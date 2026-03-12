const GITHUB_API_ROOT = "https://api.github.com";
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
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const containers = document.querySelectorAll("[data-project-feed]");
  containers.forEach((container) => {
    loadProjectFeed(container);
  });
});
