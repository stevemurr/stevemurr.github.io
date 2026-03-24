const PRIMARY_HOSTS = new Set([
  "stevemurr.com",
  "www.stevemurr.com",
  "stevemurr-github-io.pages.dev",
  "localhost",
  "127.0.0.1",
  "[::1]",
]);

function normalizeHost(hostname) {
  return String(hostname || "").trim().toLowerCase();
}

function parseURL(value) {
  try {
    return new URL(String(value || ""));
  } catch {
    return null;
  }
}

export function isAllowedSiteHost(hostname) {
  const host = normalizeHost(hostname);
  return PRIMARY_HOSTS.has(host) || host.endsWith(".stevemurr-github-io.pages.dev");
}

export function getAllowedOrigin(request) {
  const origin = request.headers.get("Origin") || "";
  const parsedOrigin = parseURL(origin);
  if (parsedOrigin && isAllowedSiteHost(parsedOrigin.hostname)) {
    return parsedOrigin.origin;
  }

  const referer = request.headers.get("Referer") || request.headers.get("Referrer") || "";
  const parsedReferer = parseURL(referer);
  if (parsedReferer && isAllowedSiteHost(parsedReferer.hostname)) {
    return parsedReferer.origin;
  }

  return "";
}

export function isAllowedSiteRequest(request) {
  return Boolean(getAllowedOrigin(request));
}
