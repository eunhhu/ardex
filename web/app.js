const state = {
  projects: [],
  projectId: localStorage.getItem("ardex.projectId"),
  snapshot: null,
  source: null,
};

const els = {
  projectSelect: document.getElementById("projectSelect"),
  connection: document.getElementById("connection"),
  goalCard: document.getElementById("goalCard"),
  statusCard: document.getElementById("statusCard"),
  taskCard: document.getElementById("taskCard"),
  scaleCard: document.getElementById("scaleCard"),
  taskCount: document.getElementById("taskCount"),
  askCount: document.getElementById("askCount"),
  evidenceCount: document.getElementById("evidenceCount"),
  outputCount: document.getElementById("outputCount"),
  scaleCount: document.getElementById("scaleCount"),
  tasks: document.getElementById("tasks"),
  asks: document.getElementById("asks"),
  outputs: document.getElementById("outputs"),
  evidence: document.getElementById("evidence"),
  scale: document.getElementById("scale"),
  errorBanner: document.getElementById("errorBanner"),
};

boot().catch(showError);

async function boot() {
  bindEvents();
  await loadProjects();
}

function bindEvents() {
  els.projectSelect.addEventListener("change", async () => {
    state.projectId = els.projectSelect.value || null;
    if (state.projectId !== null) {
      localStorage.setItem("ardex.projectId", state.projectId);
    }
    connectEvents();
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
      if (title) {
        await post("/api/projects/" + enc(state.projectId) + "/tasks", {
          title,
          qualityGate: formValue(form, "qualityGate") || "none",
        });
        form.reset();
        await safely(refresh);
      }
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

    if (form.dataset.taskOwnerForm !== undefined) {
      const taskId = form.dataset.taskId;
      const owner = formValue(form, "owner");
      if (taskId && owner) {
        await post("/api/projects/" + enc(state.projectId) + "/tasks/" + enc(taskId) + "/owner", { owner });
        await safely(refresh);
      }
      return;
    }

    if (form.dataset.taskPauseForm !== undefined) {
      const taskId = form.dataset.taskId;
      if (taskId) {
        await post("/api/projects/" + enc(state.projectId) + "/tasks/" + enc(taskId) + "/pause", { reason: formValue(form, "reason") });
        await safely(refresh);
      }
      return;
    }

    if (form.dataset.answerForm === undefined) {
      return;
    }
    const askId = form.dataset.askId;
    const input = form.elements.namedItem("answer");
    const answer = input instanceof HTMLInputElement ? input.value.trim() : "";
    if (!askId || answer.length === 0) {
      return;
    }
    await post("/api/projects/" + enc(state.projectId) + "/asks/" + enc(askId) + "/answer", { answer });
    input.value = "";
    await safely(refresh);
  });

  document.addEventListener("click", async (event) => {
    const button = event.target instanceof Element ? event.target.closest("button[data-action],button[data-evidence-action]") : null;
    if (!(button instanceof HTMLButtonElement) || !state.projectId) {
      return;
    }
    if (button.dataset.action) {
      await safely(() => handleAction(button));
      return;
    }
    const evidenceId = button.dataset.evidenceId;
    const action = button.dataset.evidenceAction;
    if (!evidenceId || !action) {
      return;
    }
    await api("/api/projects/" + enc(state.projectId) + "/evidence/" + enc(evidenceId) + "/" + enc(action), { method: "POST" });
    await safely(refresh);
  });
}

async function handleAction(button) {
  const action = button.dataset.action;
  const project = enc(state.projectId);
  if (action === "session-status") {
    await post("/api/projects/" + project + "/session/status", { status: button.dataset.status });
  } else if (action === "session-done") {
    await api("/api/projects/" + project + "/session/done", { method: "POST" });
  } else if (action === "task-claim") {
    await api("/api/projects/" + project + "/tasks/" + enc(button.dataset.taskId) + "/claim", { method: "POST" });
  } else if (action === "task-resume") {
    await api("/api/projects/" + project + "/tasks/" + enc(button.dataset.taskId) + "/resume", { method: "POST" });
  } else if (action === "task-progress") {
    await post("/api/projects/" + project + "/tasks/" + enc(button.dataset.taskId) + "/progress", { progress: Number(button.dataset.progress) });
  } else if (action === "task-done") {
    await api("/api/projects/" + project + "/tasks/" + enc(button.dataset.taskId) + "/done", { method: "POST" });
  } else if (action === "task-delete") {
    await api("/api/projects/" + project + "/tasks/" + enc(button.dataset.taskId) + "/delete", { method: "POST" });
  }
  await refresh();
}

async function loadProjects() {
  const envelope = await api("/api/projects");
  state.projects = envelope.projects;
  if (!state.projectId || !state.projects.some((project) => project.id === state.projectId)) {
    state.projectId = state.projects[0]?.id ?? null;
  }
  renderProjectSelect();
  connectEvents();
  await safely(refresh);
}

async function refresh() {
  if (!state.projectId) {
    state.snapshot = null;
    render();
    return;
  }
  state.snapshot = await api("/api/projects/" + enc(state.projectId) + "/dashboard");
  render();
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
  source.addEventListener("open", () => setConnection(true));
  source.addEventListener("snapshot", (event) => {
    state.snapshot = JSON.parse(event.data);
    render();
    setConnection(true);
  });
  source.addEventListener("error", () => setConnection(false));
  state.source = source;
}

async function api(path, init) {
  const response = await fetch(path, init);
  const envelope = await response.json();
  if (!envelope.ok) {
    const message = envelope.error?.message || "Ardex request failed";
    showError(message);
    throw new Error(message);
  }
  hideError();
  return envelope.data;
}

async function post(path, body) {
  return await api(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function renderProjectSelect() {
  els.projectSelect.innerHTML = state.projects.map((project) => '<option value="' + h(project.id) + '">' + h(project.id + " · " + project.name) + "</option>").join("");
  els.projectSelect.value = state.projectId || "";
}

function render() {
  const data = state.snapshot;
  if (!data || !data.project) {
    renderEmptyApp();
    return;
  }
  const session = data.sessions[0] || null;
  const activeTask = data.tasks.find((task) => task.id === session?.currentTaskRef) || null;
  const openAsks = data.asks.filter((ask) => ask.status === "open");
  const latestScale = data.scale.latest;
  const blockingFindings = latestScale ? latestScale.findings.filter((finding) => finding.severity === "block" && !finding.waivedAt).length : 0;

  els.goalCard.innerHTML = card("Goal", session?.goal || "No active goal", data.project.path);
  els.statusCard.innerHTML = renderSessionCard(session);
  els.taskCard.innerHTML = card("Current Task", activeTask ? activeTask.id + " · " + activeTask.title : "None", activeTask ? pct(activeTask.progress) + " · " + activeTask.owner + " · " + fmtRuntime(activeTask.runtimeSeconds) : data.statement?.nextExpectedAction || "no next action");
  els.scaleCard.innerHTML = card("Scale", latestScale ? "weight " + latestScale.estimate.weight + " · " + latestScale.estimate.recommendedAgent : "No report", latestScale ? blockingFindings + " blocking findings · " + latestScale.estimate.complexity : "run scale check");
  els.taskCount.textContent = String(data.tasks.length);
  els.askCount.textContent = String(openAsks.length) + " open";
  els.evidenceCount.textContent = String(data.evidence.length);
  els.outputCount.textContent = String(data.outputs.length);
  els.scaleCount.textContent = latestScale ? String(latestScale.findings.length) + " findings" : "0";
  els.tasks.innerHTML = renderTaskForm() + (data.tasks.length === 0 ? empty("No tasks.") : data.tasks.map(renderTask).join(""));
  els.asks.innerHTML = data.asks.length === 0 ? empty("No asks.") : data.asks.map(renderAsk).join("");
  els.outputs.innerHTML = data.outputs.length === 0 ? empty("No outputs.") : data.outputs.map(renderOutput).join("");
  els.evidence.innerHTML = data.evidence.length === 0 ? empty("No evidence.") : data.evidence.map(renderEvidence).join("");
  els.scale.innerHTML = renderScale(latestScale);
}

function renderEmptyApp() {
  els.goalCard.innerHTML = card("Goal", "No project", "register a project from CLI");
  els.statusCard.innerHTML = card("Session", "Idle", "");
  els.taskCard.innerHTML = card("Current Task", "None", "");
  els.scaleCard.innerHTML = card("Scale", "No report", "");
  els.taskCount.textContent = "0";
  els.askCount.textContent = "0";
  els.evidenceCount.textContent = "0";
  els.outputCount.textContent = "0";
  els.scaleCount.textContent = "0";
  els.tasks.innerHTML = empty("No project registered.");
  els.asks.innerHTML = empty("No project registered.");
  els.outputs.innerHTML = empty("No project registered.");
  els.evidence.innerHTML = empty("No project registered.");
  els.scale.innerHTML = empty("No project registered.");
}

function renderSessionCard(session) {
  if (!session) {
    return '<div class="label">Session</div><div class="value">No session</div><form class="stack-form" data-session-form><input name="goal" placeholder="Goal"><button>Start</button></form>';
  }
  const actions = ["planning", "scaling", "implementing", "verifying"].map((status) => '<button class="secondary" data-action="session-status" data-status="' + h(status) + '">' + h(status) + "</button>").join("");
  return card("Session", session.status, "runtime " + fmtRuntime(session.runtimeSeconds) + " · " + session.mode) + '<div class="actions">' + actions + '<button data-action="session-done">Done</button></div>';
}

function renderTaskForm() {
  return '<form class="task-form" data-add-task-form><input name="title" placeholder="New task"><select name="qualityGate"><option value="none">none</option><option value="scale">scale</option><option value="spec">spec</option><option value="visual">visual</option><option value="test">test</option><option value="demo">demo</option><option value="review">review</option></select><button>Add</button></form>';
}

function renderTask(task) {
  const level = task.status === "done" ? "good" : task.status === "active" ? "warn" : task.status === "paused" ? "bad" : "";
  const pause = task.pauseReason ? '<div class="subvalue">' + h(task.pauseReason) + "</div>" : "";
  return '<article class="item"><div class="item-head"><div class="item-title">' + h(task.priority + ". " + task.title) + '</div><span class="pill ' + level + '">' + h(task.status) + '</span></div><div class="progress" aria-label="progress"><span style="width:' + Math.max(0, Math.min(100, Math.round(task.progress * 100))) + '%"></span></div><div class="meta">' + pill(task.id) + pill(pct(task.progress)) + pill("gate " + task.qualityGate) + pill(task.owner) + pill("runtime " + fmtRuntime(task.runtimeSeconds)) + pill(task.checklistPassed ? "checklist pass" : "checklist open") + (task.estimatedWeight === null ? "" : pill("weight " + task.estimatedWeight)) + '</div>' + pause + '<div class="actions">' + taskActions(task) + "</div>" + taskForms(task) + "</article>";
}

function taskActions(task) {
  return '<button class="secondary" data-action="task-claim" data-task-id="' + h(task.id) + '">Claim</button><button class="secondary" data-action="task-resume" data-task-id="' + h(task.id) + '">Resume</button><button class="secondary" data-action="task-progress" data-task-id="' + h(task.id) + '" data-progress="0.5">50%</button><button class="secondary" data-action="task-progress" data-task-id="' + h(task.id) + '" data-progress="1">100%</button><button data-action="task-done" data-task-id="' + h(task.id) + '">Done</button><button class="secondary" data-action="task-delete" data-task-id="' + h(task.id) + '">Delete</button>';
}

function taskForms(task) {
  return '<div class="task-inline-forms"><form class="mini-form" data-task-owner-form data-task-id="' + h(task.id) + '"><input name="owner" value="' + h(task.owner) + '" placeholder="owner"><button>Owner</button></form><form class="mini-form" data-task-pause-form data-task-id="' + h(task.id) + '"><input name="reason" placeholder="Pause reason"><button>Pause</button></form></div>';
}

function renderAsk(ask) {
  const isOpen = ask.status === "open";
  return '<article class="item"><div class="item-head"><div class="item-title">' + h(ask.question) + '</div><span class="pill ' + (isOpen ? "warn" : "good") + '">' + h(ask.status) + '</span></div><div class="meta">' + pill(ask.id) + (ask.answerSource ? pill(ask.answerSource) : "") + "</div>" + (ask.answer ? '<div class="subvalue">' + h(ask.answer) + "</div>" : "") + (isOpen ? '<form class="ask-form" data-answer-form data-ask-id="' + h(ask.id) + '"><input name="answer" autocomplete="off" placeholder="Answer"><button>Answer</button></form>' : "") + "</article>";
}

function renderEvidence(evidence) {
  const level = evidence.status === "accepted" ? "good" : evidence.status === "rejected" ? "bad" : "warn";
  const actions = evidence.status === "candidate" ? '<div class="actions"><button data-evidence-action="accept" data-evidence-id="' + h(evidence.id) + '">Accept</button><button class="secondary" data-evidence-action="reject" data-evidence-id="' + h(evidence.id) + '">Reject</button></div>' : "";
  const detail = '<details><summary>Payload</summary><pre class="mono">' + h(JSON.stringify(evidence.payload || {}, null, 2)) + "</pre></details>";
  return '<article class="item"><div class="item-head"><div class="item-title">' + h(evidence.summary) + '</div><span class="pill ' + level + '">' + h(evidence.status) + '</span></div><div class="meta">' + pill(evidence.id) + pill(evidence.type) + pill(evidence.targetType + (evidence.targetRef ? ":" + evidence.targetRef : "")) + "</div>" + detail + actions + "</article>";
}

function renderOutput(output) {
  const source = output.url || output.path || "";
  const preview = output.renderableImage ? '<img class="output-img" alt="" src="' + h(source) + '">' : "";
  const link = output.url ? '<a href="' + h(output.url) + '" target="_blank" rel="noreferrer">' + h(output.url) + "</a>" : '<span class="mono">' + h(output.path) + "</span>";
  return '<article class="item output-item">' + preview + '<div class="item-head"><div class="item-title">' + h(output.summary) + '</div><span class="pill good">' + h(output.type) + '</span></div><div class="meta">' + pill(output.id) + (output.taskRef ? pill("task " + output.taskRef) : "") + '</div><div class="subvalue">' + link + "</div></article>";
}

function renderScale(report) {
  const form = '<form class="scale-form" data-scale-form><input name="paths" value="src,web"><button>Run</button></form><form class="scale-form" data-scale-split-form><input name="taskId" placeholder="Task to split"><button>Split</button></form>';
  if (!report) {
    return form + empty("No scale report.");
  }
  const head = form + '<article class="item"><div class="item-head"><div class="item-title">' + h(report.estimate.id + " · weight " + report.estimate.weight) + '</div><span class="pill ' + (report.blocked ? "bad" : "good") + '">' + (report.blocked ? "blocked" : "clear") + '</span></div><div class="meta">' + pill(report.estimate.complexity) + pill(report.estimate.recommendedAgent) + pill("context " + report.estimate.contextRisk.toFixed(2)) + '</div><div class="subvalue mono">' + h(report.estimate.basis) + "</div></article>";
  const findings = report.findings.filter((finding) => finding.severity !== "info").map(renderFinding).join("");
  return head + (findings || empty("No warning or blocking findings."));
}

function renderFinding(finding) {
  const level = finding.severity === "block" ? "bad" : finding.severity === "warn" ? "warn" : "";
  const waive = finding.severity === "block" && !finding.waivedAt ? '<form class="waive-form" data-waive-form data-finding-id="' + h(finding.id) + '"><input name="reason" placeholder="Waiver reason"><button>Waive</button></form>' : "";
  return '<article class="item"><div class="item-head"><div class="item-title mono">' + h(finding.path) + '</div><span class="pill ' + level + '">' + h(finding.severity) + '</span></div><div class="meta">' + pill(finding.id) + pill(String(finding.lineCount) + " lines") + pill(finding.role) + (finding.waivedAt ? pill("waived") : "") + '</div><div class="subvalue">' + h(finding.recommendation) + "</div>" + waive + "</article>";
}

function card(label, value, subvalue) {
  return '<div class="label">' + h(label) + '</div><div class="value">' + h(value) + '</div><div class="subvalue">' + h(subvalue || "") + "</div>";
}

function pill(value) {
  return '<span class="pill">' + h(value) + "</span>";
}

function empty(text) {
  return '<div class="empty">' + h(text) + "</div>";
}

function pct(value) {
  return Math.round((Number(value) || 0) * 100) + "%";
}

function fmtRuntime(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const rest = value % 60;
  return minutes < 60 ? minutes + "m " + rest + "s" : Math.floor(minutes / 60) + "h " + (minutes % 60) + "m";
}

function setConnection(online) {
  els.connection.textContent = online ? "live" : "offline";
  els.connection.className = "connection " + (online ? "online" : "offline");
}

async function safely(fn) {
  try {
    await fn();
  } catch (error) {
    showError(error);
  }
}

function showError(error) {
  const message = error instanceof Error ? error.message : String(error);
  els.errorBanner.textContent = message;
  els.errorBanner.hidden = false;
}

function hideError() {
  els.errorBanner.hidden = true;
  els.errorBanner.textContent = "";
}

function enc(value) {
  return encodeURIComponent(value);
}

function formValue(form, name) {
  const input = form.elements.namedItem(name);
  return input instanceof HTMLInputElement || input instanceof HTMLSelectElement ? input.value.trim() : "";
}

function h(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
