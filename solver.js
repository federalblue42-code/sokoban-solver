#!/usr/bin/env node
/**
 * sokoban-solver — a tiny, dependency-free A* solver for classic Sokoban puzzles.
 *
 * Zero dependencies. Node 18+. Reads a standard Sokoban board and prints the
 * shortest walk/push sequence it can find, plus a verification replay.
 *
 * Board legend:
 *   # wall      (space) floor     . goal       $ box
 *   * box on goal             @ player     + player on goal
 *
 * Usage:
 *   node solver.js board.txt                 # solve a board file
 *   cat board.txt | node solver.js           # solve from stdin
 *   node solver.js board.txt --json          # machine-readable output
 *   node solver.js --selftest                # run the built-in examples
 */

'use strict';

const fs = require('fs');

const DIRS = {
  U: { x: 0, y: -1 },
  D: { x: 0, y: 1 },
  L: { x: -1, y: 0 },
  R: { x: 1, y: 0 },
};
const WALL = '#', GOAL = '.', BOX = '$', BOXG = '*', PLAYER = '@', PLAYERG = '+';
const key = (x, y) => x + ',' + y;
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Parse a standard Sokoban board into a world model + initial state. */
function parse(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  // keep lines that contain at least one board character; pad to equal width
  const rows = lines.filter((l) => /[#$.@*+]/.test(l));
  if (!rows.length) throw new Error('empty board');
  const w = Math.max(...rows.map((l) => l.length));
  const grid = rows.map((l) => l.padEnd(w, ' ').split(''));
  const h = grid.length;
  const wall = (x, y) => x < 0 || y < 0 || x >= w || y >= h || grid[y][x] === WALL;
  const goals = [], boxes = [];
  let player = null;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const c = grid[y][x];
      if (c === GOAL || c === BOXG || c === PLAYERG) goals.push({ x, y });
      if (c === BOX || c === BOXG) boxes.push({ x, y });
      if (c === PLAYER || c === PLAYERG) player = { x, y };
    }
  }
  if (!player) throw new Error('no player (@) on board');
  if (!boxes.length) throw new Error('no boxes ($) on board');
  if (goals.length < boxes.length) throw new Error('fewer goals than boxes');
  return { w, h, wall, goals, goalSet: new Set(goals.map((g) => key(g.x, g.y))) , boxes, player };
}

/** Cells the player can walk to without crossing a box. */
function reachable(world, player, boxes) {
  const boxSet = new Set(boxes.map((b) => key(b.x, b.y)));
  const seen = new Set([key(player.x, player.y)]);
  const q = [player];
  while (q.length) {
    const c = q.shift();
    for (const d of Object.values(DIRS)) {
      const n = { x: c.x + d.x, y: c.y + d.y }, k = key(n.x, n.y);
      if (seen.has(k) || world.wall(n.x, n.y) || boxSet.has(k)) continue;
      seen.add(k); q.push(n);
    }
  }
  return seen;
}

/** BFS walk from player to target (boxes block), returns direction list. */
function pathTo(world, player, target, boxes) {
  const boxSet = new Set(boxes.map((b) => key(b.x, b.y)));
  const prev = new Map([[key(player.x, player.y), null]]);
  const q = [player];
  while (q.length) {
    const c = q.shift();
    if (c.x === target.x && c.y === target.y) {
      const dirs = []; let node = c;
      while (prev.get(key(node.x, node.y))) {
        const p = prev.get(key(node.x, node.y));
        dirs.unshift(p.dir); node = p.from;
      }
      return dirs;
    }
    for (const [name, d] of Object.entries(DIRS)) {
      const n = { x: c.x + d.x, y: c.y + d.y }, k = key(n.x, n.y);
      if (prev.has(k) || world.wall(n.x, n.y) || boxSet.has(k)) continue;
      prev.set(k, { from: c, dir: name }); q.push(n);
    }
  }
  return null;
}

function heuristic(world, boxes) {
  return boxes.reduce((sum, b) => {
    let best = Infinity;
    for (const g of world.goals) best = Math.min(best, manhattan(b, g));
    return sum + (best === Infinity ? 0 : best);
  }, 0);
}
const solved = (world, boxes) => boxes.every((b) => world.goalSet.has(key(b.x, b.y)));

/** A box wedged in a non-goal corner can never be pushed out. */
function deadCorner(world, b) {
  if (world.goalSet.has(key(b.x, b.y))) return false;
  const up = world.wall(b.x, b.y - 1), down = world.wall(b.x, b.y + 1);
  const left = world.wall(b.x - 1, b.y), right = world.wall(b.x + 1, b.y);
  return (up || down) && (left || right);
}

/** Min-heap keyed on f. */
function makeHeap() {
  const a = [];
  return {
    get size() { return a.length; },
    push(n) {
      a.push(n); let i = a.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
    },
    pop() {
      const top = a[0], last = a.pop();
      if (a.length) {
        a[0] = last; let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1; let m = i;
          if (l < a.length && a[l].f < a[m].f) m = l;
          if (r < a.length && a[r].f < a[m].f) m = r;
          if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m;
        }
      }
      return top;
    },
  };
}

/** A* over box-push states. Returns { moves, pushes, expanded } or null. */
function solve(world, start, budget = 500000) {
  const stateKey = (boxes, p) => boxes.map((b) => key(b.x, b.y)).sort().join('|') + '@' + key(p.x, p.y);
  const heap = makeHeap();
  const startNode = {
    boxes: start.boxes.map((b) => ({ ...b })), player: { ...start.player },
    g: 0, f: heuristic(world, start.boxes), parent: null, via: null,
  };
  heap.push(startNode);
  const seen = new Map([[stateKey(startNode.boxes, startNode.player), 0]]);
  let expanded = 0;

  while (heap.size && expanded < budget) {
    const node = heap.pop(); expanded += 1;
    if (solved(world, node.boxes)) {
      const ops = [];
      let c = node;
      while (c.parent) { ops.unshift(c.via); c = c.parent; }
      const moves = [], pushes = [];
      for (const op of ops) { moves.push(...op.walk, op.push); pushes.push(op.push); }
      return { moves, pushes, expanded };
    }
    const free = reachable(world, node.player, node.boxes);
    const boxSet = new Set(node.boxes.map((b) => key(b.x, b.y)));
    for (let i = 0; i < node.boxes.length; i += 1) {
      const box = node.boxes[i];
      for (const [name, d] of Object.entries(DIRS)) {
        const stand = { x: box.x - d.x, y: box.y - d.y };
        const dest = { x: box.x + d.x, y: box.y + d.y };
        if (!free.has(key(stand.x, stand.y))) continue;
        if (world.wall(dest.x, dest.y) || boxSet.has(key(dest.x, dest.y))) continue;
        const walk = pathTo(world, node.player, stand, node.boxes);
        if (!walk) continue;
        const nb = node.boxes.map((b, idx) => (idx === i ? dest : { ...b }));
        if (nb.some((b) => deadCorner(world, b))) continue;
        const k = stateKey(nb, box);
        const g = node.g + walk.length + 1;
        if (seen.has(k) && seen.get(k) <= g) continue;
        seen.set(k, g);
        heap.push({
          boxes: nb, player: { ...box }, g, f: g + heuristic(world, nb),
          parent: node, via: { walk, push: name },
        });
      }
    }
  }
  return null;
}

/** Replay the move list on the board to verify every push is legal and it solves. */
function verify(world, start, moves) {
  const boxes = start.boxes.map((b) => ({ ...b }));
  let p = { ...start.player };
  const boxAt = (x, y) => boxes.findIndex((b) => b.x === x && b.y === y);
  for (const m of moves) {
    const d = DIRS[m];
    if (!d) return false;
    const nx = p.x + d.x, ny = p.y + d.y;
    if (world.wall(nx, ny)) return false;
    const bi = boxAt(nx, ny);
    if (bi >= 0) {
      const bx = nx + d.x, by = ny + d.y;
      if (world.wall(bx, by) || boxAt(bx, by) >= 0) return false;
      boxes[bi] = { x: bx, y: by };
    }
    p = { x: nx, y: ny };
  }
  return solved(world, boxes);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) {
    const tests = [
      ['one box', ['#######', '#     #', '# .$@ #', '#     #', '#######'].join('\n')],
      ['two boxes', ['########', '#      #', '# .$ $.#', '#  @   #', '#      #', '########'].join('\n')],
    ];
    for (const [name, text] of tests) {
      const world = parse(text);
      const t0 = Date.now();
      const res = solve(world, { boxes: world.boxes, player: world.player });
      const ok = res && verify(world, { boxes: world.boxes, player: world.player }, res.moves);
      console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${res ? res.moves.length + ' moves, ' + res.expanded + ' expanded' : 'no solution'} (${Date.now() - t0}ms)`);
      if (!ok) process.exitCode = 1;
    }
    return;
  }
  const asJson = args.includes('--json');
  const file = args.find((a) => !a.startsWith('--'));
  let text;
  if (file) text = fs.readFileSync(file, 'utf8');
  else text = fs.readFileSync(0, 'utf8');
  const world = parse(text);
  const t0 = Date.now();
  const res = solve(world, { boxes: world.boxes, player: world.player });
  const ms = Date.now() - t0;
  if (!res) {
    console.log(asJson ? JSON.stringify({ solved: false, expanded: 0 }) : 'No solution found within budget.');
    process.exitCode = 1; return;
  }
  const ok = verify(world, { boxes: world.boxes, player: world.player }, res.moves);
  if (asJson) console.log(JSON.stringify({ solved: ok, moves: res.moves.join(''), moveCount: res.moves.length, pushes: res.pushes.length, expanded: res.expanded, ms }));
  else {
    console.log(`Solved in ${res.moves.length} moves (${res.pushes.length} pushes), ${res.expanded} states expanded, ${ms}ms`);
    console.log('Moves: ' + res.moves.join(''));
    console.log('Verified: ' + (ok ? 'yes — replay reaches a solved board' : 'NO'));
  }
  if (!ok) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { parse, solve, verify };
