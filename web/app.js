import { api, post } from "./js/api.js";
import { els, isEditing, setConnection, showError } from "./js/dom.js";
import { enc, formValue, optionalFormNumber, setFormValue } from "./js/format.js";
import { render, renderProjectButton, renderProjectList } from "./js/render.js";
import { state } from "./js/state.js";

boot().catch(showError);

async function boot() {
  bindEvents();
  await loadProjects();
}

function bindEvents() {
  els.projectButton.addEventListener("click", () => openProjectMenu());
  els.projectMenu.addEventListener("click", (event) => {
    if (event.target === els.projectMenu) closeProjectMenu();
  });
  els.projectSearch.addEventListener("input", () => renderProjectList());
  els.openTaskModal.addEventListener("click", () => els.taskModal.showModal());
  els.taskModal.addEventListener("close", flushPendingRender);

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openProjectMenu();
    }
    if (event.key === "Escape") {
      closeProjectMenu();
    }
  });

  document.addEventListener("focusout", () => {
    setTimeout(flushPendingRender, 0);
  });

  document.addEventListener("click", async (event) => {
    const projectButton = event.target instanceof Element ? event.target.closest("button[data-project-id]") : null;
    if (projectButton instanceof HTMLButtonElement) {
      await selectProject(projectButton.dataset.projectId || null);
      return;
    }

    const closeTask = event.target instanceof Element ? event.target.closest("[data-close-task-modal]") : null;
    if (closeTask !== null) {
      els.taskModal.close();
      return;
    }

    const evidenceButton = event.target instanceof Element ? event.target.closest("button[data-evidence-action]") : null;
    if (!(evidenceButton instanceof HTMLButtonElement) || !state.projectId) {
      return;
    }
    const evidenceId = evidenceButton.dataset.evidenceId;
    const action = evidenceButton.dataset.evidenceAction;
    if (!evidenceId || !action) {
      return;
    }
    await api("/api/projects/" + enc(state.projectId) + "/evidence/" + enc(evidenceId) + "/" + enc(action), { method: "POST" });
    await safely(refresh);
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !state.projectId) {
      return;
    }
    event.preventDefault();

    if (form.dataset.addTaskForm !== undefined) {
      const title = formValue(form, "title");
      if (title.length === 0) return;
      await post("/api/projects/" + enc(state.projectId) + "/tasks", {
        title,
        content: formValue(form, "content"),
        priority: optionalFormNumber(form, "priority"),
        importance: optionalFormNumber(form, "importance"),
        owner: formValue(form, "owner") || "main",
        qualityGate: formValue(form, "qualityGate") || "none",
      });
      form.reset();
      setFormValue(form, "importance", "0.5");
      setFormValue(form, "owner", "main");
      els.taskModal.close();
      await safely(refresh);
      return;
    }

    if (form.dataset.sessionForm !== undefined) {
      await post("/api/projects/" + enc(state.projectId) + "/session/start", {
        goal: formValue(form, "goal"),
        mode: "sdd_vdd",
      });
      form.reset();
      await safely(refresh);
      return;
    }

    if (form.dataset.priorityForm !== undefined) {
      const taskId = form.dataset.taskId;
      const priority = optionalFormNumber(form, "priority");
      if (taskId && priority !== undefined) {
        await post("/api/projects/" + enc(state.projectId) + "/tasks/" + enc(taskId) + "/priority", { priority });
        await safely(refresh);
      }
      return;
    }

    if (form.dataset.scaleForm !== undefined) {
      const paths = formValue(form, "paths").split(",").map((item) => item.trim()).filter(Boolean);
      await post("/api/projects/" + enc(state.projectId) + "/scale/check", { paths });
      await safely(refresh);
      return;
    }

    if (form.dataset.scaleSplitForm !== undefined) {
      const taskId = formValue(form, "taskId");
      if (taskId) {
        await post("/api/projects/" + enc(state.projectId) + "/scale/split", { taskId });
        form.reset();
        await safely(refresh);
      }
      return;
    }

    if (form.dataset.waiveForm !== undefined) {
      const findingId = form.dataset.findingId;
      const reason = formValue(form, "reason");
      if (findingId && reason) {
        await post("/api/projects/" + enc(state.projectId) + "/scale/findings/" + enc(findingId) + "/waive", { reason });
        await safely(refresh);
      }
      return;
    }

    if (form.dataset.outputReviewForm !== undefined) {
      const evidenceId = form.dataset.evidenceId;
      const submitter = event.submitter instanceof HTMLButtonElement ? event.submitter : null;
      const action = submitter?.value || "";
      if (evidenceId && (action === "accept" || action === "reject")) {
        await post("/api/projects/" + enc(state.projectId) + "/evidence/" + enc(evidenceId) + "/" + enc(action), {
          comment: formValue(form, "comment"),
        });
        await safely(refresh);
      }
      return;
    }

    if (form.dataset.answerForm !== undefined) {
      const askId = form.dataset.askId;
      const answer = formValue(form, "answer");
      if (!askId || answer.length === 0) return;
      await post("/api/projects/" + enc(state.projectId) + "/asks/" + enc(askId) + "/answer", { answer });
      setFormValue(form, "answer", "");
      await safely(refresh);
    }
  });
}

async function loadProjects() {
  const envelope = await api("/api/projects");
  state.projects = envelope.projects.filter((project) => project.archivedAt == null);
  if (!state.projectId || !state.projects.some((project) => project.id === state.projectId)) {
    state.projectId = state.projects[0]?.id ?? null;
  }
  renderProjectButton();
  renderProjectList();
  connectEvents();
  await safely(refresh);
}

async function selectProject(projectId) {
  state.projectId = projectId;
  if (projectId !== null) {
    localStorage.setItem("ardex.projectId", projectId);
  }
  closeProjectMenu();
  renderProjectButton();
  connectEvents();
  await safely(refresh);
}

async function refresh() {
  if (!state.projectId) {
    state.snapshot = null;
    renderOrDefer();
    return;
  }
  state.snapshot = await api("/api/projects/" + enc(state.projectId) + "/dashboard");
  renderOrDefer();
}

function connectEvents() {
  if (state.source !== null) {
    state.source.close();
    state.source = null;
  }
  if (!state.projectId) {
    setConnection(false);
    return;
  }
  const source = new EventSource("/events?project=" + enc(state.projectId));
  source.addEventListener("open", () => setConnection(true, state.pendingRender));
  source.addEventListener("snapshot", (event) => {
    state.snapshot = JSON.parse(event.data);
    renderOrDefer();
    setConnection(true, state.pendingRender);
  });
  source.addEventListener("error", () => setConnection(false));
  state.source = source;
}

function renderOrDefer() {
  if (isEditing()) {
    state.pendingRender = true;
    return;
  }
  state.pendingRender = false;
  render();
}

function flushPendingRender() {
  if (state.pendingRender && !isEditing()) {
    render();
    state.pendingRender = false;
  }
}

function openProjectMenu() {
  els.projectMenu.hidden = false;
  els.projectSearch.value = "";
  renderProjectList();
  els.projectSearch.focus();
}

function closeProjectMenu() {
  els.projectMenu.hidden = true;
}

async function safely(fn) {
  try {
    await fn();
  } catch (error) {
    showError(error);
  }
}
