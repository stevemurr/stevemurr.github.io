---
title: "Fabric Tutorial: Running the Context Relay Showcase"
date: 2026-03-16
draft: true
tags: ["swift", "macos", "fabric", "tutorial"]
summary: "A walkthrough of Fabric's showcase — three apps sharing context through a local broker."
projects: ["stevemurr/fabric"]
params:
  pullquote: "Three processes, one broker, zero cloud — local context sharing in action."
  cardGradient: "135deg, #1e3a5f, #2563eb, #60a5fa"
  cardIcon: "terminal"
---

<!--
BLOG POST 2: Fabric Showcase Tutorial
Target audience: developers who want to try Fabric hands-on
Walks through scripts/run-showcase.sh and what each role does
-->

## Outline

### Prerequisites
- macOS 13+, Swift 6.2
- Clone the repo: `git clone git@github.com:stevemurr/fabric.git`

### Step 1: Install the Shared Broker
- Run `./scripts/install-launch-agent.sh`
- Explain what this does: builds `FabricBrokerRuntime` in release mode, writes a LaunchAgent plist to `~/Library/LaunchAgents/`, reloads it
- The broker is now a persistent Mach service (`com.stevemurr.fabric.broker`) running in the background

### Step 2: What `run-showcase.sh` Does
- Walk through the script line by line:
  1. **Broker check** — verifies the LaunchAgent is running via `launchctl print`; exits with a helpful message if not
  2. **Build** — `swift build --target FabricShowcase`
  3. **Launch three roles** — spawns `.build/debug/FabricShowcase` three times with `--role browser`, `--role notes`, `--role lens`, each backgrounded with logs to `/tmp/`

### Step 3: The Three Roles Explained
- **Browser** (`--role browser`)
  - Exposes resources: `current page`, `selection`, `tab`
  - Publishes events when the simulated page/tab changes
  - Think of it as a mock browser that advertises what you're looking at
- **Notes** (`--role notes`)
  - Consumes browser context (subscribes to page changes)
  - Exposes note resources and mutating actions (create/update notes)
  - Demonstrates both reading from and writing to the broker
- **Lens** (`--role lens`)
  - Uses `FabricGateway` / `FabricXPCGateway` to project the shared broker as MCP resources and tools
  - Shows how an MCP-compatible client could consume Fabric context
  - The "AI-facing" window into the context substrate

### Step 4: Watching It Work
- Tail the log files to see context flowing between roles
- Explain what to look for: resource discovery, context resolution, event subscriptions, action invocations
- `tail -f /tmp/fabric-showcase-browser.log /tmp/fabric-showcase-notes.log /tmp/fabric-showcase-lens.log`

### Step 5: Running Roles Manually
- You can also launch each role individually: `swift run FabricShowcase --role browser`
- Useful for debugging or stepping through one role at a time

### Recap
- What we saw: three independent processes sharing context through a single local broker with no network calls
- The same patterns work for real apps — replace the showcase providers with your own
- Link back to the intro post and the repo
