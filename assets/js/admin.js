(function() {
  const root = document.querySelector("[data-admin-app]");
  if (!root) {
    return;
  }

  const API_ROOT = root.dataset.adminApiRoot || "/api/admin";
  const today = new Date().toISOString().slice(0, 10);

  const state = {
    posts: [],
    status: null,
    currentPost: createEmptyPost(),
    currentPostLoadingSlug: "",
    resume: createEmptyResume(),
    postSlugDirty: false,
    isPostModalOpen: false,
    isResumeModalOpen: false,
  };

  const refs = {
    feedback: root.querySelector("[data-admin-feedback]"),
    statusCopy: root.querySelector("[data-admin-status-copy]"),
    statusMeta: root.querySelector("[data-admin-status-meta]"),
    postList: root.querySelector("[data-admin-post-list]"),
    postStats: root.querySelector("[data-admin-post-stats]"),
    postHeading: root.querySelector("[data-admin-post-heading]"),
    postMeta: root.querySelector("[data-admin-post-meta]"),
    postState: root.querySelector("[data-admin-post-state]"),
    postLink: root.querySelector("[data-admin-post-link]"),
    postButtons: Array.from(root.querySelectorAll("[data-admin-action='save-post']")),
    postDetailButtons: Array.from(root.querySelectorAll("[data-admin-action='open-post-details']")),
    postModal: root.querySelector("[data-admin-post-modal]"),
    resumeModal: root.querySelector("[data-admin-resume-modal]"),
    newPostButton: root.querySelector("[data-admin-action='new-post']"),
    saveResumeButton: root.querySelector("[data-admin-action='save-resume']"),
    resumeMeta: root.querySelector("[data-admin-resume-meta]"),
    addHeroButton: root.querySelector("[data-admin-action='add-hero-button']"),
    addProjectButton: root.querySelector("[data-admin-action='add-project']"),
    heroButtons: root.querySelector("[data-admin-hero-buttons]"),
    heroEmpty: root.querySelector("[data-admin-hero-empty]"),
    projectList: root.querySelector("[data-admin-resume-projects]"),
    projectEmpty: root.querySelector("[data-admin-project-empty]"),
    heroTemplate: document.getElementById("admin-hero-button-template"),
    projectTemplate: document.getElementById("admin-project-template"),
    postForm: {
      title: document.getElementById("admin-post-title"),
      slug: document.getElementById("admin-post-slug"),
      slugHint: root.querySelector("[data-admin-post-slug-hint]"),
      date: document.getElementById("admin-post-date"),
      weight: document.getElementById("admin-post-weight"),
      summary: document.getElementById("admin-post-summary"),
      tags: document.getElementById("admin-post-tags"),
      projects: document.getElementById("admin-post-projects"),
      series: document.getElementById("admin-post-series"),
      cardIcon: document.getElementById("admin-post-card-icon"),
      cardGradient: document.getElementById("admin-post-card-gradient"),
      pullquote: document.getElementById("admin-post-pullquote"),
      showNav: document.getElementById("admin-post-show-nav"),
      body: document.getElementById("admin-post-body"),
    },
    resumeForm: {
      title: document.getElementById("admin-resume-title"),
      layout: document.getElementById("admin-resume-layout"),
      summary: document.getElementById("admin-resume-summary"),
      eyebrow: document.getElementById("admin-resume-eyebrow"),
      backLabel: document.getElementById("admin-resume-back-label"),
      backUrl: document.getElementById("admin-resume-back-url"),
      cardIcon: document.getElementById("admin-resume-card-icon"),
      cardGradient: document.getElementById("admin-resume-card-gradient"),
      heroTitle: document.getElementById("admin-resume-hero-title"),
      githubUsername: document.getElementById("admin-resume-github-username"),
      excludeRepos: document.getElementById("admin-resume-exclude-repos"),
      hideMeta: document.getElementById("admin-resume-hide-meta"),
      showToc: document.getElementById("admin-resume-show-toc"),
      body: document.getElementById("admin-resume-body"),
    },
  };

  root.addEventListener("click", handleActionClick);
  refs.heroButtons.addEventListener("click", handleRowRemove);
  refs.projectList.addEventListener("click", handleRowRemove);
  refs.postForm.title.addEventListener("input", handlePostTitleInput);
  refs.postForm.slug.addEventListener("input", handlePostSlugInput);
  document.addEventListener("keydown", handleGlobalKeydown);

  initialize().catch((error) => {
    setFeedback("error", error.message || "Admin failed to initialize.");
  });

  async function initialize() {
    setPostModalOpen(false);
    setResumeModalOpen(false);
    renderPost();
    await loadStatus();
    await Promise.all([
      loadPosts({ selectInitial: true }),
      loadResume(),
    ]);
  }

  function createEmptyPost() {
    return {
      path: "",
      slug: "",
      sha: "",
      frontmatter: {
        title: "",
        date: today,
        draft: true,
        summary: "",
        tags: [],
        projects: [],
        series: [],
        weight: "",
        ShowPostNavLinks: false,
        params: {
          pullquote: "",
          cardGradient: "",
          cardIcon: "",
        },
      },
      body: "",
    };
  }

  function createEmptyResume() {
    return {
      path: "content/resume.md",
      sha: "",
      frontmatter: {
        title: "Resume",
        layout: "resume",
        summary: "",
        cardGradient: "",
        cardIcon: "",
        eyebrow: "",
        backLabel: "Home",
        backUrl: "/",
        hideMeta: true,
        showToc: false,
        hero: {
          title: "",
          buttons: [],
        },
        githubActivity: {
          username: "",
          excludeRepos: [],
        },
        projects: [],
      },
      body: "",
    };
  }

  async function loadStatus() {
    const payload = await requestJSON(`${API_ROOT}/status`);
    state.status = payload;
    refs.statusCopy.textContent = payload.email || "Authenticated";

    if (payload.repository) {
      refs.statusMeta.textContent = `${payload.repository.owner}/${payload.repository.repo} · ${payload.repository.branch}`;
    } else {
      refs.statusMeta.textContent = "Admin API ready.";
    }
  }

  async function loadPosts({ selectInitial = false, preferredSlug = "" } = {}) {
    const payload = await requestJSON(`${API_ROOT}/posts`);
    state.posts = Array.isArray(payload.items) ? payload.items : [];
    renderPostList();

    if (preferredSlug) {
      await openPost(preferredSlug);
      return;
    }

    if (selectInitial) {
      startNewPost();
    }
  }

  async function loadResume() {
    const payload = await requestJSON(`${API_ROOT}/resume`);
    state.resume = payload;
    renderResume();
  }

  async function openPost(slug) {
    if (!slug || state.currentPostLoadingSlug === slug) {
      return;
    }

    state.currentPostLoadingSlug = slug;
    setPostModalOpen(false);
    setFeedback("info", `Loading ${slug}…`);

    try {
      const payload = await requestJSON(`${API_ROOT}/posts/${encodeURIComponent(slug)}`);
      state.currentPost = payload;
      state.postSlugDirty = false;
      renderPostList();
      renderPost();
      clearFeedback();
    } finally {
      state.currentPostLoadingSlug = "";
    }
  }

  function startNewPost({ openDetails = false } = {}) {
    state.currentPost = createEmptyPost();
    state.postSlugDirty = false;
    renderPostList();
    renderPost();
    clearFeedback();

    if (openDetails) {
      setPostModalOpen(true);
    }
  }

  function renderPostList() {
    refs.postList.replaceChildren();
    renderPostStats();

    if (!state.posts.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 5;
      cell.className = "admin-post-table__empty";
      cell.textContent = "No research posts found yet.";
      row.appendChild(cell);
      refs.postList.appendChild(row);
      return;
    }

    state.posts.forEach((item) => {
      const row = document.createElement("tr");
      row.className = "admin-post-row";
      if (state.currentPost.sha && state.currentPost.slug === item.slug) {
        row.classList.add("is-active");
      }

      const statusCell = document.createElement("td");
      const status = document.createElement("span");
      status.className = `admin-post-status admin-post-status--${item.draft ? "draft" : "published"}`;
      status.textContent = item.draft ? "Draft" : "Published";
      statusCell.appendChild(status);

      const titleCell = document.createElement("td");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "admin-post-link";
      button.dataset.adminAction = "open-post";
      button.dataset.slug = item.slug;
      button.textContent = item.title || item.slug;
      titleCell.appendChild(button);

      const dateCell = document.createElement("td");
      dateCell.className = "admin-post-cell--muted";
      dateCell.textContent = formatPostDate(item.date);

      const slugCell = document.createElement("td");
      slugCell.className = "admin-post-cell--mono";
      slugCell.textContent = item.slug;

      const summaryCell = document.createElement("td");
      summaryCell.className = "admin-post-cell--summary";
      summaryCell.textContent = item.summary || "No summary yet.";

      row.append(statusCell, titleCell, dateCell, slugCell, summaryCell);
      refs.postList.appendChild(row);
    });
  }

  function renderPostStats() {
    refs.postStats.replaceChildren();

    const counts = [
      {
        label: "Total",
        value: state.posts.length,
      },
      {
        label: "Published",
        value: state.posts.filter((post) => !post.draft).length,
      },
      {
        label: "Drafts",
        value: state.posts.filter((post) => post.draft).length,
      },
    ];

    counts.forEach((entry) => {
      const chip = document.createElement("div");
      chip.className = "admin-post-stat";
      chip.innerHTML = `<strong>${entry.value}</strong><span>${entry.label}</span>`;
      refs.postStats.appendChild(chip);
    });
  }

  function renderPost() {
    const record = state.currentPost;
    const frontmatter = record.frontmatter || {};
    const params = frontmatter.params || {};
    const isExisting = Boolean(record.sha);
    const isDraft = isExisting ? Boolean(frontmatter.draft) : true;
    const isBlankSelection = !isExisting
      && !record.slug
      && !frontmatter.title
      && !record.body
      && !frontmatter.summary;

    refs.postHeading.textContent = isExisting
      ? (frontmatter.title || record.slug)
      : (isBlankSelection ? "Select a post" : "New draft");
    refs.postMeta.textContent = isExisting
      ? `${record.path} · ${shortSha(record.sha)}`
      : (isBlankSelection
        ? "Choose a row from the library or start a new draft."
        : "Drafts and published posts write directly to GitHub main.");
    refs.postState.textContent = isExisting ? (isDraft ? "Draft" : "Published") : (isBlankSelection ? "Idle" : "New");
    refs.postLink.hidden = !isExisting || !record.slug || isDraft;

    if (!refs.postLink.hidden) {
      refs.postLink.href = `/posts/${record.slug}/?from=articles`;
    }

    refs.postForm.title.value = frontmatter.title || "";
    refs.postForm.slug.value = record.slug || "";
    refs.postForm.slug.readOnly = isExisting;
    refs.postForm.slugHint.textContent = isExisting
      ? "Slug is locked for existing posts in v1."
      : "Lowercase, hyphenated, and locked after creation.";
    refs.postForm.date.value = frontmatter.date || today;
    refs.postForm.weight.value = frontmatter.weight || "";
    refs.postForm.summary.value = frontmatter.summary || "";
    refs.postForm.tags.value = listToInput(frontmatter.tags);
    refs.postForm.projects.value = listToInput(frontmatter.projects);
    refs.postForm.series.value = listToInput(frontmatter.series);
    refs.postForm.cardIcon.value = params.cardIcon || "";
    refs.postForm.cardGradient.value = params.cardGradient || "";
    refs.postForm.pullquote.value = params.pullquote || "";
    refs.postForm.showNav.checked = Boolean(frontmatter.ShowPostNavLinks);
    refs.postForm.body.value = record.body || "";

    refs.postDetailButtons.forEach((button) => {
      button.textContent = isExisting ? "Article Details" : "Set Details";
    });
  }

  function renderResume() {
    const frontmatter = state.resume.frontmatter || {};
    const hero = frontmatter.hero || {};
    const githubActivity = frontmatter.githubActivity || {};

    refs.resumeMeta.textContent = `${state.resume.path || "content/resume.md"} · ${state.resume.sha ? shortSha(state.resume.sha) : "Unsaved"}`;
    refs.resumeForm.title.value = frontmatter.title || "";
    refs.resumeForm.layout.value = frontmatter.layout || "";
    refs.resumeForm.summary.value = frontmatter.summary || "";
    refs.resumeForm.eyebrow.value = frontmatter.eyebrow || "";
    refs.resumeForm.backLabel.value = frontmatter.backLabel || "";
    refs.resumeForm.backUrl.value = frontmatter.backUrl || "";
    refs.resumeForm.cardIcon.value = frontmatter.cardIcon || "";
    refs.resumeForm.cardGradient.value = frontmatter.cardGradient || "";
    refs.resumeForm.heroTitle.value = hero.title || "";
    refs.resumeForm.githubUsername.value = githubActivity.username || "";
    refs.resumeForm.excludeRepos.value = listToInput(githubActivity.excludeRepos);
    refs.resumeForm.hideMeta.checked = Boolean(frontmatter.hideMeta);
    refs.resumeForm.showToc.checked = Boolean(frontmatter.showToc);
    refs.resumeForm.body.value = state.resume.body || "";

    renderHeroButtons(hero.buttons || []);
    renderResumeProjects(frontmatter.projects || []);
  }

  function renderHeroButtons(items) {
    refs.heroButtons.replaceChildren();

    items.forEach((entry) => {
      const row = refs.heroTemplate.content.firstElementChild.cloneNode(true);
      row.querySelector("[data-field='name']").value = entry.name || "";
      row.querySelector("[data-field='url']").value = entry.url || "";
      refs.heroButtons.appendChild(row);
    });

    refs.heroEmpty.hidden = items.length > 0;
  }

  function renderResumeProjects(items) {
    refs.projectList.replaceChildren();

    items.forEach((entry) => {
      const row = refs.projectTemplate.content.firstElementChild.cloneNode(true);
      row.querySelector("[data-field='name']").value = entry.name || "";
      row.querySelector("[data-field='repo']").value = entry.repo || "";
      row.querySelector("[data-field='summary']").value = entry.summary || "";
      row.querySelector("[data-field='pinned']").checked = Boolean(entry.pinned);
      refs.projectList.appendChild(row);
    });

    refs.projectEmpty.hidden = items.length > 0;
  }

  function appendHeroButtonRow() {
    const row = refs.heroTemplate.content.firstElementChild.cloneNode(true);
    refs.heroButtons.appendChild(row);
    refs.heroEmpty.hidden = true;
    row.querySelector("[data-field='name']").focus();
  }

  function appendResumeProjectRow() {
    const row = refs.projectTemplate.content.firstElementChild.cloneNode(true);
    refs.projectList.appendChild(row);
    refs.projectEmpty.hidden = true;
    row.querySelector("[data-field='name']").focus();
  }

  async function savePost(draft) {
    const payload = collectPostPayload(draft);
    const isExisting = Boolean(state.currentPost.sha);
    const slug = payload.slug;

    if (!payload.title || !slug) {
      setPostModalOpen(true);
      setFeedback("error", !payload.title ? "Post title is required." : "Post slug is required.");
      (payload.title ? refs.postForm.slug : refs.postForm.title).focus();
      return;
    }

    setButtonBusy(refs.postButtons, true);
    setFeedback("info", draft ? "Saving draft…" : "Publishing post…");

    try {
      const saved = await requestJSON(
        isExisting ? `${API_ROOT}/posts/${encodeURIComponent(state.currentPost.slug)}` : `${API_ROOT}/posts`,
        {
          method: isExisting ? "PUT" : "POST",
          body: payload,
        },
      );
      state.currentPost = saved;
      state.postSlugDirty = false;
      renderPost();
      await loadPosts({ preferredSlug: saved.slug });
      setPostModalOpen(false);
      setFeedback("success", draft ? "Draft saved." : "Post published.");
    } catch (error) {
      setFeedback("error", error.message || "Post save failed.");
    } finally {
      setButtonBusy(refs.postButtons, false);
    }
  }

  async function saveResume() {
    setButtonBusy([refs.saveResumeButton], true);
    setFeedback("info", "Saving resume…");

    try {
      const saved = await requestJSON(`${API_ROOT}/resume`, {
        method: "PUT",
        body: collectResumePayload(),
      });
      state.resume = saved;
      renderResume();
      setFeedback("success", "Resume saved.");
    } catch (error) {
      setFeedback("error", error.message || "Resume save failed.");
    } finally {
      setButtonBusy([refs.saveResumeButton], false);
    }
  }

  function collectPostPayload(draft) {
    return {
      sha: state.currentPost.sha || "",
      slug: refs.postForm.slug.value.trim().toLowerCase(),
      title: refs.postForm.title.value.trim(),
      date: refs.postForm.date.value.trim(),
      draft,
      summary: refs.postForm.summary.value.trim(),
      tags: inputToList(refs.postForm.tags.value),
      projects: inputToList(refs.postForm.projects.value),
      series: inputToList(refs.postForm.series.value),
      weight: refs.postForm.weight.value.trim(),
      ShowPostNavLinks: refs.postForm.showNav.checked,
      params: {
        pullquote: refs.postForm.pullquote.value.trim(),
        cardGradient: refs.postForm.cardGradient.value.trim(),
        cardIcon: refs.postForm.cardIcon.value.trim(),
      },
      body: refs.postForm.body.value,
    };
  }

  function collectResumePayload() {
    return {
      sha: state.resume.sha || "",
      title: refs.resumeForm.title.value.trim(),
      layout: refs.resumeForm.layout.value.trim(),
      summary: refs.resumeForm.summary.value.trim(),
      eyebrow: refs.resumeForm.eyebrow.value.trim(),
      backLabel: refs.resumeForm.backLabel.value.trim(),
      backUrl: refs.resumeForm.backUrl.value.trim(),
      cardIcon: refs.resumeForm.cardIcon.value.trim(),
      cardGradient: refs.resumeForm.cardGradient.value.trim(),
      hideMeta: refs.resumeForm.hideMeta.checked,
      showToc: refs.resumeForm.showToc.checked,
      hero: {
        title: refs.resumeForm.heroTitle.value.trim(),
        buttons: collectHeroButtons(),
      },
      githubActivity: {
        username: refs.resumeForm.githubUsername.value.trim(),
        excludeRepos: inputToList(refs.resumeForm.excludeRepos.value),
      },
      projects: collectResumeProjects(),
      body: refs.resumeForm.body.value,
    };
  }

  function collectHeroButtons() {
    return Array.from(refs.heroButtons.querySelectorAll("[data-admin-row='hero-button']")).map((row) => ({
      name: row.querySelector("[data-field='name']").value.trim(),
      url: row.querySelector("[data-field='url']").value.trim(),
    })).filter((entry) => entry.name || entry.url);
  }

  function collectResumeProjects() {
    return Array.from(refs.projectList.querySelectorAll("[data-admin-row='resume-project']")).map((row) => ({
      name: row.querySelector("[data-field='name']").value.trim(),
      repo: row.querySelector("[data-field='repo']").value.trim(),
      summary: row.querySelector("[data-field='summary']").value.trim(),
      pinned: row.querySelector("[data-field='pinned']").checked,
    })).filter((entry) => entry.name || entry.repo || entry.summary);
  }

  function handleActionClick(event) {
    const actionTarget = event.target.closest("[data-admin-action]");
    if (!actionTarget) {
      return;
    }

    const { adminAction } = actionTarget.dataset;

    if (adminAction === "new-post") {
      startNewPost({ openDetails: true });
      return;
    }

    if (adminAction === "open-post") {
      openPost(actionTarget.dataset.slug || "").catch((error) => {
        setFeedback("error", error.message || "Post load failed.");
      });
      return;
    }

    if (adminAction === "save-post") {
      savePost(actionTarget.dataset.draft === "true").catch((error) => {
        setFeedback("error", error.message || "Post save failed.");
      });
      return;
    }

    if (adminAction === "open-post-details") {
      setPostModalOpen(true);
      return;
    }

    if (adminAction === "close-post-details") {
      setPostModalOpen(false);
      return;
    }

    if (adminAction === "open-resume") {
      setResumeModalOpen(true);
      return;
    }

    if (adminAction === "close-resume") {
      setResumeModalOpen(false);
      return;
    }

    if (adminAction === "save-resume") {
      saveResume().catch((error) => {
        setFeedback("error", error.message || "Resume save failed.");
      });
      return;
    }

    if (adminAction === "add-hero-button") {
      appendHeroButtonRow();
      return;
    }

    if (adminAction === "add-project") {
      appendResumeProjectRow();
    }
  }

  function handleRowRemove(event) {
    const removeButton = event.target.closest("[data-admin-action='remove-row']");
    if (!removeButton) {
      return;
    }

    const row = removeButton.closest("[data-admin-row]");
    const list = row && row.parentElement;
    if (!row || !list) {
      return;
    }

    row.remove();

    if (list === refs.heroButtons) {
      refs.heroEmpty.hidden = refs.heroButtons.children.length > 0;
    }

    if (list === refs.projectList) {
      refs.projectEmpty.hidden = refs.projectList.children.length > 0;
    }
  }

  function handlePostTitleInput() {
    const isExisting = Boolean(state.currentPost.sha);
    if (isExisting || state.postSlugDirty) {
      return;
    }

    refs.postForm.slug.value = slugify(refs.postForm.title.value);
  }

  function handlePostSlugInput() {
    state.postSlugDirty = true;
    refs.postForm.slug.value = slugify(refs.postForm.slug.value);
  }

  function handleGlobalKeydown(event) {
    if (event.key !== "Escape") {
      return;
    }

    if (state.isPostModalOpen) {
      setPostModalOpen(false);
    }

    if (state.isResumeModalOpen) {
      setResumeModalOpen(false);
    }
  }

  function setPostModalOpen(isOpen) {
    state.isPostModalOpen = Boolean(isOpen);
    refs.postModal.hidden = !state.isPostModalOpen;
    syncModalState();

    if (state.isPostModalOpen) {
      window.setTimeout(() => {
        refs.postForm.title.focus();
      }, 0);
    }
  }

  function setResumeModalOpen(isOpen) {
    state.isResumeModalOpen = Boolean(isOpen);
    refs.resumeModal.hidden = !state.isResumeModalOpen;
    syncModalState();

    if (state.isResumeModalOpen) {
      window.setTimeout(() => {
        refs.resumeForm.title.focus();
      }, 0);
    }
  }

  function syncModalState() {
    document.body.classList.toggle("admin-modal-open", state.isPostModalOpen || state.isResumeModalOpen);
  }

  async function requestJSON(path, { method = "GET", body } = {}) {
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : { error: await response.text() };

    if (!response.ok) {
      throw new Error(payload.error || `Request failed (${response.status}).`);
    }

    return payload;
  }

  function inputToList(value) {
    return String(value || "")
      .split(/[\n,]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  function listToInput(value) {
    return Array.isArray(value) ? value.join(", ") : "";
  }

  function shortSha(value) {
    return value ? value.slice(0, 7) : "";
  }

  function formatPostDate(value) {
    if (!value) {
      return "No date";
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return parsed.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function slugify(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function setButtonBusy(buttons, disabled) {
    buttons.filter(Boolean).forEach((button) => {
      button.disabled = disabled;
    });

    if (refs.newPostButton) {
      refs.newPostButton.disabled = disabled;
    }
  }

  function clearFeedback() {
    refs.feedback.hidden = true;
    refs.feedback.textContent = "";
    refs.feedback.className = "admin-feedback admin-feedback--info";
  }

  function setFeedback(kind, message) {
    refs.feedback.hidden = false;
    refs.feedback.textContent = message;
    refs.feedback.className = `admin-feedback admin-feedback--${kind}`;
  }
})();
