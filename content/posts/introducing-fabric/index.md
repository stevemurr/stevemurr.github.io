---
title: "Introducing Fabric: A Local Context Broker for macOS Apps"
date: 2026-03-16
draft: true
tags: ["swift", "macos", "fabric", "architecture"]
summary: "Why your apps can't share context — and a local broker that fixes it."
projects: ["stevemurr/fabric"]
params:
  pullquote: "What if every app on your Mac could share context through a single local broker?"
  cardGradient: "135deg, #1e3a5f, #2563eb, #60a5fa"
  cardIcon: "layers"
---

<!--
BLOG POST 1: Introducing Fabric
Target audience: macOS / Swift developers, systems thinkers, anyone interested in local-first inter-app communication
-->

## Outline

### The Problem
- Apps on macOS are silos — each holds context (current page, selection, notes, tabs) that other apps can't access
- Existing inter-app communication (pasteboard, AppleScript, URL schemes) is fragile, ad-hoc, and limited
- AI assistants / LLM tools want rich context from multiple apps but have no unified way to get it
- There's no local equivalent of a "context bus" that apps can publish to and consume from

### What Is Fabric?
- A local macOS substrate for inter-app context sharing
- Apps register **resource providers**, **action providers**, and **subscription providers** with a central broker
- Other apps discover, resolve, invoke, and subscribe through `fabric://` URIs
- Runs as a LaunchAgent-backed Mach service — one broker per user session

### Core Concepts
- **Resources**: described by `FabricResourceDescriptor`, addressed as `fabric://<appID>/<kind>/<id>`, resolved into `FabricContextPayload`
- **Actions**: described by `FabricActionDescriptor`, invoked with `FabricActionInvocation` — can be read-only or mutating (with confirmation tokens)
- **Subscriptions**: stream `FabricEvent` values via `AsyncStream` — apps react to changes in real time
- **Permissions**: `FabricPermissionGrant` controls who can discover, read, invoke, and subscribe — sibling apps (shared suite prefix) get automatic mutual access

### The MCP Connection
- `FabricGateway` projects broker resources as MCP resources and broker actions as MCP tools
- This means an MCP-compatible AI client can discover and use Fabric-registered app context without custom integration
- Fabric is not an MCP server — it's a projection layer; you bring your own transport

### Why Local-First?
- No cloud roundtrip — context stays on your machine
- Low latency via XPC / Mach services
- Permission model is local and explicit
- Works offline

### What's Next
- Tease the showcase tutorial (blog post 2)
- Link to the repo
