import { els } from "./dom.js";
import { state } from "./state.js";
import { card, compactPath, empty, fmtRuntime, h, pct, pill, projectName, shortPath } from "./format.js";

export function renderProjectButton() {
  const project = activeProject();
  els.projectButton.innerHTML = project ? h(projectName(project)) + '<span>' + h(shortPath(project.path)) + "</span>" : "No project";
}

export function renderProjectList() {
  const query = els.projectSearch.value.trim().toLowerCase();
  const projects = state.projects.filter((project) => {
    const haystack = [project.id, project.name, project.path].join(" ").toLowerCase();
    return query.length === 0 || haystack.includes(query);
  });
  els.projectList.innerHTML =
    projects.length === 0
      ? empty("No matching projects.")
      : projects
          .map(
            (project) =>
              '<button type="button" class="command-item" data-project-id="' +
              h(project.id) +
              '"><strong>' +
              h(projectName(project)) +
              "</strong><span>" +
              h(shortPath(project.path)) +
              "</span><em>" +
              h(project.id) +
              "</em></button>",
          )
          .join("");
}

export function render() {
  renderProjectButton();
  const data = state.snapshot;
  if (!data || !data.project) {
    renderEmptyApp();
    return;
  }
  const session = currentSession(data);
  const activeTask = currentTask(data, session);
  const openAsks = data.asks.filter((ask) => ask.status === "open");
  const latestScale = data.scale.latest;
  const blockingFindings = latestScale ? latestScale.findings.filter((finding) => finding.severity === "block" && !finding.waivedAt).length : 0;
  const review = projectReview(data, session, activeTask, latestScale, openAsks, blockingFindings);

  renderSessionStrip(data, session, activeTask);
  els.goalCard.innerHTML = card("Project Review", review.level, review.levelDetail);
  els.statusCard.innerHTML = card("Progress", review.progress, review.progressDetail);
  els.taskCard.innerHTML = renderFocusCard(data, session, activeTask, review);
  els.scaleCard.innerHTML = card("Readiness", review.readiness, review.readinessDetail);
  els.taskCount.textContent = String(data.tasks.length);
  els.askCount.textContent = String(openAsks.length) + " open";
  els.evidenceCount.textContent = String(data.evidence.length) + " receipts";
  els.outputCount.textContent = String(data.outputs.length);
  els.scaleCount.textContent = latestScale ? String(latestScale.findings.length) + " findings" : "0";
  els.tasks.innerHTML = data.tasks.length === 0 ? empty("No tasks.") : data.tasks.map(renderTask).join("");
  els.asks.innerHTML = data.asks.length === 0 ? empty("No asks.") : data.asks.map(renderAsk).join("");
  els.outputs.innerHTML = renderOutputs(data.outputs);
  els.evidence.innerHTML = renderVerificationLog(data.evidence);
  els.scale.innerHTML = renderScale(latestScale);
}

export function activeProject() {
  return state.projects.find((project) => project.id === state.projectId) || null;
}

function renderEmptyApp() {
  renderSessionStrip(null, null, null);
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
  els.evidence.innerHTML = renderVerificationLog([]);
  els.scale.innerHTML = empty("No project registered.");
}

function renderSessionStrip(data, session, task) {
  const strip = document.getElementById("sessionStrip");
  if (!strip) return;
  if (!data?.project) {
    strip.innerHTML = '<span class="strip-state idle">Idle</span><span class="strip-item"><b>Session</b>none</span><span class="strip-item"><b>Goal</b>no project</span>';
    return;
  }
  const agent = session?.agent || data.statement?.session?.agent || { state: "idle", staleSeconds: null };
  const agentRunning = agent.state === "running";
  const stateClass = agentRunning ? "running" : "idle";
  const stateText = agentRunning ? "Running" : "Idle";
  const seenText = typeof agent.staleSeconds === "number" ? " · seen " + fmtRuntime(agent.staleSeconds) + " ago" : "";
  const sessionStatus = session?.status || "none";
  const goal = session?.goal || "No active goal";
  const taskText = task ? task.id + " · " + task.title : data.statement?.nextExpectedAction || "No current task";
  const runtime = session?.runtimeSeconds ?? task?.runtimeSeconds ?? 0;
  strip.innerHTML =
    '<span class="strip-state ' +
    stateClass +
    '">' +
    h(stateText + seenText) +
    '</span><span class="strip-item"><b>Session</b>' +
    h(sessionStatus) +
    '</span><span class="strip-item strip-goal"><b>Goal</b>' +
    h(goal) +
    '</span><span class="strip-item strip-task"><b>Task</b>' +
    h(taskText) +
    '</span><span class="strip-item"><b>Runtime</b>' +
    h(fmtRuntime(runtime)) +
    "</span>";
}

function renderFocusCard(data, session, activeTask, review) {
  if (!session) {
    return '<div class="label">Current Focus</div><div class="value">No session</div><form class="stack-form" data-session-form><input name="goal" placeholder="Goal"><button>Start</button></form>';
  }
  return card(
    "Current Focus",
    activeTask ? activeTask.id + " · " + activeTask.title : review.nextAction,
    activeTask ? pct(activeTask.progress) + " · " + activeTask.owner + " · " + fmtRuntime(activeTask.runtimeSeconds) : session.goal || compactPath(data.project.path),
  );
}

function currentSession(data) {
  const statementSession = data.statement?.session || null;
  const fallback = data.sessions[0] || null;
  if (!statementSession) return fallback;
  return { ...fallback, ...statementSession };
}

function currentTask(data, session) {
  if (data.statement?.currentTask) {
    return data.statement.currentTask;
  }
  return data.tasks.find((task) => task.id === session?.currentTaskRef) || null;
}

function projectReview(data, session, activeTask, latestScale, openAsks, blockingFindings) {
  const totalTasks = data.tasks.length;
  const doneTasks = data.tasks.filter((task) => task.status === "done").length;
  const activeTasks = data.tasks.filter((task) => task.status === "active").length;
  const blockedTasks = data.tasks.filter((task) => task.status === "blocked" || task.status === "paused").length;
  const progressValue = totalTasks === 0 ? 0 : data.tasks.reduce((sum, task) => sum + Number(task.progress || 0), 0) / totalTasks;
  const scaleClear = latestScale ? !latestScale.blocked && blockingFindings === 0 : false;
  const checklistClear = totalTasks > 0 && data.tasks.every((task) => task.status === "done" || task.checklistPassed);
  const hasVisibleOutput = data.outputs.length > 0;
  const level = implementationLevel({ totalTasks, doneTasks, activeTasks, hasVisibleOutput, scaleClear, openAsks, blockedTasks });
  const readinessBlocked = openAsks.length > 0 || blockedTasks > 0 || blockingFindings > 0 || latestScale?.blocked === true;
  const readiness = readinessBlocked ? "Blocked" : checklistClear && scaleClear ? "Production-ready" : activeTask ? "In progress" : "Needs review";
  const nextAction = data.statement?.nextExpectedAction || (session ? "review_session" : "start_session");

  return {
    level,
    levelDetail: [data.project.name, session?.status || "no session", session?.mode || "no mode"].filter(Boolean).join(" · "),
    progress: pct(progressValue),
    progressDetail: `${doneTasks}/${totalTasks} done · ${activeTasks} active · ${blockedTasks} blocked`,
    readiness,
    readinessDetail: latestScale ? `scale ${latestScale.estimate.weight} · asks ${openAsks.length} · outputs ${data.outputs.length}` : `scale missing · asks ${openAsks.length}`,
    nextAction,
  };
}

function implementationLevel(input) {
  if (input.totalTasks === 0) return "Planning";
  if (input.openAsks.length > 0 || input.blockedTasks > 0) return "Blocked";
  if (input.doneTasks === input.totalTasks && input.scaleClear) return "Production-ready";
  if (input.hasVisibleOutput && input.activeTasks === 0) return "Reviewable build";
  if (input.hasVisibleOutput) return "Working demo";
  if (input.activeTasks > 0) return "Implementation";
  return "Spec only";
}

function renderTask(task) {
  const level = task.status === "done" ? "good" : task.status === "active" ? "warn" : task.status === "paused" ? "bad" : "";
  const pause = task.pauseReason ? '<div class="subvalue">' + h(task.pauseReason) + "</div>" : "";
  return (
    '<article class="item"><div class="item-head"><div class="item-title">' +
    h(task.priority + ". " + task.title) +
    '</div><span class="pill ' +
    level +
    '">' +
    h(task.status) +
    '</span></div><div class="progress" aria-label="progress"><span style="width:' +
    Math.max(0, Math.min(100, Math.round(task.progress * 100))) +
    '%"></span></div><div class="meta">' +
    pill(task.id) +
    pill(pct(task.progress)) +
    pill("gate " + task.qualityGate) +
    pill(task.owner) +
    pill("runtime " + fmtRuntime(task.runtimeSeconds)) +
    (task.estimatedWeight === null ? "" : pill("weight " + task.estimatedWeight)) +
    "</div>" +
    pause +
    '<form class="priority-form" data-priority-form data-task-id="' +
    h(task.id) +
    '"><label>Priority <input name="priority" type="number" min="1" step="1" value="' +
    h(task.priority) +
    '"></label><button class="secondary">Update</button></form></article>'
  );
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

function renderOutputs(outputs) {
  if (outputs.length === 0) {
    return empty("No demo, screenshot, generated image, or browser result yet.");
  }
  return outputs.map(renderOutput).join("");
}

function renderVerificationLog(evidence) {
  if (evidence.length === 0) {
    return '<details class="verification-log"><summary>No verification receipts yet</summary>' + empty("Agent receipts will appear here when external artifacts, user decisions, or manual QA notes are attached.") + "</details>";
  }
  const accepted = evidence.filter((item) => item.status === "accepted").length;
  const candidates = evidence.filter((item) => item.status === "candidate").length;
  return (
    '<details class="verification-log"><summary>' +
    h(accepted + " accepted · " + candidates + " pending · " + evidence.length + " total") +
    "</summary>" +
    evidence.map(renderEvidence).join("") +
    "</details>"
  );
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
