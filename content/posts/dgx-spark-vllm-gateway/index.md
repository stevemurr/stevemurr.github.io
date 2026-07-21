---
title: "Serving and Routing LLMs: vLLM, Nemotron, and the Gateway"
date: 2026-03-17
draft: true
tags: ["dgx-spark", "vllm", "nemotron", "litellm", "quantization", "streaming"]
series: ["DGX Spark AI Lab"]
weight: 2
ShowPostNavLinks: true
summary: "How I serve Nemotron 3 Nano and GPT-OSS 120B through vLLM, route everything through LiteLLM, and fixed the streaming reasoning bug that drops thinking content mid-stream."
params:
  pullquote: "vLLM drops the reasoning field mid-stream. Here's the fix."
  cardGradient: "135deg, #ff6b35, #1a1a2e, #0d0d1a"
  cardIcon: "cpu"
---

## Why Nemotron 3 Nano

- **Architecture:** Hybrid Mamba-Transformer MoE — 31.6B total parameters, only 3.2B active per token
- This matters for the Spark: MoE means you get large-model quality at small-model inference cost
- Trained by NVIDIA, optimized for their hardware stack
- Supports tool calling (via `qwen3_coder` parser) and extended thinking (via custom `nano_v3` reasoning parser)

## NVFP4 Quantization: Fitting Models on the Spark

- NVFP4 (NVIDIA FP4) compresses weights to 4-bit floating point
- Cuts memory footprint roughly in half compared to FP8, enabling 30B-class models on the Spark alongside other services
- vLLM image: `avarok/dgx-vllm-nvfp4-kernel:v22` — includes the NVFP4 quantization kernel for ARM64 Blackwell

### GPT-OSS 120B as the Alternative

- Full 120B parameter model with MXFP4 (microscaling FP4) quantization
- 131K token context window, but only 2 parallel sequences (GPU memory trade-off)
- Profile-gated in docker-compose — only runs when explicitly activated via `./model swap`
- Uses the stock NVIDIA vLLM image: `nvcr.io/nvidia/vllm:26.02-py3`

## vLLM Configuration Deep-Dive

### Nemotron 3 Nano (Primary)

```yaml
# Key environment variables from docker-compose.yml
VLLM_ATTENTION_BACKEND: flashinfer
VLLM_USE_FLASHINFER_SAMPLER: 1

# vLLM server arguments
--model nvidia/Nemotron-3-Nano-30B-A3B-NVFP4
--gpu-memory-utilization 0.75
--max-model-len 65536
--max-num-seqs 16
--kv-cache-dtype fp8
--enable-reasoning --reasoning-parser nano_v3
--enable-auto-tool-choice --tool-call-parser qwen3_coder
```

- **FlashInfer backend** — optimized attention for Blackwell GPUs (Flash Attention 3 isn't compatible with ARM64 Blackwell, so FlashInfer is the right choice)
- **FP8 KV cache** — halves KV cache memory, enabling longer contexts and more parallel sequences
- **16 parallel sequences** — enough for concurrent users through Open WebUI
- **65K context** — long enough for most conversations, short enough to leave room for other services

### GPT-OSS 120B (Alternative)

```yaml
--model nvidia/GPT-OSS-120B-MXFP4
--gpu-memory-utilization 0.70
--max-model-len 131072
--max-num-seqs 2
--kv-cache-dtype fp8
```

- Only 2 sequences — this model fills most of the GPU; it's meant for single-user deep work
- 131K context for long document analysis

## LiteLLM as the Unified Gateway

- Single API endpoint on port 4000, OpenAI-compatible
- Routes requests to the right backend based on model name:

```yaml
# litellm/config.yaml
model_list:
  - model_name: nemotron3-nano
    litellm_params:
      api_base: http://nemotron3:8000/v1
      model: openai/nemotron3-nano

  - model_name: gpt-oss-120b
    litellm_params:
      api_base: http://gpt-oss:8000/v1
      model: openai/gpt-oss-120b

  - model_name: bge-m3
    litellm_params:
      api_base: http://embeddings:8000/v1
      model: openai/bge-m3

  - model_name: tts-1
    litellm_params:
      api_base: http://qwen-tts:8880/v1
      model: openai/tts-1
    model_info:
      mode: audio_speech

  - model_name: whisper-1
    litellm_params:
      api_base: http://whisper:8000/v1
      model: openai/whisper-1
    model_info:
      mode: audio_transcription
```

- Any OpenAI-compatible client can hit `http://litellm:4000/v1` — Open WebUI, Letta, external scripts — they all go through one gateway
- Embeddings, TTS, and STT are exposed as standard OpenAI model names (`bge-m3`, `tts-1`, `whisper-1`)

## The Streaming Reasoning Bug

- Nemotron 3 Nano supports extended thinking — it outputs a `<think>...</think>` block before its response
- vLLM correctly extracts this into a `reasoning` field on streamed chat completion chunks
- **The problem:** LiteLLM's `CustomStreamWrapper` drops the `reasoning` field in two places:
  1. `Delta.__init__` doesn't recognize the `reasoning` key from vLLM, so it's silently discarded
  2. `is_chunk_non_empty` considers reasoning-only chunks as empty and filters them out
- **Result:** Thinking content vanishes mid-stream — the UI shows nothing during the reasoning phase

<!-- IMAGE: streaming-before-after.png — terminal showing broken vs fixed streaming output -->

## The Fix: `patch_reasoning_streaming.py`

Two monkey-patches applied at LiteLLM startup:

### Patch 1: Map `reasoning` → `reasoning_content` in Delta

```python
_orig_delta_init = Delta.__init__

def _patched_delta_init(self, **kwargs):
    # vLLM sends "reasoning", LiteLLM expects "reasoning_content"
    if "reasoning" in kwargs and "reasoning_content" not in kwargs:
        kwargs["reasoning_content"] = kwargs.pop("reasoning")
    _orig_delta_init(self, **kwargs)

Delta.__init__ = _patched_delta_init
```

### Patch 2: Don't Drop Reasoning-Only Chunks

```python
_orig_is_chunk_non_empty = CustomStreamWrapper.is_chunk_non_empty

def _patched_is_chunk_non_empty(self, completion_obj, model_response):
    if _orig_is_chunk_non_empty(self, completion_obj, model_response):
        return True
    # Check the original chunk for reasoning content
    original = getattr(self, "response_iterator", None)
    if original and hasattr(original, "__dict__"):
        chunk = getattr(original, "_current_chunk", None)
        if chunk:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and (getattr(delta, "reasoning", None)
                         or getattr(delta, "reasoning_content", None)):
                return True
    return False

CustomStreamWrapper.is_chunk_non_empty = _patched_is_chunk_non_empty
```

**Reference:** [litellm#20246](https://github.com/BerriAI/litellm/issues/20246)

## Loading the Patch via Custom Entrypoint

```bash
# litellm/entrypoint.sh
exec python3 -c "
import sys
sys.path.insert(0, '/app/litellm_custom')
import patch_reasoning_streaming   # ← patches apply on import
from litellm.proxy.proxy_cli import run_server
sys.argv = ['litellm'] + sys.argv[1:]
run_server()
" "$@"
```

- The patch module is mounted into the container at `/app/litellm_custom`
- Importing it triggers the monkey-patches before the proxy starts
- No need to fork LiteLLM — patches are applied at runtime

## Custom vLLM Reasoning Parser: `nano_v3`

- Nemotron 3 Nano has a quirk: when `enable_thinking=False`, it puts all output in the reasoning block instead of the content block
- The `nano_v3` parser extends vLLM's `DeepSeekR1ReasoningParser` with a swap:

```python
@ReasoningParserManager.register_module("nano_v3")
class NanoV3ReasoningParser(DeepSeekR1ReasoningParser):
    def extract_reasoning(self, model_output, request):
        reasoning_content, final_content = super().extract_reasoning(
            model_output, request
        )
        if enable_thinking is False and final_content is None:
            # Swap: move reasoning to content so it shows as normal output
            reasoning_content, final_content = final_content, reasoning_content
        return reasoning_content, final_content
```

- Registered as a vLLM plugin, loaded via `--reasoning-parser nano_v3` in the vLLM launch args

<!-- IMAGE: reasoning-flow.png — diagram showing reasoning content path: model → vLLM (nano_v3 parser) → LiteLLM (patched Delta) → Open WebUI -->

## End-to-End Reasoning Flow

1. **Model** generates `<think>reasoning</think>response`
2. **vLLM** (`nano_v3` parser) extracts reasoning vs content, streams chunks with `reasoning` field
3. **LiteLLM** (patched) maps `reasoning` → `reasoning_content`, preserves reasoning-only chunks
4. **Open WebUI** renders thinking in a collapsible block, response as normal chat

## Key Files Referenced

- `docker-compose.yml` — `nemotron3`, `gpt-oss`, `litellm` service definitions
- `litellm/config.yaml` — Model routing configuration for all 5 models
- `litellm/patch_reasoning_streaming.py` — Monkey-patches for streaming reasoning
- `litellm/entrypoint.sh` — Custom entrypoint that loads patches before LiteLLM starts
- `vllm/nano_v3_reasoning_parser.py` — Custom reasoning parser for Nemotron 3 Nano
