import { HTTPError, buildCorsHeaders, errorResponse, parseJSONBody } from "../../cloudflare/lib/http.js";
import { getAllowedOrigin } from "../../cloudflare/lib/site-origin.js";

const MAX_MESSAGES = 8;
const MAX_MESSAGE_CHARS = 1200;
const MAX_OUTPUT_TOKENS = 512;
const UPSTREAM_TIMEOUT_MS = 30000;
const SYSTEM_PROMPT = [
  "You are Steve's public website assistant running on his DGX Spark.",
  "Keep answers concise, practical, and direct.",
  "You can discuss Steve's projects, local inference work, and general topics.",
  "Do not claim to have private data, browsing, or operator access.",
  "If you do not know something, say so plainly.",
].join(" ");

const ALLOWED_ROLES = new Set(["user", "assistant"]);
const encoder = new TextEncoder();

function buildSSEHeaders(origin) {
  return buildCorsHeaders(origin, {
    methods: "POST, OPTIONS",
    allowedHeaders: "Content-Type",
    extra: {
      "Cache-Control": "no-store",
      "Content-Type": "text/event-stream; charset=UTF-8",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new HTTPError(400, "Messages must be a non-empty array.");
  }

  if (messages.length > MAX_MESSAGES) {
    throw new HTTPError(400, `Messages are capped at ${MAX_MESSAGES} entries per request.`);
  }

  const sanitized = messages.map((entry) => {
    const role = String((entry && entry.role) || "").trim().toLowerCase();
    const content = String((entry && entry.content) || "").trim();

    if (!ALLOWED_ROLES.has(role)) {
      throw new HTTPError(400, "Only user and assistant messages are allowed.");
    }

    if (!content) {
      throw new HTTPError(400, "Messages cannot be empty.");
    }

    if (content.length > MAX_MESSAGE_CHARS) {
      throw new HTTPError(400, `Messages are capped at ${MAX_MESSAGE_CHARS} characters.`);
    }

    return { role, content };
  });

  if (!sanitized.some((entry) => entry.role === "user")) {
    throw new HTTPError(400, "At least one user message is required.");
  }

  return sanitized;
}

function getClientIP(request) {
  const forwarded = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "";
  return forwarded.split(",")[0].trim();
}

async function verifyTurnstile(token, request, env) {
  const responseToken = String(token || "").trim();
  if (!responseToken) {
    throw new HTTPError(400, "Missing Turnstile token.");
  }

  const formData = new URLSearchParams();
  formData.set("secret", env.TURNSTILE_SECRET_KEY);
  formData.set("response", responseToken);

  const clientIP = getClientIP(request);
  if (clientIP) {
    formData.set("remoteip", clientIP);
  }

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new HTTPError(502, "Turnstile verification failed upstream.");
  }

  const payload = await response.json();
  if (!payload || payload.success !== true) {
    throw new HTTPError(403, "Turnstile verification failed.");
  }
}

function buildLiteLLMHeaders(env) {
  return {
    Accept: "text/event-stream, application/json",
    "CF-Access-Client-Id": env.CF_ACCESS_CLIENT_ID,
    "CF-Access-Client-Secret": env.CF_ACCESS_CLIENT_SECRET,
    "Content-Type": "application/json",
    Authorization: `Bearer ${env.LITELLM_API_KEY}`,
    "User-Agent": "stevemurr.com",
  };
}

function buildLiteLLMURL(env) {
  return new URL("/v1/chat/completions", env.LITELLM_BASE_URL).toString();
}

function buildLiteLLMBody(env, messages) {
  return JSON.stringify({
    model: env.LITELLM_MODEL,
    stream: true,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      ...messages,
    ],
  });
}

async function parseUpstreamError(response) {
  const contentType = response.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      const payload = await response.json();
      if (payload && payload.error && typeof payload.error.message === "string") {
        return payload.error.message;
      }

      if (payload && typeof payload.error === "string") {
        return payload.error;
      }
    }

    const text = await response.text();
    return text || "LiteLLM upstream returned an error.";
  } catch {
    return "LiteLLM upstream returned an error.";
  }
}

function parseSSEBlock(block) {
  const lines = String(block || "").split("\n");
  let eventName = "message";
  const dataLines = [];

  lines.forEach((line) => {
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim() || eventName;
      return;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  });

  if (!dataLines.length) {
    return null;
  }

  return {
    eventName,
    data: dataLines.join("\n"),
  };
}

function extractPartText(part) {
  if (typeof part === "string") {
    return part;
  }

  if (!part || typeof part !== "object") {
    return "";
  }

  if (typeof part.text === "string") {
    return part.text;
  }

  if (typeof part.content === "string") {
    return part.content;
  }

  if (typeof part.value === "string") {
    return part.value;
  }

  return "";
}

function extractContentParts(content) {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content.map(extractPartText).join("");
}

function extractTypedContentParts(content, types) {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      const type = String((part && (part.type || part.kind)) || "").trim().toLowerCase();
      if (!types.has(type)) {
        return "";
      }

      return extractPartText(part);
    })
    .join("");
}

function extractReasoningField(value) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(extractPartText).join("");
  }

  return extractPartText(value);
}

function extractReasoningText(payload) {
  const choice = Array.isArray(payload && payload.choices) ? payload.choices[0] : null;
  if (!choice) {
    return "";
  }

  const delta = choice.delta || {};
  const message = choice.message || {};
  const reasoningFields = [
    delta.reasoning_content,
    delta.reasoning,
    delta.reasoning_text,
    delta.reasoning_details,
    delta.thinking,
    choice.reasoning_content,
    choice.reasoning,
    choice.thinking,
    message.reasoning_content,
    message.reasoning,
    message.reasoning_text,
    message.reasoning_details,
    message.thinking,
  ];

  for (const field of reasoningFields) {
    const text = extractReasoningField(field);
    if (text) {
      return text;
    }
  }

  const reasoningTypes = new Set(["reasoning", "reasoning_content", "thinking", "thought"]);
  const deltaReasoning = extractTypedContentParts(delta.content, reasoningTypes);
  if (deltaReasoning) {
    return deltaReasoning;
  }

  const messageReasoning = extractTypedContentParts(message.content, reasoningTypes);
  if (messageReasoning) {
    return messageReasoning;
  }

  return "";
}

function extractDeltaText(payload) {
  const choice = Array.isArray(payload && payload.choices) ? payload.choices[0] : null;
  if (!choice) {
    return "";
  }

  if (typeof choice.text === "string") {
    return choice.text;
  }

  const delta = choice.delta || {};
  const deltaText = extractContentParts(delta.content);
  if (deltaText) {
    return deltaText;
  }

  const message = choice.message || {};
  const messageText = extractContentParts(message.content);
  if (messageText) {
    return messageText;
  }

  return "";
}

async function writeSSE(writer, eventName, data) {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  await writer.write(encoder.encode(`event: ${eventName}\ndata: ${payload}\n\n`));
}

async function relayUpstreamSSE(upstreamResponse, writer) {
  if (!upstreamResponse.body) {
    throw new Error("LiteLLM stream did not include a body.");
  }

  const contentType = upstreamResponse.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const payload = await upstreamResponse.json();
    const reasoning = extractReasoningText(payload);
    const text = extractDeltaText(payload);

    await writeSSE(writer, "start", { ok: true });

    if (reasoning) {
      await writeSSE(writer, "thinking", { text: reasoning });
    }

    if (text) {
      await writeSSE(writer, "delta", { text });
    }

    await writeSSE(writer, "done", { done: true });
    return;
  }

  if (!contentType.includes("text/event-stream")) {
    throw new Error(`Unexpected LiteLLM response content type: ${contentType || "unknown"}`);
  }

  const reader = upstreamResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawDone = false;

  await writeSSE(writer, "start", { ok: true });

  while (true) {
    const { value, done } = await reader.read();

    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    let boundaryIndex = buffer.indexOf("\n\n");
    while (boundaryIndex !== -1) {
      const rawBlock = buffer.slice(0, boundaryIndex).trim();
      buffer = buffer.slice(boundaryIndex + 2);

      if (rawBlock) {
        const parsed = parseSSEBlock(rawBlock);
        if (parsed && parsed.data) {
          if (parsed.data === "[DONE]") {
            sawDone = true;
            await writeSSE(writer, "done", { done: true });
            return;
          }

          const payload = JSON.parse(parsed.data);
          const reasoning = extractReasoningText(payload);
          if (reasoning) {
            await writeSSE(writer, "thinking", { text: reasoning });
          }

          const text = extractDeltaText(payload);
          if (text) {
            await writeSSE(writer, "delta", { text });
          }
        }
      }

      boundaryIndex = buffer.indexOf("\n\n");
    }

    if (done) {
      break;
    }
  }

  if (!sawDone) {
    await writeSSE(writer, "done", { done: true });
  }
}

function assertRequiredSecrets(env) {
  const required = [
    "CF_ACCESS_CLIENT_ID",
    "CF_ACCESS_CLIENT_SECRET",
    "LITELLM_API_KEY",
    "TURNSTILE_SECRET_KEY",
    "LITELLM_BASE_URL",
    "LITELLM_MODEL",
  ];

  const missing = required.filter((key) => !String(env[key] || "").trim());
  if (missing.length) {
    throw new HTTPError(500, `Missing Pages configuration: ${missing.join(", ")}`);
  }
}

async function handleChat(request, env, origin, context) {
  assertRequiredSecrets(env);

  const payload = await parseJSONBody(request);
  const sanitizedMessages = sanitizeMessages(payload && payload.messages);
  await verifyTurnstile(payload && payload.captchaToken, request, env);

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, UPSTREAM_TIMEOUT_MS);

  let upstreamResponse;

  try {
    upstreamResponse = await fetch(buildLiteLLMURL(env), {
      method: "POST",
      headers: buildLiteLLMHeaders(env),
      body: buildLiteLLMBody(env, sanitizedMessages),
      signal: abortController.signal,
      redirect: "manual",
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new HTTPError(504, "LiteLLM upstream timed out.");
    }

    throw error;
  }

  if (upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
    const location = upstreamResponse.headers.get("Location") || "";
    const accessRedirect = location.includes("cloudflareaccess.com");
    throw new HTTPError(
      502,
      accessRedirect
        ? "LiteLLM rejected the Cloudflare Access service token for talkie.auto2putt.com."
        : `LiteLLM returned an unexpected redirect (${upstreamResponse.status}).`,
    );
  }

  if (!upstreamResponse.ok) {
    clearTimeout(timeoutId);
    throw new HTTPError(502, await parseUpstreamError(upstreamResponse));
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  context.waitUntil((async () => {
    try {
      await relayUpstreamSSE(upstreamResponse, writer);
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : "Streaming relay failed.";
      await writeSSE(writer, "error", { error: message });
    } finally {
      clearTimeout(timeoutId);
      await writer.close();
    }
  })());

  return new Response(readable, {
    status: 200,
    headers: buildSSEHeaders(origin),
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const requestOrigin = request.headers.get("Origin") || "";
  const allowedOrigin = getAllowedOrigin(request);

  if (requestOrigin && !allowedOrigin) {
    return errorResponse("Forbidden", {
      status: 403,
      methods: "POST, OPTIONS",
    });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: buildCorsHeaders(allowedOrigin, {
        methods: "POST, OPTIONS",
        allowedHeaders: "Content-Type",
      }),
    });
  }

  if (request.method !== "POST") {
    return errorResponse("Method Not Allowed", {
      status: 405,
      origin: allowedOrigin,
      methods: "POST, OPTIONS",
    });
  }

  try {
    return await handleChat(request, env, allowedOrigin, context);
  } catch (error) {
    const status = error instanceof HTTPError ? error.status : 502;
    const message = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(message, {
      status,
      origin: allowedOrigin,
      methods: "POST, OPTIONS",
    });
  }
}
