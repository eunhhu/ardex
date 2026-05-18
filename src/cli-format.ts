import { VERSION } from "./output.ts";
import type {
  Ask,
  Evidence,
  FileScaleFinding,
  ProductionChecklist,
  Project,
  ScaleEstimate,
  ScaleReport,
  Session,
  Statement,
  Task,
  TaskEvent,
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
  return [
    `project: ${statement.project.id} ${statement.project.path}`,
    `session: ${statement.session?.id ?? "none"} ${statement.session?.status ?? ""}`,
    `goal: ${statement.session?.goal ?? ""}`,
    `currentTask: ${statement.currentTask?.id ?? "none"} ${statement.currentTask?.title ?? ""}`,
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
    "  task ls|add|check|claim|pause|resume|assign|delete|done|events|checklist|<id> set",
    "  evidence add|ls|<id> accept|reject|check",
    "  ask <question>|ls|<id> answer",
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
    commands: ["init", "start", "stop", "check", "status", "project", "session", "task", "evidence", "ask", "scale", "statement", "version"],
    options: ["--json", "--no-start", "-p <project_id>", "--project <project_id>"],
    version: VERSION,
  };
}
