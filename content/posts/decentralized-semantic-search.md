---
title: "Decentralized Semantic Search in Rust"
date: 2026-03-02
draft: false
tags: ["rust", "search", "p2p", "ai"]
summary: "DIndex: building a decentralized semantic search engine in Rust designed for the age of LLMs."
params:
  pullquote: "31,000 lines of Rust, 500 tests, zero concurrency bugs in production."
  cardGradient: "135deg, #1a3a2a, #065f46, #059669"
  cardIcon: "search"
---

## The Problem

Search engines are centralized. That's been fine for two decades, but LLMs are changing the calculus. When AI agents need to search the web, they're bottlenecked by a handful of gatekeepers who can rate-limit, paywall, or shape results. There's no open, decentralized alternative designed for programmatic consumption.

[DIndex](https://github.com/stevemurr/dindex) is my attempt at one: a decentralized semantic search engine built in Rust, designed to be queried by both humans and LLMs. Nodes form a peer-to-peer network, each indexing a shard of the corpus, and queries are routed semantically to the nodes most likely to have relevant results.

## Hybrid Retrieval

Pure keyword search misses semantic matches. Pure vector search misses exact matches. DIndex does both and combines them.

The dense retrieval path uses **HNSW (Hierarchical Navigable Small World)** graphs via the USearch library. Documents are embedded into vector space, and approximate nearest neighbor search finds semantically similar content. HNSW gives you sub-linear query time with tunable recall -- you trade index build time for search quality.

The sparse retrieval path uses **BM25** via Tantivy, Rust's full-text search library. This handles the cases where you're looking for specific terms, exact phrases, or technical jargon that embedding models tend to smear across the vector space.

Results from both paths are combined using **Reciprocal Rank Fusion (RRF)**. RRF is elegant in its simplicity: for each document, compute `1 / (k + rank)` for each retrieval path, then sum. It doesn't need score calibration between the two systems, and it consistently outperforms either path alone in my benchmarks.

## P2P Networking

The networking layer is built on **libp2p** with a few specific protocol choices:

- **Kademlia DHT** for peer discovery and distributed hash table operations. Nodes find each other and maintain routing tables without any central coordinator.
- **GossipSub** for broadcasting index updates and query results across the network. When a node indexes new content, it gossips the metadata to interested peers.
- **QUIC transport** for connection multiplexing and fast handshakes. QUIC's stream multiplexing means a single connection can handle multiple concurrent queries without head-of-line blocking.

The combination gives you a network that's resilient to node churn, doesn't depend on any central server, and handles NAT traversal reasonably well.

## Semantic Routing

Here's the interesting part: how do you route a query to the right nodes in a decentralized network? You can't broadcast every query to every node -- that doesn't scale.

DIndex uses **multi-band Locality-Sensitive Hashing (LSH)** for semantic routing. Each node computes LSH signatures for its indexed content and advertises them via bloom filters on the DHT. When a query comes in, its LSH signature is computed and compared against the advertised bloom filters to identify which nodes are most likely to have relevant results.

The multi-band approach lets you tune the precision-recall tradeoff. More bands mean higher precision (fewer irrelevant nodes contacted) but lower recall (might miss some relevant nodes). In practice, 8-12 bands with 4-8 rows each works well for the corpus sizes I've tested.

## Token-Aware Chunking

Documents need to be split into chunks for both embedding and indexing. Most systems use character-count or sentence-boundary splitting, which can produce chunks that are awkward sizes for the embedding model.

DIndex uses **tiktoken's BPE tokenizer** for chunk boundary decisions. Chunks are split at token boundaries with a target token count that matches the embedding model's sweet spot. This means every chunk is optimally sized for the embedding step, and you don't get the edge effects that come from splitting mid-token or mid-word.

## The Rust Experience

DIndex is about 31,000 lines of Rust with over 500 tests. Some observations from building a non-trivial system in Rust:

The ownership model is genuinely excellent for concurrent systems. The P2P networking layer has multiple async tasks sharing state, and Rust's type system catches data races at compile time. I've shipped zero concurrency bugs in production, which is not something I could say about equivalent Go or C++ code.

The ecosystem is mature enough for serious work. Tantivy, USearch, libp2p, tiktoken -- all production-quality libraries with active maintenance. Five years ago, some of these wouldn't have existed.

Compile times are real. A clean build takes a while, and the edit-compile-test cycle is slower than I'd like. `cargo check` and incremental compilation help, but it's still the main friction point.

Error handling with `Result` and `?` is the right model. After spending time in languages with exceptions, having errors as values that the type system tracks feels obviously correct. The `anyhow` and `thiserror` crates fill in the ergonomic gaps.

The project is at [github.com/stevemurr/dindex](https://github.com/stevemurr/dindex). It's still early, but the core retrieval and networking layers are solid, and I'm using it as the search backend for some of my other projects.
