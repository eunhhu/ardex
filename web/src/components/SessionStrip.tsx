import { fmtRuntime } from "../format.ts";
import type { CurrentTaskSummary } from "../review.ts";
import type { DashboardSnapshot, SessionSummary, TaskSummary } from "../types.ts";

export function SessionStrip({ snapshot, session, task }: { snapshot: DashboardSnapshot | null; session: SessionSummary | null; task: TaskSummary | CurrentTaskSummary | null }) {
  if (!snapshot?.project) {
    return (
      <div class="session-strip" aria-label="Session status">
        <span class="strip-state idle"><span class="strip-value">Idle</span></span>
        <span class="strip-item"><b>Session</b><span class="strip-value">none</span></span>
        <span class="strip-item"><b>Goal</b><span class="strip-value">no project</span></span>
      </div>
    );
  }
  const agent = session?.agent || snapshot.statement?.session?.agent || { state: "idle", staleSeconds: null };
  const running = agent.state === "running";
  const seen = typeof agent.staleSeconds === "number" ? ` · seen ${fmtRuntime(agent.staleSeconds)} ago` : "";
  const taskText = task ? `${task.id} · ${task.title}` : snapshot.statement?.nextExpectedAction || "No current task";
  return (
    <div class="session-strip" aria-label="Session status">
      <span class={`strip-state ${running ? "running" : "idle"}`}><span class="strip-value">{running ? "Running" : "Idle"}{seen}</span></span>
      <span class="strip-item"><b>Session</b><span class="strip-value">{session?.status || "none"}</span></span>
      <span class="strip-item strip-goal"><b>Goal</b><span class="strip-value">{session?.goal || "No active goal"}</span></span>
      <span class="strip-item strip-task"><b>Task</b><span class="strip-value">{taskText}</span></span>
      <span class="strip-item"><b>Runtime</b><span class="strip-value">{fmtRuntime(session?.runtimeSeconds ?? task?.runtimeSeconds ?? 0)}</span></span>
    </div>
  );
}
