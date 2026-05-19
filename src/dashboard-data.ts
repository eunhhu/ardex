import { ArdexError } from "./errors.ts";
import { openDatabase } from "./db.ts";
import type { ArdexPaths } from "./paths.ts";
import {
  answerAsk,
  answerDecision,
  buildProductionChecklist,
  buildStatement,
  dismissDecision,
  latestScaleReport,
  listAgentActions,
  listAgentRuns,
  listAsks,
  listDecisions,
  listEvidence,
  listProjects,
  listScaleReports,
  listSessions,
  listTasks,
  sessionAgentActivity,
  setEvidenceStatus,
  taskRuntimeSeconds,
  type AgentAction,
  type AgentActivity,
  type AgentRun,
  type Ask,
  type Decision,
  type Evidence,
  type FileScaleFinding,
  type Project,
  type ScaleEstimate,
  type ScaleReport,
  type Session,
  type Statement,
  type Task,
  VISUAL_SCENARIO_CONFIRM_KIND,
  VISUAL_SCENARIO_PROMPT_KIND,
} from "./repository.ts";

export type DashboardSnapshot = {
  generatedAt: string;
  project: ProjectSummary | null;
  projects: ProjectSummary[];
  statement: Statement | null;
  sessions: SessionSummary[];
  tasks: TaskSummary[];
  agentRuns: AgentRunSummary[];
  agentActions: AgentActionSummary[];
  decisions: DecisionSummary[];
  evidence: EvidenceSummary[];
  outputs: OutputSummary[];
  asks: AskSummary[];
  scale: {
    latest: ScaleReportSummary | null;
    reports: ScaleEstimateSummary[];
  };
};

type ProjectSummary = {
  id: string;
  name: string;
  path: string;
  defaultWorkflow: string;
  archivedAt: string | null;
};

type SessionSummary = {
  id: string;
  status: string;
  goal: string | null;
  mode: string;
  model: string | null;
  currentTaskId: string | null;
  currentTaskRef: string | null;
  runtimeSeconds: number;
  lastSeenAt: string;
  agent: AgentActivity;
  nextExpectedAction: string | null;
};

type TaskSummary = {
  id: string;
  title: string;
  status: string;
  progress: number;
  priority: number;
  importance: number;
  owner: string;
  qualityGate: string;
  estimatedWeight: number | null;
  contextRisk: number | null;
  startedAt: string | null;
  pausedAt: string | null;
  resumedAt: string | null;
  activeSeconds: number;
  runtimeSeconds: number;
  pauseReason: string | null;
  checklistPassed: boolean;
};

type AgentRunSummary = {
  id: string;
  sessionId: string | null;
  sessionRef: string | null;
  taskId: string | null;
  taskRef: string | null;
  owner: string;
  role: string;
  status: string;
  pid: number | null;
  worktreePath: string | null;
  branchName: string | null;
  model: string | null;
  autonomyBudget: Record<string, unknown>;
  goal: string;
  summary: string;
  metadata: Record<string, unknown>;
  startedAt: string | null;
  lastSeenAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type AgentActionSummary = {
  id: string;
  sessionId: string | null;
  sessionRef: string | null;
  runId: string;
  runRef: string | null;
  taskId: string | null;
  taskRef: string | null;
  sequence: number;
  type: string | null;
  kind: string | null;
  status: string;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  currentFile: string | null;
  command: string | null;
  progress: number | null;
  startedAt: string | null;
  endedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type EvidenceSummary = {
  id: string;
  type: string;
  status: string;
  targetType: string;
  targetRef: string | null;
  summary: string;
  payload: Record<string, unknown>;
  media: OutputSummary | null;
  createdAt: string;
};

type OutputSummary = {
  id: string;
  type: string;
  kind: OutputKind;
  format: OutputFormat;
  mimeType: string | null;
  status: string;
  taskRef: string | null;
  summary: string;
  path: string | null;
  url: string | null;
  markdown: string | null;
  html: string | null;
  text: string | null;
  previewUrl: string | null;
  renderable: boolean;
  renderableImage: boolean;
  visualScenario: boolean;
  prompt: string | null;
  reviewComment: string | null;
  needsApproval: boolean;
  createdAt: string;
};

type OutputFormat = "image" | "markdown" | "html" | "text" | "link" | "file";

type OutputKind = "image" | "markdown" | "html" | "link" | "file" | "artifact";

type AskSummary = {
  id: string;
  status: string;
  question: string;
  answer: string | null;
  answerSource: string | null;
  attachments: string[];
  createdAt: string;
  answeredAt: string | null;
};

type DecisionOptionSummary = {
  id: string;
  label: string;
  description: string | null;
  consequence: string | null;
};

type DecisionSummary = {
  id: string;
  sessionId: string | null;
  sessionRef: string | null;
  taskId: string | null;
  taskRef: string | null;
  runId: string | null;
  runRef: string | null;
  actionId: string | null;
  type: string | null;
  priority: number;
  agentRunId: string | null;
  agentRunRef: string | null;
  question: string;
  context: string;
  options: DecisionOptionSummary[];
  recommendedOption: string | null;
  required: boolean;
  status: string;
  answer: string | null;
  dismissedReason: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  answeredAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type ScaleEstimateSummary = {
  id: string;
  targetType: string;
  targetId: string | null;
  weight: number;
  complexity: string;
  contextRisk: number;
  modularityRisk: number;
  recommendedAgent: string;
  recommendedSplit: Record<string, unknown> | null;
  basis: string;
  createdAt: string;
};

type FileScaleFindingSummary = {
  id: string;
  path: string;
  lineCount: number;
  byteCount: number;
  role: string;
  severity: string;
  reason: string;
  recommendation: string;
  waivedAt: string | null;
  waiverStale: boolean;
};

type ScaleReportSummary = {
  estimate: ScaleEstimateSummary;
  findings: FileScaleFindingSummary[];
  blocked: boolean;
};

export async function buildDashboardSnapshot(paths: ArdexPaths, projectRef?: string): Promise<DashboardSnapshot> {
  const db = openDatabase(paths);
  try {
    const projects = listProjects(db);
    const project = projectRef === undefined ? projects[0] : projects.find((item) => item.id === projectRef || item.alias === projectRef);
    if (project === undefined) {
      return emptySnapshot(projects);
    }

    const sessions = listSessions(db, project.alias);
    const tasks = listTasks(db, project.alias);
    const agentRuns: AgentRun[] = listAgentRuns(db, project.alias);
    const agentActions: AgentAction[] = listAgentActions(db, project.alias);
    const decisions: Decision[] = listDecisions(db, project.alias);
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const sessionById = new Map(sessions.map((session) => [session.id, session]));
    const agentRunById = new Map(agentRuns.map((run) => [run.id, run]));
    const latestScale = tryLatestScaleReport(db, project.alias);

    return {
      generatedAt: new Date().toISOString(),
      project: projectSummary(project),
      projects: projects.map(projectSummary),
      statement: buildStatement(db, project.alias),
      sessions: sessions.map((session) => sessionSummary(session, taskById)),
      tasks: tasks.map((task) => taskSummary(db, project.alias, task)),
      agentRuns: agentRuns.map((run) => agentRunSummary(run, taskById, sessionById)),
      agentActions: agentActions.map((action) => agentActionSummary(action, taskById, sessionById, agentRunById)),
      decisions: decisions.map((decision) => decisionSummary(decision, taskById, sessionById, agentRunById)),
      evidence: listEvidence(db, project.alias).map((item) => evidenceSummary(item, taskById, sessionById)),
      outputs: listEvidence(db, project.alias).map((item) => outputSummary(item, project, taskById)).filter((item): item is OutputSummary => item !== null),
      asks: listAsks(db, project.alias).map(askSummary),
      scale: {
        latest: latestScale === null ? null : scaleReportSummary(latestScale),
        reports: listScaleReports(db, project.alias).map(scaleEstimateSummary),
      },
    };
  } finally {
    db.close();
  }
}

export function readProjects(paths: ArdexPaths): ProjectSummary[] {
  const db = openDatabase(paths);
  try {
    return listProjects(db).map(projectSummary);
  } finally {
    db.close();
  }
}

export function answerAskForDashboard(paths: ArdexPaths, projectRef: string, askRef: string, answer: string): AskSummary {
  return mutateDb(paths, (db) => askSummary(answerAsk(db, projectRef, askRef, answer)));
}

export function answerDecisionForDashboard(paths: ArdexPaths, projectRef: string, decisionRef: string, answer: string): DecisionSummary {
  return mutateDb(paths, (db) => {
    const decision = answerDecision(db, projectRef, decisionRef, answer);
    const tasks = listTasks(db, projectRef);
    const sessions = listSessions(db, projectRef);
    const agentRuns: AgentRun[] = listAgentRuns(db, projectRef);
    return decisionSummary(
      decision,
      new Map(tasks.map((task) => [task.id, task])),
      new Map(sessions.map((session) => [session.id, session])),
      new Map(agentRuns.map((run) => [run.id, run])),
    );
  });
}

export function dismissDecisionForDashboard(paths: ArdexPaths, projectRef: string, decisionRef: string, reason?: string): DecisionSummary {
  return mutateDb(paths, (db) => {
    const decision = dismissDecision(db, projectRef, decisionRef, reason);
    const tasks = listTasks(db, projectRef);
    const sessions = listSessions(db, projectRef);
    const agentRuns: AgentRun[] = listAgentRuns(db, projectRef);
    return decisionSummary(
      decision,
      new Map(tasks.map((task) => [task.id, task])),
      new Map(sessions.map((session) => [session.id, session])),
      new Map(agentRuns.map((run) => [run.id, run])),
    );
  });
}

export function setEvidenceStatusForDashboard(
  paths: ArdexPaths,
  projectRef: string,
  evidenceRef: string,
  status: "accepted" | "rejected",
  comment?: string,
): EvidenceSummary {
  return mutateDb(paths, (db) => {
    const evidence = setEvidenceStatus(db, projectRef, evidenceRef, status, { comment });
    const tasks = listTasks(db, projectRef);
    const sessions = listSessions(db, projectRef);
    return evidenceSummary(evidence, new Map(tasks.map((task) => [task.id, task])), new Map(sessions.map((session) => [session.id, session])));
  });
}

function mutateDb<T>(paths: ArdexPaths, callback: (db: ReturnType<typeof openDatabase>) => T): T {
  const db = openDatabase(paths);
  try {
    return callback(db);
  } finally {
    db.close();
  }
}

function emptySnapshot(projects: Project[]): DashboardSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    project: null,
    projects: projects.map(projectSummary),
    statement: null,
    sessions: [],
    tasks: [],
    agentRuns: [],
    agentActions: [],
    decisions: [],
    evidence: [],
    outputs: [],
    asks: [],
    scale: {
      latest: null,
      reports: [],
    },
  };
}

function tryLatestScaleReport(db: ReturnType<typeof openDatabase>, projectRef: string): ScaleReport | null {
  try {
    return latestScaleReport(db, projectRef);
  } catch (error) {
    if (error instanceof ArdexError && error.code === "NOT_FOUND") {
      return null;
    }
    throw error;
  }
}

function projectSummary(project: Project): ProjectSummary {
  return {
    id: project.alias,
    name: project.name,
    path: project.path,
    defaultWorkflow: project.defaultWorkflow,
    archivedAt: project.archivedAt,
  };
}

function sessionSummary(session: Session, taskById: Map<string, Task>): SessionSummary {
  const currentTask = session.currentTaskId === null ? null : taskById.get(session.currentTaskId) ?? null;
  return {
    id: session.alias,
    status: session.status,
    goal: session.goal,
    mode: session.mode,
    model: session.model,
    currentTaskId: session.currentTaskId,
    currentTaskRef: currentTask?.alias ?? null,
    runtimeSeconds: effectiveRuntimeSeconds(session),
    lastSeenAt: session.lastSeenAt,
    agent: sessionAgentActivity(session),
    nextExpectedAction: session.nextExpectedAction,
  };
}

function taskSummary(db: ReturnType<typeof openDatabase>, projectRef: string, task: Task): TaskSummary {
  const checklist = buildProductionChecklist(db, projectRef, task.alias);
  return {
    id: task.alias,
    title: task.title,
    status: task.status,
    progress: task.progress,
    priority: task.priority,
    importance: task.importance,
    owner: task.owner,
    qualityGate: task.qualityGate,
    estimatedWeight: task.estimatedWeight,
    contextRisk: task.contextRisk,
    startedAt: task.startedAt,
    pausedAt: task.pausedAt,
    resumedAt: task.resumedAt,
    activeSeconds: task.activeSeconds,
    runtimeSeconds: taskRuntimeSeconds(task),
    pauseReason: task.pauseReason,
    checklistPassed: checklist.passed,
  };
}

function agentRunSummary(run: AgentRun, taskById: Map<string, Task>, sessionById: Map<string, Session>): AgentRunSummary {
  const source = objectRecord(run);
  const sessionId = nullableString(source["sessionId"]);
  const taskId = nullableString(source["taskId"]);
  const owner = stringField(source, "owner") ?? stringField(source, "agentRole") ?? "";
  const createdAt = stringField(source, "createdAt") ?? "";
  const updatedAt = stringField(source, "updatedAt") ?? createdAt;
  return {
    id: run.alias,
    sessionId,
    sessionRef: refById(sessionId, sessionById),
    taskId,
    taskRef: refById(taskId, taskById),
    owner,
    role: stringField(source, "role") ?? owner,
    status: stringField(source, "status") ?? "",
    pid: nullableNumber(source["pid"]),
    worktreePath: nullableString(source["worktreePath"]),
    branchName: nullableString(source["branchName"]),
    model: nullableString(source["model"]),
    autonomyBudget: recordField(source, "autonomyBudget"),
    goal: stringField(source, "goal") ?? "",
    summary: stringField(source, "summary") ?? "",
    metadata: recordField(source, "metadata"),
    startedAt: nullableString(source["startedAt"]),
    lastSeenAt: nullableString(source["lastSeenAt"]) ?? nullableString(source["lastHeartbeatAt"]) ?? updatedAt,
    completedAt: nullableString(source["completedAt"]) ?? nullableString(source["endedAt"]),
    createdAt,
    updatedAt,
  };
}

function agentActionSummary(
  action: AgentAction,
  taskById: Map<string, Task>,
  sessionById: Map<string, Session>,
  runById: Map<string, AgentRun>,
): AgentActionSummary {
  const source = objectRecord(action);
  const sessionId = nullableString(source["sessionId"]);
  const taskId = nullableString(source["taskId"]);
  const type = nullableString(source["type"]);
  const kind = nullableString(source["kind"]) ?? type;
  const createdAt = stringField(source, "createdAt") ?? "";
  const updatedAt = stringField(source, "updatedAt") ?? createdAt;
  return {
    id: action.alias,
    sessionId,
    sessionRef: refById(sessionId, sessionById),
    runId: action.runId,
    runRef: refById(action.runId, runById),
    taskId,
    taskRef: refById(taskId, taskById),
    sequence: numberField(source, "sequence") ?? 0,
    type,
    kind,
    status: stringField(source, "status") ?? "",
    title: stringField(source, "title") ?? "",
    summary: stringField(source, "summary") ?? "",
    payload: recordField(source, "payload"),
    currentFile: nullableString(source["currentFile"]),
    command: nullableString(source["command"]),
    progress: nullableNumber(source["progress"]),
    startedAt: nullableString(source["startedAt"]),
    endedAt: nullableString(source["endedAt"]),
    completedAt: nullableString(source["completedAt"]),
    createdAt,
    updatedAt,
  };
}

function evidenceSummary(evidence: Evidence, taskById: Map<string, Task>, sessionById: Map<string, Session>): EvidenceSummary {
  return {
    id: evidence.alias,
    type: evidence.type,
    status: evidence.status,
    targetType: evidence.targetType,
    targetRef: targetRef(evidence, taskById, sessionById),
    summary: evidence.summary,
    payload: evidence.payload,
    media: outputSummary(evidence, null, taskById),
    createdAt: evidence.createdAt,
  };
}

function decisionSummary(
  decision: Decision,
  taskById: Map<string, Task>,
  sessionById: Map<string, Session>,
  runById: Map<string, AgentRun>,
): DecisionSummary {
  const source = objectRecord(decision);
  const sessionId = nullableString(source["sessionId"]);
  const taskId = nullableString(source["taskId"]);
  const runId = nullableString(source["runId"]);
  const agentRunId = nullableString(source["agentRunId"]) ?? runId;
  const metadata = recordField(source, "metadata");
  const createdAt = stringField(source, "createdAt") ?? "";
  const updatedAt = stringField(source, "updatedAt") ?? createdAt;
  return {
    id: decision.alias,
    sessionId,
    sessionRef: refById(sessionId, sessionById),
    taskId,
    taskRef: refById(taskId, taskById),
    runId,
    runRef: refById(runId, runById),
    actionId: nullableString(source["actionId"]),
    type: nullableString(source["type"]) ?? metadataString(metadata, "type"),
    priority: numberField(source, "priority") ?? 0,
    agentRunId,
    agentRunRef: refById(agentRunId, runById),
    question: stringField(source, "question") ?? "",
    context: stringField(source, "context") ?? "",
    options: decision.options.map(decisionOptionSummary),
    recommendedOption: nullableString(source["recommendedOption"]),
    required: booleanField(source, "required") ?? (numberField(source, "priority") ?? 0) > 0,
    status: stringField(source, "status") ?? "",
    answer: nullableString(source["answer"]),
    dismissedReason: nullableString(source["dismissedReason"]),
    resolvedBy: nullableString(source["resolvedBy"]),
    resolvedAt: nullableString(source["resolvedAt"]),
    answeredAt: nullableString(source["answeredAt"]) ?? nullableString(source["resolvedAt"]),
    metadata,
    createdAt,
    updatedAt,
  };
}

function decisionOptionSummary(option: Decision["options"][number]): DecisionOptionSummary {
  return {
    id: option.id,
    label: option.label,
    description: fieldString(option, "description"),
    consequence: fieldString(option, "consequence") ?? fieldString(option, "description"),
  };
}

function outputSummary(evidence: Evidence, project: Project | null, taskById: Map<string, Task>): OutputSummary | null {
  if (evidence.payload["kind"] === VISUAL_SCENARIO_PROMPT_KIND) {
    return null;
  }
  const visualScenario = evidence.payload["kind"] === VISUAL_SCENARIO_CONFIRM_KIND;
  if (evidence.status !== "accepted" && !visualScenario) {
    return null;
  }
  if (evidence.status === "rejected" && !visualScenario) {
    return null;
  }
  if (!["screenshot", "generated_image", "prototype", "url", "browser_diff", "artifact"].includes(evidence.type)) {
    return null;
  }
  const path = typeof evidence.payload["path"] === "string" ? evidence.payload["path"] : null;
  const url = typeof evidence.payload["url"] === "string" ? evidence.payload["url"] : null;
  const markdown = typeof evidence.payload["markdown"] === "string" ? evidence.payload["markdown"] : null;
  const html = typeof evidence.payload["html"] === "string" ? evidence.payload["html"] : null;
  const text = typeof evidence.payload["text"] === "string" ? evidence.payload["text"] : null;
  if (path === null && url === null && markdown === null && html === null && text === null) {
    return null;
  }
  const source = url ?? path ?? "";
  const format = outputFormat(evidence, source, { markdown, html, text });
  const kind = outputKind(evidence, format, path, url);
  const mimeType = outputMimeType(format, source);
  const previewUrl = renderableArtifactUrl(project, path);
  const renderableRemote = /^https?:\/\//.test(source) && /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(source);
  return {
    id: evidence.alias,
    type: evidence.type,
    kind,
    format,
    mimeType,
    status: evidence.status,
    taskRef: evidence.targetType === "task" && evidence.targetId !== null ? taskById.get(evidence.targetId)?.alias ?? evidence.targetId : null,
    summary: evidence.summary,
    path,
    url,
    markdown,
    html,
    text,
    previewUrl,
    renderable: format !== "file",
    renderableImage: format === "image" && (previewUrl !== null || renderableRemote),
    visualScenario,
    prompt: typeof evidence.payload["prompt"] === "string" ? evidence.payload["prompt"] : null,
    reviewComment: typeof evidence.payload["reviewComment"] === "string" ? evidence.payload["reviewComment"] : null,
    needsApproval: visualScenario && evidence.status === "candidate",
    createdAt: evidence.createdAt,
  };
}

function outputFormat(evidence: Evidence, source: string, inline: { markdown: string | null; html: string | null; text: string | null }): OutputFormat {
  const declared = typeof evidence.payload["format"] === "string" ? evidence.payload["format"].toLowerCase() : null;
  if (declared === "image" || declared === "markdown" || declared === "html" || declared === "text" || declared === "link" || declared === "file") {
    return declared;
  }
  if (inline.markdown !== null) return "markdown";
  if (inline.html !== null) return "html";
  if (inline.text !== null) return "text";
  if (evidence.type === "generated_image" || evidence.type === "screenshot") return "image";
  if (evidence.type === "browser_diff") return "html";
  if (/\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(source)) return "image";
  if (/\.(md|markdown)(\?|$)/i.test(source)) return "markdown";
  if (/\.(html?|xhtml)(\?|$)/i.test(source)) return "html";
  if (/\.(txt|log)(\?|$)/i.test(source)) return "text";
  if (/^https?:\/\//i.test(source)) return "link";
  return "file";
}

function outputKind(evidence: Evidence, format: OutputFormat, path: string | null, url: string | null): OutputKind {
  if (format === "image" || format === "markdown" || format === "html") return format;
  if (url !== null && path === null) return "link";
  if (evidence.type === "prototype" || evidence.type === "artifact") return "artifact";
  return "file";
}

function outputMimeType(format: OutputFormat, source: string): string | null {
  if (format === "markdown") return "text/markdown";
  if (format === "html") return "text/html";
  if (format === "text") return "text/plain";
  if (format === "link" || format === "file") return null;
  if (/\.png(\?|$)/i.test(source)) return "image/png";
  if (/\.jpe?g(\?|$)/i.test(source)) return "image/jpeg";
  if (/\.gif(\?|$)/i.test(source)) return "image/gif";
  if (/\.webp(\?|$)/i.test(source)) return "image/webp";
  if (/\.avif(\?|$)/i.test(source)) return "image/avif";
  return "image/*";
}

function renderableArtifactUrl(project: Project | null, path: string | null): string | null {
  if (project === null || path === null || !/\.(png|jpe?g|gif|webp|avif)$/i.test(path)) {
    return null;
  }
  return `/api/projects/${encodeURIComponent(project.alias)}/artifacts?path=${encodeURIComponent(path)}`;
}

function askSummary(ask: Ask): AskSummary {
  return {
    id: ask.alias,
    status: ask.status,
    question: ask.question,
    answer: ask.answer,
    answerSource: ask.answerSource,
    attachments: ask.attachments,
    createdAt: ask.createdAt,
    answeredAt: ask.answeredAt,
  };
}

function scaleEstimateSummary(estimate: ScaleEstimate): ScaleEstimateSummary {
  return {
    id: estimate.alias,
    targetType: estimate.targetType,
    targetId: estimate.targetId,
    weight: estimate.weight,
    complexity: estimate.complexity,
    contextRisk: estimate.contextRisk,
    modularityRisk: estimate.modularityRisk,
    recommendedAgent: estimate.recommendedAgent,
    recommendedSplit: estimate.recommendedSplit,
    basis: estimate.basis,
    createdAt: estimate.createdAt,
  };
}

function fileScaleFindingSummary(finding: FileScaleFinding): FileScaleFindingSummary {
  return {
    id: finding.alias,
    path: finding.path,
    lineCount: finding.lineCount,
    byteCount: finding.byteCount,
    role: finding.role,
    severity: finding.severity,
    reason: finding.reason,
    recommendation: finding.recommendation,
    waivedAt: finding.waivedAt,
    waiverStale: finding.waiverHash !== null && finding.waiverHash !== finding.contentHash,
  };
}

function scaleReportSummary(report: ScaleReport): ScaleReportSummary {
  return {
    estimate: scaleEstimateSummary(report.estimate),
    findings: report.findings.map(fileScaleFindingSummary),
    blocked: report.blocked,
  };
}

function targetRef(evidence: Evidence, taskById: Map<string, Task>, sessionById: Map<string, Session>): string | null {
  if (evidence.targetId === null) {
    return null;
  }
  if (evidence.targetType === "task") {
    return taskById.get(evidence.targetId)?.alias ?? evidence.targetId;
  }
  if (evidence.targetType === "session") {
    return sessionById.get(evidence.targetId)?.alias ?? evidence.targetId;
  }
  return evidence.targetId;
}

function refById<T extends { alias: string }>(id: string | null, itemsById: Map<string, T>): string | null {
  if (id === null) {
    return null;
  }
  return itemsById.get(id)?.alias ?? null;
}

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" ? value : null;
}

function objectRecord(value: object): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function recordField(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = source[key];
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringField(source: Record<string, unknown>, key: string): string | null {
  return fieldString(source, key);
}

function fieldString(source: object, key: string): string | null {
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberField(source: Record<string, unknown>, key: string): number | null {
  return nullableNumber(source[key]);
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanField(source: Record<string, unknown>, key: string): boolean | null {
  const value = source[key];
  return typeof value === "boolean" ? value : null;
}

function effectiveRuntimeSeconds(session: Session): number {
  if (session.endedAt !== null) {
    return session.runtimeSeconds;
  }
  const startedAt = Date.parse(session.startedAt);
  return Number.isFinite(startedAt) ? Math.max(session.runtimeSeconds, Math.floor((Date.now() - startedAt) / 1000)) : session.runtimeSeconds;
}
