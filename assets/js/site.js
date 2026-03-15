const GITHUB_API_ROOT = "https://api.github.com";
const RECENT_COMMIT_PAGE_LIMIT = 100;
const RECENT_COMMIT_MAX_PAGES = 3;
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

function fetchJSON(url) {
  return fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
    },
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`GitHub request failed: ${response.status}`);
    }

    return response.json();
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

function getProjectSortDate(entry) {
  if (!entry) {
    return 0;
  }

  const sortDate = entry.repository.pushed_at || entry.repository.updated_at || entry.lastActiveAt;
  const timestamp = new Date(sortDate).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
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

function sortProjectCards(list, entryMap) {
  const cards = Array.from(list.querySelectorAll("[data-project-card]"));

  cards.sort((left, right) => {
    const leftPinned = left.dataset.projectPinned === "true";
    const rightPinned = right.dataset.projectPinned === "true";

    if (leftPinned !== rightPinned) {
      return leftPinned ? -1 : 1;
    }

    const leftEntry = entryMap.get(normalizeRepo(left.dataset.projectRepo));
    const rightEntry = entryMap.get(normalizeRepo(right.dataset.projectRepo));

    const leftSortDate = getProjectSortDate(leftEntry);
    const rightSortDate = getProjectSortDate(rightEntry);

    if (rightSortDate !== leftSortDate) {
      return rightSortDate - leftSortDate;
    }

    if (leftEntry && rightEntry && rightEntry.score !== leftEntry.score) {
      return rightEntry.score - leftEntry.score;
    }

    if (leftEntry && !rightEntry) {
      return -1;
    }

    if (!leftEntry && rightEntry) {
      return 1;
    }

    return Number(left.dataset.projectOrder || 0) - Number(right.dataset.projectOrder || 0);
  });

  cards.forEach((card) => {
    list.appendChild(card);
  });
}

async function loadProjectFeed(container) {
  const username = container.dataset.githubUser;
  const list = container.querySelector("[data-project-list]");
  const cards = Array.from(container.querySelectorAll("[data-project-card]"));
  const excludedRepos = (container.dataset.githubExclude || "")
    .split(",")
    .map(normalizeRepo)
    .filter(Boolean);

  if (!list || !cards.length) {
    return;
  }

  if (!username) {
    cards.forEach((card) => {
      updateProjectCard(card, null);
    });
    sortProjectCards(list, new Map());
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

    cards.forEach((card) => {
      const repoName = normalizeRepo(card.dataset.projectRepo);
      updateProjectCard(card, entryMap.get(repoName) || null);
    });

    sortProjectCards(list, entryMap);
  } catch (_error) {
    cards.forEach((card) => {
      markProjectCardUnavailable(card);
    });
    sortProjectCards(list, new Map());
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
  const recentCommitContainers = document.querySelectorAll("[data-recent-commits]");
  recentCommitContainers.forEach((container) => {
    loadRecentCommits(container);
  });

  const containers = document.querySelectorAll("[data-project-feed]");
  containers.forEach((container) => {
    loadProjectFeed(container);
  });
});
