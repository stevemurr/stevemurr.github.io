---
title: "Spec Driven Development"
date: 2026-03-01
draft: true
tags: ["python", "ai", "spec"]
summary: "AI agents are great at generating code but bad at reasoning about correctness. TLAForge constrains an LLM to a Python builder API so it can only produce syntactically valid TLA+ formal specifications."
projects: ["stevemurr/tlaforge"]
params:
  pullquote: "If the model can only call valid builder methods, it can't produce a broken spec."
  cardGradient: "135deg, #1a1a2e, #16213e, #0f3460"
  cardIcon: "globe"
---

# Why make a spec?

AI agents can generate a lot of code very quickly. The problem is that "a lot of code" and "correct code" are not the same thing. An agent will happily produce a state machine with a deadlock, a retry loop that never terminates, or a workflow where two transitions race and corrupt shared state. It doesn't know these things are wrong because it never had to think about what "correct" means for your system.

A formal specification forces that thinking to happen before any code is written. You define the states your system can be in, the transitions between them, and the properties that must always hold. Then a model checker exhaustively explores every reachable state and tells you if any of those properties are violated. Bugs that would take weeks to surface in production — race conditions, edge cases in retry logic, unreachable states — show up in seconds.

The pitch for spec-driven development is simple: write the spec first, let the model checker find the bugs, then write the code. It's the same idea as test-driven development, but one level up. Instead of testing individual functions, you're testing the design itself.

# What is TLA+?

TLA+ is a formal specification language created by Leslie Lamport. It's designed for modeling concurrent and distributed systems as state machines. You define variables, an initial state, a set of transitions (called actions), and properties you want to verify — invariants that must hold in every reachable state, or liveness properties that say something must eventually happen.

The TLC model checker takes your spec and explores every possible execution. If it finds a state that violates an invariant, it gives you a counterexample: the exact sequence of steps that leads to the bug.

TLA+ is powerful. It's also intimidating. The syntax looks nothing like any mainstream programming language. Conjunction is `/\`, disjunction is `\/`, and primed variables like `state'` represent the next-state value. A simple guard-and-update that would be an `if` statement in Python looks like this:

```
RedToGreen ==
    /\ state = "red"
    /\ state' = "green"
```

It's not hard once you internalize it, but the learning curve is steep enough that most developers bounce off before they get there. That's the gap I wanted to close.

# What problem does tlaforge solve?

[TLAForge](https://github.com/stevemurr/tlaforge) is a Python library that lets you build TLA+ specifications using Python objects instead of raw TLA+ syntax. Every construct in TLA+ has a corresponding Python class — `Var`, `PrimedVar`, `BinOp`, `And`, `Or`, `Always`, `Eventually`, and so on. You compose them, call `.emit()`, and get valid TLA+ out the other side.

Here's the traffic light example. The Python builder code:

```python
from tlaforge import (
    BinOp, Definition, PrimedVar,
    StateMachineSpec, StateTransition, StringLit, Var,
)

spec = StateMachineSpec(
    module_name="TrafficLight",
    states=["red", "green", "yellow"],
    initial_state="red",
)

spec.transitions.extend([
    StateTransition(
        name="RedToGreen",
        guards=[BinOp(Var("state"), "=", StringLit("red"))],
        updates=[BinOp(PrimedVar("state"), "=", StringLit("green"))],
    ),
    StateTransition(
        name="GreenToYellow",
        guards=[BinOp(Var("state"), "=", StringLit("green"))],
        updates=[BinOp(PrimedVar("state"), "=", StringLit("yellow"))],
    ),
    StateTransition(
        name="YellowToRed",
        guards=[BinOp(Var("state"), "=", StringLit("yellow"))],
        updates=[BinOp(PrimedVar("state"), "=", StringLit("red"))],
    ),
])

spec.invariants.append(
    Definition(
        name="ValidState",
        body=BinOp(Var("state"), "\\in", Var("States")),
    )
)

print(spec.emit())
```

This emits a complete, valid TLA+ module — `Init`, `Next`, state transitions, invariants, fairness conditions, all of it. You never have to remember whether it's `/\` or `&&`. The Python is verbose, but it's familiar, and more importantly, it's composable — you can build specs programmatically, generate them from config files, or let an AI agent construct them.

The repo includes progressive examples that go from this traffic light to a todo workflow with terminal states, and then to a retrying job with auxiliary variables and constants like `MaxRetries`. Each one adds a layer of complexity while staying in plain Python.

# Does it actually work?

TLAForge includes an agent mode. You describe what you want in natural language, and Claude generates the Python builder code — not raw TLA+ — executes it, and validates the output. If the generated code fails, the error gets sent back to Claude for correction, up to three retries. There's also an interactive mode where you can refine the spec iteratively.

```bash
tlaforge "a job queue with retry logic and a max retry limit"
```

The agent generates a `StateMachineSpec` with the right states, transitions, guards, and invariants. It works because Claude is good at writing Python, and the builder API constrains the output to valid TLA+ constructs. The model doesn't need to understand TLA+ syntax — it just needs to understand a Python API, which is squarely in its wheelhouse.

Is it perfect? No. The generated specs sometimes need manual refinement, especially for subtle liveness properties or complex invariants. But as a starting point, it's dramatically faster than writing TLA+ from scratch — and the spec it produces is always syntactically valid, which is more than I can say for my first dozen attempts at writing TLA+ by hand.

# Why not just let the agent generate TLA+ strings?

This is the design decision at the core of the project. The obvious approach would be to give Claude a TLA+ primer and ask it to generate raw spec strings. I tried this. It doesn't work well.

TLA+ has enough syntactic quirks that an LLM will reliably produce broken output. It'll mix up `/\` and `\/`. It'll forget the module header or the `====` footer. It'll use `=` where it should use `==` for definitions. These are trivial mistakes for a human to catch and fix, but they're exactly the kind of thing language models get wrong — low-entropy tokens that the model treats as interchangeable.

The builder API eliminates this entire category of error. If the model can only call valid builder methods — `BinOp`, `And`, `StateTransition` — it can't produce a syntactically broken spec. The Python layer handles all the formatting, operator symbols, and module structure. The model's job shrinks from "generate correct TLA+" to "compose Python objects in the right order," which is a much easier task for an LLM.

This is a pattern I think has broad applicability beyond TLA+. Whenever you want an AI agent to produce output in a structured, syntax-heavy format, don't ask it to generate strings. Give it a builder API that makes invalid output unrepresentable. Constrain the generation space and let the tooling handle correctness.
