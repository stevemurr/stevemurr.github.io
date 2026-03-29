---
title: Exploring ECS Through Interactive Graphs
date: '2026-03-28'
draft: true
tags:
  - ecs
  - architecture
  - interactive
summary: >-
  A hands-on exploration of Entity Component System architecture through
  interactive visualizations — watching entities, components, and systems
  come alive in real time.
params:
  cardGradient: '135deg, #1e3a5f, #2563eb, #60a5fa'
  cardIcon: layers
---

Entity Component System is one of those patterns that sounds simple on paper — entities are IDs, components are data, systems are logic — but the emergent behavior of a running ECS world is hard to grasp without seeing it. These interactive demos let you poke at a live ECS and watch what happens.

## The Graph

This first view renders the ECS world as a dynamic graph. Entities are nodes, components are the colored connections between them, and systems light up as they process matching entities. Toggle components on and off to see how the graph reshapes itself.

{{< interactive src="/demos/ecs-graph/ecs_graph.html" title="ECS Dynamic Graph" height="650px" >}}

## The Playground

Here you can create entities, attach and detach components, and watch systems react in real time. The simulation canvas on the left shows the visual output while the inspector on the right lets you drill into any entity's component state.

{{< interactive src="/demos/ecs-graph/ecs_playground.html" title="ECS Playground" height="700px" >}}

## The UI Playground

This extends the playground with a full UI-driven approach — a tree view of all entities, a live preview panel, and an inspector for editing component properties directly. It's closer to what an actual ECS editor would feel like.

{{< interactive src="/demos/ecs-graph/ecs_ui_playground.html" title="ECS UI Playground" height="700px" >}}
