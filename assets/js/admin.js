import { defaultValueCtx, Editor, rootCtx } from "@milkdown/core";
import { clipboard } from "@milkdown/plugin-clipboard";
import { history, redoCommand, undoCommand } from "@milkdown/plugin-history";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import {
  commonmark,
  createCodeBlockCommand,
  insertHrCommand,
  toggleEmphasisCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from "@milkdown/preset-commonmark";
import { gfm, insertTableCommand } from "@milkdown/preset-gfm";
import { callCommand, getMarkdown, replaceAll } from "@milkdown/utils";

const root = document.querySelector("[data-admin-app]");

if (root) {
  const API_ROOT = root.dataset.adminApiRoot || "/api/admin";
  const today = new Date().toISOString().slice(0, 10);
  const DEFAULT_GITHUB_OWNER = "stevemurr";
  const FEEDBACK_TRANSITION_MS = 180;
  const FEEDBACK_SUCCESS_MS = 2600;
  const FEEDBACK_INFO_MS = 3200;
  let feedbackHideTimer = 0;
  let feedbackCleanupTimer = 0;

  const state = {
    posts: [],
    postView: "library",
    currentPost: createEmptyPost(),
    currentPostLoadingSlug: "",
    currentDraftValue: true,
    resume: createEmptyResume(),
    isResumeModalOpen: false,
    editorMode: "visual",
    editorMarkdown: "",
    editor: null,
    githubRepositories: [],
    postFieldOptions: {
      projects: [],
    },
  };

  const refs = {
    feedback: root.querySelector("[data-admin-feedback]"),
    postList: root.querySelector("[data-admin-post-list]"),
    postLibrary: root.querySelector("[data-admin-post-library]"),
    postDetail: root.querySelector("[data-admin-post-detail]"),
    postSaveButton: root.querySelector("[data-admin-action='save-post']"),
    resumeModal: root.querySelector("[data-admin-resume-modal]"),
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
    draftToggleButtons: Array.from(root.querySelectorAll("[data-admin-action='set-post-draft']")),
    editorModeButtons: Array.from(root.querySelectorAll("[data-admin-action='set-editor-mode']")),
    editorCommandButtons: Array.from(root.querySelectorAll("[data-admin-action='editor-command']")),
    editorToolbar: root.querySelector("[data-admin-editor-toolbar]"),
    editorVisual: root.querySelector("[data-admin-editor-visual]"),
    editorSourceWrap: root.querySelector("[data-admin-editor-source-wrap]"),
    editorSource: root.querySelector("[data-admin-editor-source]"),
    postForm: {
      title: document.getElementById("admin-post-title"),
      date: document.getElementById("admin-post-date"),
      projects: document.getElementById("admin-post-projects"),
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

  document.addEventListener("click", handleActionClick);
  refs.heroButtons.addEventListener("click", handleRowRemove);
  refs.projectList.addEventListener("click", handleRowRemove);
  refs.postForm.title.addEventListener("input", handlePostTitleInput);
  refs.editorSource.addEventListener("input", handleEditorSourceInput);
  document.addEventListener("keydown", handleGlobalKeydown);

  initialize().catch((error) => {
    setFeedback("error", error.message || "Admin failed to initialize.");
  });

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

  async function initialize() {
    setResumeModalOpen(false);
    setPostView("library");
    renderPostList();
    renderPostDetail();
    await Promise.all([
      loadPosts(),
      loadResume(),
    ]);
    clearFeedback();
  }

  async function loadPosts() {
    const payload = await requestJSON(`${API_ROOT}/posts`);
    state.posts = Array.isArray(payload.items) ? payload.items : [];
    refreshPostFieldOptions();
    renderPostList();
  }

  async function loadResume() {
    const payload = await requestJSON(`${API_ROOT}/resume`);
    state.resume = payload;
    renderResume();
    loadGitHubRepositories(state.resume.frontmatter?.githubActivity?.username || DEFAULT_GITHUB_OWNER).catch(() => {});
  }

  async function openPost(slug) {
    if (!slug) {
      return;
    }

    if (state.currentPost.sha && state.currentPost.slug === slug) {
      setPostView("detail");
      renderPostList();
      renderPostDetail();
      clearFeedback();
      return;
    }

    if (state.currentPostLoadingSlug === slug) {
      return;
    }

    state.currentPostLoadingSlug = slug;
    setPostView("detail");
    setFeedback("info", `Loading ${slug}…`);

    try {
      const payload = await requestJSON(`${API_ROOT}/posts/${encodeURIComponent(slug)}`);
      state.currentPost = payload;
      state.currentDraftValue = Boolean(payload.frontmatter?.draft);
      hydratePostFormFromCurrentPost();
      await setEditorContent(payload.body || "");
      renderPostList();
      renderPostDetail();
      clearFeedback();
    } finally {
      state.currentPostLoadingSlug = "";
    }
  }

  async function startNewPost() {
    state.currentPost = createEmptyPost();
    state.currentDraftValue = true;
    state.editorMode = "visual";
    hydratePostFormFromCurrentPost();
    await setEditorContent("");
    setPostView("detail");
    renderPostList();
    renderPostDetail();
    clearFeedback();
    focusPostTitle();
  }

  function renderPostList() {
    refs.postList.replaceChildren();

    if (!state.posts.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 4;
      cell.className = "admin-post-table__empty";
      cell.textContent = "No research posts found yet.";
      row.appendChild(cell);
      refs.postList.appendChild(row);
      return;
    }

    state.posts.forEach((item) => {
      const row = document.createElement("tr");
      row.className = "admin-post-row";

      if (state.currentPost.slug && state.currentPost.slug === item.slug) {
        row.classList.add("is-active");
      }

      const titleCell = document.createElement("td");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "admin-post-link";
      button.dataset.adminAction = "open-post";
      button.dataset.slug = item.slug;
      button.innerHTML = `<span>${escapeHTML(item.title || item.slug)}</span>`;
      titleCell.appendChild(button);

      const repoCell = document.createElement("td");
      if (item.repo) {
        const repoPill = document.createElement("span");
        repoPill.className = "admin-post-repo";
        repoPill.textContent = item.repo;
        repoCell.appendChild(repoPill);
      } else {
        repoCell.className = "admin-post-cell--muted";
        repoCell.textContent = "No repo";
      }

      const dateCell = document.createElement("td");
      dateCell.className = "admin-post-cell--muted";
      dateCell.textContent = formatPostDate(item.date);

      const statusCell = document.createElement("td");
      const status = document.createElement("span");
      status.className = `admin-post-status admin-post-status--${item.draft ? "draft" : "published"}`;
      status.textContent = item.draft ? "Draft" : "Published";
      statusCell.appendChild(status);

      row.append(titleCell, repoCell, dateCell, statusCell);
      refs.postList.appendChild(row);
    });
  }

  function hydratePostFormFromCurrentPost() {
    const record = state.currentPost;
    const frontmatter = record.frontmatter || {};

    refs.postForm.title.value = frontmatter.title || "";
    refs.postForm.date.value = frontmatter.date || today;
    renderPostProjectOptions(Array.isArray(frontmatter.projects) ? (frontmatter.projects[0] || "") : "");
  }

  function renderPostDetail() {
    refs.draftToggleButtons.forEach((button) => {
      const isActive = String(state.currentDraftValue) === button.dataset.draft;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    refs.editorModeButtons.forEach((button) => {
      const isActive = button.dataset.mode === state.editorMode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    refs.editorToolbar.hidden = state.editorMode !== "visual";
    refs.editorSourceWrap.hidden = state.editorMode !== "source";
    refs.editorVisual.hidden = state.editorMode !== "visual";
    refs.editorSource.value = state.editorMode === "source"
      ? refs.editorSource.value
      : state.editorMarkdown;
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

  async function savePost() {
    const payload = await collectPostPayload();
    const isExisting = Boolean(state.currentPost.sha);
    const slug = payload.slug;

    if (!payload.title) {
      setFeedback("error", "Post title is required.");
      refs.postForm.title.focus();
      return;
    }

    if (!slug) {
      setFeedback("error", "Title must include letters or numbers to generate a slug.");
      refs.postForm.title.focus();
      return;
    }

    if (!payload.date) {
      setFeedback("error", "Post date is required.");
      refs.postForm.date.focus();
      return;
    }

    setButtonBusy([refs.postSaveButton], true);
    setFeedback("info", state.currentDraftValue ? "Saving draft…" : "Saving published post…");

    try {
      const saved = await requestJSON(
        isExisting ? `${API_ROOT}/posts/${encodeURIComponent(state.currentPost.slug)}` : `${API_ROOT}/posts`,
        {
          method: isExisting ? "PUT" : "POST",
          body: payload,
        },
      );

      state.currentPost = saved;
      state.currentDraftValue = Boolean(saved.frontmatter?.draft);
      hydratePostFormFromCurrentPost();
      await setEditorContent(saved.body || "");
      await loadPosts();
      setPostView("detail");
      renderPostDetail();
      setFeedback("success", state.currentDraftValue ? "Draft saved." : "Post saved as published.", { autoHide: true });
      return true;
    } catch (error) {
      setFeedback("error", error.message || "Post save failed.");
      return false;
    } finally {
      setButtonBusy([refs.postSaveButton], false);
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
      loadGitHubRepositories(state.resume.frontmatter?.githubActivity?.username || DEFAULT_GITHUB_OWNER).catch(() => {});
      setFeedback("success", "Resume saved.", { autoHide: true });
    } catch (error) {
      setFeedback("error", error.message || "Resume save failed.");
    } finally {
      setButtonBusy([refs.saveResumeButton], false);
    }
  }

  async function collectPostPayload() {
    const frontmatter = state.currentPost.frontmatter || {};
    const params = frontmatter.params || {};
    const isExisting = Boolean(state.currentPost.sha);

    return {
      sha: state.currentPost.sha || "",
      slug: getCurrentPostSlug(),
      title: refs.postForm.title.value.trim(),
      date: refs.postForm.date.value.trim(),
      draft: state.currentDraftValue,
      projects: inputToList(refs.postForm.projects.value),
      ...(isExisting ? {
        summary: frontmatter.summary || "",
        tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
        series: Array.isArray(frontmatter.series) ? frontmatter.series : [],
        weight: frontmatter.weight || "",
        ShowPostNavLinks: Boolean(frontmatter.ShowPostNavLinks),
        params: {
          pullquote: params.pullquote || "",
          cardGradient: params.cardGradient || "",
          cardIcon: params.cardIcon || "",
        },
      } : {}),
      body: await getCurrentEditorMarkdown(),
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

  async function handleActionClick(event) {
    const actionTarget = event.target.closest("[data-admin-action]");
    if (!actionTarget) {
      return;
    }

    const { adminAction } = actionTarget.dataset;

    if (adminAction === "new-post") {
      await startNewPost();
      return;
    }

    if (adminAction === "open-post") {
      openPost(actionTarget.dataset.slug || "").catch((error) => {
        setPostView("library");
        setFeedback("error", error.message || "Post load failed.");
      });
      return;
    }

    if (adminAction === "back-to-library") {
      setPostView("library");
      clearFeedback();
      return;
    }

    if (adminAction === "save-post") {
      savePost();
      return;
    }

    if (adminAction === "set-post-draft") {
      state.currentDraftValue = actionTarget.dataset.draft !== "false";
      renderPostDetail();
      return;
    }

    if (adminAction === "set-editor-mode") {
      setEditorMode(actionTarget.dataset.mode || "visual").catch((error) => {
        setFeedback("error", error.message || "Editor mode switch failed.");
      });
      return;
    }

    if (adminAction === "editor-command") {
      runEditorCommand(actionTarget.dataset.command || "").catch((error) => {
        setFeedback("error", error.message || "Editor command failed.");
      });
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
    renderPostDetail();
  }

  function handleEditorSourceInput() {
    if (state.editorMode === "source") {
      state.editorMarkdown = refs.editorSource.value;
    }
  }

  function handleGlobalKeydown(event) {
    if (event.key !== "Escape") {
      return;
    }

    if (state.isResumeModalOpen) {
      setResumeModalOpen(false);
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
    document.body.classList.toggle("admin-modal-open", state.isResumeModalOpen);
  }

  function setPostView(view) {
    state.postView = view === "detail" ? "detail" : "library";
    refs.postLibrary.hidden = state.postView !== "library";
    refs.postDetail.hidden = state.postView !== "detail";
  }

  async function setEditorMode(mode) {
    const nextMode = mode === "source" ? "source" : "visual";

    if (nextMode === state.editorMode) {
      return;
    }

    if (nextMode === "source") {
      state.editorMarkdown = await getCurrentEditorMarkdown();
      refs.editorSource.value = state.editorMarkdown;
      state.editorMode = "source";
      renderPostDetail();
      return;
    }

    state.editorMarkdown = refs.editorSource.value;
    state.editorMode = "visual";
    renderPostDetail();
    await ensureVisualEditor(state.editorMarkdown);
  }

  async function setEditorContent(markdown) {
    state.editorMarkdown = String(markdown || "");
    refs.editorSource.value = state.editorMarkdown;

    if (state.editorMode === "visual") {
      await ensureVisualEditor(state.editorMarkdown);
    } else if (state.editor) {
      state.editor.action(replaceAll(state.editorMarkdown, true));
    }
  }

  async function ensureVisualEditor(markdown = state.editorMarkdown) {
    const nextMarkdown = String(markdown || "");

    if (!state.editor) {
      const editor = Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, refs.editorVisual);
          ctx.set(defaultValueCtx, nextMarkdown);
        })
        .use(commonmark)
        .use(gfm)
        .use(history)
        .use(listener)
        .use(clipboard);

      state.editor = await editor.create();
      state.editor.action((ctx) => {
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdownValue) => {
          state.editorMarkdown = markdownValue;
          if (refs.editorSource.value !== markdownValue) {
            refs.editorSource.value = markdownValue;
          }
        });
      });
    } else {
      state.editor.action(replaceAll(nextMarkdown, true));
    }

    state.editorMarkdown = state.editor.action(getMarkdown());
    refs.editorSource.value = state.editorMarkdown;
  }

  async function getCurrentEditorMarkdown() {
    if (state.editorMode === "source") {
      state.editorMarkdown = refs.editorSource.value;
      return state.editorMarkdown;
    }

    await ensureVisualEditor(state.editorMarkdown);
    state.editorMarkdown = state.editor.action(getMarkdown());
    refs.editorSource.value = state.editorMarkdown;
    return state.editorMarkdown;
  }

  async function runEditorCommand(command) {
    if (state.editorMode !== "visual") {
      setFeedback("info", "Switch back to Visual mode to use rich editing controls.", { autoHide: true });
      return;
    }

    await ensureVisualEditor(state.editorMarkdown);

    if (!state.editor) {
      return;
    }

    const exec = (key, payload) => {
      state.editor.action(callCommand(key, payload));
      state.editorMarkdown = state.editor.action(getMarkdown());
      refs.editorSource.value = state.editorMarkdown;
    };

    switch (command) {
      case "undo":
        exec(undoCommand);
        break;
      case "redo":
        exec(redoCommand);
        break;
      case "bold":
        exec(toggleStrongCommand);
        break;
      case "italic":
        exec(toggleEmphasisCommand);
        break;
      case "heading-2":
        exec(wrapInHeadingCommand, 2);
        break;
      case "heading-3":
        exec(wrapInHeadingCommand, 3);
        break;
      case "bullet-list":
        exec(wrapInBulletListCommand);
        break;
      case "ordered-list":
        exec(wrapInOrderedListCommand);
        break;
      case "blockquote":
        exec(wrapInBlockquoteCommand);
        break;
      case "code-block":
        exec(createCodeBlockCommand);
        break;
      case "rule":
        exec(insertHrCommand);
        break;
      case "link": {
        const href = window.prompt("Link URL", "https://");
        if (href == null) {
          return;
        }

        const value = href.trim();
        if (!value) {
          return;
        }

        exec(toggleLinkCommand, { href: value });
        break;
      }
      case "table":
        exec(insertTableCommand, { row: 3, col: 3 });
        break;
      default:
        break;
    }
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

  function getCurrentPostSlug() {
    if (state.currentPost.sha) {
      return String(state.currentPost.slug || "").trim().toLowerCase();
    }

    return slugify(refs.postForm.title.value);
  }

  function focusPostTitle() {
    window.setTimeout(() => {
      refs.postForm.title.focus();
      refs.postForm.title.select();
    }, 0);
  }

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/['".,!?()[\]{}:;@#$%^&*+=~`]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function setFeedback(type, message, options = {}) {
    const text = String(message || "").trim();
    clearFeedbackTimers();

    if (!text) {
      hideFeedback({ immediate: options.immediate !== false });
      return;
    }

    refs.feedback.hidden = false;
    refs.feedback.textContent = text;
    refs.feedback.className = `admin-feedback admin-feedback--${type}`;
    refs.feedback.setAttribute("role", type === "error" ? "alert" : "status");
    refs.feedback.setAttribute("aria-live", type === "error" ? "assertive" : "polite");
    refs.feedback.setAttribute("aria-hidden", "false");
    void refs.feedback.offsetWidth;
    refs.feedback.classList.add("is-visible");

    const autoHide = Boolean(options.autoHide);
    if (autoHide) {
      const duration = Number(options.duration) || (type === "success" ? FEEDBACK_SUCCESS_MS : FEEDBACK_INFO_MS);
      feedbackHideTimer = window.setTimeout(() => {
        hideFeedback();
      }, duration);
    }
  }

  function clearFeedback() {
    hideFeedback();
  }

  function hideFeedback({ immediate = false } = {}) {
    clearFeedbackTimers();
    if (refs.feedback.hidden) {
      refs.feedback.setAttribute("aria-hidden", "true");
      return;
    }

    refs.feedback.setAttribute("aria-hidden", "true");

    if (immediate) {
      refs.feedback.className = "admin-feedback admin-feedback--info";
      refs.feedback.hidden = true;
      refs.feedback.textContent = "";
      return;
    }

    refs.feedback.classList.remove("is-visible");
    feedbackCleanupTimer = window.setTimeout(() => {
      refs.feedback.className = "admin-feedback admin-feedback--info";
      refs.feedback.hidden = true;
      refs.feedback.textContent = "";
    }, FEEDBACK_TRANSITION_MS);
  }

  function clearFeedbackTimers() {
    if (feedbackHideTimer) {
      window.clearTimeout(feedbackHideTimer);
      feedbackHideTimer = 0;
    }

    if (feedbackCleanupTimer) {
      window.clearTimeout(feedbackCleanupTimer);
      feedbackCleanupTimer = 0;
    }
  }

  function setButtonBusy(buttons, isBusy) {
    buttons.filter(Boolean).forEach((button) => {
      button.disabled = isBusy;
      button.setAttribute("aria-busy", String(isBusy));
    });
  }

  function refreshPostFieldOptions() {
    const fallbackProjects = [];

    state.posts.forEach((item) => {
      (Array.isArray(item.projects) ? item.projects : []).forEach((project) => {
        const normalized = normalizeRepositoryName(project);
        if (normalized) {
          fallbackProjects.push(normalized);
        }
      });

      if (item.repo) {
        fallbackProjects.push(normalizeRepositoryName(item.repo));
      }
    });

    state.postFieldOptions.projects = uniqueValues([
      ...state.githubRepositories,
      ...fallbackProjects,
    ]);
    renderPostProjectOptions();
  }

  async function loadGitHubRepositories(username) {
    const owner = String(username || DEFAULT_GITHUB_OWNER).trim() || DEFAULT_GITHUB_OWNER;
    try {
      const response = await fetch(`https://api.github.com/users/${encodeURIComponent(owner)}/repos?per_page=100&sort=updated&type=owner`, {
        headers: {
          Accept: "application/vnd.github+json",
        },
      });

      if (!response.ok) {
        throw new Error(`GitHub repositories request failed (${response.status}).`);
      }

      const payload = await response.json();
      state.githubRepositories = Array.isArray(payload)
        ? payload.map((repo) => normalizeRepositoryName(repo?.full_name || `${owner}/${repo?.name || ""}`)).filter(Boolean)
        : [];
    } catch (_error) {
      state.githubRepositories = [];
    }

    refreshPostFieldOptions();
  }

  function renderPostProjectOptions(selectedValue = refs.postForm.projects.value || state.currentPost.frontmatter?.projects?.[0] || "") {
    const normalizedSelected = normalizeRepositoryName(selectedValue);
    const options = uniqueValues([
      normalizedSelected,
      ...state.postFieldOptions.projects,
    ]);

    refs.postForm.projects.replaceChildren();

    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "No repository";
    refs.postForm.projects.appendChild(emptyOption);

    options.forEach((value) => {
      if (!value) {
        return;
      }

      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      refs.postForm.projects.appendChild(option);
    });

    refs.postForm.projects.value = normalizedSelected;
    if (refs.postForm.projects.value !== normalizedSelected) {
      refs.postForm.projects.value = "";
    }
  }

  function normalizeRepositoryName(value) {
    return String(value || "")
      .trim()
      .replace(/^https?:\/\/github\.com\//i, "")
      .replace(/\/+$/, "")
      .toLowerCase();
  }

  function uniqueValues(items) {
    const seen = new Set();
    const values = [];

    items.forEach((item) => {
      const normalized = String(item || "").trim();
      if (!normalized || seen.has(normalized)) {
        return;
      }

      seen.add(normalized);
      values.push(normalized);
    });

    return values;
  }

  function escapeHTML(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }
}
