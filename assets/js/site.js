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

  let valueUnit;
  if (absMs < hour) {
    valueUnit = [Math.round(elapsed / minute), "minute"];
  } else if (absMs < day) {
    valueUnit = [Math.round(elapsed / hour), "hour"];
  } else if (absMs < week) {
    valueUnit = [Math.round(elapsed / day), "day"];
  } else if (absMs < month) {
    valueUnit = [Math.round(elapsed / week), "week"];
  } else if (absMs < year) {
    valueUnit = [Math.round(elapsed / month), "month"];
  } else {
    valueUnit = [Math.round(elapsed / year), "year"];
  }

  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  return formatter.format(valueUnit[0], valueUnit[1]);
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

function buildActivityEntries(repositories, events, username, limit) {
  const lowerUser = username.toLowerCase();
  const ownedRepositories = repositories.filter((repository) => {
    return !repository.fork && repository.owner && repository.owner.login.toLowerCase() === lowerUser;
  });
  const repositoryMap = new Map(
    ownedRepositories.map((repository) => [repository.full_name.toLowerCase(), repository]),
  );
  const activityMap = new Map();

  function ensureEntry(repository) {
    const key = repository.full_name.toLowerCase();
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

  ownedRepositories.slice(0, Math.max(limit * 3, 8)).forEach((repository, index) => {
    const entry = ensureEntry(repository);
    entry.score += Math.max(0, 6 - index);
  });

  events.forEach((event, index) => {
    if (!ACTIVITY_EVENT_TYPES.has(event.type)) {
      return;
    }

    const repository = repositoryMap.get((event.repo && event.repo.name || "").toLowerCase());
    if (!repository) {
      return;
    }

    const entry = ensureEntry(repository);
    entry.eventCount += 1;
    entry.lastActiveAt = entry.lastActiveAt && new Date(entry.lastActiveAt) > new Date(event.created_at)
      ? entry.lastActiveAt
      : event.created_at;
    entry.score += getFreshnessScore(event.created_at) + Math.max(0, 5 - index * 0.2);

    if (event.type === "PushEvent") {
      entry.pushes += Math.max(1, event.payload && event.payload.size || 0);
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

  return Array.from(activityMap.values())
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return new Date(right.lastActiveAt || 0) - new Date(left.lastActiveAt || 0);
    })
    .slice(0, limit);
}

function createElement(documentRef, tagName, className, textContent) {
  const element = documentRef.createElement(tagName);

  if (className) {
    element.className = className;
  }

  if (textContent) {
    element.textContent = textContent;
  }

  return element;
}

function renderActivity(container, entries, username) {
  const body = container.querySelector("[data-github-activity-body]");
  if (!body) {
    return;
  }

  body.textContent = "";

  if (!entries.length) {
    const empty = createElement(document, "p", "github-activity__status", "No recent public GitHub activity found.");
    body.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  entries.forEach((entry) => {
    const item = createElement(document, "article", "github-activity__item");
    const top = createElement(document, "div", "github-activity__top");
    const title = createElement(document, "a", "github-activity__title", entry.repository.name);
    const stamp = createElement(document, "span", "github-activity__stamp", formatRelativeTime(entry.lastActiveAt));
    const summary = createElement(
      document,
      "p",
      "github-activity__summary",
      entry.repository.description || "Recently active repository on GitHub.",
    );
    const metrics = createElement(document, "div", "github-activity__metrics");
    const repoLink = createElement(document, "a", "github-activity__metric github-activity__metric--link", "Repository");

    title.href = entry.repository.html_url;
    title.rel = "noopener";
    repoLink.href = entry.repository.html_url;
    repoLink.rel = "noopener";

    top.appendChild(title);
    top.appendChild(stamp);

    if (entry.repository.language) {
      metrics.appendChild(createElement(document, "span", "github-activity__metric", entry.repository.language));
    }

    const activitySummary = describeActivity(entry);
    if (activitySummary) {
      metrics.appendChild(createElement(document, "span", "github-activity__metric", activitySummary));
    }

    metrics.appendChild(
      createElement(
        document,
        "span",
        "github-activity__metric",
        `updated ${formatRelativeTime(entry.repository.pushed_at || entry.repository.updated_at)}`,
      ),
    );
    metrics.appendChild(repoLink);

    item.appendChild(top);
    item.appendChild(summary);
    item.appendChild(metrics);
    fragment.appendChild(item);
  });

  const footer = createElement(document, "a", "github-activity__profile", `View all activity on @${username}`);
  footer.href = `https://github.com/${username}`;
  footer.rel = "noopener";

  body.appendChild(fragment);
  body.appendChild(footer);
}

function renderError(container, username) {
  const body = container.querySelector("[data-github-activity-body]");
  if (!body) {
    return;
  }

  body.textContent = "";
  body.appendChild(
    createElement(
      document,
      "p",
      "github-activity__status github-activity__status--error",
      "GitHub activity could not be loaded right now.",
    ),
  );

  const fallback = createElement(document, "a", "github-activity__profile", `Open @${username} on GitHub`);
  fallback.href = `https://github.com/${username}`;
  fallback.rel = "noopener";
  body.appendChild(fallback);
}

async function loadGitHubActivity(container) {
  const username = container.dataset.githubUser;
  const limit = Number.parseInt(container.dataset.githubLimit || "4", 10);

  if (!username) {
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

    const entries = buildActivityEntries(repositories, events, username, limit);
    renderActivity(container, entries, username);
  } catch (_error) {
    renderError(container, username);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const containers = document.querySelectorAll("[data-github-activity]");
  containers.forEach((container) => {
    loadGitHubActivity(container);
  });
});
