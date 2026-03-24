import { HTTPError } from "./http.js";

const GITHUB_API_ROOT = "https://api.github.com";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encodeRepoPath(path) {
  return String(path || "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function getRepositoryConfig(env) {
  return {
    owner: String(env.GITHUB_REPOSITORY_OWNER || "stevemurr").trim(),
    repo: String(env.GITHUB_REPOSITORY_NAME || "stevemurr.github.io").trim(),
    branch: String(env.GITHUB_REPOSITORY_BRANCH || "main").trim(),
  };
}

function getCommitter(env) {
  return {
    name: String(env.GITHUB_COMMITTER_NAME || "").trim() || "Steve Murr Admin",
    email: String(env.GITHUB_COMMITTER_EMAIL || "").trim() || "stevemurr@users.noreply.github.com",
  };
}

function encodeBase64UTF8(value) {
  const bytes = encoder.encode(String(value || ""));
  let binary = "";

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }

  return btoa(binary);
}

function decodeBase64UTF8(value) {
  const binary = atob(String(value || "").replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return decoder.decode(bytes);
}

async function parseGitHubError(response) {
  const contentType = response.headers.get("content-type") || "";
  const raw = await response.text();

  try {
    if (contentType.includes("application/json")) {
      const payload = JSON.parse(raw);
      if (payload && typeof payload.message === "string" && payload.message.trim()) {
        const docs = typeof payload.documentation_url === "string" && payload.documentation_url.trim()
          ? ` See ${payload.documentation_url.trim()}`
          : "";
        return `${payload.message.trim()}${docs}`;
      }
    }
  } catch {
    // Fall through to raw text handling.
  }

  return raw.trim() || `GitHub request failed with status ${response.status}.`;
}

async function githubRequest(env, path, { method = "GET", body } = {}) {
  const token = String(env.GITHUB_CONTENTS_TOKEN || "").trim();
  if (!token) {
    throw new HTTPError(500, "Missing GitHub contents token.");
  }

  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "stevemurr.com-admin",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${GITHUB_API_ROOT}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const message = await parseGitHubError(response);
    throw new HTTPError(response.status, message);
  }

  return response.json();
}

export async function listContentDirectory(env, path) {
  const { owner, repo, branch } = getRepositoryConfig(env);
  const encodedPath = encodeRepoPath(path);
  const query = new URLSearchParams({ ref: branch });
  return githubRequest(env, `/repos/${owner}/${repo}/contents/${encodedPath}?${query.toString()}`);
}

export async function getContentFile(env, path) {
  const { owner, repo, branch } = getRepositoryConfig(env);
  const encodedPath = encodeRepoPath(path);
  const query = new URLSearchParams({ ref: branch });
  const payload = await githubRequest(env, `/repos/${owner}/${repo}/contents/${encodedPath}?${query.toString()}`);

  if (!payload || payload.type !== "file") {
    throw new HTTPError(404, "File not found.");
  }

  return {
    path: payload.path,
    sha: payload.sha,
    content: decodeBase64UTF8(payload.content),
  };
}

export async function putContentFile(env, path, { content, sha, message }) {
  const { owner, repo, branch } = getRepositoryConfig(env);
  const encodedPath = encodeRepoPath(path);
  const committer = getCommitter(env);
  const body = {
    message,
    branch,
    content: encodeBase64UTF8(content),
    author: committer,
    committer,
  };

  if (sha) {
    body.sha = sha;
  }

  const payload = await githubRequest(env, `/repos/${owner}/${repo}/contents/${encodedPath}`, {
    method: "PUT",
    body,
  });

  if (!payload || !payload.content || !payload.content.sha) {
    throw new HTTPError(502, "GitHub did not return updated content metadata.");
  }

  return {
    sha: payload.content.sha,
    path: payload.content.path,
  };
}

export function getRepositorySummary(env) {
  const { owner, repo, branch } = getRepositoryConfig(env);
  return { owner, repo, branch };
}
