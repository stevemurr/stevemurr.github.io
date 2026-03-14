---
title: "On-Device AI Context Management"
date: 2026-03-08
draft: true
tags: ["swift", "ai", "apple", "open-source"]
summary: "LanguageModelContextKit — managing context windows for Apple's on-device Foundation Models."
projects: ["stevemurr/LanguageModelContextKit"]
params:
  pullquote: "On-device models have limited context windows and no built-in session management."
  cardGradient: "135deg, #1e3a5f, #0369a1, #0ea5e9"
  cardIcon: "cpu"
---

## The Problem

Apple's Foundation Models framework gives you access to on-device LLMs with a clean Swift API. What it doesn't give you is session management. The models have limited context windows, conversations don't persist across sessions, and there's no built-in mechanism for handling conversations that grow beyond the context limit.

If you're building a simple single-turn Q&A feature, this is fine. If you're building something like [Wheel](/posts/building-an-ai-native-browser) where the AI maintains ongoing conversations with page context, history, and multi-turn interactions, you need infrastructure that doesn't exist in the framework.

[LanguageModelContextKit](https://github.com/stevemurr/LanguageModelContextKit) is a Swift package that fills this gap.

## Automatic Token Budgeting

The core problem is fitting a conversation into a fixed-size window. You have a system prompt, conversation history, current page context (in Wheel's case), and the user's latest message. These compete for limited token budget.

LanguageModelContextKit manages this automatically. You define priority levels for different content categories, and the kit allocates tokens accordingly. System prompts get highest priority (they're always included). Recent conversation turns get next priority. Older history and supplementary context fill whatever space remains.

Token counting uses the model's actual tokenizer, not character-count heuristics. This matters because token counts vary significantly depending on content -- code is token-dense, natural language less so. Heuristics lead to either wasted context space or truncation at bad boundaries.

## Logical Threads

Not all conversations are the same. In Wheel, a user might have a chat thread about a specific article, a separate thread for general questions, and an agent thread running a multi-step task. These need independent context management.

The **logical threads API** lets you create named threads that maintain separate conversation histories and context allocations. Each thread has its own token budget, message history, and compaction state. Switching between threads is instant because the state is maintained independently.

```swift
let manager = ContextManager(model: .default)
let articleThread = manager.thread("article-discussion")
let agentThread = manager.thread("booking-agent")

// Each thread maintains independent context
try await articleThread.append(.user("Summarize the key arguments"))
try await agentThread.append(.user("Find flights to Tokyo next week"))
```

## Context Compaction

When a conversation exceeds its token budget, something has to give. Naive truncation (dropping old messages) loses important context. LanguageModelContextKit uses **context compaction** instead.

When a thread approaches its token limit, the kit summarizes older conversation turns using the on-device model itself. The summary replaces the original messages, preserving the semantic content in a fraction of the token cost. The compaction is progressive -- as the conversation continues to grow, earlier summaries get re-summarized into increasingly compressed representations.

The compaction trigger and aggressiveness are configurable. You can set it to compact early (preserving more headroom for new content) or late (preserving more verbatim history). For Wheel's chat mode, I compact aggressively because current page context is more important than exact conversation history. For agent mode, I compact conservatively because the agent needs precise recall of earlier steps.

## Session Bridging

Foundation Models sessions don't survive app restarts. LanguageModelContextKit bridges this gap by maintaining a durable representation of the conversation state that can be replayed into a new Foundation Models session.

When a session is restored, the kit reconstructs the conversation from its persisted state, applying compaction if the full history no longer fits. From the user's perspective, the conversation picks up where it left off.

## Durable Persistence

Conversation state is backed by **file-based stores** that write to disk. Each logical thread gets its own store file, and writes are atomic to prevent corruption from crashes or force-quits.

The persistence format is intentionally simple -- JSON with a version field for forward compatibility. No database dependency, no complex migration path. For the scale of data we're talking about (conversation histories, not millions of records), file-based storage is the right call.

## Integration with Wheel

In Wheel, LanguageModelContextKit manages all AI interactions. The chat mode creates a thread per tab, scoped to the current page. The agent mode creates a thread per task. Semantic search results are injected as context into chat threads when relevant.

The kit handles the gnarly details so the browser code can focus on the user experience. When a user switches tabs, the context switches with them. When a page changes, the page context is swapped without disrupting the conversation history. When the app restarts, conversations resume seamlessly.

The package is at [github.com/stevemurr/LanguageModelContextKit](https://github.com/stevemurr/LanguageModelContextKit). It's designed for any Swift app using Foundation Models, not just Wheel. If you're building on-device AI features for macOS or iOS and hitting context management pain, it might save you some time.
