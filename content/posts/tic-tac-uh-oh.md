---
title: "Tic-Tac-Uh-Oh: When the Board Fights Back"
date: 2026-03-07
draft: false
tags: ["godot", "gamedev", "gdscript"]
summary: "A tic-tac-toe variant where the board fights back."
projects: ["tic-tac-uh-oh"]
params:
  pullquote: "12 stackable complications. Gravity, bombs, infection, decay -- pure chaos."
  cardGradient: "135deg, #7c2d12, #c2410c, #ea580c"
  cardIcon: "gamepad"
---

## The Concept

Tic-tac-toe is a solved game. Two competent players will draw every time. So what if draws made things worse?

[Tic-Tac-Uh-Oh](https://github.com/stevemurr/tic-tac-uh-oh) is a tic-tac-toe variant built in Godot where every draw escalates the chaos. The board grows, complications stack up, and what started as a simple 3x3 grid turns into something genuinely unpredictable.

## Escalating Chaos

When a game ends in a draw, two things happen: the board grows by one row and one column, and a new complication is added from the pool. Complications are stackable, so by the third or fourth draw, you might be playing on a 6x6 board with gravity, bombs, and a rotating board all active simultaneously.

There are 12 complications in total:

- **Gravity** -- pieces fall to the lowest empty cell in their column
- **Bombs** -- placing a piece detonates adjacent opponent pieces
- **Rotating Board** -- the entire board rotates 90 degrees every N turns
- **Decay** -- pieces disappear after a set number of turns
- **Infection** -- pieces convert adjacent opponent pieces on placement
- **Fog of War** -- you can only see cells adjacent to your own pieces
- **Walls** -- random cells become impassable
- **Teleport** -- placing on certain cells moves your piece to a random location
- **Mirror** -- your move is duplicated on the opposite side of the board
- **Freeze** -- random cells become temporarily unplayable
- **Shuffle** -- all pieces randomly swap positions every N turns
- **Inversion** -- your piece is placed as your opponent's color (but still counts as yours for win detection)

The interactions between complications create emergent gameplay. Gravity plus bombs means a well-placed piece can trigger a cascade. Decay plus infection means the board is constantly churning. Some combinations are genuinely strategic; others are pure comedy.

## Architecture

The game uses a **pure data-model architecture**. The board state is a simple data object with no rendering logic. Complications are implemented as a **hook-based system** -- each complication registers hooks for events like `on_place`, `on_turn_end`, and `on_draw`. When an event fires, all active complications process it in priority order.

This made the complication system surprisingly composable. Adding a new complication means implementing a few hook methods and registering it. The complications don't know about each other, which is how you get the emergent interactions for free.

## The AI

The AI opponent uses **minimax with alpha-beta pruning**. Difficulty levels correspond to search depth:

- Easy: depth 1 (basically random with slight preference for good moves)
- Medium: depth 3 (plays competently on small boards)
- Hard: depth 5+ (plays optimally on 3x3, strong on larger boards)

Complications make the AI interesting because they expand the effective branching factor. The AI evaluates board states after all complication hooks have fired, so it accounts for gravity, bombs, and other effects in its planning. On larger boards with multiple complications, even the hard AI can get surprised by emergent interactions, which keeps things fun.

## Testing the Silly Game

The project has 77 tests, including headless integration tests that run the full game loop without rendering. Yes, even the silly game gets proper test coverage.

Testing the complication system was actually a good exercise in testing emergent behavior. Individual complications are unit tested in isolation, and then integration tests verify specific multi-complication interactions that I discovered during playtesting. The headless test setup in Godot took some wrangling, but having fast, automated tests for game logic that involves randomness and cascading effects was absolutely worth the investment.

The project is at [github.com/stevemurr/tic-tac-uh-oh](https://github.com/stevemurr/tic-tac-uh-oh). It's a fun palate cleanser between the more serious projects, and it's a surprisingly good testbed for thinking about composable game systems.
