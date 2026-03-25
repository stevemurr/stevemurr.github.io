import { HTTPError, errorResponse, jsonResponse, parseJSONBody } from "../../../cloudflare/lib/http.js";
import { adminOptionsResponse, getAdminRequestOrigin, requireAdminEmail } from "../../../cloudflare/lib/admin-auth.js";
import {
  buildPostDocument,
  buildResumeDocument,
  getPostPathFromSlug,
  getResumePath,
  isValidPostSlug,
  parsePostDocument,
  parseResumeDocument,
} from "../../../cloudflare/lib/admin-content.js";
import {
  getContentFile,
  getRepositorySummary,
  listContentDirectory,
  putContentFile,
} from "../../../cloudflare/lib/github-content.js";

const ADMIN_METHODS = "GET, POST, PUT, OPTIONS";

function toActionParts(params) {
  return Array.isArray(params.route)
    ? params.route.map((part) => String(part || "").trim()).filter(Boolean)
    : [];
}

function sortPosts(items) {
  return [...items].sort((left, right) => {
    const leftDate = left.frontmatter.date || "";
    const rightDate = right.frontmatter.date || "";
    if (leftDate !== rightDate) {
      return rightDate.localeCompare(leftDate);
    }

    return left.slug.localeCompare(right.slug);
  });
}

function summarizePost(record) {
  return {
    slug: record.slug,
    sha: record.sha,
    title: record.frontmatter.title,
    repo: Array.isArray(record.frontmatter.projects) ? (record.frontmatter.projects[0] || "") : "",
    date: record.frontmatter.date,
    draft: record.frontmatter.draft,
    summary: record.frontmatter.summary,
  };
}

function getPublishCommitMessage(slug, draft) {
  return draft ? `Save draft: ${slug}` : `Publish post: ${slug}`;
}

async function loadPostBySlug(env, slug) {
  const path = getPostPathFromSlug(slug);
  if (!path) {
    throw new HTTPError(400, "Invalid post slug.");
  }

  const file = await getContentFile(env, path);
  return {
    file,
    record: parsePostDocument(path, file.sha, file.content),
  };
}

async function loadResume(env) {
  const file = await getContentFile(env, getResumePath());
  return {
    file,
    record: parseResumeDocument(file.path, file.sha, file.content),
  };
}

function buildSavedPostResponse(path, sha, source) {
  return parsePostDocument(path, sha, source);
}

function buildSavedResumeResponse(path, sha, source) {
  return parseResumeDocument(path, sha, source);
}

async function handleStatus(request, env, origin) {
  const email = await requireAdminEmail(request, env);

  return jsonResponse({
    ok: true,
    email,
    repository: getRepositorySummary(env),
  }, {
    origin,
    methods: ADMIN_METHODS,
  });
}

async function handleListPosts(request, env, origin) {
  await requireAdminEmail(request, env);

  const entries = await listContentDirectory(env, "content/posts");
  const postDirectories = Array.isArray(entries)
    ? entries.filter((entry) => entry && entry.type === "dir" && isValidPostSlug(entry.name))
    : [];

  const records = [];
  const results = await Promise.allSettled(postDirectories.map(async (entry) => {
    const file = await getContentFile(env, `content/posts/${entry.name}/index.md`);
    return parsePostDocument(file.path, file.sha, file.content);
  }));

  for (const result of results) {
    if (result.status === "fulfilled") {
      records.push(result.value);
      continue;
    }

    const reason = result.reason;
    if (!(reason instanceof HTTPError) || reason.status !== 404) {
      throw reason;
    }
  }

  return jsonResponse({
    items: sortPosts(records).map(summarizePost),
  }, {
    origin,
    methods: ADMIN_METHODS,
  });
}

async function handleGetPost(request, env, origin, slug) {
  await requireAdminEmail(request, env);
  const { record } = await loadPostBySlug(env, slug);

  return jsonResponse(record, {
    origin,
    methods: ADMIN_METHODS,
  });
}

async function handleCreatePost(request, env, origin) {
  await requireAdminEmail(request, env);
  const payload = await parseJSONBody(request);
  const slug = String(payload.slug || "").trim().toLowerCase();
  const path = getPostPathFromSlug(slug);

  if (!path) {
    throw new HTTPError(400, "Invalid post slug.");
  }

  try {
    await getContentFile(env, path);
    throw new HTTPError(409, "A post with that slug already exists.");
  } catch (error) {
    if (!(error instanceof HTTPError) || error.status !== 404) {
      throw error;
    }
  }

  let source;
  try {
    source = buildPostDocument("", {
      ...payload,
      draft: payload.draft !== false,
    });
  } catch (error) {
    throw new HTTPError(400, error instanceof Error ? error.message : "Invalid post payload.");
  }

  const saved = await putContentFile(env, path, {
    content: source,
    message: getPublishCommitMessage(slug, payload.draft !== false),
  });

  return jsonResponse(buildSavedPostResponse(saved.path, saved.sha, source), {
    status: 201,
    origin,
    methods: ADMIN_METHODS,
  });
}

async function handleUpdatePost(request, env, origin, slug) {
  await requireAdminEmail(request, env);
  if (!isValidPostSlug(slug)) {
    throw new HTTPError(400, "Invalid post slug.");
  }

  const payload = await parseJSONBody(request);
  const { file, record } = await loadPostBySlug(env, slug);
  const providedSha = String(payload.sha || "").trim();
  if (!providedSha) {
    throw new HTTPError(400, "Missing post sha.");
  }

  if (providedSha !== record.sha) {
    throw new HTTPError(409, "This post changed since it was loaded. Refresh and try again.");
  }

  let source;
  try {
    source = buildPostDocument(file.content, {
      ...payload,
      draft: payload.draft === true,
    });
  } catch (error) {
    throw new HTTPError(400, error instanceof Error ? error.message : "Invalid post payload.");
  }

  const saved = await putContentFile(env, record.path, {
    content: source,
    sha: record.sha,
    message: getPublishCommitMessage(slug, payload.draft === true),
  });

  return jsonResponse(buildSavedPostResponse(saved.path, saved.sha, source), {
    origin,
    methods: ADMIN_METHODS,
  });
}

async function handleGetResume(request, env, origin) {
  await requireAdminEmail(request, env);
  const { record } = await loadResume(env);

  return jsonResponse(record, {
    origin,
    methods: ADMIN_METHODS,
  });
}

async function handleUpdateResume(request, env, origin) {
  await requireAdminEmail(request, env);
  const payload = await parseJSONBody(request);
  const { file, record } = await loadResume(env);
  const providedSha = String(payload.sha || "").trim();

  if (!providedSha) {
    throw new HTTPError(400, "Missing resume sha.");
  }

  if (providedSha !== record.sha) {
    throw new HTTPError(409, "Resume content changed since it was loaded. Refresh and try again.");
  }

  let source;
  try {
    source = buildResumeDocument(file.content, payload);
  } catch (error) {
    throw new HTTPError(400, error instanceof Error ? error.message : "Invalid resume payload.");
  }

  const saved = await putContentFile(env, getResumePath(), {
    content: source,
    sha: record.sha,
    message: "Update resume",
  });

  return jsonResponse(buildSavedResumeResponse(saved.path, saved.sha, source), {
    origin,
    methods: ADMIN_METHODS,
  });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  let origin = "";

  try {
    origin = getAdminRequestOrigin(request);
    if (request.method === "OPTIONS") {
      return adminOptionsResponse(origin, ADMIN_METHODS, "Content-Type");
    }

    if (!["GET", "POST", "PUT"].includes(request.method)) {
      return errorResponse("Method Not Allowed", {
        status: 405,
        origin,
        methods: ADMIN_METHODS,
      });
    }

    const actionParts = toActionParts(params);
    const [resource, slug] = actionParts;

    if (actionParts.length > 2) {
      throw new HTTPError(404, "Not Found");
    }

    if (!resource) {
      if (request.method === "GET") {
        return handleStatus(request, env, origin);
      }

      throw new HTTPError(404, "Not Found");
    }

    if (resource === "status" && request.method === "GET") {
      return handleStatus(request, env, origin);
    }

    if (resource === "posts" && request.method === "GET" && !slug) {
      return handleListPosts(request, env, origin);
    }

    if (resource === "posts" && request.method === "POST" && !slug) {
      return handleCreatePost(request, env, origin);
    }

    if (resource === "posts" && request.method === "GET" && slug) {
      return handleGetPost(request, env, origin, slug);
    }

    if (resource === "posts" && request.method === "PUT" && slug) {
      return handleUpdatePost(request, env, origin, slug);
    }

    if (resource === "resume" && request.method === "GET" && !slug) {
      return handleGetResume(request, env, origin);
    }

    if (resource === "resume" && request.method === "PUT" && !slug) {
      return handleUpdateResume(request, env, origin);
    }

    throw new HTTPError(404, "Not Found");
  } catch (error) {
    if (error instanceof HTTPError) {
      return errorResponse(error.message, {
        status: error.status,
        origin,
        methods: ADMIN_METHODS,
      });
    }

    return errorResponse("Admin API failed.", {
      status: 500,
      origin,
      methods: ADMIN_METHODS,
    });
  }
}
