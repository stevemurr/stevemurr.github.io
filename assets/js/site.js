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
const ARTICLE_CACHE = new Map();

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

  if (entry.repository.language) {
    metrics.appendChild(createMetric(entry.repository.language));
  }

  const activitySummary = describeActivity(entry);
  if (activitySummary) {
    metrics.appendChild(createMetric(activitySummary));
  }

  metrics.appendChild(
    createMetric(`updated ${formatRelativeTime(entry.repository.pushed_at || entry.repository.updated_at)}`),
  );
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

function shouldBypassDrawer(event, link) {
  return event.defaultPrevented
    || event.button !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
    || link.hasAttribute("download")
    || link.target === "_blank";
}

function normalizeFetchedArticleContent(content, baseUrl) {
  content.querySelectorAll("script, .anchor").forEach((node) => {
    node.remove();
  });

  content.querySelectorAll("[id]").forEach((node) => {
    node.removeAttribute("id");
  });

  content.querySelectorAll("a[href]").forEach((link) => {
    const href = link.getAttribute("href");
    if (!href) {
      return;
    }

    if (href.startsWith("#")) {
      link.removeAttribute("href");
      return;
    }

    if (!href.startsWith("/") && !href.startsWith("http://") && !href.startsWith("https://")) {
      link.setAttribute("href", new URL(href, baseUrl).toString());
    }

    const linkUrl = new URL(link.href, window.location.origin);
    if (linkUrl.origin !== window.location.origin) {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener");
    }
  });

  content.querySelectorAll("img[src]").forEach((image) => {
    const src = image.getAttribute("src");
    if (src && !src.startsWith("/") && !src.startsWith("http://") && !src.startsWith("https://")) {
      image.setAttribute("src", new URL(src, baseUrl).toString());
    }
  });
}

function fetchArticlePayload(url) {
  const articleUrl = String(url);

  if (!ARTICLE_CACHE.has(articleUrl)) {
    ARTICLE_CACHE.set(
      articleUrl,
      fetch(articleUrl, {
        headers: {
          Accept: "text/html",
        },
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Article request failed: ${response.status}`);
          }

          return response.text();
        })
        .then((html) => {
          const parsed = new DOMParser().parseFromString(html, "text/html");
          const content = parsed.querySelector(".post-content");

          if (!content) {
            throw new Error("Article content not found");
          }

          const normalizedContent = content.cloneNode(true);
          normalizeFetchedArticleContent(normalizedContent, articleUrl);

          const metaParts = Array.from(parsed.querySelectorAll(".post-hero__meta span"))
            .map((element) => element.textContent.trim())
            .filter(Boolean);

          return {
            title: (parsed.querySelector(".post-title") || {}).textContent?.trim() || "Article",
            summary: (parsed.querySelector(".post-hero__summary") || {}).textContent?.trim() || "",
            date: metaParts[0] || "",
            bodyHTML: normalizedContent.innerHTML,
            canonicalUrl: (parsed.querySelector('link[rel="canonical"]') || {}).href || articleUrl,
          };
        })
        .catch((error) => {
          ARTICLE_CACHE.delete(articleUrl);
          throw error;
        }),
    );
  }

  return ARTICLE_CACHE.get(articleUrl);
}

function setDrawerLinkState(links, activeLink) {
  links.forEach((link) => {
    link.classList.toggle("is-active", link === activeLink);
  });
}

function setDrawerStatus(drawer, title, message) {
  const titleElement = drawer.querySelector("[data-article-drawer-title]");
  const summaryElement = drawer.querySelector("[data-article-drawer-summary]");
  const dateElement = drawer.querySelector("[data-article-drawer-date]");
  const bodyElement = drawer.querySelector("[data-article-drawer-body]");

  if (titleElement) {
    titleElement.textContent = title;
  }

  if (summaryElement) {
    summaryElement.textContent = "";
    summaryElement.hidden = true;
  }

  if (dateElement) {
    dateElement.textContent = "";
  }

  if (bodyElement) {
    bodyElement.innerHTML = "";
    bodyElement.appendChild(createElement(document, "p", "resume-article-drawer__status", message));
  }
}

function renderDrawerArticle(drawer, payload) {
  const titleElement = drawer.querySelector("[data-article-drawer-title]");
  const summaryElement = drawer.querySelector("[data-article-drawer-summary]");
  const dateElement = drawer.querySelector("[data-article-drawer-date]");
  const bodyElement = drawer.querySelector("[data-article-drawer-body]");
  const openElement = drawer.querySelector("[data-article-drawer-open]");
  const scrollElement = drawer.querySelector(".resume-article-drawer__scroll");

  if (titleElement) {
    titleElement.textContent = payload.title;
  }

  if (summaryElement) {
    summaryElement.textContent = payload.summary;
    summaryElement.hidden = !payload.summary;
  }

  if (dateElement) {
    dateElement.textContent = payload.date;
  }

  if (bodyElement) {
    bodyElement.innerHTML = payload.bodyHTML;
  }

  if (openElement) {
    openElement.href = payload.canonicalUrl;
  }

  if (scrollElement) {
    scrollElement.scrollTop = 0;
  }
}

function openArticleDrawer(drawer, link, links) {
  const panel = drawer.querySelector(".resume-article-drawer__panel");
  const openElement = drawer.querySelector("[data-article-drawer-open]");
  const previewTitle = link.querySelector(".resume-project__article-title, .resume-writing__body strong");
  const previewSummary = link.querySelector(".resume-project__article-summary, .resume-writing__body small");
  const previewDate = link.querySelector(".resume-project__article-date, .resume-writing__date");
  const targetUrl = new URL(link.href, window.location.origin).toString();

  drawer.hidden = false;
  drawer.dataset.activeUrl = targetUrl;
  drawer._lastTrigger = link;
  document.body.classList.add("has-article-drawer");
  setDrawerLinkState(links, link);

  if (openElement) {
    openElement.href = targetUrl;
  }

  setDrawerStatus(
    drawer,
    previewTitle ? previewTitle.textContent.trim() : "Loading article",
    "Loading article...",
  );

  const summaryElement = drawer.querySelector("[data-article-drawer-summary]");
  const dateElement = drawer.querySelector("[data-article-drawer-date]");
  if (summaryElement) {
    summaryElement.textContent = previewSummary ? previewSummary.textContent.trim() : "";
    summaryElement.hidden = !summaryElement.textContent;
  }
  if (dateElement) {
    dateElement.textContent = previewDate ? previewDate.textContent.trim() : "";
  }

  if (panel) {
    panel.focus();
  }

  fetchArticlePayload(targetUrl)
    .then((payload) => {
      if (drawer.dataset.activeUrl !== targetUrl) {
        return;
      }

      renderDrawerArticle(drawer, payload);
    })
    .catch(() => {
      window.location.assign(targetUrl);
    });
}

function closeArticleDrawer(drawer, links) {
  if (drawer.hidden) {
    return;
  }

  drawer.hidden = true;
  delete drawer.dataset.activeUrl;
  document.body.classList.remove("has-article-drawer");
  setDrawerLinkState(links, null);

  if (drawer._lastTrigger instanceof HTMLElement) {
    drawer._lastTrigger.focus();
  }
}

function initArticleDrawer() {
  const drawer = document.querySelector("[data-article-drawer]");
  const links = Array.from(document.querySelectorAll("[data-article-drawer-link]"));

  if (!drawer || !links.length) {
    return;
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-article-drawer-link]");
    if (!link || !links.includes(link) || shouldBypassDrawer(event, link)) {
      return;
    }

    const targetUrl = new URL(link.href, window.location.origin);
    if (targetUrl.origin !== window.location.origin) {
      return;
    }

    event.preventDefault();
    openArticleDrawer(drawer, link, links);
  });

  drawer.querySelectorAll("[data-article-drawer-close]").forEach((button) => {
    button.addEventListener("click", () => {
      closeArticleDrawer(drawer, links);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeArticleDrawer(drawer, links);
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const containers = document.querySelectorAll("[data-project-feed]");
  containers.forEach((container) => {
    loadProjectFeed(container);
  });
  initArticleDrawer();
});
