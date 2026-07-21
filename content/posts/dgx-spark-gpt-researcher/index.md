---
title: "Deep Research at Home: GPT Researcher + SearXNG"
date: 2026-03-17
draft: true
tags: ["dgx-spark", "gpt-researcher", "searxng", "research", "open-webui"]
series: ["DGX Spark AI Lab"]
weight: 3
ShowPostNavLinks: true
summary: "How I replaced Tavily with self-hosted SearXNG, baked GPT Researcher into Open WebUI, and built a tool that runs autonomous multi-step research queries entirely on local infrastructure."
params:
  pullquote: "Autonomous multi-step research, entirely self-hosted."
  cardGradient: "135deg, #00d4aa, #1a1a2e, #0d0d1a"
  cardIcon: "search"
---

## Open WebUI as the Chat Interface

- Open WebUI provides the primary user interface for the entire platform (port 3001)
- Why it was chosen:
  - OpenAI-compatible — works directly with LiteLLM as the backend
  - Supports tool/function calling — critical for integrating GPT Researcher
  - Built-in RAG with web search support (configured to use SearXNG)
  - TTS and STT integration (routes through LiteLLM to Qwen-TTS and Whisper)
  - Multi-user support with authentication
- The Docker image is extended with a custom Dockerfile to bake in GPT Researcher:

```dockerfile
# open-webui/Dockerfile
FROM ghcr.io/open-webui/open-webui:main
USER root
RUN pip install --no-cache-dir gpt-researcher==0.14.8
```

## What GPT Researcher Does

- Autonomous multi-step research agent — give it a question, it:
  1. Plans sub-queries to break down the research question
  2. Searches the web for each sub-query
  3. Scrapes and ranks the most relevant sources
  4. Synthesizes findings into a structured report
- Supports configurable breadth (sub-queries per step) and depth (iteration rounds)
- Originally requires Tavily for web search — we replace that with self-hosted SearXNG

## Replacing Tavily with Self-Hosted SearXNG

- **Why:** No API costs, no rate limits, full privacy — all search queries stay local
- SearXNG is a metasearch engine that aggregates results from multiple sources
- Runs as a Docker container on port 8889

### SearXNG Configuration

```yaml
# searxng/settings.yml
server:
  limiter: false          # No rate limiting for local use
  image_proxy: false

search:
  safe_search: 0          # Disabled for research completeness
  autocomplete: ""
  default_lang: en
  formats:
    - html
    - json               # Required — GPT Researcher queries via JSON API

engines:
  - name: google
    engine: google
    shortcut: g
  - name: duckduckgo
    engine: duckduckgo
    shortcut: ddg
  - name: wikipedia
    engine: wikipedia
    shortcut: wp
  - name: arxiv
    engine: arxiv
    shortcut: arx
  - name: github
    engine: github
    shortcut: gh
```

- Five engines enabled — broad coverage from general web (Google, DuckDuckGo) to academic (ArXiv) to code (GitHub)
- JSON format is critical — GPT Researcher hits the SearXNG JSON API, not the HTML interface

<!-- IMAGE: searxng-engines.png — SearXNG admin showing enabled engines -->

## Building the Open WebUI Tool: `gpt_researcher_tool.py`

- A 329-line Python tool that wraps GPT Researcher as a native Open WebUI function
- Registered as a tool that can be invoked from any chat conversation

### Configuration via Valves

```python
class Valves(BaseModel):
    OPENAI_BASE_URL: str = "http://litellm:4000/v1"
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", os.getenv("LITELLM_MASTER_KEY", ""))
    EMBEDDING_MODEL: str = "openai:bge-m3"
    FAST_LLM: str = "nemotron3-nano"
    SMART_LLM: str = "nemotron3-nano"
    STRATEGIC_LLM: str = "nemotron3-nano"
    RETRIEVER: str = "searx"
    SEARX_URL: str = "http://searxng:8080"
    REPORT_TYPE: str = "research_report"
    BREADTH: int = 4        # Sub-queries per research step
    DEPTH: int = 2          # Iteration rounds
    MAX_SEARCH_RESULTS: int = 10
    TIMEOUT_SECONDS: int = 600
```

- All LLM calls route through LiteLLM → Nemotron 3 Nano (the platform's own model does the research reasoning)
- Embeddings use BGE-M3 through LiteLLM for source ranking
- Search uses the local SearXNG instance — no external API keys needed

### Live Status Updates

- The tool communicates progress back to Open WebUI via the event emitter
- Messages are classified into milestones and status updates:

```
🔍 Starting research for: "What are the latest advances in RLHF?"
🗂️ Planned 4 sub-queries
🔍 Researching: "RLHF recent papers 2025"
🌐 Scraping 8 sources
📚 Ranking content relevance
✍️ Writing final report
```

- Users see real-time progress as the research runs, not just a spinner

### How It Runs

```python
async def deep_research(
    self,
    query: str,
    breadth: int = None,
    depth: int = None,
    report_type: str = None,
    max_search_results: int = None,
    __event_emitter__=None
) -> str:
```

- Runs GPT Researcher in a background thread with environment variable overrides
- Queue-based communication between the research thread and the async event emitter
- Returns the final report as markdown when complete
- 600-second timeout by default (research can take several minutes for deep queries)

<!-- IMAGE: research-demo.png — Open WebUI screenshot showing a research query in progress with status updates -->

## Baking GPT Researcher into the Docker Image

- GPT Researcher is installed directly into the Open WebUI image (not a sidecar container)
- This keeps the integration simple — the tool imports `gpt_researcher` directly
- The tool file (`gpt_researcher_tool.py`) must be manually imported into Open WebUI's Functions after the stack starts
- Version pinned to `0.14.8` for reproducibility

## Demo: Running a Research Query End-to-End

1. Open a chat in Open WebUI, enable the GPT Researcher tool
2. Ask: *"What are the current best practices for running LLMs on edge devices?"*
3. The tool kicks off:
   - Plans sub-queries (e.g., "edge LLM optimization techniques 2026", "quantization methods for on-device inference")
   - Searches via SearXNG → Google, DuckDuckGo, ArXiv
   - Scrapes top results, ranks by relevance using BGE-M3 embeddings
   - Synthesizes a structured report with citations
4. Live status updates stream into the chat as the research progresses
5. Final report appears as a markdown document with sources

### The Full Request Path

```
User → Open WebUI → Tool (gpt_researcher_tool.py)
  → GPT Researcher → SearXNG (search) + LiteLLM (LLM reasoning + embeddings)
    → Nemotron 3 Nano (reasoning) + BGE-M3 (ranking)
  → Final report → Open WebUI
```

## Key Files Referenced

- `open-webui/Dockerfile` — Extends Open WebUI with gpt-researcher v0.14.8
- `open-webui/tools/gpt_researcher_tool.py` — Full tool wrapper with live status, configurable valves
- `searxng/settings.yml` — Engine configuration (Google, DuckDuckGo, Wikipedia, ArXiv, GitHub)
- `docker-compose.yml` — `open-webui` and `searxng` service definitions
