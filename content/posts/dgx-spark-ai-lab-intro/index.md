---
title: "Why I Built My Own AI Lab on a DGX Spark"
date: 2026-03-17
draft: true
tags: ["dgx-spark", "self-hosted", "llm", "docker", "nvidia"]
series: ["DGX Spark AI Lab"]
weight: 1
ShowPostNavLinks: true
summary: "One docker compose up gives me a full AI platform — model serving, voice I/O, deep research, persistent memory, and monitoring — all running on a single NVIDIA DGX Spark."
params:
  pullquote: "One docker compose up → 14 services, full AI platform."
  cardGradient: "135deg, #76b900, #1a1a2e, #0d0d1a"
  cardIcon: "server"
---

## What Is the DGX Spark?

- NVIDIA's desktop-class AI workstation — ARM64 (Grace Blackwell), 128 GB unified GPU memory
- Small form factor, runs on a single power supply — sits on a desk, not in a rack
- Designed for AI developers and researchers who want local GPU inference without cloud costs
- The key constraint: one GPU's worth of memory, so every byte of VRAM allocation matters

## The Pitch: One Command, Full Platform

- The entire stack launches with `docker compose up`
- 14 Docker services covering every layer of a self-hosted AI platform:
  - **Model serving:** vLLM instances for chat (Nemotron 3 Nano 30B or GPT-OSS 120B), embeddings (BGE-M3), TTS (Qwen3-TTS), STT (Whisper)
  - **AI gateway:** LiteLLM as a unified OpenAI-compatible API routing layer
  - **Chat UI:** Open WebUI with baked-in research tools
  - **Persistent memory:** Letta (forked) with pgvector storage
  - **Search:** Self-hosted SearXNG metasearch engine
  - **Monitoring:** Prometheus + Grafana scraping vLLM metrics
  - **Remote access:** Tailscale VPN sidecar + Cloudflare Tunnel
- Everything on a single bridge network (`llm-platform`), services discover each other by container name

<!-- IMAGE: architecture-diagram.png — block diagram of all 14 services and how they connect on the llm-platform network -->

## Architecture Overview

### Database Layer
- `litellm-db` — PostgreSQL 15 for LiteLLM configuration storage
- `letta-db` — PostgreSQL with pgvector 0.5.1 for Letta's embedding storage

### Model Servers
- `nemotron3` — Primary chat model: Nemotron 3 Nano 30B-A3B with NVFP4 quantization (75% GPU, 64K context, 16 parallel sequences)
- `gpt-oss` — Profile-gated alternative: GPT-OSS 120B with MXFP4 quantization (70% GPU, 131K context, 2 sequences)
- `embeddings` — BGE-M3 multilingual embeddings (10% GPU, 8K context)
- `qwen-tts` — Qwen3-TTS text-to-speech with vLLM-Omni backend (5% GPU, voice cloning support)
- `whisper` — Whisper medium for speech-to-text (GPU-accelerated)

### Gateway & UI
- `litellm` — Unified API gateway routing chat, embeddings, TTS, and STT through a single endpoint on port 4000
- `open-webui` — Chat interface on port 3001, extended with GPT Researcher

### Memory, Search, Monitoring, Access
- `letta` — Persistent memory agent (custom fork with streaming + reasoning support)
- `searxng` — Self-hosted metasearch (Google, DuckDuckGo, Wikipedia, ArXiv, GitHub)
- `prometheus` + `grafana` — Metrics scraping and dashboards
- `ts-open-webui` — Tailscale VPN sidecar for secure remote access
- `cloudflared` — Cloudflare Tunnel for internet-facing access

## The `model` CLI — Swapping Models at Runtime

- GPU memory is finite — you can't run Nemotron 3 Nano and GPT-OSS 120B simultaneously
- The `model` CLI manages this:

```bash
# Check what's running
./model
# → Shows status of all 5 GPU services (nemotron3, gpt-oss, embeddings, qwen-tts, whisper)

# Swap chat models (stops one, starts the other on port 8355)
./model swap

# Load or unload individual models
./model load qwen-tts
./model unload whisper
```

- Both chat models bind to port 8355 — the CLI handles stopping the active one before starting the other
- Profile-gated services (like `gpt-oss`) are activated with `docker compose --profile gpt-oss`
- Interactive menus when no model name is provided

<!-- IMAGE: model-cli.png — terminal screenshot of ./model showing status of all GPU services -->

## GPU Resource Allocation Strategy

- **75%** → Primary chat model (Nemotron 3 Nano or GPT-OSS)
- **10%** → Embeddings (BGE-M3)
- **5%** → TTS (Qwen3-TTS)
- Whisper runs on GPU but doesn't need a fixed allocation
- This split is tuned for the Spark's 128 GB unified memory — enough headroom for KV cache growth under concurrent requests

## What This Series Will Cover

1. **This post** — Architecture overview and the `model` CLI
2. **Serving and Routing LLMs** — vLLM configuration, Nemotron 3 Nano vs GPT-OSS 120B, LiteLLM gateway, and fixing streaming reasoning
3. **Deep Research at Home** — GPT Researcher + SearXNG as a self-hosted research tool inside Open WebUI
4. **Giving AI a Voice** — Qwen3-TTS, Whisper, voice cloning, and ARM64 audio builds
5. **Memory, Monitoring, and Keeping It All Running** — Letta persistent memory, Prometheus/Grafana dashboards, Tailscale/Cloudflare access, and operational lessons

## Key Files Referenced

- `docker-compose.yml` — All 14 service definitions, volumes, network, profiles
- `model` — Bash CLI for GPU model management (load, unload, swap, status)
