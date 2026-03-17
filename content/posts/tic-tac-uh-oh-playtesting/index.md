---
title: "Tic-Tac-Uh-Oh: Automated Playtesting"
date: 2026-03-16
draft: false
tags: ["godot", "gamedev", "gdscript", "playtesting", "ai"]
summary: "When you have 48 complication configs you automate."
projects: ["stevemurr/tic-tac-uh-oh"]
params:
  pullquote: "Turns out the best playtester is a robot that doesn't get bored after game three."
  cardGradient: "135deg, #1e3a5f, #065f46, #16a34a"
  cardIcon: "gamepad"
---

# Scaling Ideas

Here's the thing about making a game where draws escalate instead of ending -- you end up with a lot of knobs. Twelve complications. Each one changes the rules in a different way. And they *stack*. A draw triggers a new complication on top of whatever's already active.

So you've got Crossfire. Gravity. Decay. Steal. Each one alone is a different game. Pair them up? Different game. Triple stack? Different game again.

The solution is obvious.  

You develop some metrics, spin up a bunch of agents and ask them to play each game configuration and score the results.

## ***What Even Is Fun Though***

Before you can automate playtesting you have to answer the question nobody wants to answer: what does "fun" actually mean in a way a computer can measure?

I landed on five components, each scored on a 0-1 scale and then combined with configurable weights into a final score from 0 to 10:

- **Length** -- Did the game/phase last a reasonable number of turns? Too short means nothing happened. Too long means someone got trapped in a loop.
- **Progression** -- Did the complication stack grow? Did phases have enough turns to actually matter?
- **Complexity** -- Were explosions, conversions, captures, and other effects actually firing? Or was everyone just placing marks in silence?
- **Resolution** -- Did someone *win*, or did the game fizzle out from a stalemate or timeout?
- **Fairness** -- Was there a massive seat advantage? Did one player timeout way more than the other?

Each component uses what I call a "sweet spot band" -- a target range where the score is 1.0, with falloff zones on either side:

```gdscript
func _score_band(value: float, target: Dictionary) -> float:
    var sweet_min := float(target.get("sweet_min", value))
    var sweet_max := float(target.get("sweet_max", value))
    var hard_min := float(target.get("hard_min", sweet_min))
    var hard_max := float(target.get("hard_max", sweet_max))

    if value >= sweet_min and value <= sweet_max:
        return 1.0
    if value < hard_min or value > hard_max:
        return 0.0
    if value < sweet_min:
        return clampf((value - hard_min) / maxf(sweet_min - hard_min, 0.001), 0.0, 1.0)
    return clampf((hard_max - value) / maxf(hard_max - sweet_max, 0.001), 0.0, 1.0)
```

The weighted combination is dead simple -- multiply each component by its weight, clamp to 0-10:

```gdscript
func _weighted_score(components: Dictionary, weights: Dictionary) -> float:
    var weighted := 0.0
    for key in ["length", "progression", "complexity", "resolution", "fairness"]:
        weighted += float(components.get(key, 0.0)) * float(weights.get(key, 0.0))
    return snapped(clampf(weighted * 10.0, 0.0, 10.0), 0.001)
```

Is this a perfect model of fun? Obviously not. But it captures the *mechanics* of fun. The things you can count. And that's enough to rank configurations against each other.

---

## ***Building The Robot Army***

You can't just throw random configs at the wall. You need structure. The playtest runner generates scenarios across three suites:

**Baseline** -- No complications at all. Vanilla tic-tac-toe on a growing board. This is your control group.

**Forced First** -- Each of the 14 complications solo. Force Crossfire first. Force Gravity first. This tells you how each complication plays in isolation.

**Forced Depth** -- Each complication at stack depths 2, 3, and 4. This is where it gets interesting. At depth 3, Crossfire isn't just Crossfire anymore -- it's Crossfire on top of two other complications that were already warping the board.

```gdscript
func _build_scenarios() -> Array[Dictionary]:
    var scenarios: Array[Dictionary] = []

    # Baseline: no forced complications
    if _suite == "baseline" or _suite == "all":
        scenarios.append({
            "suite": "baseline",
            "label": "baseline",
            "forced_sequence": [],
            "target_complication_id": "",
            "expected_depth": 0,
        })

    # Solo: each complication in isolation
    if _suite == "forced_first" or _suite == "all":
        for comp_id in _complication_ids:
            scenarios.append({
                "suite": "forced_first",
                "label": "forced_first:%s" % comp_id,
                "forced_sequence": [comp_id],
                "target_complication_id": comp_id,
                "expected_depth": 1,
            })

    # Stacked: each complication at depths 2, 3, 4
    if _suite == "forced_depth" or _suite == "all":
        for depth in [2, 3, 4]:
            for comp_id in _complication_ids:
                var prefix = _sample_prefix_sequence(comp_id, depth - 1, depth)
                if prefix.size() != depth - 1:
                    continue
                var sequence: Array = prefix.duplicate()
                sequence.append(comp_id)
                scenarios.append({
                    "suite": "forced_depth",
                    "label": "forced_depth:%d:%s" % [depth, comp_id],
                    "forced_sequence": sequence,
                    "target_complication_id": comp_id,
                    "expected_depth": depth,
                })

    return scenarios
```

The prefix generation is the sneaky part. Not every complication can coexist -- some are incompatible. So for each target complication at each depth, the runner uses a seeded RNG to pick a valid prefix of preceding complications that all play nice together. Deterministic seeds mean the same run always produces the same configs.

Each scenario then gets played across multiple agent matchups, multiple games each. That's how you get to ~1,500 games.

---

## ***Playing Without A Board***

Simulating a board game headlessly in Godot is way more annoying than you'd expect.

Godot wants to render things. It wants `await`. It wants frame callbacks. A synchronous game loop that runs without a scene tree? That's swimming upstream.

The `game_simulator.gd` strips all of that away. Pure logic. No UI, no signals, no awaits. Each turn: get legal actions, pick one, apply it, check for draws, handle escalation. Repeat until someone wins or the turn limit hits.

```gdscript
func run_full_game(max_turns: int = 200) -> String:
    start_round()
    for i in max_turns:
        if game_over:
            return ""

        var err = play_random_move()
        if err != "":
            if err == "No legal actions":
                finish_game("no_legal_actions")
                return ""
            return "Turn %d: %s" % [i, err]

        if draw_occurred:
            err = handle_draw()
            if err != "":
                return "Turn %d handle_draw: %s" % [i, err]

    if not game_over:
        finish_game("max_turns")
        return "Game did not finish within %d turns" % max_turns

    return ""
```

The real complexity is in `_play_game()` on the runner side. That's where agent selection happens -- each player slot gets an agent (random, minimax, etc.), the game trace gets recorded, and every phase gets scored by the fun model before anything moves on.

The trick is that complications modify the board state in ways that compound. Crossfire converts opponent marks. Gravity makes marks fall. Decay removes old marks. The simulator has to faithfully reproduce all of that without any of the visual feedback loop that makes those interactions comprehensible to a human.

---

## ***The AI That Knows Too Much***

You can't playtest with random moves alone. Random vs random tells you if a config is *broken*, but it can't tell you if it's *fun*. For that you need an AI that actually tries to win.

The minimax solver does alpha-beta pruning with a 50,000 node limit. But the interesting part is depth adaptation -- the AI adjusts how far ahead it looks based on how many cells are available:

```gdscript
func _compute_max_depth(board: BoardModel) -> int:
    var empty := board.get_playable_cells().size()
    if empty <= 9:
        return 9  # Full search for small boards
    elif empty <= 16:
        return 5
    elif empty <= 36:
        return 3
    else:
        return 2
```

Early game on a big board? Shallow search. Late game on a small board? Full depth solve. This keeps the AI responsive without blowing up computation time across 1,500 games.

The critical insight: the AI has to simulate complications when evaluating moves. It can't just look at mark positions -- it has to model what Crossfire will do, what Gravity will do, how the board transforms after each hypothetical move. Without that, it plays like it's in a different game than the one actually running.

---

## ***So What Did The Robots Find***

After running 57 scenarios across multiple agent matchups and multiple games each, the report spits out a ranked leaderboard. The data is dense but the format is clean:

```
summary:
  total_games: 1,500+
  avg_game_fun: 6.2
  avg_turns: 18.4
  avg_draws: 1.8
  top_complications:
    - crossfire    (marginal_fun_delta: +0.8)
    - gravity      (marginal_fun_delta: +0.6)
    - steal        (marginal_fun_delta: +0.5)
```

Some findings that stood out:

**The "Most Fun" Award** goes to complications that produce high complexity density with clean resolutions. Crossfire consistently scores near the top -- lots of dramatic board flips, games that resolve decisively. Gravity is close behind because it forces genuinely different spatial thinking.

**The "Chaos Goblin" Award** goes to configs where effects chain wildly -- Crossfire + Steal at depth 3 produces the kind of board state where you place one mark and half the board changes. Fun score? Actually decent. Turns out people (and metrics) like fireworks.

**The "Please God Make It Stop" Award** goes to configs that timeout or stalemate. Some triple-stacks at depth 4 create board states where legal actions shrink to nothing and the game just dies. These score below 3.0 and get flagged as candidates for incompatibility rules.

**First Player Advantage** -- baseline tic-tac-toe has a known first-player edge. Complications generally *reduce* that bias. The board-warping effects of draws mean any positional advantage from going first gets scrambled. Some configs actually invert the advantage entirely.

The complication rankings include a `marginal_fun_delta` -- how much fun changes when you add that complication compared to the baseline at the same depth. Positive delta = this complication makes things more interesting. Negative delta = maybe don't default this one on.

---

## ***Trust The Robots (But Not Too Much)***

Here's the thing the robots can't tell you: does it *feel* good?

A config can score 8/10 on the fun model and still feel like garbage because the board animations are confusing, or the complication text doesn't make sense, or the strategic depth is there but the player can't perceive it.

Metrics capture mechanics. They measure the skeleton of fun -- enough turns, enough effects, decisive outcomes, fair play. But the skin on top? That's still subjective. You still have to play the damn thing.

What the robots *did* save me is hundreds of hours of mechanical playtesting. Instead of playing 48 configs blind, I have a ranked list. I know which complications are the stars and which ones need work. I know which stacks are broken. The results feed directly into which configs ship as defaults and which are unlockable stretch goals.
