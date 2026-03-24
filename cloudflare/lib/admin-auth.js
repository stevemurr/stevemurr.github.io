import { createRemoteJWKSet, jwtVerify } from "jose";
import { HTTPError, buildCorsHeaders } from "./http.js";
import { getAllowedOrigin } from "./site-origin.js";

const ACCESS_EMAIL_HEADERS = [
  "CF-Access-Authenticated-User-Email",
  "Cf-Access-Authenticated-User-Email",
];

let cachedTeamDomain = "";
let cachedJWKS = null;

function getAccessTeamDomain(env) {
  return String(env.ACCESS_TEAM_DOMAIN || "").trim().replace(/\/+$/, "");
}

function getAccessAudience(env) {
  return String(env.ACCESS_APPLICATION_AUD || "").trim();
}

function getRemoteJWKS(teamDomain) {
  if (cachedJWKS && cachedTeamDomain === teamDomain) {
    return cachedJWKS;
  }

  cachedTeamDomain = teamDomain;
  cachedJWKS = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
  return cachedJWKS;
}

function getAuthenticatedAdminEmailFromHeader(request) {
  for (const headerName of ACCESS_EMAIL_HEADERS) {
    const value = String(request.headers.get(headerName) || "").trim();
    if (value) {
      return value.toLowerCase();
    }
  }

  return "";
}

export async function getAuthenticatedAdminEmail(request, env) {
  const accessToken = String(request.headers.get("cf-access-jwt-assertion") || "").trim();
  const teamDomain = getAccessTeamDomain(env);
  const audience = getAccessAudience(env);

  if (accessToken && teamDomain && audience) {
    try {
      const { payload } = await jwtVerify(accessToken, getRemoteJWKS(teamDomain), {
        issuer: teamDomain,
        audience,
      });
      const email = String(payload.email || "").trim().toLowerCase();
      if (email) {
        return email;
      }
    } catch {
      throw new HTTPError(403, "Invalid Access token.");
    }
  }

  return getAuthenticatedAdminEmailFromHeader(request);
}

export function getAdminRequestOrigin(request) {
  const requestOrigin = request.headers.get("Origin") || "";
  const allowedOrigin = getAllowedOrigin(request);

  if (requestOrigin && !allowedOrigin) {
    throw new HTTPError(403, "Forbidden");
  }

  return allowedOrigin;
}

export async function requireAdminEmail(request, env) {
  const expectedEmail = String(env.ADMIN_EMAIL || "").trim().toLowerCase();
  const authenticatedEmail = await getAuthenticatedAdminEmail(request, env);

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
