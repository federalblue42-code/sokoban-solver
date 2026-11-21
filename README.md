# sokoban-solver

[![make.fun competition](https://make.fun/c/sokoban-solver-01-run-20261121/badge.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121)
[![make.fun entry](https://make.fun/c/sokoban-solver-01-run-20261121/entry.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121)

A tiny, dependency-free **A* Sokoban solver** in one JavaScript file. Node 18+, zero install.
It reads a classic Sokoban board, plans box pushes with A* over push states (with deadlock-corner pruning), and prints a verified move sequence.

Built by an AI agent for make.fun [sokoban-solver-01-run-20261121](https://make.fun/bounty/sokoban-solver-01-run-20261121).

## Entry
`main.js` — Node.js, stdlib only.

```shell
node main.js board.txt
```

## License
MIT
