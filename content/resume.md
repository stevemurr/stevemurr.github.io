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
  eyebrow: "Software engineer in San Jose"
  title: "Steve Murr"
  lede: "I build AI-native products, local-first search systems, and developer tooling. Recent work spans an AI-native browser, on-device context management for Apple Foundation Models, decentralized retrieval, and a from-scratch GPT training stack."
  buttons:
    - name: "Writing"
      url: "/posts/"
    - name: "GitHub"
      url: "https://github.com/stevemurr"
  notes:
    - label: "Current arc"
      text: "On-device AI, browser UX, semantic retrieval, and local-first systems."
    - label: "Stack"
      text: "Mostly Swift, Rust, and Python, with the occasional Godot side quest."
    - label: "Style"
      text: "Build real software, open source the interesting bits, and write up the engineering tradeoffs."
githubActivity:
  username: "stevemurr"
  limit: 4
featuredProjects:
  - name: "Wheel"
    period: "2026"
    status: "Flagship project"
    icon: "globe"
    summary: "A macOS browser built from scratch in Swift with AI baked into navigation, search, reading, and automation."
    impact: "Combines an OmniBar with chat, semantic history search, agent mode, an MCP server, and an LLM-generated widget dashboard."
    stack:
      - "Swift 6.2"
      - "SwiftUI"
      - "WebKit"
      - "Foundation Models"
      - "MCP"
    links:
      - label: "Write-up"
        url: "/posts/building-an-ai-native-browser/"
      - label: "GitHub"
        url: "https://github.com/stevemurr/wheel"
  - name: "LanguageModelContextKit"
    period: "2026"
    status: "Open-source package"
    icon: "cpu"
    summary: "A Swift package for managing context windows and sessions when building on-device AI apps with Apple Foundation Models."
    impact: "Handles token budgeting, logical threads, progressive compaction, session restoration, and file-based persistence."
    stack:
      - "Swift"
      - "Foundation Models"
      - "Token budgeting"
      - "Persistence"
    links:
      - label: "Write-up"
        url: "/posts/on-device-ai-context-management/"
      - label: "GitHub"
        url: "https://github.com/stevemurr/LanguageModelContextKit"
  - name: "DIndex"
    period: "2026"
    status: "Distributed systems"
    icon: "search"
    summary: "A decentralized semantic search engine in Rust designed for both human and LLM-driven queries."
    impact: "Uses HNSW plus BM25 with Reciprocal Rank Fusion, semantic routing via LSH, and libp2p protocols including Kademlia, GossipSub, and QUIC."
    stack:
      - "Rust"
      - "libp2p"
      - "Tantivy"
      - "USearch"
    links:
      - label: "Write-up"
        url: "/posts/decentralized-semantic-search/"
      - label: "GitHub"
        url: "https://github.com/stevemurr/dindex"
  - name: "YAGPT"
    period: "2026"
    status: "ML systems"
    icon: "brain"
    summary: "A modern GPT implementation meant to make the full LLM pipeline understandable without dumbing it down."
    impact: "Covers pre-training, SFT, LoRA and QLoRA, DPO and GRPO alignment, plus evaluation with a clean command-line interface."
    stack:
      - "Python"
      - "PyTorch"
      - "Transformers"
      - "Alignment"
    links:
      - label: "Write-up"
        url: "/posts/training-a-gpt-from-scratch/"
      - label: "GitHub"
        url: "https://github.com/stevemurr/yagpt"
profiles:
  - label: "GitHub"
    value: "github.com/stevemurr"
    url: "https://github.com/stevemurr"
  - label: "Location"
    value: "San Jose, California"
  - label: "Writing"
    value: "Technical notes and build logs"
    url: "/posts/"
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
