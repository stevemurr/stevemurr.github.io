---
title: "Training a GPT from Scratch"
date: 2026-03-05
draft: false
tags: ["python", "ai", "machine-learning", "transformers"]
summary: "Building YAGPT — a clean, modern GPT implementation for learning the full LLM pipeline."
projects: ["stevemurr/yagpt"]
params:
  pullquote: "The gap between reading a paper and implementing it correctly is larger than you'd expect."
  cardGradient: "135deg, #2d1b69, #5b21b6, #7c3aed"
  cardIcon: "brain"
---

## Why Build Yet Another GPT?

There's a gap between reading a paper and understanding it. I've read the attention paper, the GPT papers, the RLHF papers -- but every time I tried to explain a detail to someone, I'd hit a wall where my understanding was surface-level. The only fix I know for that is to implement the thing yourself.

[YAGPT](https://github.com/stevemurr/yagpt) is the result. It's a clean, modern GPT implementation that covers the full pipeline: pre-training, supervised fine-tuning, alignment, and evaluation. Not a toy -- it uses current best practices -- but designed to be readable. Every file is around 200 lines, the CLI is straightforward, and there's no abstraction for abstraction's sake.

## Architecture Choices

The model uses a modern transformer stack, and each choice is deliberate:

- **RoPE (Rotary Position Embeddings)** -- encodes position information directly into the attention computation. Unlike learned position embeddings, RoPE generalizes to sequence lengths not seen during training and has nice theoretical properties around relative position encoding.
- **RMSNorm** -- a simplified layer normalization that skips the mean-centering step. Faster than LayerNorm with no measurable quality loss. It's one of those "why didn't we do this from the start" improvements.
- **SwiGLU** -- a gated activation function for the feed-forward blocks. Empirically outperforms ReLU and GELU for a given parameter budget. The gating mechanism lets the network learn which features to pass through.
- **GQA (Grouped Query Attention)** -- a middle ground between multi-head attention and multi-query attention. Groups of query heads share a single key-value head, which dramatically reduces KV-cache memory during inference with minimal quality impact.
- **QK-Norm** -- normalizes the query and key vectors before computing attention scores. Prevents attention logits from growing too large during training, which improves stability especially at scale.
- **Flash Attention** -- the fused CUDA kernel that computes attention without materializing the full N x N attention matrix. Makes training on longer sequences practical and is strictly better than naive attention.

## The Dual Optimizer Approach

One of the more interesting implementation details is the optimizer setup. YAGPT uses two optimizers simultaneously:

- **Muon** for attention projections and feed-forward blocks -- Muon is designed for matrix-valued parameters and tends to converge faster on these structured weight matrices.
- **AdamW** for embeddings and the final language model head -- these parameters don't have the same matrix structure, so the standard adaptive optimizer works well.

The parameter groups are split automatically based on tensor dimensionality. It's a small implementation detail that has a noticeable effect on training dynamics.

## The Full Pipeline

The project covers the complete LLM lifecycle:

**Pre-training** uses standard next-token prediction with mixed-precision training, gradient accumulation, and learning rate scheduling with warmup and cosine decay.

**Supervised Fine-Tuning (SFT)** uses ChatML formatting to teach the model to follow instructions. The data pipeline handles conversation templates and proper masking so the model only learns to predict assistant responses, not user prompts.

**Parameter-Efficient Fine-Tuning** via LoRA and QLoRA. LoRA injects low-rank adapter matrices into attention layers, and QLoRA adds 4-bit quantization of the base weights to cut memory further. Both are implemented from scratch rather than using a library -- again, the point is understanding.

**Alignment** includes three approaches:
- **DPO (Direct Preference Optimization)** -- learns from preference pairs without needing a separate reward model
- **SimPO** -- a simplified variant of DPO that uses sequence-level scoring
- **GRPO (Group Relative Policy Optimization)** -- the approach used by DeepSeek, which samples multiple completions and uses relative rankings within the group

**Evaluation** hooks into EleutherAI's lm-eval-harness for standardized benchmarking. You can run standard evals (HellaSwag, ARC, etc.) against your trained models with a single CLI command.

## Code Organization

I'm opinionated about code organization in ML projects. The typical research codebase is a 2000-line monolith with global state everywhere, and I find that actively harmful to understanding.

Every file in YAGPT is roughly 200 lines. The model definition is separate from the training loop, which is separate from the data pipeline, which is separate from the evaluation harness. The CLI uses subcommands: `yagpt train`, `yagpt sft`, `yagpt align`, `yagpt eval`. You can read any single file and understand what it does without context from the rest of the codebase.

## What I Learned

The biggest lesson is that the gap between "I understand the concept" and "I can implement it correctly" is larger than you'd expect. Some specifics:

Numerical stability is everything. Multiple components (attention scaling, QK-norm, loss computation) need careful handling to avoid NaN gradients. Papers mention this in passing; in practice, it's where you spend a lot of debugging time.

The alignment algorithms are conceptually simple but tricky to implement correctly. DPO in particular is sensitive to how you compute the reference model log-probabilities. Getting this wrong doesn't crash your training -- it just silently produces a worse model, which is harder to debug.

The full project is at [github.com/stevemurr/yagpt](https://github.com/stevemurr/yagpt). If you're trying to build intuition for how LLMs actually work under the hood, I'd recommend this kind of exercise. Reading papers is necessary but not sufficient.
