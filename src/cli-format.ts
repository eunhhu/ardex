import { VERSION } from "./output.ts";
import {
  sessionAgentActivity,
  type Ask,
  type Evidence,
  type FileScaleFinding,
  type ProductionChecklist,
  type Project,
  type ScaleEstimate,
  type ScaleReport,
  type Session,
  type Statement,
  type Task,
  type TaskEvent,
} from "./repository.ts";

export function projectSummary(project: Project): Record<string, unknown> {
  return {
    id: project.alias,
    internalId: project.id,
    name: project.name,
    path: project.path,
    defaultWorkflow: project.defaultWorkflow,
    archivedAt: project.archivedAt,
  };
}

export function sessionSummary(session: Session): Record<string, unknown> {
  return {
    id: session.alias,
    internalId: session.id,
    status: session.status,
    goal: session.goal,
    mode: session.mode,
    currentTaskId: session.currentTaskId,
    runtimeSeconds: session.runtimeSeconds,
    lastSeenAt: session.lastSeenAt,
    agent: sessionAgentActivity(session),
    nextExpectedAction: session.nextExpectedAction,
  };
}

export function taskSummary(task: Task): Record<string, unknown> {
  return {
    id: task.alias,
    internalId: task.id,
    title: task.title,
    status: task.status,
    progress: task.progress,
    priority: task.priority,
    importance: task.importance,
    owner: task.owner,
    qualityGate: task.qualityGate,
    sessionId: task.sessionId,
    startedAt: task.startedAt,
    pausedAt: task.pausedAt,
    resumedAt: task.resumedAt,
    activeSeconds: task.activeSeconds,
    pauseReason: task.pauseReason,
  };
}

export function taskEventSummary(event: TaskEvent): Record<string, unknown> {
  return {
    id: event.alias,
    internalId: event.id,
    taskId: event.taskAlias,
    type: event.type,
    summary: event.summary,
    payload: event.payload,
    createdAt: event.createdAt,
  };
}

export function checklistSummary(checklist: ProductionChecklist): Record<string, unknown> {
  return {
    taskId: checklist.taskId,
    passed: checklist.passed,
    items: checklist.items,
  };
}

export function evidenceSummary(evidence: Evidence): Record<string, unknown> {
  return {
    id: evidence.alias,
    internalId: evidence.id,
    type: evidence.type,
    status: evidence.status,
    targetType: evidence.targetType,
    targetId: evidence.targetId,
    summary: evidence.summary,
    payload: evidence.payload,
  };
}

export function askSummary(ask: Ask): Record<string, unknown> {
  return {
    id: ask.alias,
    internalId: ask.id,
    status: ask.status,
    question: ask.question,
    answer: ask.answer,
    answerSource: ask.answerSource,
    attachments: ask.attachments,
  };
}

export function agentRunSummary(run: object): Record<string, unknown> {
  return {
    id: textField(run, "alias") ?? textField(run, "id"),
    internalId: textField(run, "id"),
    projectId: textField(run, "projectId"),
    sessionId: textField(run, "sessionId"),
    taskId: textField(run, "taskId"),
    owner: textField(run, "owner") ?? textField(run, "agentRole"),
    role: textField(run, "agentRole") ?? textField(run, "owner"),
    status: textField(run, "status"),
    pid: numberField(run, "pid"),
    worktreePath: textField(run, "worktreePath"),
    branchName: textField(run, "branchName"),
    model: textField(run, "model"),
    goal: textField(run, "goal") ?? textField(run, "summary"),
    summary: textField(run, "summary"),
    metadata: objectField(run, "metadata") ?? objectField(run, "autonomyBudget"),
    autonomyBudget: objectField(run, "autonomyBudget"),
    startedAt: textField(run, "startedAt"),
    lastSeenAt: textField(run, "lastSeenAt") ?? textField(run, "updatedAt"),
    completedAt: textField(run, "completedAt"),
    createdAt: textField(run, "createdAt"),
    updatedAt: textField(run, "updatedAt"),
    failureReason: textField(run, "failureReason") ?? textField(run, "reason") ?? textField(run, "error"),
  };
}

export function agentActionSummary(action: object): Record<string, unknown> {
  return {
    id: textField(action, "alias") ?? textField(action, "id"),
    internalId: textField(action, "id"),
    runId: textField(action, "runId"),
    taskId: textField(action, "taskId"),
    sequence: numberField(action, "sequence"),
    type: textField(action, "type") ?? textField(action, "kind"),
    kind: textField(action, "kind") ?? textField(action, "type"),
    status: textField(action, "status"),
    title: textField(action, "title"),
    summary: textField(action, "summary"),
    payload: objectField(action, "payload"),
    currentFile: textField(action, "currentFile"),
    command: textField(action, "command"),
    progress: numberField(action, "progress"),
    startedAt: textField(action, "startedAt"),
    endedAt: textField(action, "endedAt") ?? textField(action, "completedAt"),
    completedAt: textField(action, "completedAt") ?? textField(action, "endedAt"),
    createdAt: textField(action, "createdAt"),
    updatedAt: textField(action, "updatedAt"),
  };
}

export function decisionSummary(decision: object): Record<string, unknown> {
  return {
    id: textField(decision, "alias") ?? textField(decision, "id"),
    internalId: textField(decision, "id"),
    runId: textField(decision, "runId") ?? textField(decision, "agentRunId"),
    agentRunId: textField(decision, "agentRunId") ?? textField(decision, "runId"),
    actionId: textField(decision, "actionId"),
    taskId: textField(decision, "taskId"),
    status: textField(decision, "status"),
    priority: numberField(decision, "priority"),
    type: textField(decision, "type"),
    question: textField(decision, "question") ?? textField(decision, "prompt"),
    context: textField(decision, "context"),
    answer: textField(decision, "answer"),
    recommendedOption: textField(decision, "recommendedOption"),
    required: booleanField(decision, "required"),
    dismissedReason: textField(decision, "dismissedReason"),
    resolvedBy: textField(decision, "resolvedBy"),
    resolvedAt: textField(decision, "resolvedAt") ?? textField(decision, "answeredAt"),
    answeredAt: textField(decision, "answeredAt") ?? textField(decision, "resolvedAt"),
    options: arrayField(decision, "options"),
    metadata: objectField(decision, "metadata"),
    createdAt: textField(decision, "createdAt"),
    updatedAt: textField(decision, "updatedAt"),
  };
}

export function scaleEstimateSummary(estimate: ScaleEstimate): Record<string, unknown> {
  return {
    id: estimate.alias,
    internalId: estimate.id,
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

export function fileScaleFindingSummary(finding: FileScaleFinding): Record<string, unknown> {
  return {
    id: finding.alias,
    internalId: finding.id,
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

export function scaleReportSummary(report: ScaleReport): Record<string, unknown> {
  return {
    estimate: scaleEstimateSummary(report.estimate),
    findings: report.findings.map(fileScaleFindingSummary),
    blocked: report.blocked,
  };
}

export function formatScaleReport(report: ScaleReport): string {
  const header = [
    `report: ${report.estimate.alias}`,
    `weight: ${report.estimate.weight}`,
    `complexity: ${report.estimate.complexity}`,
    `agent: ${report.estimate.recommendedAgent}`,
    `blocked: ${report.blocked}`,
  ].join("\n");
  const findings = report.findings
    .filter((finding) => finding.severity !== "info")
    .map((finding) => `${finding.alias}\t${finding.severity}\t${finding.lineCount}\t${finding.path}`)
    .join("\n");
  return findings.length === 0 ? header : `${header}\n${findings}`;
}

export function formatObject(value: Record<string, unknown>): string {
  return Object.entries(value)
    .map(([key, entry]) => `${key}: ${entry ?? ""}`)
    .join("\n");
}

export function formatStatement(statement: Statement): string {
  const subagentLine = statement.subagents.required
    ? `subagents: required ${statement.subagents.pending.map((task) => `${task.id}:${task.owner}`).join(", ")}`
    : `subagents: none${statement.subagents.reason ? ` (${statement.subagents.reason})` : ""}`;
  return [
    `project: ${statement.project.id} ${statement.project.path}`,
    `session: ${statement.session?.id ?? "none"} ${statement.session?.status ?? ""} agent:${statement.session?.agent.state ?? "idle"}`,
    `goal: ${statement.session?.goal ?? ""}`,
    `currentTask: ${statement.currentTask?.id ?? "none"} ${statement.currentTask?.title ?? ""}`,
    `visualScenario: ${statement.visualScenario?.required ? (statement.visualScenario.approved ? "approved" : statement.visualScenario.detail) : "none"}`,
    subagentLine,
    `next: ${statement.nextExpectedAction ?? ""}`,
    `blockers: ${statement.blockers.length}`,
  ].join("\n");
}

export function usageText(): string {
  return [
    "ardex <command> [options]",
    "",
    "Commands:",
    "  init                 Initialize ~/.ardex storage",
    "  start                Start local daemon",
    "  stop                 Stop local daemon",
    "  check                Check daemon health",
    "  status               Show daemon status",
    "  project ls|add|show|current|rename|archive|restore|migrate-codex",
    "  session ls|current|start|set|done",
    "  task ls|add|check|claim|pause|resume|assign|delete|done|events|checklist|<id> scenario|<id> set",
    "  evidence add|ls|<id> accept|reject|check",
    "  ask <question>|ls|<id> answer",
    "  agent-run ls|start|heartbeat|done|fail",
    "  agent-action add|ls|end",
    "  decision ls|add|<id> answer|<id> dismiss",
    "  scale check|report|waive",
    "  statement            Show current session statement",
    "  version              Print version",
    "",
    "Options:",
    "  --json               Print stable JSON envelope",
    "  --no-start           Disable daemon auto-start for commands that support it",
    "  -p, --project <id>   Select project",
  ].join("\n");
}

export function helpData(): Record<string, unknown> {
  return {
    commands: [
      "init",
      "start",
      "stop",
      "check",
      "status",
      "project",
      "session",
      "task",
      "evidence",
      "ask",
      "agent-run",
      "agent-action",
      "decision",
      "scale",
      "statement",
      "version",
    ],
    options: ["--json", "--no-start", "-p <project_id>", "--project <project_id>"],
    version: VERSION,
  };
}

function textField(value: object, key: string): string | null {
  const entry = (value as Record<string, unknown>)[key];
  return typeof entry === "string" ? entry : null;
}

function objectField(value: object, key: string): Record<string, unknown> | null {
  const entry = (value as Record<string, unknown>)[key];
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  return entry as Record<string, unknown>;
}

function numberField(value: object, key: string): number | null {
  const entry = (value as Record<string, unknown>)[key];
  return typeof entry === "number" ? entry : null;
}

function booleanField(value: object, key: string): boolean | null {
  const entry = (value as Record<string, unknown>)[key];
  return typeof entry === "boolean" ? entry : null;
}

function arrayField(value: object, key: string): unknown[] {
  const entry = (value as Record<string, unknown>)[key];
  return Array.isArray(entry) ? entry : [];
}
