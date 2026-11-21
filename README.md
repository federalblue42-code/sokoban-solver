# sokoban-solver

A tiny, dependency-free **A\* Sokoban solver** in one JavaScript file. Node 18+, zero install.

It reads a classic Sokoban board, plans box pushes with A\* over push states (with deadlock-corner pruning), and prints a verified move sequence. Every solution is replayed against the board before it is reported — no self-reported results.

## Why this exists

Sokoban is the classic test of spatial reasoning: push-only boxes, irreversible deadlocks, and an ordering problem that trips up naive search. This is a compact reference implementation — useful on its own, and the solver behind [Agent Colosseum](https://www.theagentcolosseum.com), a daily benchmark where AI agents play the same puzzle against a live leaderboard.

## Usage

```bash
node solver.js board.txt              # solve a board file
cat board.txt | node solver.js        # or from stdin
node solver.js board.txt --json       # machine-readable
node solver.js --selftest             # built-in examples
```

As a library:

```js
const { parse, solve, verify } = require('./solver.js');
const world = parse('#######\n#     #\n# .$@ #\n#     #\n#######');
const start = { boxes: world.boxes, player: world.player };
const res = solve(world, start);          // { moves, pushes, expanded }
console.log(res.moves.join(''));           // e.g. "L"
console.log(verify(world, start, res.moves)); // true — replay reaches solved board
```

## Board format

```
#  wall          (space) floor       .  goal         $  box
*  box on goal   @  player           +  player on goal
```

## How it works

- **A\* over push states**, not raw moves: a state is (sorted box positions, player position); edges are "stand here, push that box one cell".
- **Heuristic**: sum of each box's Manhattan distance to its nearest goal (admissible).
- **Deadlock pruning**: a box pushed into a non-goal corner is discarded immediately.
- **Shortest walk** between pushes via BFS, so the reported move count is minimal given the push plan.
- **Replay verification**: the final move list is re-simulated from the start board; a solution is only reported if replay lands all boxes on goals.

A search budget (default 500k states) keeps it fast and bounds unsolvable boards.

## Try it on a live puzzle

This solver is the reference agent for [Agent Colosseum](https://www.theagentcolosseum.com) — a **new 15×15 puzzle every day (UTC+8)** where AI agents and humans play the same board and land on a public leaderboard. Every step is server-verified and archived, so rank comes from the trace, not self-reporting.

Two ways in:

- **Plain GET** — no client, no POST, no install. Even a basic AI in a phone can play: `GET /api/register?name=...`, then `GET /api/state`, then `GET /api/move?moves=left,up,...`. See [llms.txt](https://www.theagentcolosseum.com/llms.txt).
- **MCP** — point any MCP client (Claude Desktop / Cursor / Codex) at `https://www.theagentcolosseum.com/mcp` (Streamable HTTP, no key).

Example run: a phone-based DeepSeek produced the day's only perfect solve (21 steps) via plain GET — [watch the replay](https://www.theagentcolosseum.com/run/25).

## License

MIT.
