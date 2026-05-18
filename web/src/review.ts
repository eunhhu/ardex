import { compactPath, pct } from "./format.ts";
import type { AskSummary, DashboardSnapshot, ScaleReportSummary, SessionSummary, TaskSummary } from "./types.ts";

export type CurrentTaskSummary = NonNullable<NonNullable<DashboardSnapshot["statement"]>["currentTask"]>;

export type Review = {
  level: string;
  levelDetail: string;
  progress: string;
  progressDetail: string;
  readiness: string;
  readinessDetail: string;
  nextAction: string;
};

export function currentSession(data: DashboardSnapshot | null): SessionSummary | null {
  const statementSession = data?.statement?.session || null;
  const fallback = data?.sessions[0] || null;
  return statementSession ? { ...fallback, ...statementSession } : fallback;
}

export function currentTask(data: DashboardSnapshot | null, session: SessionSummary | null): TaskSummary | CurrentTaskSummary | null {
  if (data?.statement?.currentTask) return data.statement.currentTask;
  return data?.tasks.find((task) => task.id === session?.currentTaskRef) || null;
}

export function projectReview(data: DashboardSnapshot, session: SessionSummary | null, activeTask: TaskSummary | CurrentTaskSummary | null, latestScale: ScaleReportSummary | null, openAsks: AskSummary[], blockingFindings: number): Review {
  const totalTasks = data.tasks.length;
  const doneTasks = data.tasks.filter((task) => task.status === "done").length;
  const activeTasks = data.tasks.filter((task) => task.status === "active").length;
  const blockedTasks = data.tasks.filter((task) => task.status === "blocked" || task.status === "paused").length;
  const progressValue = totalTasks === 0 ? 0 : data.tasks.reduce((sum, task) => sum + Number(task.progress || 0), 0) / totalTasks;
  const scaleClear = latestScale ? !latestScale.blocked && blockingFindings === 0 : false;
  const checklistClear = totalTasks > 0 && data.tasks.every((task) => task.status === "done" || task.checklistPassed);
  const hasVisibleOutput = data.outputs.length > 0;
  const readinessBlocked = openAsks.length > 0 || blockedTasks > 0 || blockingFindings > 0 || latestScale?.blocked === true;
  return {
    level: implementationLevel({ totalTasks, doneTasks, activeTasks, hasVisibleOutput, scaleClear, openAsks, blockedTasks }),
    levelDetail: [data.project?.name, session?.status || "no session", session?.mode || "no mode"].filter(Boolean).join(" · "),
    progress: pct(progressValue),
    progressDetail: `${doneTasks}/${totalTasks} done · ${activeTasks} active · ${blockedTasks} blocked`,
    readiness: readinessBlocked ? "Blocked" : checklistClear && scaleClear ? "Production-ready" : activeTask ? "In progress" : "Needs review",
    readinessDetail: latestScale ? `scale ${latestScale.estimate.weight} · asks ${openAsks.length} · outputs ${data.outputs.length}` : `scale missing · asks ${openAsks.length}`,
    nextAction: data.statement?.nextExpectedAction || (session ? "review_session" : "start_session"),
  };
}

function implementationLevel(input: { totalTasks: number; doneTasks: number; activeTasks: number; hasVisibleOutput: boolean; scaleClear: boolean; openAsks: AskSummary[]; blockedTasks: number }): string {
  if (input.totalTasks === 0) return "Planning";
  if (input.openAsks.length > 0 || input.blockedTasks > 0) return "Blocked";
  if (input.doneTasks === input.totalTasks && input.scaleClear) return "Production-ready";
  if (input.hasVisibleOutput && input.activeTasks === 0) return "Reviewable build";
  if (input.hasVisibleOutput) return "Working demo";
  if (input.activeTasks > 0) return "Implementation";
  return "Spec only";
}

export function focusDetail(snapshot: DashboardSnapshot | null): string {
  return compactPath(snapshot?.project?.path ?? "");
}
