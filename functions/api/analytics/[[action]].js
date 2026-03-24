import { buildCorsHeaders, emptyResponse, errorResponse, jsonResponse, textResponse } from "../../../cloudflare/lib/http.js";
import { getAllowedOrigin, isAllowedSiteRequest } from "../../../cloudflare/lib/site-origin.js";

function isValidPage(page) {
  if (!page.startsWith("/")) {
    return false;
  }

  if (page.length > 256) {
    return false;
  }

  if (!/^[a-zA-Z0-9/_\-.%]+$/.test(page)) {
    return false;
  }

  return true;
}

function hasValidApiKey(request, env) {
  const key = request.headers.get("X-API-Key");
  return key !== null && key === env.ANALYTICS_API_KEY;
}

async function readAllCounts(env) {
  const pages = {};
  let cursor;

  do {
    const result = await env.COUNTERS.list({ cursor });
    cursor = result.list_complete ? undefined : result.cursor;

    for (const key of result.keys) {
      const raw = await env.COUNTERS.get(key.name);
      const value = raw ? Number(raw) : 0;
      pages[key.name] = Number.isFinite(value) ? value : 0;
    }
  } while (cursor);

  return pages;
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const requestOrigin = request.headers.get("Origin") || "";
  const allowedOrigin = getAllowedOrigin(request);
  const actionParts = Array.isArray(params.action) ? params.action : [];
  const action = String(actionParts[0] || "").trim().toLowerCase();

  if (requestOrigin && !allowedOrigin) {
    return errorResponse("Forbidden", {
      status: 403,
      methods: "GET, OPTIONS",
      allowedHeaders: "X-API-Key",
    });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: buildCorsHeaders(allowedOrigin, {
        methods: "GET, OPTIONS",
        allowedHeaders: "X-API-Key",
      }),
    });
  }

  if (request.method !== "GET") {
    return errorResponse("Method Not Allowed", {
      status: 405,
      origin: allowedOrigin,
      methods: "GET, OPTIONS",
      allowedHeaders: "X-API-Key",
    });
  }

  if (!env.COUNTERS) {
    return errorResponse("Missing Pages configuration: COUNTERS KV binding.", {
      status: 500,
      origin: allowedOrigin,
      methods: "GET, OPTIONS",
      allowedHeaders: "X-API-Key",
    });
  }

  if (action === "track") {
    if (!isAllowedSiteRequest(request)) {
      return textResponse("Forbidden", {
        status: 403,
        origin: allowedOrigin,
        methods: "GET, OPTIONS",
      });
    }

    const url = new URL(request.url);
    const page = url.searchParams.get("page") || "/";
    if (!isValidPage(page)) {
      return textResponse("Bad request", {
        status: 400,
        origin: allowedOrigin,
        methods: "GET, OPTIONS",
      });
    }

    const raw = await env.COUNTERS.get(page);
    const current = raw ? Number(raw) : 0;
    const nextCount = Number.isFinite(current) ? current + 1 : 1;
    await env.COUNTERS.put(page, String(nextCount));

    return emptyResponse({
      status: 204,
      origin: allowedOrigin,
      methods: "GET, OPTIONS",
    });
  }

  if (action === "count" || action === "stats") {
    if (!hasValidApiKey(request, env)) {
      return textResponse("Unauthorized", {
        status: 401,
        origin: allowedOrigin,
        methods: "GET, OPTIONS",
        allowedHeaders: "X-API-Key",
      });
    }

    const pages = await readAllCounts(env);
    if (action === "count") {
      const total = Object.values(pages).reduce((sum, count) => sum + count, 0);
      return jsonResponse({ count: total }, {
        origin: allowedOrigin,
        methods: "GET, OPTIONS",
        allowedHeaders: "X-API-Key",
      });
    }

    return jsonResponse({ pages }, {
      origin: allowedOrigin,
      methods: "GET, OPTIONS",
      allowedHeaders: "X-API-Key",
    });
  }

  return errorResponse("Not Found", {
    status: 404,
    origin: allowedOrigin,
    methods: "GET, OPTIONS",
    allowedHeaders: "X-API-Key",
  });
}
