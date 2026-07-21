---
title: "Giving AI a Voice: Qwen3-TTS, Whisper, and Voice Cloning"
date: 2026-03-17
draft: true
tags: ["dgx-spark", "tts", "stt", "whisper", "qwen-tts", "voice-cloning"]
series: ["DGX Spark AI Lab"]
weight: 4
ShowPostNavLinks: true
summary: "Building a full audio pipeline on ARM64 — Qwen3-TTS for speech synthesis with voice cloning, Whisper for transcription, all routed through LiteLLM as OpenAI-compatible tts-1 and whisper-1 endpoints."
params:
  pullquote: "Voice cloning, TTS, and STT — all local, all OpenAI-compatible."
  cardGradient: "135deg, #7b2ff7, #1a1a2e, #0d0d1a"
  cardIcon: "mic"
---

## The Audio Pipeline

- Full bidirectional voice I/O: speech in, text processing, speech out
- **STT (Whisper)** → transcribes user speech to text
- **LLM (Nemotron 3 Nano)** → processes the text, generates a response
- **TTS (Qwen3-TTS)** → synthesizes the response as speech
- All three stages route through LiteLLM as standard OpenAI model names

<!-- IMAGE: audio-pipeline.png — diagram showing STT → LLM → TTS flow with service names and ports -->

## Building Qwen3-TTS for ARM64

- The DGX Spark is ARM64 (Grace Blackwell) — most TTS Docker images target x86_64
- Building Qwen3-TTS requires a custom multi-stage Dockerfile (83 lines)

### The Build: `qwen-tts/Dockerfile.vllm`

```dockerfile
FROM nvcr.io/nvidia/pytorch:25.03-py3

# Audio processing dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg libsndfile1 libsox-dev sox

# CUDA 13.0 runtime (required for vLLM cu130 wheel on Blackwell)
RUN apt-get install -y cuda-cudart-13-0
ENV LD_LIBRARY_PATH=/usr/local/cuda-13.0/lib64:${LD_LIBRARY_PATH}

# vLLM v0.16.0 ARM64 wheel (cu130)
RUN pip install https://...vllm-0.16.0...aarch64.whl

# Flash Attention 2 from source
# (FA3 is incompatible with Blackwell on ARM64)
RUN pip install flash-attn --no-build-isolation

# vLLM-Omni from source (fa3-fwd removed for ARM64 compat)
RUN pip install git+https://...vllm-omni...

# Audio + ML dependencies
RUN pip install torchaudio==2.7.0 transformers==4.57.3 \
    accelerate==1.12.0 librosa soundfile sox \
    onnxruntime einops fastapi uvicorn pydantic \
    inflect aiofiles pydub httpx
```

- **Base image:** NVIDIA PyTorch container — ARM64-native with CUDA support
- **Key challenge:** Flash Attention 3 doesn't work on ARM64 Blackwell, so FA2 is built from source
- **vLLM-Omni:** Modified fork with `fa3-fwd` removed for ARM64 compatibility
- **Build context:** Parent directory — copies the `Qwen3-TTS-Openai-Fastapi/` sibling repo

### Runtime Configuration

```yaml
# docker-compose.yml (qwen-tts service)
environment:
  TTS_BACKEND: vllm_omni
  VOICE_STUDIO_ENABLED: "true"
deploy:
  resources:
    reservations:
      devices:
        - capabilities: [gpu]
# 5% GPU allocation
```

- Uses the `vllm_omni` backend for GPU-accelerated inference
- Exposes port 8003 for the API and Voice Studio UI
- Health check: `curl http://localhost:8880/health` every 30s with 120s startup grace period

## Voice Cloning via `clone:ProfileName`

- Qwen3-TTS supports voice cloning — match a target voice from a reference audio sample
- Invoke via the voice parameter: `clone:ProfileName`
- Voice profiles are stored in a persistent Docker volume (`qwen-tts-voices`)
- Voice Studio UI (enabled via `VOICE_STUDIO_ENABLED=true`) provides a web interface for managing voice profiles

<!-- IMAGE: voice-studio.png — screenshot of Voice Studio UI at :8003/voice-studio -->

## Voice Studio UI

- Web interface at `:8003/voice-studio` for voice management
- Upload reference audio samples to create voice profiles
- Preview synthesized speech with different voices
- Profiles persist across container restarts via the `qwen-tts-voices` volume

## Whisper on GPU: ARM64 Build

- Simpler build than TTS — Whisper's dependencies are more straightforward

```dockerfile
# whisper/Dockerfile
FROM nvcr.io/nvidia/pytorch:25.03-py3

RUN apt-get update && apt-get install -y ffmpeg

RUN pip install --no-cache-dir \
    fastapi==0.135.1 \
    uvicorn[standard]==0.42.0 \
    openai-whisper==20250625 \
    python-multipart==0.0.22

COPY server.py /app/server.py
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
```

- **Base:** Same NVIDIA PyTorch container (ARM64-native)
- **Model:** Whisper `medium` — good accuracy/speed trade-off for local use
- **Server:** Custom FastAPI server (`server.py`) wrapping OpenAI Whisper
- GPU-accelerated transcription — the PyTorch base image provides CUDA support out of the box

## Routing Through LiteLLM

- Both audio services are exposed as OpenAI-compatible endpoints through LiteLLM:

```yaml
# litellm/config.yaml
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

- Any client that speaks the OpenAI audio API can use these — `tts-1` for synthesis, `whisper-1` for transcription
- Open WebUI is configured to use these routes for its built-in voice chat feature

## Integration with Open WebUI

- Open WebUI's TTS and STT settings point to LiteLLM:
  - TTS model: `tts-1` (routes to Qwen3-TTS)
  - STT model: `whisper-1` (routes to Whisper)
- Users get voice chat in the browser — click the microphone, speak, get a spoken response back
- The full path: **Browser mic → Whisper (STT) → Nemotron 3 Nano (LLM) → Qwen3-TTS (TTS) → Browser speaker**
- All processing happens locally on the DGX Spark — no audio data leaves the network

## ARM64 Build Challenges

- **Flash Attention:** FA3 doesn't compile on ARM64 Blackwell — FA2 works but must be built from source
- **vLLM wheels:** No official ARM64 wheels — using community-built cu130 wheels
- **vLLM-Omni:** Had to remove `fa3-fwd` references for compatibility
- **CUDA 13.0:** Blackwell requires CUDA 13.0 runtime (`libcudart.so.13`), installed alongside the base image's CUDA
- **torchaudio:** Installed with `--no-deps` to avoid pulling in a conflicting PyTorch version

## Key Files Referenced

- `qwen-tts/Dockerfile.vllm` — Multi-stage ARM64 TTS build (83 lines)
- `whisper/Dockerfile` — STT build with custom FastAPI server
- `litellm/config.yaml` — `tts-1` and `whisper-1` route definitions
- `docker-compose.yml` — `qwen-tts` and `whisper` service definitions, GPU allocation, volumes
