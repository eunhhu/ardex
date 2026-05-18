import { useState } from "preact/hooks";
import { fmtRuntime, pct } from "../format.ts";
import { focusDetail, type CurrentTaskSummary, type Review } from "../review.ts";
import type { DashboardSnapshot, SessionSummary, TaskSummary } from "../types.ts";

export function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article class="summary-card">
      <div class="label">{label}</div>
      <div class="value">{value}</div>
      <div class="subvalue">{detail}</div>
    </article>
  );
}

export function FocusCard({ snapshot, session, task, review, onStart }: { snapshot: DashboardSnapshot | null; session: SessionSummary | null; task: TaskSummary | CurrentTaskSummary | null; review: Review | null; onStart: (goal: string) => void }) {
  const [goal, setGoal] = useState("");
  if (!session) {
    return (
      <>
        <div class="label">Current Focus</div>
        <div class="value">No session</div>
        <form class="stack-form" onSubmit={(event) => { event.preventDefault(); onStart(goal); setGoal(""); }}>
          <input value={goal} onInput={(event) => setGoal(event.currentTarget.value)} placeholder="Goal" />
          <button type="submit">Start</button>
        </form>
      </>
    );
  }
  return (
    <>
      <div class="label">Current Focus</div>
      <div class="value">{task ? `${task.id} · ${task.title}` : review?.nextAction}</div>
      <div class="subvalue">{task ? `${pct(task.progress)} · ${task.owner} · ${fmtRuntime(task.runtimeSeconds)}` : session.goal || focusDetail(snapshot)}</div>
    </>
  );
}
