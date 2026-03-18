const GITHUB_API_ROOT = "https://github-api-proxy.gh-murr-proxy.workers.dev";
const LLM_METRICS_API_ROOT = "https://llm-metrics-proxy.gh-murr-proxy.workers.dev";
const LLM_CHAT_API_ROOT = "https://llm-chat-proxy.gh-murr-proxy.workers.dev";
const RECENT_COMMIT_PAGE_LIMIT = 100;
const RECENT_COMMIT_MAX_PAGES = 3;
const LLM_METRICS_CACHE_TTL_MS = 60 * 1000; // 1 minute
const LLM_CHAT_MAX_HISTORY_MESSAGES = 8;
const LLM_CHAT_TURNSTILE_POLL_MS = 250;
const LLM_CHAT_TURNSTILE_MAX_ATTEMPTS = 24;
const LLM_CHAT_BODY_OPEN_CLASS = "has-llm-chat-open";
const LLM_CHAT_DEFAULT_ERROR = "Chat is temporarily unavailable. Try again in a minute.";
const LLM_CHAT_ARTICLE_SCOPE = "article";
const LLM_CHAT_ARTICLE_TRANSCRIPT_LIMIT = 25000;
const LLM_CHAT_ARTICLE_CONTEXT_ERROR = "Article chat could not load this page context. Reload and try again.";
const LLM_CHAT_OPEN_ANIMATION_MS = 260;
const LLM_CHAT_BACKDROP_ANIMATION_MS = 180;
const SVG_NS = "http://www.w3.org/2000/svg";
const POST_BACK_DESTINATIONS = {
  articles: {
    path: "/articles/",
    label: "Articles",
  },
  resume: {
    path: "/",
    label: "Resume",
  },
};
const ACTIVITY_EVENT_TYPES = new Set([
  "PushEvent",
  "PullRequestEvent",
  "ReleaseEvent",
  "CreateEvent",
  "IssuesEvent",
  "IssueCommentEvent",
  "CommitCommentEvent",
]);

function normalizeRepo(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePathname(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "/";
  }

  let pathname = raw;
  if (!pathname.startsWith("/")) {
    pathname = `/${pathname}`;
  }

  return pathname === "/" ? pathname : pathname.replace(/\/+$/, "") + "/";
}

function appendQueryParam(url, key, value) {
  if (!url || !key || !value) {
    return url;
  }

  try {
    const parsed = new URL(url, window.location.origin);
    parsed.searchParams.set(key, value);
    return parsed.pathname + parsed.search + parsed.hash;
  } catch (_error) {
    const separator = String(url).includes("?") ? "&" : "?";
    return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
}

function getPostBackDestination() {
  const from = new URLSearchParams(window.location.search).get("from");
  if (from && POST_BACK_DESTINATIONS[from]) {
    return POST_BACK_DESTINATIONS[from];
  }

  if (!document.referrer) {
    return null;
  }

  try {
    const referrer = new URL(document.referrer);
    if (referrer.origin !== window.location.origin) {
      return null;
    }

    const pathname = normalizePathname(referrer.pathname);
    if (pathname === normalizePathname(POST_BACK_DESTINATIONS.articles.path)) {
      return POST_BACK_DESTINATIONS.articles;
    }

    if (pathname === normalizePathname(POST_BACK_DESTINATIONS.resume.path) || pathname === "/resume/") {
      return POST_BACK_DESTINATIONS.resume;
    }
  } catch (_error) {
    return null;
  }

  return null;
}

function initializePostBackLinks() {
  const links = document.querySelectorAll("[data-post-back]");
  if (!links.length) {
    return;
  }

  const destination = getPostBackDestination();

  links.forEach((link) => {
    const fallback = {
      path: link.dataset.defaultBackUrl || POST_BACK_DESTINATIONS.resume.path,
      label: link.dataset.defaultBackLabel || POST_BACK_DESTINATIONS.resume.label,
    };
    const target = destination || fallback;

    link.href = target.path;
    link.setAttribute("aria-label", `Back to ${target.label}`);
    link.setAttribute("title", target.label);

    if (!destination || !document.referrer || window.history.length <= 1) {
      return;
    }

    try {
      const referrer = new URL(document.referrer);
      if (referrer.origin !== window.location.origin) {
        return;
      }

      if (normalizePathname(referrer.pathname) !== normalizePathname(target.path)) {
        return;
      }
    } catch (_error) {
      return;
    }

    link.addEventListener("click", (event) => {
      event.preventDefault();
      window.history.back();
    });
  });
}

function formatRelativeTime(value) {
  if (!value) {
    return "recently";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "recently";
  }

  const elapsed = date.getTime() - Date.now();
  const absMs = Math.abs(elapsed);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  let unit;
  if (absMs < hour) {
    unit = [Math.round(elapsed / minute), "minute"];
  } else if (absMs < day) {
    unit = [Math.round(elapsed / hour), "hour"];
  } else if (absMs < week) {
    unit = [Math.round(elapsed / day), "day"];
  } else if (absMs < month) {
    unit = [Math.round(elapsed / week), "week"];
  } else if (absMs < year) {
    unit = [Math.round(elapsed / month), "month"];
  } else {
    unit = [Math.round(elapsed / year), "year"];
  }

  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(unit[0], unit[1]);
}

function describeActivity(entry) {
  const parts = [];

  if (entry.pushes > 0) {
    parts.push(`${entry.pushes} ${entry.pushes === 1 ? "push" : "pushes"}`);
  }

  if (entry.pullRequests > 0) {
    parts.push(`${entry.pullRequests} ${entry.pullRequests === 1 ? "PR" : "PRs"}`);
  }

  if (entry.releases > 0) {
    parts.push(`${entry.releases} ${entry.releases === 1 ? "release" : "releases"}`);
  }

  if (entry.eventCount > 0 && parts.length === 0) {
    parts.push(`${entry.eventCount} recent updates`);
  }

  return parts.join(" · ");
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCached(key, ttlMs = CACHE_TTL_MS) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > ttlMs) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // storage full or unavailable — ignore
  }
}

function fetchJSON(url) {
  const cacheKey = `gh:${url}`;
  const cached = getCached(cacheKey);
  if (cached) return Promise.resolve(cached);

  return fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
    },
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`GitHub request failed: ${response.status}`);
    }

    return response.json().then((data) => {
      setCache(cacheKey, data);
      return data;
    });
  });
}

function fetchMetricsJSON(url) {
  const cacheKey = `llm:${url}`;
  const cached = getCached(cacheKey, LLM_METRICS_CACHE_TTL_MS);
  if (cached) return Promise.resolve(cached);

  return fetch(url, {
    headers: {
      Accept: "application/json",
    },
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`Metrics request failed: ${response.status}`);
    }

    return response.json().then((data) => {
      setCache(cacheKey, data);
      return data;
    });
  });
}

function getFreshnessScore(dateValue) {
  if (!dateValue) {
    return 0;
  }

  const ageMs = Date.now() - new Date(dateValue).getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);

  if (ageDays <= 2) {
    return 8;
  }

  if (ageDays <= 7) {
    return 6;
  }

  if (ageDays <= 14) {
    return 4;
  }

  if (ageDays <= 30) {
    return 2;
  }

  return 0;
}

function buildActivityEntries(repositories, events, username, excludedRepos) {
  const lowerUser = String(username || "").toLowerCase();
  const excluded = new Set((excludedRepos || []).map(normalizeRepo));
  const ownedRepositories = repositories.filter((repository) => {
    const owner = repository.owner && repository.owner.login
      ? repository.owner.login.toLowerCase()
      : "";
    const fullName = normalizeRepo(repository.full_name);

    return !repository.fork && owner === lowerUser && !excluded.has(fullName);
  });
  const repositoryMap = new Map(
    ownedRepositories.map((repository) => [normalizeRepo(repository.full_name), repository]),
  );
  const activityMap = new Map();

  function ensureEntry(repository) {
    const key = normalizeRepo(repository.full_name);
    if (!activityMap.has(key)) {
      activityMap.set(key, {
        repository,
        eventCount: 0,
        pushes: 0,
        pullRequests: 0,
        releases: 0,
        score: getFreshnessScore(repository.pushed_at || repository.updated_at),
        lastActiveAt: repository.pushed_at || repository.updated_at,
      });
    }

    return activityMap.get(key);
  }

  ownedRepositories.forEach((repository, index) => {
    const entry = ensureEntry(repository);
    entry.score += Math.max(0, 10 - index * 0.35);
  });

  events.forEach((event, index) => {
    if (!ACTIVITY_EVENT_TYPES.has(event.type)) {
      return;
    }

    const repoName = normalizeRepo(event.repo && event.repo.name);
    if (excluded.has(repoName)) {
      return;
    }

    const repository = repositoryMap.get(repoName);
    if (!repository) {
      return;
    }

    const entry = ensureEntry(repository);
    entry.eventCount += 1;
    entry.lastActiveAt = entry.lastActiveAt && new Date(entry.lastActiveAt) > new Date(event.created_at)
      ? entry.lastActiveAt
      : event.created_at;
    entry.score += getFreshnessScore(event.created_at) + Math.max(0, 6 - index * 0.15);

    if (event.type === "PushEvent") {
      entry.pushes += Math.max(1, (event.payload && event.payload.size) || 0);
      entry.score += 4;
    } else if (event.type === "PullRequestEvent") {
      entry.pullRequests += 1;
      entry.score += 5;
    } else if (event.type === "ReleaseEvent") {
      entry.releases += 1;
      entry.score += 5;
    } else {
      entry.score += 2;
    }
  });

  return Array.from(activityMap.values()).sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return new Date(right.lastActiveAt || 0) - new Date(left.lastActiveAt || 0);
  });
}

function createElement(documentRef, tagName, className, textContent) {
  const element = documentRef.createElement(tagName);

  if (className) {
    element.className = className;
  }

  if (typeof textContent === "string") {
    element.textContent = textContent;
  }

  return element;
}

function createMetric(text, modifier) {
  const className = modifier
    ? `resume-project__metric ${modifier}`
    : "resume-project__metric";

  return createElement(document, "span", className, text);
}

function formatPacificDateTime(value) {
  if (!value) {
    return "Recently";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  return `${new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date)} PT`;
}

function extractRefLabel(value) {
  const ref = String(value || "").trim();
  if (!ref) {
    return "";
  }

  if (ref.startsWith("refs/heads/")) {
    return ref.slice("refs/heads/".length);
  }

  if (ref.startsWith("refs/tags/")) {
    return ref.slice("refs/tags/".length);
  }

  return ref.replace(/^refs\//, "");
}

function buildRecentCommitEntries(events, excludedRepos) {
  const excluded = new Set((excludedRepos || []).map(normalizeRepo));
  const seen = new Set();
  const entries = [];

  events.forEach((event, eventIndex) => {
    if (!event || event.type !== "PushEvent") {
      return;
    }

    const repoFullName = String(event.repo && event.repo.name || "").trim();
    const repoKey = normalizeRepo(repoFullName);
    if (!repoKey || excluded.has(repoKey)) {
      return;
    }

    const commits = Array.isArray(event.payload && event.payload.commits)
      ? [...event.payload.commits].reverse()
      : [];
    const refs = extractRefLabel(event.payload && event.payload.ref);

    commits.forEach((commit, commitIndex) => {
      const sha = String(commit && commit.sha || "").trim();
      const message = String(commit && commit.message || "").split("\n")[0].trim();
      const uniqueKey = `${repoKey}:${sha}`;

      if (!sha || !message || seen.has(uniqueKey)) {
        return;
      }

      seen.add(uniqueKey);
      entries.push({
        repo: repoFullName,
        repoName: repoFullName.split("/").pop() || repoFullName,
        fullHash: sha,
        shortHash: sha.slice(0, 7),
        date: event.created_at,
        message,
        refs,
        url: `https://github.com/${repoFullName}/commit/${sha}`,
        displayDateTime: formatPacificDateTime(event.created_at),
        relativeTime: formatRelativeTime(event.created_at),
        sortEventIndex: eventIndex,
        sortCommitIndex: commitIndex,
      });
    });
  });

  return entries
    .sort((left, right) => {
      const dateDelta = new Date(right.date || 0) - new Date(left.date || 0);
      if (dateDelta !== 0) {
        return dateDelta;
      }

      if (left.sortEventIndex !== right.sortEventIndex) {
        return left.sortEventIndex - right.sortEventIndex;
      }

      return left.sortCommitIndex - right.sortCommitIndex;
    })
    .map(({ sortEventIndex, sortCommitIndex, ...entry }) => entry);
}

function createCommitItem(entry) {
  const link = createElement(document, "a", "resume-commit");
  link.href = entry.url;
  link.rel = "noopener";
  link.title = `${entry.repo} · ${entry.fullHash}`;

  const graph = createElement(document, "span", "resume-commit__graph");
  graph.setAttribute("aria-hidden", "true");
  link.appendChild(graph);

  const body = createElement(document, "div", "resume-commit__body");
  const meta = createElement(document, "div", "resume-commit__meta");
  meta.appendChild(createElement(document, "span", "resume-commit__repo", entry.repoName));
  meta.appendChild(createElement(document, "code", "resume-commit__hash", entry.shortHash));

  if (entry.refs) {
    meta.appendChild(createElement(document, "span", "resume-commit__refs", entry.refs));
  }

  body.appendChild(meta);
  body.appendChild(createElement(document, "strong", "resume-commit__message", entry.message));
  link.appendChild(body);

  const time = createElement(
    document,
    "time",
    "resume-commit__when",
    entry.displayDateTime || entry.relativeTime || "Recently",
  );

  if (entry.date) {
    time.dateTime = entry.date;
  }

  if (entry.relativeTime) {
    time.title = entry.relativeTime;
  }

  link.appendChild(time);
  return link;
}

function renderProjectMetrics(card, entry) {
  const metrics = card.querySelector("[data-project-metrics]");
  if (!metrics) {
    return;
  }

  metrics.textContent = "";
  metrics.hidden = false;

  if (!entry) {
    metrics.hidden = true;
    return;
  }

  const activitySummary = describeActivity(entry);
  if (activitySummary) {
    metrics.appendChild(createMetric(activitySummary));
  }

  metrics.hidden = metrics.childElementCount === 0;
}

function updateProjectCard(card, entry) {
  const stamp = card.querySelector("[data-project-stamp]");

  if (stamp) {
    stamp.textContent = entry ? `Active ${formatRelativeTime(entry.lastActiveAt)}` : "";
    stamp.hidden = !entry;
  }

  renderProjectMetrics(card, entry);
}

function markProjectCardUnavailable(card) {
  const stamp = card.querySelector("[data-project-stamp]");
  if (stamp) {
    stamp.textContent = "";
    stamp.hidden = true;
  }

  const metrics = card.querySelector("[data-project-metrics]");
  if (!metrics) {
    return;
  }

  metrics.textContent = "";
  metrics.hidden = true;
}

const GITHUB_ICON_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.22 1.87.88 2.33.67.07-.52.28-.88.51-1.08-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.5 7.5 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z"></path></svg>';

function kebabToTitle(str) {
  return str.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function getProjectPostsMap() {
  const el = document.getElementById("project-posts-map");
  if (!el) return {};
  try { return JSON.parse(el.textContent); } catch { return {}; }
}

function appendProjectPosts(article, repoKey) {
  const map = getProjectPostsMap();
  const posts = map[repoKey];
  if (!posts || posts.length === 0) return;

  const container = createElement(document, "div", "resume-project__posts");
  container.appendChild(createElement(document, "p", "resume-project__section", "Article log"));
  posts.forEach(post => {
    const link = createElement(document, "a", "resume-project__post-link");
    link.href = appendQueryParam(post.url, "from", "resume");
    const copy = createElement(document, "span", "resume-project__post-copy");
    copy.appendChild(createElement(document, "span", "resume-project__post-kicker", "Read article"));
    copy.appendChild(createElement(document, "span", "resume-project__post-title", post.title));
    link.appendChild(copy);
    link.appendChild(createElement(document, "span", "resume-project__post-date", post.date));
    container.appendChild(link);
  });
  article.appendChild(container);
}

function createProjectCard(entry) {
  const repo = entry.repository;
  const repoName = repo.name || repo.full_name.split("/").pop();
  const displayName = kebabToTitle(repoName);
  const article = createElement(document, "article", "resume-project");
  article.setAttribute("data-project-card", "");
  article.setAttribute("data-project-pinned", "false");
  article.setAttribute("data-project-repo", normalizeRepo(repo.full_name));

  const header = createElement(document, "div", "resume-project__header");
  const intro = createElement(document, "div", "resume-project__intro");
  const topline = createElement(document, "div", "resume-project__topline");

  const title = createElement(document, "h3", "resume-project__title");
  const link = createElement(document, "a");
  link.href = repo.html_url || `https://github.com/${repo.full_name}`;
  link.rel = "noopener";
  link.textContent = displayName;
  link.insertAdjacentHTML("beforeend", GITHUB_ICON_SVG);
  title.appendChild(link);

  const metrics = createElement(document, "div", "resume-project__metrics");
  metrics.setAttribute("data-project-metrics", "");
  const stamp = createElement(document, "span", "resume-project__stamp");
  stamp.setAttribute("data-project-stamp", "");

  topline.appendChild(title);
  topline.appendChild(metrics);
  topline.appendChild(stamp);

  intro.appendChild(topline);

  if (repo.description) {
    intro.appendChild(createElement(document, "p", "resume-project__summary", repo.description));
  }

  header.appendChild(intro);
  article.appendChild(header);

  updateProjectCard(article, entry);
  appendProjectPosts(article, normalizeRepo(repo.full_name));

  return article;
}

function createSVGElement(tagName, className) {
  const element = document.createElementNS(SVG_NS, tagName);

  if (className) {
    element.setAttribute("class", className);
  }

  return element;
}

function formatWindowLabel(value) {
  const raw = String(value || "").trim().toLowerCase();
  const match = raw.match(/^(\d+)(m|h|d)$/);

  if (!match) {
    return "recent window";
  }

  const amount = Number(match[1]);
  const unitMap = {
    m: amount === 1 ? "minute" : "minutes",
    h: amount === 1 ? "hour" : "hours",
    d: amount === 1 ? "day" : "days",
  };

  return `${amount} ${unitMap[match[2]]}`;
}

function formatRateValue(value) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  const abs = Math.abs(value);
  let maximumFractionDigits = 0;

  if (abs > 0 && abs < 1) {
    maximumFractionDigits = 2;
  } else if (abs < 10) {
    maximumFractionDigits = 1;
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: abs > 0 && abs < 1 ? 2 : 0,
  }).format(value);
}

function formatRuntimeValue(metricKey, value) {
  if (metricKey === "lastActivityAt") {
    if (value === null) {
      return "Quiet";
    }

    return value ? formatRelativeTime(value) : "—";
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "—";
  }

  if (metricKey === "generatedTokens" || metricKey === "promptTokens") {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(Math.round(numericValue));
  }

  if (metricKey === "activeMinutes") {
    const roundedMinutes = Math.max(0, Math.round(numericValue));
    return `${roundedMinutes} ${roundedMinutes === 1 ? "min" : "mins"}`;
  }

  if (metricKey === "ttftP95Seconds") {
    if (numericValue < 1) {
      return `${Math.round(numericValue * 1000)} ms`;
    }

    return `${formatRateValue(numericValue)} s`;
  }

  return formatRateValue(numericValue);
}

function formatLegendValue(graphKey, seriesKey, value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  if (graphKey === "tokenThroughput") {
    return `${formatRateValue(value)} tok/s peak`;
  }

  if (graphKey === "concurrentRequests") {
    return `${formatRateValue(value)} peak`;
  }

  return formatRateValue(value);
}

function normalizeSeriesPoints(points) {
  if (!Array.isArray(points)) {
    return [];
  }

  return points
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

function inferSeriesStepSeconds(points) {
  for (let index = 1; index < points.length; index += 1) {
    const delta = Number(points[index][0]) - Number(points[index - 1][0]);
    if (Number.isFinite(delta) && delta > 0) {
      return delta;
    }
  }

  return 60;
}

function getSeriesPeakValue(points) {
  let peak = null;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (!point || !Number.isFinite(point[1])) {
      continue;
    }

    peak = peak === null ? point[1] : Math.max(peak, point[1]);
  }

  return peak;
}

function getActiveSeriesPoints(series) {
  const pointSets = [];

  if (series && series.tokenThroughput) {
    pointSets.push(normalizeSeriesPoints(series.tokenThroughput.generation));
    pointSets.push(normalizeSeriesPoints(series.tokenThroughput.prompt));
  }

  if (series && series.concurrentRequests) {
    pointSets.push(normalizeSeriesPoints(series.concurrentRequests.running));
    pointSets.push(normalizeSeriesPoints(series.concurrentRequests.waiting));
  }

  return pointSets;
}

function sumSeriesTotals(points) {
  if (!points.length) {
    return 0;
  }

  const stepSeconds = inferSeriesStepSeconds(points);

  return points.reduce((total, point) => total + (Math.max(point[1], 0) * stepSeconds), 0);
}

function getActiveMinutes(pointSets) {
  const activeTimestamps = new Set();
  let stepSeconds = 60;

  pointSets.forEach((points) => {
    if (points.length > 1) {
      stepSeconds = inferSeriesStepSeconds(points);
    }

    points.forEach((point) => {
      if (point[1] > 0) {
        activeTimestamps.add(point[0]);
      }
    });
  });

  return Math.round((activeTimestamps.size * stepSeconds) / 60);
}

function getLastActivityAt(pointSets) {
  let lastTimestamp = null;

  pointSets.forEach((points) => {
    points.forEach((point) => {
      if (point[1] <= 0) {
        return;
      }

      lastTimestamp = lastTimestamp === null ? point[0] : Math.max(lastTimestamp, point[0]);
    });
  });

  if (lastTimestamp === null) {
    return null;
  }

  return new Date(lastTimestamp * 1000).toISOString();
}

function buildRuntimeWindowSummary(series) {
  const generationPoints = normalizeSeriesPoints(series && series.tokenThroughput ? series.tokenThroughput.generation : null);
  const promptPoints = normalizeSeriesPoints(series && series.tokenThroughput ? series.tokenThroughput.prompt : null);
  const pointSets = getActiveSeriesPoints(series);

  return {
    generatedTokens: sumSeriesTotals(generationPoints),
    promptTokens: sumSeriesTotals(promptPoints),
    activeMinutes: getActiveMinutes(pointSets),
    lastActivityAt: getLastActivityAt(pointSets),
  };
}

function buildLinePath(points, width, height, padding, minValue, maxValue) {
  if (!points.length) {
    return "";
  }

  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const range = Math.max(maxValue - minValue, 0.001);

  return points.map((point, index) => {
    const ratioX = points.length === 1 ? 0 : index / (points.length - 1);
    const x = padding.left + (ratioX * innerWidth);
    const y = padding.top + ((1 - ((point[1] - minValue) / range)) * innerHeight);
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

function buildAreaPath(points, width, height, padding, minValue, maxValue) {
  const linePath = buildLinePath(points, width, height, padding, minValue, maxValue);

  if (!linePath) {
    return "";
  }

  const innerWidth = width - padding.left - padding.right;
  const baselineY = height - padding.bottom;
  const firstX = padding.left;
  const lastX = padding.left + (points.length === 1 ? 0 : innerWidth);

  return `${linePath} L${lastX.toFixed(2)},${baselineY.toFixed(2)} L${firstX.toFixed(2)},${baselineY.toFixed(2)} Z`;
}

function renderChartGrid(gridGroup, width, height, padding) {
  gridGroup.textContent = "";

  const lineCount = 4;
  for (let index = 0; index < lineCount; index += 1) {
    const ratio = lineCount === 1 ? 0 : index / (lineCount - 1);
    const y = padding.top + (ratio * (height - padding.top - padding.bottom));
    const line = createSVGElement("line", "resume-runtime__grid-line");
    line.setAttribute("x1", padding.left);
    line.setAttribute("x2", width - padding.right);
    line.setAttribute("y1", y.toFixed(2));
    line.setAttribute("y2", y.toFixed(2));
    gridGroup.appendChild(line);
  }
}

function setRuntimeStatus(container, message, state) {
  container.dataset.runtimeState = state;

  const status = container.querySelector("[data-llm-status]");
  if (status) {
    status.textContent = message;
  }
}

function updateRuntimeCards(container, summary) {
  const cards = container.querySelectorAll("[data-llm-card]");
  cards.forEach((card) => {
    const metricKey = card.dataset.llmCard;
    const valueNode = card.querySelector("[data-llm-value]");
    const hasValue = Boolean(summary) && metricKey in summary;
    const value = hasValue ? summary[metricKey] : undefined;

    if (valueNode) {
      valueNode.textContent = formatRuntimeValue(metricKey, value);
    }

    if (hasValue && value !== null && value !== undefined && value !== "") {
      card.dataset.runtimeValue = String(value);
    } else {
      delete card.dataset.runtimeValue;
    }
  });
}

function updateRuntimeLegend(graph, graphKey, pointsBySeries) {
  const legendItems = graph.querySelectorAll("[data-llm-legend-key]");

  legendItems.forEach((item) => {
    const seriesKey = item.dataset.llmLegendKey;
    const points = normalizeSeriesPoints(pointsBySeries && pointsBySeries[seriesKey]);
    const peakValue = getSeriesPeakValue(points);
    const label = item.textContent.split(" · ")[0].trim();
    const formattedValue = formatLegendValue(graphKey, seriesKey, peakValue);

    item.textContent = formattedValue ? `${label} · ${formattedValue}` : label;
  });
}

function renderRuntimeGraph(container, graphKey, pointsBySeries) {
  const graph = container.querySelector(`[data-llm-graph="${graphKey}"]`);
  if (!graph) {
    return;
  }

  const svg = graph.querySelector("svg");
  const gridGroup = graph.querySelector("[data-llm-grid]");
  const seriesGroup = graph.querySelector("[data-llm-series]");

  if (!svg || !gridGroup || !seriesGroup) {
    return;
  }

  const width = 360;
  const height = 180;
  const padding = { top: 12, right: 12, bottom: 18, left: 12 };
  const seriesOrder = graphKey === "tokenThroughput"
    ? ["generation", "prompt"]
    : ["running", "waiting"];
  const pointSets = seriesOrder.map((seriesKey) => ({
    seriesKey,
    points: normalizeSeriesPoints(pointsBySeries && pointsBySeries[seriesKey]),
  }));
  const values = pointSets.flatMap((entry) => entry.points.map((point) => point[1]));
  const maxValue = Math.max(1, ...values, 0);

  renderChartGrid(gridGroup, width, height, padding);
  seriesGroup.textContent = "";

  pointSets.forEach((entry, index) => {
    if (!entry.points.length) {
      return;
    }

    if (index === 0) {
      const area = createSVGElement("path", `resume-runtime__area resume-runtime__area--${entry.seriesKey}`);
      area.setAttribute("d", buildAreaPath(entry.points, width, height, padding, 0, maxValue));
      seriesGroup.appendChild(area);
    }

    const path = createSVGElement("path", `resume-runtime__line resume-runtime__line--${entry.seriesKey}`);
    path.setAttribute("d", buildLinePath(entry.points, width, height, padding, 0, maxValue));
    seriesGroup.appendChild(path);

    const latestPoint = entry.points[entry.points.length - 1];
    if (latestPoint) {
      const ratioX = entry.points.length === 1 ? 0 : (entry.points.length - 1) / (entry.points.length - 1);
      const x = padding.left + (ratioX * (width - padding.left - padding.right));
      const y = padding.top + ((1 - (latestPoint[1] / Math.max(maxValue, 0.001))) * (height - padding.top - padding.bottom));
      const dot = createSVGElement("circle", `resume-runtime__dot resume-runtime__dot--${entry.seriesKey}`);
      dot.setAttribute("cx", x.toFixed(2));
      dot.setAttribute("cy", y.toFixed(2));
      dot.setAttribute("r", "4");
      seriesGroup.appendChild(dot);
    }
  });

  updateRuntimeLegend(graph, graphKey, pointsBySeries);
}

async function loadLLMMetrics(container) {
  const modelName = container.dataset.modelName || "nemotron3-nano";
  const windowValue = container.dataset.metricsWindow || "1h";
  const dashboardLink = container.querySelector(".resume-runtime__dashboard");
  const endpoint = `${LLM_METRICS_API_ROOT}/api/llm/${encodeURIComponent(modelName)}?window=${encodeURIComponent(windowValue)}`;

  setRuntimeStatus(container, `Fetching the latest ${formatWindowLabel(windowValue)} of traces.`, "loading");

  try {
    const payload = await fetchMetricsJSON(endpoint);
    const series = payload && payload.series ? payload.series : {};
    const updatedAt = payload && payload.updatedAt ? payload.updatedAt : new Date().toISOString();
    const summary = buildRuntimeWindowSummary(series);

    updateRuntimeCards(container, summary);
    renderRuntimeGraph(container, "tokenThroughput", series.tokenThroughput || {});
    renderRuntimeGraph(container, "concurrentRequests", series.concurrentRequests || {});

    if (dashboardLink && payload && payload.dashboardUrl) {
      dashboardLink.href = payload.dashboardUrl;
    }

    setRuntimeStatus(
      container,
      `Updated ${formatRelativeTime(updatedAt)} · showing the last ${formatWindowLabel(windowValue)}.`,
      "ready",
    );
  } catch (_error) {
    updateRuntimeCards(container, null);
    renderRuntimeGraph(container, "tokenThroughput", {});
    renderRuntimeGraph(container, "concurrentRequests", {});
    setRuntimeStatus(container, "Telemetry temporarily unavailable. Try the full dashboard.", "error");
  }
}

function isEditableElement(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [contenteditable=''], [role='textbox']"));
}

function getChatRoleLabel(role) {
  if (role === "user") {
    return "You";
  }

  if (role === "assistant") {
    return "nemotron3-nano";
  }

  return "System";
}

function appendInlineMarkdown(documentRef, parent, text) {
  const source = String(text || "");
  const pattern = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|`([^`\n]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|_([^_\n]+)_)/g;
  let lastIndex = 0;
  let match = pattern.exec(source);

  while (match) {
    if (match.index > lastIndex) {
      parent.appendChild(documentRef.createTextNode(source.slice(lastIndex, match.index)));
    }

    if (match[2] && match[3]) {
      const link = documentRef.createElement("a");
      link.href = match[3];
      link.rel = "noopener noreferrer nofollow";
      link.target = "_blank";
      appendInlineMarkdown(documentRef, link, match[2]);
      parent.appendChild(link);
    } else if (match[4]) {
      const code = documentRef.createElement("code");
      code.textContent = match[4];
      parent.appendChild(code);
    } else if (match[5] || match[6]) {
      const strong = documentRef.createElement("strong");
      appendInlineMarkdown(documentRef, strong, match[5] || match[6]);
      parent.appendChild(strong);
    } else if (match[7] || match[8]) {
      const emphasis = documentRef.createElement("em");
      appendInlineMarkdown(documentRef, emphasis, match[7] || match[8]);
      parent.appendChild(emphasis);
    }

    lastIndex = pattern.lastIndex;
    match = pattern.exec(source);
  }

  if (lastIndex < source.length) {
    parent.appendChild(documentRef.createTextNode(source.slice(lastIndex)));
  }
}

function appendParagraphLines(documentRef, parent, lines) {
  const paragraph = documentRef.createElement("p");
  lines.forEach((line, index) => {
    if (index > 0) {
      paragraph.appendChild(documentRef.createElement("br"));
    }
    appendInlineMarkdown(documentRef, paragraph, line);
  });
  parent.appendChild(paragraph);
}

function collectMarkdownBlock(lines, startIndex, matcher) {
  const collected = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      break;
    }

    const match = line.match(matcher);
    if (!match) {
      break;
    }

    collected.push(match);
    index += 1;
  }

  return { collected, nextIndex: index };
}

function buildMarkdownFragment(documentRef, text) {
  const fragment = documentRef.createDocumentFragment();
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index];
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const codeFenceMatch = line.match(/^```([\w-]+)?\s*$/);
    if (codeFenceMatch) {
      const codeLines = [];
      index += 1;

      while (index < lines.length && !lines[index].trim().match(/^```/)) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      const pre = documentRef.createElement("pre");
      const code = documentRef.createElement("code");
      if (codeFenceMatch[1]) {
        code.dataset.language = codeFenceMatch[1];
      }
      code.textContent = codeLines.join("\n");
      pre.appendChild(code);
      fragment.appendChild(pre);
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const heading = documentRef.createElement(`h${headingMatch[1].length}`);
      appendInlineMarkdown(documentRef, heading, headingMatch[2].trim());
      fragment.appendChild(heading);
      index += 1;
      continue;
    }

    const unorderedList = collectMarkdownBlock(lines, index, /^\s*[-*+]\s+(.+)$/);
    if (unorderedList.collected.length) {
      const list = documentRef.createElement("ul");
      unorderedList.collected.forEach((match) => {
        const item = documentRef.createElement("li");
        appendInlineMarkdown(documentRef, item, match[1].trim());
        list.appendChild(item);
      });
      fragment.appendChild(list);
      index = unorderedList.nextIndex;
      continue;
    }

    const orderedList = collectMarkdownBlock(lines, index, /^\s*\d+\.\s+(.+)$/);
    if (orderedList.collected.length) {
      const list = documentRef.createElement("ol");
      orderedList.collected.forEach((match) => {
        const item = documentRef.createElement("li");
        appendInlineMarkdown(documentRef, item, match[1].trim());
        list.appendChild(item);
      });
      fragment.appendChild(list);
      index = orderedList.nextIndex;
      continue;
    }

    const blockquote = collectMarkdownBlock(lines, index, /^\s*>\s?(.+)$/);
    if (blockquote.collected.length) {
      const quote = documentRef.createElement("blockquote");
      appendParagraphLines(
        documentRef,
        quote,
        blockquote.collected.map((match) => match[1].trim()),
      );
      fragment.appendChild(quote);
      index = blockquote.nextIndex;
      continue;
    }

    const paragraphLines = [];
    while (index < lines.length) {
      const paragraphLine = lines[index];
      const trimmed = paragraphLine.trim();
      if (
        !trimmed
        || /^```/.test(trimmed)
        || /^(#{1,6})\s+/.test(trimmed)
        || /^\s*[-*+]\s+/.test(trimmed)
        || /^\s*\d+\.\s+/.test(trimmed)
        || /^\s*>\s?/.test(trimmed)
      ) {
        break;
      }

      paragraphLines.push(paragraphLine.trimEnd());
      index += 1;
    }

    if (paragraphLines.length) {
      appendParagraphLines(documentRef, fragment, paragraphLines);
      continue;
    }

    index += 1;
  }

  return fragment;
}

function setChatMessageText(message, text) {
  if (!message || !message.copyNode) {
    return;
  }

  const value = typeof text === "string" ? text : "";
  message.copyNode.replaceChildren();
  message.copyNode.hidden = !value;

  const role = message.article && message.article.dataset
    ? message.article.dataset.chatMessageRole
    : "";

  if (role === "assistant" || role === "system") {
    message.copyNode.appendChild(buildMarkdownFragment(document, value));
  } else {
    message.copyNode.textContent = value;
  }

  if (message.article) {
    message.article.dataset.chatMessageContent = value;
  }
}

function setMessageThinking(message, text = "", visible = false) {
  if (
    !message
    || !message.thinkingNode
    || !message.thinkingCopyNode
    || !message.thinkingToggleNode
    || !message.thinkingPanelNode
  ) {
    return;
  }

  const content = String(text || "").trim();
  const shouldShow = visible && Boolean(content);
  message.thinkingNode.hidden = !shouldShow;

  if (!shouldShow) {
    message.thinkingNode.dataset.state = "idle";
    message.thinkingToggleNode.setAttribute("aria-expanded", "false");
    message.thinkingPanelNode.hidden = true;
    message.thinkingCopyNode.textContent = "";
    return;
  }

  message.thinkingCopyNode.textContent = content;
}

function createChatMessage(documentRef, role, text, options = {}) {
  const article = createElement(
    documentRef,
    "article",
    `resume-runtime__chat-message resume-runtime__chat-message--${role}`,
  );
  article.dataset.chatMessageRole = role;

  if (options.pending) {
    article.classList.add("resume-runtime__chat-message--pending");
  }

  if (options.error) {
    article.classList.add("resume-runtime__chat-message--error");
  }

  if (options.welcome) {
    article.classList.add("resume-runtime__chat-message--welcome");
  }

  const showMessageHead = role !== "user";
  let roleNode = null;
  let stampNode = null;
  let actions = null;
  let copyButton = null;
  let regenerateButton = null;
  let thinkingNode = null;
  let thinkingToggleNode = null;
  let thinkingPanelNode = null;
  let thinkingCopyNode = null;

  if (showMessageHead) {
    const head = createElement(documentRef, "div", "resume-runtime__chat-message-head");
    const avatar = createElement(
      documentRef,
      "span",
      "resume-runtime__chat-avatar",
      role === "assistant" ? "AI" : "SYS",
    );
    avatar.setAttribute("aria-hidden", "true");

    const metaStack = createElement(documentRef, "div", "resume-runtime__chat-meta-stack");
    roleNode = createElement(
      documentRef,
      "p",
      "resume-runtime__chat-message-role",
      options.roleLabel || getChatRoleLabel(role),
    );
    stampNode = createElement(
      documentRef,
      "p",
      "resume-runtime__chat-message-stamp",
      options.stamp || (role === "assistant" ? "Live on DGX Spark" : "System"),
    );

    metaStack.appendChild(roleNode);
    metaStack.appendChild(stampNode);
    head.appendChild(avatar);
    head.appendChild(metaStack);
    article.appendChild(head);
  }

  if (role === "assistant" && !options.welcome) {
    thinkingNode = createElement(documentRef, "div", "resume-runtime__chat-thinking");
    thinkingNode.hidden = true;
    thinkingNode.dataset.state = options.pending ? "live" : "idle";

    thinkingToggleNode = createElement(documentRef, "button", "resume-runtime__chat-thinking-toggle");
    thinkingToggleNode.type = "button";
    thinkingToggleNode.setAttribute("data-llm-chat-thinking-toggle", "");
    thinkingToggleNode.setAttribute("aria-expanded", "false");

    const thinkingHead = createElement(documentRef, "span", "resume-runtime__chat-thinking-head");
    const thinkingPulse = createElement(documentRef, "span", "resume-runtime__chat-thinking-pulse");
    thinkingPulse.setAttribute("aria-hidden", "true");
    const thinkingLabel = createElement(documentRef, "span", "resume-runtime__chat-thinking-label", "Thought Process");
    const thinkingChevron = createElement(documentRef, "span", "resume-runtime__chat-thinking-chevron", "");
    thinkingChevron.setAttribute("aria-hidden", "true");
    thinkingHead.appendChild(thinkingPulse);
    thinkingHead.appendChild(thinkingLabel);
    thinkingToggleNode.appendChild(thinkingHead);
    thinkingToggleNode.appendChild(thinkingChevron);

    thinkingPanelNode = createElement(documentRef, "div", "resume-runtime__chat-thinking-panel");
    thinkingPanelNode.hidden = true;

    thinkingCopyNode = createElement(
      documentRef,
      "div",
      "resume-runtime__chat-thinking-copy",
      "",
    );

    thinkingPanelNode.appendChild(thinkingCopyNode);
    thinkingNode.appendChild(thinkingToggleNode);
    thinkingNode.appendChild(thinkingPanelNode);
    article.appendChild(thinkingNode);
  }

  const copyNode = createElement(
    documentRef,
    "div",
    "resume-runtime__chat-message-copy",
    typeof text === "string" ? text : "",
  );
  copyNode.hidden = !String(text || "").trim();

  article.appendChild(copyNode);

  if (role === "assistant" && !options.welcome) {
    actions = createElement(documentRef, "div", "resume-runtime__chat-message-tools");
    actions.hidden = options.pending || options.hideActions || false;

    copyButton = createElement(documentRef, "button", "resume-runtime__chat-tool", "Copy");
    copyButton.type = "button";
    copyButton.setAttribute("data-llm-chat-copy", "");

    regenerateButton = createElement(documentRef, "button", "resume-runtime__chat-tool", "Regenerate");
    regenerateButton.type = "button";
    regenerateButton.setAttribute("data-llm-chat-regenerate", "");
    regenerateButton.hidden = true;

    actions.appendChild(copyButton);
    actions.appendChild(regenerateButton);
    article.appendChild(actions);
  }

  setChatMessageText({ article, copyNode }, text);

  return {
    article,
    copyNode,
    roleNode,
    stampNode,
    actions,
    copyButton,
    regenerateButton,
    thinkingNode,
    thinkingToggleNode,
    thinkingPanelNode,
    thinkingCopyNode,
  };
}

function scrollChatToBottom(state) {
  window.requestAnimationFrame(() => {
    state.messagesContainer.scrollTop = state.messagesContainer.scrollHeight;
  });
}

function autosizeChatInput(input) {
  if (!input) {
    return;
  }

  input.style.height = "0px";

  const maxHeight = 168;
  const nextHeight = Math.min(input.scrollHeight, maxHeight);
  input.style.height = `${Math.max(nextHeight, 24)}px`;
  input.style.overflowY = input.scrollHeight > maxHeight ? "auto" : "hidden";
}

function updateChatSendState(state) {
  if (!state.sendButton || !state.input) {
    return;
  }

  const hasValue = Boolean(state.input.value.trim());
  state.sendButton.disabled = state.isStreaming || !hasValue || Boolean(state.contextError);
}

function setChatFeedback(state, message, tone = "error", retryable = false) {
  if (!state.feedback || !state.feedbackRow) {
    return;
  }

  const text = String(message || "").trim();
  state.feedbackRow.hidden = !text;
  state.feedback.hidden = !text;
  state.feedback.dataset.tone = tone;
  state.feedback.textContent = text;

  if (state.retryButton) {
    state.retryButton.hidden = !(retryable && text);
  }
}

function describeTurnstileError(errorCode) {
  const code = String(errorCode || "").trim();

  if (!code) {
    return "Verification failed to initialize. Reload and try again.";
  }

  if (code === "110200") {
    return `Turnstile rejected this hostname (${code}). Add stevemurr.github.io in Turnstile Hostname Management.`;
  }

  if (code === "200500") {
    return `Turnstile iframe failed to load (${code}). Check blockers, privacy tools, or network filtering on challenges.cloudflare.com.`;
  }

  if (code.startsWith("110")) {
    return `Turnstile widget configuration failed (${code}). Check the site key, hostname list, and widget settings in Cloudflare.`;
  }

  if (code.startsWith("200")) {
    return `Turnstile hit a browser or cache problem (${code}). Reload the page or try a private window.`;
  }

  if (code.startsWith("300") || code.startsWith("600")) {
    return `Turnstile challenge failed (${code}). Retry or try another browser/network.`;
  }

  if (code.startsWith("400")) {
    return `Turnstile rejected the widget (${code}). Recheck the site key and whether the widget is enabled.`;
  }

  return `Turnstile failed (${code}). Check the widget configuration and retry.`;
}

function resetTurnstile(state) {
  state.turnstileToken = "";

  if (
    state.turnstileWidgetId !== null
    && window.turnstile
    && typeof window.turnstile.reset === "function"
  ) {
    window.turnstile.reset(state.turnstileWidgetId);
  }
}

function ensureTurnstileRendered(state, attempt = 0) {
  if (!state.turnstileContainer || !state.siteKey || state.turnstileWidgetId !== null) {
    return;
  }

  if (window.turnstile && typeof window.turnstile.render === "function") {
    state.turnstileWidgetId = window.turnstile.render(state.turnstileContainer, {
      sitekey: state.siteKey,
      size: "flexible",
      theme: "auto",
      appearance: "interaction-only",
      callback(token) {
        state.turnstileToken = token;
        if (!syncPersistentChatFeedback(state)) {
          setChatFeedback(state, "", "info", false);
        }
      },
      "expired-callback"() {
        state.turnstileToken = "";
        setChatFeedback(state, "Verification expired. Please confirm again.", "muted", false);
      },
      "timeout-callback"() {
        state.turnstileToken = "";
        setChatFeedback(state, "Verification timed out. Please try again.", "muted", false);
      },
      "unsupported-callback"() {
        state.turnstileToken = "";
        setChatFeedback(state, "This browser is not supported by Turnstile. Try another browser.", "error", false);
        return true;
      },
      "error-callback"(errorCode) {
        state.turnstileToken = "";
        setChatFeedback(state, describeTurnstileError(errorCode), "error", false);
        return true;
      },
    });

    return;
  }

  if (attempt >= LLM_CHAT_TURNSTILE_MAX_ATTEMPTS) {
    setChatFeedback(state, "Verification widget did not load. Disable blockers and reopen chat.", "error", false);
    return;
  }

  window.setTimeout(() => {
    ensureTurnstileRendered(state, attempt + 1);
  }, LLM_CHAT_TURNSTILE_POLL_MS);
}

function setChatBusy(state, isBusy) {
  state.isStreaming = isBusy;

  if (state.root) {
    state.root.dataset.chatBusy = isBusy ? "true" : "false";
  }

  if (state.input) {
    state.input.disabled = isBusy;
  }

  if (state.stopButton) {
    state.stopButton.hidden = !isBusy;
  }

  updateChatSendState(state);
}

function extractThinkingText(data) {
  if (typeof data === "string") {
    return data;
  }

  if (!data || typeof data !== "object") {
    return "";
  }

  const candidates = [
    data.text,
    data.thinking,
    data.reasoning,
    data.trace,
    data.message,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  return "";
}

function setMessageThinkingState(message, state = "idle") {
  if (!message || !message.thinkingNode) {
    return;
  }

  message.thinkingNode.dataset.state = state;
}

function toggleMessageThinking(article) {
  if (!article) {
    return;
  }

  const thinkingNode = article.querySelector(".resume-runtime__chat-thinking");
  const toggle = article.querySelector("[data-llm-chat-thinking-toggle]");
  const panel = article.querySelector(".resume-runtime__chat-thinking-panel");

  if (!thinkingNode || !toggle || !panel || thinkingNode.hidden) {
    return;
  }

  const expanded = toggle.getAttribute("aria-expanded") === "true";
  toggle.setAttribute("aria-expanded", expanded ? "false" : "true");
  panel.hidden = expanded;
}

function appendChatMessage(state, role, text, options = {}) {
  const message = createChatMessage(document, role, text, {
    modelLabel: state.modelLabel,
    roleLabel: role === "assistant" ? state.modelLabel : options.roleLabel,
    ...options,
  });
  state.messagesContainer.appendChild(message.article);
  updateAssistantMessageActions(state);
  scrollChatToBottom(state);
  return message;
}

function removeChatMessage(message) {
  if (message && message.article && message.article.parentNode) {
    message.article.parentNode.removeChild(message.article);
  }
}

function restoreChatShell(state) {
  state.messages = [];
  state.lastRequestSnapshot = null;
  state.pendingAssistant = null;
  state.pendingAssistantText = "";
  state.pendingThinkingText = "";
  state.messagesContainer.innerHTML = state.initialMessagesMarkup;
  state.input.value = "";
  autosizeChatInput(state.input);
  setChatBusy(state, false);
  resetTurnstile(state);
  if (!syncPersistentChatFeedback(state)) {
    setChatFeedback(state, "", "info", false);
  }
}

function updateAssistantMessageActions(state) {
  const assistantMessages = Array.from(
    state.messagesContainer.querySelectorAll(".resume-runtime__chat-message--assistant:not(.resume-runtime__chat-message--welcome)"),
  );

  assistantMessages.forEach((message, index) => {
    const actions = message.querySelector(".resume-runtime__chat-message-tools");
    const regenerateButton = message.querySelector("[data-llm-chat-regenerate]");

    if (actions && message.classList.contains("resume-runtime__chat-message--pending")) {
      actions.hidden = true;
    } else if (actions) {
      actions.hidden = false;
    }

    if (regenerateButton) {
      regenerateButton.hidden = index !== assistantMessages.length - 1;
      regenerateButton.disabled = state.isStreaming;
    }
  });
}

async function copyChatMessage(state, article) {
  const text = String(article && article.dataset.chatMessageContent || "").trim();
  if (!text) {
    return;
  }

  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      setChatFeedback(state, "Copied response.", "muted", false);
      return;
    }
  } catch {
    // fall through to textarea fallback
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand("copy");
    setChatFeedback(state, "Copied response.", "muted", false);
  } catch {
    setChatFeedback(state, "Copy failed. Try selecting the response directly.", "error", false);
  } finally {
    document.body.removeChild(textarea);
  }
}

function prefersReducedMotion() {
  return Boolean(
    window.matchMedia
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
}

function getChatAnimationMetrics(state, sourceElement) {
  if (!state.shell || !sourceElement) {
    return null;
  }

  const sourceRect = sourceElement.getBoundingClientRect();
  const shellRect = state.shell.getBoundingClientRect();

  if (!sourceRect.width || !sourceRect.height || !shellRect.width || !shellRect.height) {
    return null;
  }

  return {
    deltaX: (sourceRect.left + (sourceRect.width / 2)) - (shellRect.left + (shellRect.width / 2)),
    deltaY: (sourceRect.top + (sourceRect.height / 2)) - (shellRect.top + (shellRect.height / 2)),
    scaleX: Math.max(0.18, Math.min(1, sourceRect.width / shellRect.width)),
    scaleY: Math.max(0.08, Math.min(1, sourceRect.height / shellRect.height)),
  };
}

function clearChatAnimatedStyles(state) {
  if (state.shell) {
    state.shell.style.transform = "";
    state.shell.style.opacity = "";
  }

  if (state.backdrop) {
    state.backdrop.style.opacity = "";
  }
}

function clearChatAnimationRef(state, key, animation) {
  if (state[key] === animation) {
    state[key] = null;
  }
}

function trackChatAnimation(state, key, animation) {
  state[key] = animation;

  Promise.resolve(animation.finished)
    .catch(() => {
      // Cancellation is part of the normal lifecycle here.
    })
    .finally(() => {
      clearChatAnimationRef(state, key, animation);
    });

  return animation;
}

function cancelElementAnimations(element) {
  if (!element || typeof element.getAnimations !== "function") {
    return;
  }

  element.getAnimations().forEach((animation) => {
    try {
      animation.cancel();
    } catch {
      // Ignore already-finished animations.
    }
  });
}

function resetChatAnimations(state) {
  [
    ["shellAnimation", state.shellAnimation],
    ["backdropAnimation", state.backdropAnimation],
  ].forEach(([key, animation]) => {
    if (animation && typeof animation.cancel === "function") {
      try {
        animation.cancel();
      } catch {
        // Ignore already-finished animations.
      }
    }

    clearChatAnimationRef(state, key, animation);
  });

  cancelElementAnimations(state.shell);
  cancelElementAnimations(state.backdrop);
  clearChatAnimatedStyles(state);
}

function animateChatOpen(state, sourceElement) {
  if (
    !state.shell
    || !state.backdrop
    || !sourceElement
    || prefersReducedMotion()
    || typeof state.shell.animate !== "function"
    || typeof state.backdrop.animate !== "function"
  ) {
    return;
  }

  const metrics = getChatAnimationMetrics(state, sourceElement);
  if (!metrics) {
    return;
  }

  trackChatAnimation(state, "backdropAnimation", state.backdrop.animate(
    [
      { opacity: 0 },
      { opacity: 1 },
    ],
    {
      duration: LLM_CHAT_BACKDROP_ANIMATION_MS,
      easing: "ease-out",
    },
  ));

  trackChatAnimation(state, "shellAnimation", state.shell.animate(
    [
      {
        transform: `translate(${metrics.deltaX}px, ${metrics.deltaY}px) scale(${metrics.scaleX}, ${metrics.scaleY})`,
        opacity: 0.3,
      },
      {
        transform: "translate(0, 0) scale(1, 1)",
        opacity: 1,
      },
    ],
    {
      duration: LLM_CHAT_OPEN_ANIMATION_MS,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    },
  ));
}

function openChat(state, sourceElement = null) {
  if (!state.overlay || !state.input || state.isOpen || state.isClosing) {
    return;
  }

  state.lastOpenSourceElement = sourceElement || state.openButtons[0] || null;
  resetChatAnimations(state);
  state.overlay.hidden = false;
  document.body.classList.add(LLM_CHAT_BODY_OPEN_CLASS);
  state.isOpen = true;
  animateChatOpen(state, state.lastOpenSourceElement);
  if (!state.contextError) {
    ensureTurnstileRendered(state);
  }
  autosizeChatInput(state.input);
  updateChatSendState(state);
  window.requestAnimationFrame(() => {
    state.input.focus({ preventScroll: true });
  });
}

function closeChat(state) {
  if (!state.overlay || state.isClosing) {
    return;
  }

  if (state.abortController) {
    state.abortController.abort();
  }

  state.isOpen = false;
  state.isClosing = true;

  const finishClose = () => {
    state.overlay.hidden = true;
    resetChatAnimations(state);
    document.body.classList.remove(LLM_CHAT_BODY_OPEN_CLASS);
    state.isClosing = false;
    restoreChatShell(state);
  };

  if (
    !state.shell
    || !state.backdrop
    || !state.lastOpenSourceElement
    || prefersReducedMotion()
    || typeof state.shell.animate !== "function"
    || typeof state.backdrop.animate !== "function"
  ) {
    finishClose();
    return;
  }

  resetChatAnimations(state);

  const metrics = getChatAnimationMetrics(state, state.lastOpenSourceElement);
  if (!metrics) {
    finishClose();
    return;
  }

  const backdropAnimation = trackChatAnimation(state, "backdropAnimation", state.backdrop.animate(
    [
      { opacity: 1 },
      { opacity: 0 },
    ],
    {
      duration: LLM_CHAT_BACKDROP_ANIMATION_MS,
      easing: "ease-in",
      fill: "forwards",
    },
  ));

  const shellAnimation = trackChatAnimation(state, "shellAnimation", state.shell.animate(
    [
      {
        transform: "translate(0, 0) scale(1, 1)",
        opacity: 1,
      },
      {
        transform: `translate(${metrics.deltaX}px, ${metrics.deltaY}px) scale(${metrics.scaleX}, ${metrics.scaleY})`,
        opacity: 0.3,
      },
    ],
    {
      duration: LLM_CHAT_OPEN_ANIMATION_MS,
      easing: "cubic-bezier(0.64, 0, 0.78, 0)",
      fill: "forwards",
    },
  ));

  Promise.allSettled([backdropAnimation.finished, shellAnimation.finished]).finally(() => {
    finishClose();
  });
}

function normalizeChatPlainText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeChatCodeText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .join("\n")
    .trim();
}

function cloneChatContentNode(node) {
  if (!node || typeof node.cloneNode !== "function") {
    return null;
  }

  const clone = node.cloneNode(true);
  Array.from(clone.querySelectorAll(".anchor, .entry-hint, script, style, noscript, [hidden], [aria-hidden=\"true\"]"))
    .forEach((child) => {
      child.remove();
    });
  return clone;
}

function getArticleChatText(node) {
  const clone = cloneChatContentNode(node);
  return normalizeChatPlainText(clone ? clone.textContent : "");
}

function getArticleCodeText(node) {
  const source = node && node.querySelector("code")
    ? node.querySelector("code")
    : node;
  const clone = cloneChatContentNode(source);
  return normalizeChatCodeText(clone ? clone.textContent : "");
}

function getArticleCodeLanguage(node) {
  const classNames = [];

  if (node && node.classList) {
    classNames.push(...Array.from(node.classList));
  }

  const code = node && node.querySelector("code")
    ? node.querySelector("code")
    : null;
  if (code && code.classList) {
    classNames.push(...Array.from(code.classList));
  }

  for (const className of classNames) {
    const match = className.match(/^language-([\w-]+)/i);
    if (match && match[1]) {
      return match[1];
    }
  }

  if (code && code.dataset) {
    return normalizeChatPlainText(code.dataset.language || code.dataset.lang || "");
  }

  return "";
}

function serializeArticleList(node) {
  const isOrdered = node.tagName.toUpperCase() === "OL";
  return Array.from(node.children)
    .filter((child) => child.tagName && child.tagName.toUpperCase() === "LI")
    .map((item, index) => {
      const text = getArticleChatText(item);
      if (!text) {
        return "";
      }

      return `${isOrdered ? `${index + 1}.` : "-"} ${text}`;
    })
    .filter(Boolean)
    .join("\n");
}

function serializeArticleNode(node, blocks, sections) {
  if (!(node instanceof HTMLElement) || node.hidden) {
    return;
  }

  const tagName = node.tagName.toUpperCase();
  if (tagName === "SCRIPT" || tagName === "STYLE" || tagName === "NOSCRIPT") {
    return;
  }

  if (/^H[1-6]$/.test(tagName)) {
    const text = getArticleChatText(node);
    if (!text) {
      return;
    }

    const anchor = node.id ? `#${node.id}` : "";
    if (anchor) {
      sections.push({
        level: tagName,
        text,
        anchor,
      });
    }
    blocks.push(`${tagName}${anchor ? ` ${anchor}` : ""}: ${text}`);
    return;
  }

  if (tagName === "P") {
    const text = getArticleChatText(node);
    if (text) {
      blocks.push(text);
    }
    return;
  }

  if (tagName === "UL" || tagName === "OL") {
    const listText = serializeArticleList(node);
    if (listText) {
      blocks.push(listText);
    }
    return;
  }

  if (tagName === "BLOCKQUOTE") {
    const text = getArticleChatText(node);
    if (text) {
      blocks.push(`Blockquote: ${text}`);
    }
    return;
  }

  if (tagName === "PRE") {
    const code = getArticleCodeText(node);
    if (!code) {
      return;
    }

    const language = getArticleCodeLanguage(node);
    blocks.push(`Code block${language ? ` (${language})` : ""}:\n${code}`);
    return;
  }

  Array.from(node.children).forEach((child) => {
    serializeArticleNode(child, blocks, sections);
  });
}

function buildArticleTranscript(contentNode) {
  const blocks = [];
  const sections = [];

  Array.from(contentNode.children).forEach((child) => {
    serializeArticleNode(child, blocks, sections);
  });

  return {
    transcript: blocks.join("\n\n").trim(),
    sections,
  };
}

function getArticleChatURL() {
  try {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return window.location.href;
  }
}

function buildArticleChatMessages(root) {
  const article = root.closest(".post-single");
  const title = getArticleChatText(article && article.querySelector(".post-title"));
  const summary = getArticleChatText(article && article.querySelector(".post-hero__summary"));
  const contentNode = article && article.querySelector(".post-content");

  if (!article || !title || !contentNode) {
    return { error: LLM_CHAT_ARTICLE_CONTEXT_ERROR };
  }

  const { transcript, sections } = buildArticleTranscript(contentNode);
  if (!transcript) {
    return { error: LLM_CHAT_ARTICLE_CONTEXT_ERROR };
  }

  const transcriptText = transcript.length > LLM_CHAT_ARTICLE_TRANSCRIPT_LIMIT
    ? `${transcript.slice(0, LLM_CHAT_ARTICLE_TRANSCRIPT_LIMIT).trimEnd()}\n\n[Transcript truncated at ${LLM_CHAT_ARTICLE_TRANSCRIPT_LIMIT} characters.]`
    : transcript;
  const sectionIndex = sections.length
    ? sections
      .map((section) => `- ${section.level}: ${section.text} (${section.anchor})`)
      .join("\n")
    : "- None";
  const instructionMessage = [
    "Answer using only the current article context provided in this conversation.",
    "If the answer is not covered in the article, reply with exactly: not covered in this article.",
    "Do not use outside knowledge, do not speculate, and do not invent details.",
    "When referencing a section with a known anchor, include a markdown link that uses the relative fragment, for example [Section](#section-id).",
  ].join(" ");
  const contextMessage = [
    `Article title: ${title}`,
    summary ? `Summary: ${summary}` : "",
    `URL: ${getArticleChatURL()}`,
    "",
    "Section index:",
    sectionIndex,
    "",
    "Article transcript:",
    transcriptText,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    messages: [
      {
        role: "system",
        content: instructionMessage,
      },
      {
        role: "system",
        content: contextMessage,
      },
    ],
  };
}

function hydrateChatContext(state) {
  state.hiddenRequestMessages = [];
  state.contextError = "";

  if (state.chatScope !== LLM_CHAT_ARTICLE_SCOPE) {
    return;
  }

  const context = buildArticleChatMessages(state.root);
  if (context.error) {
    state.contextError = context.error;
    return;
  }

  state.hiddenRequestMessages = context.messages;
}

function syncPersistentChatFeedback(state) {
  if (!state.contextError) {
    return false;
  }

  setChatFeedback(state, state.contextError, "error", false);
  return true;
}

function getChatRequestMessages(state, messages) {
  const visibleMessages = messages
    .slice(-LLM_CHAT_MAX_HISTORY_MESSAGES)
    .map((entry) => ({
      role: entry.role,
      content: entry.content,
    }));

  return state.hiddenRequestMessages.concat(visibleMessages);
}

async function parseChatError(response) {
  const contentType = response.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      const payload = await response.json();
      if (payload && typeof payload.error === "string") {
        return payload.error;
      }

      if (payload && payload.error && typeof payload.error.message === "string") {
        return payload.error.message;
      }
    }

    const text = await response.text();
    return text || LLM_CHAT_DEFAULT_ERROR;
  } catch {
    return LLM_CHAT_DEFAULT_ERROR;
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

  const rawData = dataLines.join("\n");

  if (!rawData) {
    return { eventName, data: null };
  }

  try {
    return {
      eventName,
      data: JSON.parse(rawData),
    };
  } catch {
    return {
      eventName,
      data: rawData,
    };
  }
}

async function readEventStream(response, onEvent) {
  if (!response.body) {
    throw new Error("Streaming response missing body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

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
        if (parsed) {
          onEvent(parsed);
        }
      }

      boundaryIndex = buffer.indexOf("\n\n");
    }

    if (done) {
      break;
    }
  }

  const tail = buffer.trim();
  if (tail) {
    const parsed = parseSSEBlock(tail);
    if (parsed) {
      onEvent(parsed);
    }
  }
}

function markPendingAssistant(state, options = {}) {
  if (!state.pendingAssistant) {
    return;
  }

  state.pendingAssistant.article.classList.remove("resume-runtime__chat-message--pending");

  if (options.error) {
    state.pendingAssistant.article.classList.add("resume-runtime__chat-message--error");
  }

  if (state.pendingAssistant.actions) {
    state.pendingAssistant.actions.hidden = Boolean(options.error);
  }
}

async function streamChatRequest(state, requestMessages) {
  state.lastRequestSnapshot = requestMessages.slice();
  setChatFeedback(state, "", "info", false);
  setChatBusy(state, true);
  state.pendingThinkingText = "";
  state.pendingAssistantText = "";
  state.pendingAssistant = appendChatMessage(state, "assistant", "", { pending: true });
  state.abortController = new AbortController();

  try {
    const response = await fetch(`${LLM_CHAT_API_ROOT}/api/chat`, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: getChatRequestMessages(state, requestMessages),
        captchaToken: state.turnstileToken,
      }),
      signal: state.abortController.signal,
    });

    if (!response.ok) {
      throw new Error(await parseChatError(response));
    }

    await readEventStream(response, ({ eventName, data }) => {
      if (eventName === "start") {
        return;
      }

      if (eventName === "thinking" || eventName === "reasoning") {
        const text = extractThinkingText(data);
        if (!text) {
          return;
        }

        state.pendingThinkingText += text;
        setMessageThinking(state.pendingAssistant, state.pendingThinkingText, true);
        setMessageThinkingState(state.pendingAssistant, "live");
        return;
      }

      if (eventName === "delta") {
        const text = typeof data === "string"
          ? data
          : String((data && data.text) || "");

        if (!text) {
          return;
        }

        if (!state.pendingAssistant) {
          state.pendingAssistant = appendChatMessage(state, "assistant", "", { pending: true });
        }

        if (state.pendingThinkingText.trim()) {
          setMessageThinking(state.pendingAssistant, state.pendingThinkingText, true);
          setMessageThinkingState(state.pendingAssistant, "done");
        }

        if (!state.pendingAssistantText) {
          setChatMessageText(state.pendingAssistant, "");
        }

        state.pendingAssistantText += text;
        setChatMessageText(state.pendingAssistant, state.pendingAssistantText);
        markPendingAssistant(state, { error: false });
        updateAssistantMessageActions(state);
        scrollChatToBottom(state);
        return;
      }

      if (eventName === "error") {
        const message = typeof data === "string"
          ? data
          : String((data && (data.error || data.message)) || LLM_CHAT_DEFAULT_ERROR);
        throw new Error(message);
      }
    });

    markPendingAssistant(state, { error: false });
    if (state.pendingThinkingText.trim()) {
      setMessageThinking(state.pendingAssistant, state.pendingThinkingText, true);
      setMessageThinkingState(state.pendingAssistant, "done");
    }

    if (state.pendingAssistantText.trim()) {
      if (state.pendingAssistant.actions) {
        state.pendingAssistant.actions.hidden = false;
      }

      state.messages.push({
        role: "assistant",
        content: state.pendingAssistantText,
      });

      updateAssistantMessageActions(state);
    } else {
      removeChatMessage(state.pendingAssistant);
      state.pendingAssistant = null;
      throw new Error("The model returned an empty response.");
    }

    setChatFeedback(state, "", "info", false);
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    const message = aborted
      ? "Response stopped."
      : error instanceof Error && error.message
        ? error.message
        : LLM_CHAT_DEFAULT_ERROR;

    if (state.pendingAssistant && !state.pendingAssistantText.trim()) {
      removeChatMessage(state.pendingAssistant);
      state.pendingAssistant = null;
    } else {
      markPendingAssistant(state, { error: !aborted });
    }

    if (!state.isOpen) {
      return;
    }

    if (state.pendingAssistantText.trim()) {
      setMessageThinkingState(state.pendingAssistant, "done");
    } else {
      setMessageThinking(state.pendingAssistant, "", false);
    }
    setChatFeedback(state, message, aborted ? "muted" : "error", Boolean(state.lastRequestSnapshot && state.lastRequestSnapshot.length));
  } finally {
    state.abortController = null;
    if (state.pendingAssistant && state.pendingThinkingText.trim()) {
      setMessageThinking(state.pendingAssistant, state.pendingThinkingText, true);
      setMessageThinkingState(state.pendingAssistant, "done");
    }
    state.pendingAssistant = null;
    state.pendingAssistantText = "";
    state.pendingThinkingText = "";
    setChatBusy(state, false);
    resetTurnstile(state);
    updateAssistantMessageActions(state);
    updateChatSendState(state);

    if (state.isOpen) {
      state.input.focus({ preventScroll: true });
    }
  }
}

async function submitChat(state) {
  const content = state.input.value.trim();
  if (!content || state.isStreaming) {
    return;
  }

  if (state.contextError) {
    setChatFeedback(state, state.contextError, "error", false);
    return;
  }

  if (!state.turnstileToken) {
    setChatFeedback(state, "Complete the verification challenge before sending.", "muted", false);
    return;
  }

  state.messages.push({
    role: "user",
    content,
  });

  appendChatMessage(state, "user", content);
  state.input.value = "";
  autosizeChatInput(state.input);
  updateChatSendState(state);

  await streamChatRequest(state, state.messages);
}

async function retryChat(state) {
  if (state.isStreaming || !state.lastRequestSnapshot || !state.lastRequestSnapshot.length) {
    return;
  }

  if (state.contextError) {
    setChatFeedback(state, state.contextError, "error", false);
    return;
  }

  if (!state.turnstileToken) {
    setChatFeedback(state, "Complete the verification challenge before retrying.", "muted", false);
    return;
  }

  await streamChatRequest(state, state.lastRequestSnapshot);
}

function initializeLLMChat(root) {
  const overlay = root.querySelector("[data-llm-chat-overlay]");
  const backdrop = root.querySelector(".resume-runtime__chat-backdrop");
  const shell = root.querySelector(".resume-runtime__chat-shell");
  const messagesContainer = root.querySelector("[data-llm-chat-messages]");
  const feedbackRow = root.querySelector("[data-llm-chat-feedback-row]");
  const feedback = root.querySelector("[data-llm-chat-feedback]");
  const form = root.querySelector("[data-llm-chat-form]");
  const input = root.querySelector("[data-llm-chat-input]");
  const turnstileContainer = root.querySelector("[data-llm-chat-turnstile]");
  const sendButton = root.querySelector("[data-llm-chat-send]");
  const stopButton = root.querySelector("[data-llm-chat-stop]");
  const retryButton = root.querySelector("[data-llm-chat-retry]");
  const openButtons = Array.from(root.querySelectorAll("[data-llm-chat-open]"));
  const closeButtons = Array.from(root.querySelectorAll("[data-llm-chat-close]"));
  const siteKey = root.dataset.turnstileSiteKey || "";

  if (!overlay || !messagesContainer || !form || !input || !sendButton || !stopButton) {
    return;
  }

  const state = {
    root,
    overlay,
    backdrop,
    shell,
    messagesContainer,
    feedbackRow,
    feedback,
    form,
    input,
    turnstileContainer,
    sendButton,
    stopButton,
    retryButton,
    openButtons,
    closeButtons,
    siteKey,
    chatScope: root.dataset.chatScope || "general",
    modelLabel: root.dataset.chatModel || "nemotron3-nano",
    initialMessagesMarkup: messagesContainer.innerHTML,
    isOpen: false,
    isClosing: false,
    isStreaming: false,
    messages: [],
    lastRequestSnapshot: null,
    lastOpenSourceElement: openButtons[0] || null,
    shellAnimation: null,
    backdropAnimation: null,
    pendingAssistant: null,
    pendingAssistantText: "",
    pendingThinkingText: "",
    abortController: null,
    turnstileWidgetId: null,
    turnstileToken: "",
    hiddenRequestMessages: [],
    contextError: "",
  };

  if (overlay.parentNode !== document.body) {
    document.body.appendChild(overlay);
  }

  hydrateChatContext(state);
  restoreChatShell(state);
  autosizeChatInput(input);

  openButtons.forEach((button) => {
    button.addEventListener("click", () => {
      openChat(state, button);
    });
  });

  closeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      closeChat(state);
    });
  });

  if (retryButton) {
    retryButton.addEventListener("click", () => {
      retryChat(state);
    });
  }

  messagesContainer.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }

    const copyButton = target.closest("[data-llm-chat-copy]");
    if (copyButton) {
      const article = copyButton.closest(".resume-runtime__chat-message");
      if (article) {
        copyChatMessage(state, article);
      }
      return;
    }

    const thinkingToggle = target.closest("[data-llm-chat-thinking-toggle]");
    if (thinkingToggle) {
      const article = thinkingToggle.closest(".resume-runtime__chat-message");
      toggleMessageThinking(article);
      return;
    }

    const regenerateButton = target.closest("[data-llm-chat-regenerate]");
    if (regenerateButton) {
      retryChat(state);
    }
  });

  stopButton.addEventListener("click", () => {
    if (state.abortController) {
      state.abortController.abort();
    }
  });

  input.addEventListener("input", () => {
    autosizeChatInput(input);
    if (!syncPersistentChatFeedback(state)) {
      setChatFeedback(state, "", "info", false);
    }
    updateChatSendState(state);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitChat(state);
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitChat(state);
  });

  document.addEventListener("keydown", (event) => {
    const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
    if (isShortcut) {
      if (!state.isOpen && isEditableElement(event.target)) {
        return;
      }

      event.preventDefault();
      if (state.isOpen) {
        state.input.focus({ preventScroll: true });
      } else {
        openChat(state, state.openButtons[0] || null);
      }

      return;
    }

    if (event.key === "Escape" && state.isOpen) {
      event.preventDefault();
      closeChat(state);
    }
  });
}

async function loadProjectFeed(container) {
  const username = container.dataset.githubUser;
  const list = container.querySelector("[data-project-list]");
  const limit = Math.max(1, Number(container.dataset.projectLimit || 5));
  const pinnedCards = Array.from(container.querySelectorAll("[data-project-card]"));
  const pinnedRepoNames = (container.dataset.pinnedRepos || "")
    .split(",")
    .map(normalizeRepo)
    .filter(Boolean);
  const pinnedSet = new Set(pinnedRepoNames);
  const excludedRepos = (container.dataset.githubExclude || "")
    .split(",")
    .map(normalizeRepo)
    .filter(Boolean);

  if (!list || !username) {
    pinnedCards.forEach((card) => {
      updateProjectCard(card, null);
    });
    return;
  }

  try {
    const repositories = await fetchJSON(
      `${GITHUB_API_ROOT}/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated&type=owner`,
    );

    let events = [];
    try {
      events = await fetchJSON(
        `${GITHUB_API_ROOT}/users/${encodeURIComponent(username)}/events/public?per_page=100`,
      );
    } catch (_error) {
      events = [];
    }

    const entries = buildActivityEntries(repositories, events, username, excludedRepos);
    const entryMap = new Map(
      entries.map((entry) => [normalizeRepo(entry.repository.full_name), entry]),
    );

    pinnedCards.forEach((card) => {
      const repoName = normalizeRepo(card.dataset.projectRepo);
      updateProjectCard(card, entryMap.get(repoName) || null);
    });

    const dynamicSlots = limit - pinnedCards.length;
    const dynamicEntries = entries
      .filter((entry) => !pinnedSet.has(normalizeRepo(entry.repository.full_name)))
      .slice(0, dynamicSlots);

    dynamicEntries.forEach((entry) => {
      list.appendChild(createProjectCard(entry));
    });
  } catch (_error) {
    pinnedCards.forEach((card) => {
      markProjectCardUnavailable(card);
    });
  }
}

async function loadRecentCommits(container) {
  const username = container.dataset.githubUser;
  const list = container.querySelector(".resume-commit-list");
  const excludedRepos = (container.dataset.githubExclude || "")
    .split(",")
    .map(normalizeRepo)
    .filter(Boolean);
  const limit = Math.max(1, Number(container.dataset.commitCount || 5));

  if (!username || !list) {
    return;
  }

  try {
    const events = [];
    let recentCommits = [];

    for (let page = 1; page <= RECENT_COMMIT_MAX_PAGES; page += 1) {
      const batch = await fetchJSON(
        `${GITHUB_API_ROOT}/users/${encodeURIComponent(username)}/events/public?per_page=${RECENT_COMMIT_PAGE_LIMIT}&page=${page}`,
      );

      if (!Array.isArray(batch) || batch.length === 0) {
        break;
      }

      events.push(...batch);
      recentCommits = buildRecentCommitEntries(events, excludedRepos);

      if (recentCommits.length >= limit || batch.length < RECENT_COMMIT_PAGE_LIMIT) {
        break;
      }
    }

    if (!recentCommits.length) {
      return;
    }

    const fragment = document.createDocumentFragment();
    recentCommits.slice(0, limit).forEach((entry) => {
      fragment.appendChild(createCommitItem(entry));
    });

    list.textContent = "";
    list.appendChild(fragment);
  } catch (_error) {
    // Keep the build-time list in place as a fallback when GitHub is unavailable.
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initializePostBackLinks();

  const llmMetricsContainers = document.querySelectorAll("[data-llm-metrics]");
  llmMetricsContainers.forEach((container) => {
    loadLLMMetrics(container);
  });

  const llmChatContainers = document.querySelectorAll("[data-llm-chat]");
  llmChatContainers.forEach((container) => {
    initializeLLMChat(container);
  });

  const recentCommitContainers = document.querySelectorAll("[data-recent-commits]");
  recentCommitContainers.forEach((container) => {
    loadRecentCommits(container);
  });

  const containers = document.querySelectorAll("[data-project-feed]");
  containers.forEach((container) => {
    loadProjectFeed(container);
  });
});
