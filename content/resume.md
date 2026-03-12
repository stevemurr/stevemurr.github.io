---
title: "Resume"
layout: "resume"
summary: "Project-focused overview of recent work across AI-native apps, search systems, and developer tooling."
cardGradient: "135deg, #1c2633, #254963, #0f6d9c"
cardIcon: "file"
eyebrow: "Selected work"
backLabel: "Home"
backUrl: "/"
hideMeta: true
showToc: false
hero:
  title: "Steve Murr"
  buttons:
    - name: "Writing"
      url: "/posts/"
    - name: "GitHub"
      url: "https://github.com/stevemurr"
githubActivity:
  username: "stevemurr"
  excludeRepos:
    - "stevemurr/stevemurr.github.io"
projects:
  - name: "Wheel"
    repo: "stevemurr/wheel"
    summary: "A macOS browser built from scratch in Swift with AI baked into navigation, search, reading, and automation."
    impact: "Combines an OmniBar with chat, semantic history search, agent mode, an MCP server, and an LLM-generated widget dashboard."
    stack:
      - "Swift 6.2"
      - "SwiftUI"
      - "WebKit"
      - "Foundation Models"
      - "MCP"
  - name: "TLAForge"
    repo: "stevemurr/tlaforge"
    summary: "An LLM-powered TLA+ specification generator that constrains model output through a builder API instead of hoping raw text stays valid."
    impact: "Turns natural-language requests into structured TLA+ construction steps so the generated specs stay syntactically valid and easier to iterate on."
    stack:
      - "Python"
      - "TLA+"
      - "LLM tooling"
      - "Structured generation"
  - name: "LanguageModelContextKit"
    repo: "stevemurr/LanguageModelContextKit"
    summary: "A Swift package for managing context windows and sessions when building on-device AI apps with Apple Foundation Models."
    impact: "Handles token budgeting, logical threads, progressive compaction, session restoration, and file-based persistence."
    stack:
      - "Swift"
      - "Foundation Models"
      - "Token budgeting"
      - "Persistence"
  - name: "DIndex"
    repo: "stevemurr/dindex"
    summary: "A decentralized semantic search engine in Rust designed for both human and LLM-driven queries."
    impact: "Uses HNSW plus BM25 with Reciprocal Rank Fusion, semantic routing via LSH, and libp2p protocols including Kademlia, GossipSub, and QUIC."
    stack:
      - "Rust"
      - "libp2p"
      - "Tantivy"
      - "USearch"
  - name: "YAGPT"
    repo: "stevemurr/yagpt"
    summary: "A modern GPT implementation meant to make the full LLM pipeline understandable without dumbing it down."
    impact: "Covers pre-training, SFT, LoRA and QLoRA, DPO and GRPO alignment, plus evaluation with a clean command-line interface."
    stack:
      - "Python"
      - "PyTorch"
      - "Transformers"
      - "Alignment"
  - name: "Tic-Tac-Uh-Oh"
    repo: "stevemurr/tic-tac-uh-oh"
    summary: "A Godot tactics side quest where tic-tac-toe keeps escalating after every draw."
    impact: "Uses stackable complications like gravity, bombs, infection, and board growth to turn a solved game into managed chaos."
    stack:
      - "Godot"
      - "GDScript"
      - "Game systems"
      - "UI polish"
info:
  - label: "GitHub"
    value: "github.com/stevemurr"
    url: "https://github.com/stevemurr"
  - label: "Based in"
    value: "San Jose, California"
---

## Snapshot

Software engineer based in San Jose building AI-native products, search systems, and developer tooling. The through-line in my recent work is straightforward: build real software, keep the interesting parts open source, and write clearly about the engineering decisions behind it.

## Selected Projects

### Wheel

AI-native browser for macOS built in Swift and SwiftUI on top of WebKit.

- Replaced the traditional address bar with an OmniBar that supports address, chat, semantic search, agent, and reading-list workflows.
- Grounded on-device AI interactions in the current page, browsing history, and local browser state.
- Added semantic history search, agent-driven automation, an MCP server, and an LLM-generated widget dashboard.

Links: [Write-up](/posts/building-an-ai-native-browser/) · [GitHub](https://github.com/stevemurr/wheel)

### LanguageModelContextKit

Swift package for session and context management on top of Apple Foundation Models.

- Built automatic token budgeting with priority-based allocation across prompts, history, and supplementary context.
- Added logical threads, progressive context compaction, session restoration, and file-based persistence.
- Designed it as standalone infrastructure for any app using on-device Apple models, not just Wheel.

Links: [Write-up](/posts/on-device-ai-context-management/) · [GitHub](https://github.com/stevemurr/LanguageModelContextKit)

### DIndex

Decentralized semantic search engine in Rust.

- Combined dense retrieval with HNSW and sparse retrieval with BM25, fused via Reciprocal Rank Fusion.
- Built peer discovery and routing with libp2p, including Kademlia, GossipSub, and QUIC transport.
- Focused the architecture on search workflows that work for both human users and LLM-driven agents.

Links: [Write-up](/posts/decentralized-semantic-search/) · [GitHub](https://github.com/stevemurr/dindex)

### YAGPT

Modern GPT implementation for understanding the full training and alignment pipeline.

- Implemented pre-training, SFT, LoRA and QLoRA, DPO, SimPO, GRPO, and evaluation hooks in a clean CLI-oriented codebase.
- Used modern architectural choices including RoPE, RMSNorm, SwiGLU, GQA, QK-Norm, and Flash Attention.
- Optimized for readability so the code stays educational without collapsing into toy-code shortcuts.

Links: [Write-up](/posts/training-a-gpt-from-scratch/) · [GitHub](https://github.com/stevemurr/yagpt)

## Technical Focus

- Languages: Swift, Rust, Python, and GDScript.
- Platforms and frameworks: macOS, SwiftUI, WebKit, Apple Foundation Models, libp2p, PyTorch.
- Retrieval and AI systems: vector search, hybrid retrieval, token budgeting, context management, alignment, evaluation.
- Product style: local-first where it matters, strong UX opinions, and end-to-end ownership from engine to interface.

## Writing

- [On-Device AI Context Management](/posts/on-device-ai-context-management/)
- [Building an AI-Native Browser from Scratch](/posts/building-an-ai-native-browser/)
- [Decentralized Semantic Search in Rust](/posts/decentralized-semantic-search/)
- [Training a GPT from Scratch](/posts/training-a-gpt-from-scratch/)
- [Tic-Tac-Uh-Oh: When the Board Fights Back](/posts/tic-tac-uh-oh/)

## Profiles

- GitHub: [github.com/stevemurr](https://github.com/stevemurr)
- Location: San Jose, California
