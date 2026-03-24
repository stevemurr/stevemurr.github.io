export class HTTPError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HTTPError";
    this.status = status;
  }
}

export function buildCorsHeaders(
  origin,
  {
    methods = "GET, OPTIONS",
    allowedHeaders = "Content-Type",
    extra = {},
  } = {},
) {
  const headers = new Headers(extra);
  headers.set("Access-Control-Allow-Methods", methods);
  headers.set("Access-Control-Allow-Headers", allowedHeaders);

  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }

  return headers;
}

export function emptyResponse({
  status = 204,
  origin = "",
  methods = "GET, OPTIONS",
  allowedHeaders = "Content-Type",
  headers = {},
} = {}) {
  return new Response(null, {
    status,
    headers: buildCorsHeaders(origin, {
      methods,
      allowedHeaders,
      extra: headers,
    }),
  });
}

export function jsonResponse(
  data,
  {
    status = 200,
    origin = "",
    methods = "GET, OPTIONS",
    allowedHeaders = "Content-Type",
    headers = {},
  } = {},
) {
  const responseHeaders = buildCorsHeaders(origin, {
    methods,
    allowedHeaders,
    extra: headers,
  });
  responseHeaders.set("Content-Type", "application/json; charset=UTF-8");

  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders,
  });
}

export function textResponse(
  body,
  {
    status = 200,
    origin = "",
    methods = "GET, OPTIONS",
    allowedHeaders = "Content-Type",
    headers = {},
  } = {},
) {
  const responseHeaders = buildCorsHeaders(origin, {
    methods,
    allowedHeaders,
    extra: headers,
  });
  responseHeaders.set("Content-Type", "text/plain; charset=UTF-8");

  return new Response(body, {
    status,
    headers: responseHeaders,
  });
}

export function errorResponse(message, options = {}) {
  return jsonResponse(
    { error: message },
    {
      status: options.status || 400,
      origin: options.origin || "",
      methods: options.methods || "GET, OPTIONS",
      allowedHeaders: options.allowedHeaders || "Content-Type",
      headers: options.headers || {},
    },
  );
}

export async function parseJSONBody(request, message = "Request body must be valid JSON.") {
  try {
    return await request.json();
  } catch {
    throw new HTTPError(400, message);
  }
}
