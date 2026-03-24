import { HTTPError, buildCorsHeaders } from "./http.js";
import { getAllowedOrigin } from "./site-origin.js";

const ACCESS_EMAIL_HEADERS = [
  "CF-Access-Authenticated-User-Email",
  "Cf-Access-Authenticated-User-Email",
];

export function getAuthenticatedAdminEmail(request) {
  for (const headerName of ACCESS_EMAIL_HEADERS) {
    const value = String(request.headers.get(headerName) || "").trim();
    if (value) {
      return value.toLowerCase();
    }
  }

  return "";
}

export function getAdminRequestOrigin(request) {
  const requestOrigin = request.headers.get("Origin") || "";
  const allowedOrigin = getAllowedOrigin(request);

  if (requestOrigin && !allowedOrigin) {
    throw new HTTPError(403, "Forbidden");
  }

  return allowedOrigin;
}

export function requireAdminEmail(request, env) {
  const expectedEmail = String(env.ADMIN_EMAIL || "").trim().toLowerCase();
  const authenticatedEmail = getAuthenticatedAdminEmail(request);

  if (!expectedEmail) {
    throw new HTTPError(500, "Missing admin configuration.");
  }

  if (!authenticatedEmail) {
    throw new HTTPError(401, "Missing Access identity.");
  }

  if (authenticatedEmail !== expectedEmail) {
    throw new HTTPError(403, "Forbidden");
  }

  return authenticatedEmail;
}

export function adminOptionsResponse(origin, methods = "GET, OPTIONS", allowedHeaders = "Content-Type") {
  return new Response(null, {
    status: 204,
    headers: buildCorsHeaders(origin, {
      methods,
      allowedHeaders,
    }),
  });
}
