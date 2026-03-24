import { buildCorsHeaders, errorResponse, jsonResponse } from "../../../cloudflare/lib/http.js";
import { getAllowedOrigin } from "../../../cloudflare/lib/site-origin.js";

const CACHE_TTL_SECONDS = 30;
const GRAPH_STEP_SECONDS = 60;
const DEFAULT_WINDOW = "1h";
const WINDOW_PATTERN = /^(\d+)(m|h|d)$/;
const MODEL_PATTERN = /^[a-zA-Z0-9._-]+$/;

const SUMMARY_QUERIES = {
  generationTokensPerSecond: 'rate(vllm:generation_tokens_total{model_name="%MODEL%"}[1m])',
  promptTokensPerSecond: 'rate(vllm:prompt_tokens_total{model_name="%MODEL%"}[1m])',
  requestsPerSecond: 'sum(rate(vllm:request_success_total{model_name="%MODEL%"}[1m]))',
  ttftP95Seconds: 'histogram_quantile(0.95, rate(vllm:time_to_first_token_seconds_bucket{model_name="%MODEL%"}[5m]))',
};

const RANGE_QUERIES = {
  tokenThroughput: {
    generation: 'rate(vllm:generation_tokens_total{model_name="%MODEL%"}[1m])',
    prompt: 'rate(vllm:prompt_tokens_total{model_name="%MODEL%"}[1m])',
  },
  concurrentRequests: {
    running: 'vllm:num_requests_running{model_name="%MODEL%"}',
    waiting: 'vllm:num_requests_waiting{model_name="%MODEL%"}',
  },
};

function parseWindow(windowValue) {
  const raw = String(windowValue || DEFAULT_WINDOW).trim().toLowerCase();
  const match = raw.match(WINDOW_PATTERN);

  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers = {
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
  };

  return {
    raw,
    seconds: amount * multipliers[unit],
  };
}

function fillModel(query, modelName) {
  return query.replaceAll("%MODEL%", modelName);
}

function buildGrafanaHeaders(env) {
  const headers = {
    Accept: "application/json",
    "User-Agent": "stevemurr.com",
  };

  if (env.CF_ACCESS_CLIENT_ID) {
    headers["CF-Access-Client-Id"] = env.CF_ACCESS_CLIENT_ID;
  }

  if (env.CF_ACCESS_CLIENT_SECRET) {
    headers["CF-Access-Client-Secret"] = env.CF_ACCESS_CLIENT_SECRET;
  }

  if (env.GRAFANA_TOKEN) {
    headers.Authorization = `Bearer ${env.GRAFANA_TOKEN}`;
  }

  return headers;
}

async function queryGrafanaVector(env, expression) {
  const url = new URL(
    `/api/datasources/proxy/${encodeURIComponent(env.GRAFANA_DATASOURCE_ID)}/api/v1/query`,
    env.GRAFANA_BASE_URL,
  );
  url.searchParams.set("query", expression);

  const response = await fetch(url.toString(), {
    headers: buildGrafanaHeaders(env),
  });

  if (!response.ok) {
    throw new Error(`Grafana vector query failed: ${response.status}`);
  }

  const payload = await response.json();
  const result = payload && payload.data && Array.isArray(payload.data.result)
    ? payload.data.result
    : [];
  const first = result[0];

  if (!first || !Array.isArray(first.value) || first.value.length < 2) {
    return 0;
  }

  const value = Number(first.value[1]);
  return Number.isFinite(value) ? value : 0;
}

async function queryGrafanaRange(env, expression, startSeconds, endSeconds) {
  const url = new URL(
    `/api/datasources/proxy/${encodeURIComponent(env.GRAFANA_DATASOURCE_ID)}/api/v1/query_range`,
    env.GRAFANA_BASE_URL,
  );
  url.searchParams.set("query", expression);
  url.searchParams.set("start", String(startSeconds));
  url.searchParams.set("end", String(endSeconds));
  url.searchParams.set("step", String(GRAPH_STEP_SECONDS));

  const response = await fetch(url.toString(), {
    headers: buildGrafanaHeaders(env),
  });

  if (!response.ok) {
    throw new Error(`Grafana range query failed: ${response.status}`);
  }

  const payload = await response.json();
  const result = payload && payload.data && Array.isArray(payload.data.result)
    ? payload.data.result
    : [];
  const first = result[0];
  const values = first && Array.isArray(first.values) ? first.values : [];

  return values
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) {
        return null;
      }

      const timestamp = Number(point[0]);
      const value = Number(point[1]);

      if (!Number.isFinite(timestamp) || !Number.isFinite(value)) {
        return null;
      }

      return [timestamp, value];
    })
    .filter(Boolean);
}

async function buildPayload(env, modelName, windowConfig) {
  const endSeconds = Math.floor(Date.now() / 1000);
  const startSeconds = endSeconds - windowConfig.seconds;
  const summaryEntries = Object.entries(SUMMARY_QUERIES);
  const summaryValues = await Promise.all(summaryEntries.map(async ([key, expression]) => {
    const value = await queryGrafanaVector(env, fillModel(expression, modelName));
    return [key, value];
  }));

  const tokenThroughputEntries = Object.entries(RANGE_QUERIES.tokenThroughput);
  const tokenThroughputValues = await Promise.all(tokenThroughputEntries.map(async ([key, expression]) => {
    const value = await queryGrafanaRange(env, fillModel(expression, modelName), startSeconds, endSeconds);
    return [key, value];
  }));

  const concurrentEntries = Object.entries(RANGE_QUERIES.concurrentRequests);
  const concurrentValues = await Promise.all(concurrentEntries.map(async ([key, expression]) => {
    const value = await queryGrafanaRange(env, fillModel(expression, modelName), startSeconds, endSeconds);
    return [key, value];
  }));

  return {
    model: modelName,
    updatedAt: new Date().toISOString(),
    summary: Object.fromEntries(summaryValues),
    series: {
      tokenThroughput: Object.fromEntries(tokenThroughputValues),
      concurrentRequests: Object.fromEntries(concurrentValues),
    },
    dashboardUrl: env.DASHBOARD_URL,
  };
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const requestOrigin = request.headers.get("Origin") || "";
  const allowedOrigin = getAllowedOrigin(request);

  if (requestOrigin && !allowedOrigin) {
    return errorResponse("Forbidden", {
      status: 403,
      methods: "GET, OPTIONS",
    });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: buildCorsHeaders(allowedOrigin, {
        methods: "GET, OPTIONS",
      }),
    });
  }

  if (request.method !== "GET") {
    return errorResponse("Method Not Allowed", {
      status: 405,
      origin: allowedOrigin,
      methods: "GET, OPTIONS",
    });
  }

  const modelName = String(params.model || env.MODEL_NAME || "").trim();
  if (!modelName || !MODEL_PATTERN.test(modelName)) {
    return errorResponse("Invalid model name.", {
      status: 400,
      origin: allowedOrigin,
      methods: "GET, OPTIONS",
    });
  }

  const url = new URL(request.url);
  const windowConfig = parseWindow(url.searchParams.get("window"));
  if (!windowConfig) {
    return errorResponse("Invalid window. Use values like 30m, 1h, or 1d.", {
      status: 400,
      origin: allowedOrigin,
      methods: "GET, OPTIONS",
    });
  }

  try {
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: "GET" });
    const cached = await cache.match(cacheKey);

    if (cached) {
      return new Response(cached.body, {
        status: cached.status,
        headers: buildCorsHeaders(allowedOrigin, {
          methods: "GET, OPTIONS",
          extra: {
            "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=120`,
            "Content-Type": "application/json; charset=UTF-8",
          },
        }),
      });
    }

    const payload = await buildPayload(env, modelName, windowConfig);
    const cacheableResponse = jsonResponse(payload, {
      headers: {
        "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=120`,
      },
      methods: "GET, OPTIONS",
    });

    await cache.put(cacheKey, cacheableResponse.clone());

    return jsonResponse(payload, {
      origin: allowedOrigin,
      methods: "GET, OPTIONS",
      headers: {
        "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=120`,
      },
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error", {
      status: 502,
      origin: allowedOrigin,
      methods: "GET, OPTIONS",
    });
  }
}
