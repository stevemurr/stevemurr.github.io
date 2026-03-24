import matter from "gray-matter";

const POSTS_ROOT = "content/posts";
const RESUME_PATH = "content/resume.md";
const POST_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function cloneData(value) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return JSON.parse(JSON.stringify(value));
}

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeBoolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeDate(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }

  return parsed.toISOString().slice(0, 10);
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeString(entry))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeResumeProjects(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => ({
      name: normalizeString(entry && entry.name),
      repo: normalizeString(entry && entry.repo),
      summary: normalizeString(entry && entry.summary),
      pinned: normalizeBoolean(entry && entry.pinned),
    }))
    .filter((entry) => entry.name || entry.repo || entry.summary);
}

function normalizeHeroButtons(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => ({
      name: normalizeString(entry && entry.name),
      url: normalizeString(entry && entry.url),
    }))
    .filter((entry) => entry.name || entry.url);
}

function setValueOrDelete(target, key, value, { allowFalse = false } = {}) {
  if (value === false && allowFalse) {
    target[key] = false;
    return;
  }

  if (value === undefined || value === null || value === "") {
    delete target[key];
    return;
  }

  target[key] = value;
}

function normalizeBody(value) {
  const body = String(value || "");
  return body.endsWith("\n") ? body : `${body}\n`;
}

function buildDocument(nextData, nextBody) {
  return matter.stringify(normalizeBody(nextBody), nextData);
}

export function getPostPathFromSlug(slug) {
  const normalized = normalizeString(slug).toLowerCase();
  if (!POST_SLUG_PATTERN.test(normalized)) {
    return "";
  }

  return `${POSTS_ROOT}/${normalized}/index.md`;
}

export function getPostSlugFromPath(path) {
  const match = String(path || "").match(/^content\/posts\/([^/]+)\/index\.md$/);
  return match ? match[1] : "";
}

export function isValidPostSlug(slug) {
  return POST_SLUG_PATTERN.test(normalizeString(slug).toLowerCase());
}

export function getResumePath() {
  return RESUME_PATH;
}

export function parsePostDocument(path, sha, source) {
  const parsed = matter(source);
  const data = parsed.data || {};
  const params = data.params || {};

  return {
    path,
    slug: getPostSlugFromPath(path),
    sha,
    frontmatter: {
      title: normalizeString(data.title),
      date: normalizeDate(data.date),
      draft: normalizeBoolean(data.draft),
      summary: normalizeString(data.summary),
      tags: normalizeArray(data.tags),
      projects: normalizeArray(data.projects),
      series: normalizeArray(data.series),
      weight: data.weight === undefined || data.weight === null ? "" : String(data.weight),
      ShowPostNavLinks: normalizeBoolean(data.ShowPostNavLinks),
      params: {
        pullquote: normalizeString(params.pullquote),
        cardGradient: normalizeString(params.cardGradient),
        cardIcon: normalizeString(params.cardIcon),
      },
    },
    body: parsed.content.replace(/\n$/, ""),
  };
}

export function buildPostDocument(existingSource, payload) {
  const parsed = existingSource ? matter(existingSource) : { data: {}, content: "" };
  const data = cloneData(parsed.data);
  const params = cloneData(data.params);

  const title = normalizeString(payload.title);
  const date = normalizeDate(payload.date);
  if (!title) {
    throw new Error("Post title is required.");
  }

  if (!date) {
    throw new Error("Post date is required.");
  }

  data.title = title;
  data.date = date;
  data.draft = normalizeBoolean(payload.draft);
  setValueOrDelete(data, "summary", normalizeString(payload.summary));

  const tags = normalizeArray(payload.tags);
  const projects = normalizeArray(payload.projects);
  const series = normalizeArray(payload.series);
  const weight = normalizeString(payload.weight);

  setValueOrDelete(data, "tags", tags.length ? tags : "");
  setValueOrDelete(data, "projects", projects.length ? projects : "");
  setValueOrDelete(data, "series", series.length ? series : "");
  setValueOrDelete(data, "weight", weight ? Number(weight) : "");
  setValueOrDelete(data, "ShowPostNavLinks", normalizeBoolean(payload.ShowPostNavLinks) ? true : "");

  const inputParams = payload.params || {};
  setValueOrDelete(params, "pullquote", normalizeString(inputParams.pullquote));
  setValueOrDelete(params, "cardGradient", normalizeString(inputParams.cardGradient));
  setValueOrDelete(params, "cardIcon", normalizeString(inputParams.cardIcon));
  setValueOrDelete(data, "params", Object.keys(params).length ? params : "");

  return buildDocument(data, payload.body);
}

export function parseResumeDocument(path, sha, source) {
  const parsed = matter(source);
  const data = parsed.data || {};
  const hero = data.hero || {};
  const githubActivity = data.githubActivity || {};

  return {
    path,
    sha,
    frontmatter: {
      title: normalizeString(data.title),
      layout: normalizeString(data.layout),
      summary: normalizeString(data.summary),
      cardGradient: normalizeString(data.cardGradient),
      cardIcon: normalizeString(data.cardIcon),
      eyebrow: normalizeString(data.eyebrow),
      backLabel: normalizeString(data.backLabel),
      backUrl: normalizeString(data.backUrl),
      hideMeta: normalizeBoolean(data.hideMeta),
      showToc: normalizeBoolean(data.showToc),
      hero: {
        title: normalizeString(hero.title),
        buttons: normalizeHeroButtons(hero.buttons),
      },
      githubActivity: {
        username: normalizeString(githubActivity.username),
        excludeRepos: normalizeArray(githubActivity.excludeRepos),
      },
      projects: normalizeResumeProjects(data.projects),
    },
    body: parsed.content.replace(/\n$/, ""),
  };
}

export function buildResumeDocument(existingSource, payload) {
  const parsed = existingSource ? matter(existingSource) : { data: {}, content: "" };
  const data = cloneData(parsed.data);
  const hero = cloneData(data.hero);
  const githubActivity = cloneData(data.githubActivity);

  data.title = normalizeString(payload.title) || "Resume";
  data.layout = normalizeString(payload.layout) || normalizeString(data.layout) || "resume";
  setValueOrDelete(data, "summary", normalizeString(payload.summary));
  setValueOrDelete(data, "cardGradient", normalizeString(payload.cardGradient));
  setValueOrDelete(data, "cardIcon", normalizeString(payload.cardIcon));
  setValueOrDelete(data, "eyebrow", normalizeString(payload.eyebrow));
  setValueOrDelete(data, "backLabel", normalizeString(payload.backLabel));
  setValueOrDelete(data, "backUrl", normalizeString(payload.backUrl));
  setValueOrDelete(data, "hideMeta", normalizeBoolean(payload.hideMeta), { allowFalse: true });
  setValueOrDelete(data, "showToc", normalizeBoolean(payload.showToc), { allowFalse: true });

  const heroInput = payload.hero || {};
  const heroButtons = normalizeHeroButtons(heroInput.buttons);
  setValueOrDelete(hero, "title", normalizeString(heroInput.title));
  setValueOrDelete(hero, "buttons", heroButtons.length ? heroButtons : "");
  setValueOrDelete(data, "hero", Object.keys(hero).length ? hero : "");

  const activityInput = payload.githubActivity || {};
  const excludeRepos = normalizeArray(activityInput.excludeRepos);
  setValueOrDelete(githubActivity, "username", normalizeString(activityInput.username));
  setValueOrDelete(
    githubActivity,
    "excludeRepos",
    excludeRepos.length ? excludeRepos : "",
  );
  setValueOrDelete(data, "githubActivity", Object.keys(githubActivity).length ? githubActivity : "");

  const projects = normalizeResumeProjects(payload.projects);
  setValueOrDelete(data, "projects", projects.length ? projects : "");

  return buildDocument(data, payload.body);
}
