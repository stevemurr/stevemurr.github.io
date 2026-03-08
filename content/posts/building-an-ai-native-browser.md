---
title: "Building an AI-Native Browser from Scratch"
date: 2026-03-01
draft: false
tags: ["swift", "ai", "macos", "browser"]
summary: "How I built Wheel, a macOS browser with on-device AI baked into every layer."
---

## Why Build a Browser?

I kept waiting for someone to build the browser I wanted to use. Every major browser bolted on an AI sidebar or dropped a chatbot into a panel, and none of it felt integrated. It felt like sticking a turbocharger on a bicycle -- technically more powerful, but the underlying thing was never designed for it.

The thesis behind [Wheel](https://github.com/stevemurr/wheel) is simple: what if the browser was designed from day one with AI as a first-class citizen? Not a feature you toggle on, but something woven into navigation, search, history, and page interaction. The browser chrome itself becomes an AI interface.

So I built one.

## Architecture

Wheel is written in Swift 6.2 with SwiftUI, targeting macOS on Apple Silicon. WebKit handles rendering (you're not going to catch me writing a layout engine). Everything else -- the chrome, the AI layer, the data pipeline -- is custom.

The central UI concept is the **OmniBar**, which replaces the traditional address bar with five distinct modes:

- **Address Mode** -- your standard URL bar, but with fuzzy matching against history and bookmarks
- **Chat Mode** -- conversational AI grounded in the current page context. Ask questions about what you're reading and get answers that reference the actual content
- **Semantic Search Mode** -- search your entire browsing history by meaning, not just keywords. "That article about cache invalidation strategies I read last month" actually works
- **Agent Mode** -- multi-step browser automation. "Find the cheapest flight to Tokyo next weekend and screenshot the options" kicks off an autonomous workflow
- **Reading List Mode** -- saved content with AI-generated summaries and tag suggestions

The mode switching is fluid. You can start typing a URL, realize you want to ask a question about it, hit Tab, and you're in chat mode with the page already in context.

## On-Device AI

This is the part I'm most excited about. Wheel uses Apple's Foundation Models framework exclusively -- no API keys, no cloud calls, no OpenAI dependency. Everything runs on-device via Apple Silicon's neural engine.

The practical implications are significant. There's no usage cost, no rate limiting, no privacy concerns about shipping your browsing data to a third party. The tradeoff is that on-device models are smaller and less capable than frontier cloud models, but for the kinds of tasks a browser AI needs to do -- summarization, question answering, classification, simple planning -- they're more than sufficient.

Context management turned out to be one of the harder problems. On-device models have limited context windows, so I built [LanguageModelContextKit](/posts/on-device-ai-context-management) to handle automatic token budgeting and context compaction. More on that in a separate post.

## Agent Mode

Agent mode is where things get interesting. You describe a multi-step task in natural language, and Wheel breaks it down into a sequence of browser actions: navigate, click, scroll, extract, screenshot, fill forms, and so on.

Under the hood, the agent operates on a simplified DOM representation. I extract the interactive elements from the page, serialize them into a compact format the model can reason about, and let it plan and execute steps in a loop. It has a retry mechanism for when actions fail and can ask clarifying questions if the task is ambiguous.

It's not as capable as something running GPT-4 or Claude, but for straightforward multi-step workflows it's surprisingly useful -- and it works offline.

## Semantic History Search

Traditional browser history is almost useless. You get a chronological list of URLs and page titles, and good luck finding anything from more than a day ago.

Wheel indexes every page you visit into a local vector store using [VecturaKit](https://github.com/stevemurr/vecturakit), a lightweight vector indexing library I built for this purpose. Pages are chunked, embedded on-device, and stored locally. When you search in semantic mode, your query gets embedded and matched against your history using cosine similarity.

The difference is night and day. Instead of trying to remember the exact title or URL, you describe what you're looking for conceptually. The vector index handles the rest.

## Widget Dashboard

New tabs show a widget dashboard where each widget is generated and laid out by the LLM. You can ask for widgets -- "show me a weather widget and my recent GitHub notifications" -- and the model generates SwiftUI views on the fly using structured output. Widgets persist across sessions and can be rearranged or dismissed.

This was one of those features that started as a proof of concept and turned out to be genuinely useful. Having your new tab page adapt to your actual needs instead of showing a static grid of frequently visited sites is a meaningful improvement.

## MCP Server

Wheel includes a built-in [Model Context Protocol](https://modelcontextprotocol.io) server, which means external tools can interact with the browser programmatically. Other AI agents can navigate pages, extract content, take screenshots, and interact with web applications through Wheel's MCP interface.

This turns the browser into a tool that other AI systems can use, which opens up some interesting workflows. Your coding assistant can look things up on the web. Your automation scripts can interact with web apps that don't have APIs.

## What I Learned

Building a browser is humbling. Even with WebKit doing the heavy lifting on rendering, the sheer surface area of browser functionality is enormous. Tab management, history, bookmarks, downloads, permissions, cookies, extensions -- each of these is a substantial subsystem.

Some specific lessons:

- **WebKit's API surface is huge** and the documentation is uneven. I spent a lot of time reading WebKit source code to understand behavior that wasn't documented.
- **On-device model latency matters more than capability** for a browser use case. Users expect browser UI to be instant. I had to carefully manage when and how the model is invoked to avoid making the browser feel sluggish.
- **Swift concurrency is excellent** for this kind of application. The actor model maps naturally onto a browser architecture where you have multiple tabs, background indexing, and AI inference all running concurrently.
- **Context window management is a first-class problem.** This is what led me to build LanguageModelContextKit as a separate package. You cannot just dump entire web pages into a model context and hope for the best.

The project is open source at [github.com/stevemurr/wheel](https://github.com/stevemurr/wheel). It's my daily driver now, which is either a testament to its quality or my stubbornness. Probably both.
