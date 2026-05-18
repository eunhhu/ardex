import { enc, post } from "../api.ts";
import { fmtRuntime, pct } from "../format.ts";
import type { TaskSummary } from "../types.ts";
import { MetadataBadge, type Mutate } from "./shared.tsx";

export function TaskItem({ task, projectId, mutate }: { task: TaskSummary; projectId: string; mutate: Mutate }) {
  const level = task.status === "done" ? "good" : task.status === "active" ? "warn" : task.status === "paused" ? "bad" : "";
  return (
    <article class="item">
      <div class="item-head">
        <div class="item-title">{task.priority}. {task.title}</div>
        <span class={`pill metadata-badge metadata-badge--status metadata-badge--state-${task.status} ${level}`}>
          <span class="metadata-badge-label">Status</span>
          <span class="metadata-badge-value">{task.status}</span>
        </span>
      </div>
      <div class="progress" aria-label="progress"><span style={{ width: `${Math.max(0, Math.min(100, Math.round(task.progress * 100)))}%` }} /></div>
      <div class="meta task-meta">
        <MetadataBadge label="ID" value={task.id} tone="id" />
        <MetadataBadge label="Progress" value={pct(task.progress)} tone="progress" state={task.status} />
        <MetadataBadge label="Gate" value={task.qualityGate} tone="gate" state={task.qualityGate} />
        <MetadataBadge label="Owner" value={task.owner} tone="owner" />
        <MetadataBadge label="Runtime" value={fmtRuntime(task.runtimeSeconds)} tone="runtime" />
        {task.estimatedWeight !== null && <MetadataBadge label="Weight" value={task.estimatedWeight} tone="weight" />}
      </div>
      {task.pauseReason && <div class="subvalue">{task.pauseReason}</div>}
      <form class="priority-form" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const priority = Number(form.get("priority"));
        if (Number.isFinite(priority)) void mutate(() => post(`/api/projects/${enc(projectId)}/tasks/${enc(task.id)}/priority`, { priority }));
      }}>
        <label>Priority <input name="priority" type="number" min="1" step="1" defaultValue={task.priority} /></label>
        <button class="secondary" type="submit">Update</button>
      </form>
    </article>
  );
}
