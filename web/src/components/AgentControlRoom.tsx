import { useState } from "preact/hooks";
import { enc, post } from "../api.ts";
import { compactPath, fmtRuntime, pct } from "../format.ts";
import type { AgentActionSummary, AgentRunSummary, DashboardSnapshot, DecisionSummary, OutputSummary } from "../types.ts";
import { Empty, MetadataBadge, Pill, type Mutate } from "./shared.tsx";

export function AgentControlRoom({ snapshot, projectId, mutate }: { snapshot: DashboardSnapshot | null; projectId: string; mutate: Mutate }) {
  const runs = sortRuns(snapshot?.agentRuns ?? []).slice(0, 4);
  const actions = sortRecent(snapshot?.agentActions ?? [], actionTime).slice(0, 6);
  const decisions = snapshot?.decisions ?? [];
  const allOpenDecisions = decisions.filter((decision) => decision.status === "open");
  const openDecisions = sortDecisions(allOpenDecisions).slice(0, 4);
  const resolvedDecisions = decisions.length - allOpenDecisions.length;
  const outputs = sortRecent(snapshot?.outputs ?? [], (output) => output.createdAt);
  const pendingOutputs = outputs.filter((output) => output.needsApproval);

  return (
    <section class="agent-control-room" aria-label="Agent control room">
      <div class="agent-room-head">
        <div>
          <h2>Agent Control Room</h2>
          <div class="agent-room-subhead">{runs.length} agents · {actions.length} timeline items · {openDecisions.length} decisions</div>
        </div>
        <div class="agent-room-metrics">
          <span class={`pill ${runs.some((run) => run.status === "running") ? "good" : ""}`}>{runs.filter((run) => run.status === "running").length} running</span>
          <span class={`pill ${allOpenDecisions.length > 0 ? "warn" : "good"}`}>{allOpenDecisions.length} open</span>
          <span class={`pill ${pendingOutputs.length > 0 ? "warn" : ""}`}>{pendingOutputs.length} outputs pending</span>
        </div>
      </div>

      <OutputBridge outputs={outputs} pendingCount={pendingOutputs.length} />

      <div class="agent-room-columns">
        <section class="agent-room-panel agent-runs-panel">
          <PanelHead title="Agent Grid" count={String(snapshot?.agentRuns.length ?? 0)} />
          <div class="agent-run-grid">
            {runs.length === 0 ? <Empty text="No agent runs." /> : runs.map((run) => <AgentRunCard key={run.id} run={run} />)}
          </div>
        </section>

        <section class="agent-room-panel agent-timeline-panel">
          <PanelHead title="Live Timeline" count={String(snapshot?.agentActions.length ?? 0)} />
          {actions.length === 0 ? <Empty text="No actions yet." /> : <ActionTimeline actions={actions} />}
        </section>

        <section class="agent-room-panel decision-queue-panel">
          <PanelHead title="Decision Queue" count={`${allOpenDecisions.length} open${resolvedDecisions > 0 ? ` · ${resolvedDecisions} resolved` : ""}`} />
          {openDecisions.length === 0 ? (
            <Empty text="No open decisions." />
          ) : (
            <div class="decision-list">
              {openDecisions.map((decision) => (
                <DecisionCard key={decision.id} decision={decision} projectId={projectId} mutate={mutate} />
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function PanelHead({ title, count }: { title: string; count: string }) {
  return (
    <div class="agent-panel-head">
      <h3>{title}</h3>
      <span class="muted">{count}</span>
    </div>
  );
}

function AgentRunCard({ run }: { run: AgentRunSummary }) {
  const task = run.taskRef ? `Task ${run.taskRef}` : "No task";
  const detail = run.summary || run.goal || run.branchName || run.worktreePath || "";
  return (
    <article class="agent-run-card">
      <div class="agent-card-top">
        <div>
          <strong>{run.role || run.owner || run.id}</strong>
          <span>{task}</span>
        </div>
        <span class={`pill ${statusLevel(run.status)}`}>{run.status || "unknown"}</span>
      </div>
      {detail && <div class="agent-card-detail">{detail}</div>}
      <div class="agent-card-meta">
        <MetadataBadge label="ID" value={run.id} tone="id" />
        {run.model && <MetadataBadge label="Model" value={run.model} tone="type" />}
        {run.pid !== null && <MetadataBadge label="PID" value={run.pid} tone="runtime" />}
        <MetadataBadge label="Seen" value={relativeTime(run.lastSeenAt || run.updatedAt)} tone="time" />
      </div>
    </article>
  );
}

function ActionTimeline({ actions }: { actions: AgentActionSummary[] }) {
  return (
    <ol class="agent-timeline">
      {actions.map((action) => (
        <li class="agent-timeline-item" key={action.id}>
          <div class="agent-timeline-marker" aria-hidden="true" />
          <div class="agent-timeline-content">
            <div class="agent-timeline-title">
              <strong>{action.title || action.summary || action.kind || action.id}</strong>
              <span class={`pill ${statusLevel(action.status)}`}>{action.status || "unknown"}</span>
            </div>
            {action.summary && action.title && <div class="agent-card-detail">{action.summary}</div>}
            <div class="agent-card-meta">
              <MetadataBadge label="Seq" value={action.sequence} tone="id" />
              {(action.kind || action.type) && <MetadataBadge label="Kind" value={action.kind || action.type || ""} tone="type" />}
              {action.taskRef && <MetadataBadge label="Task" value={action.taskRef} tone="task" />}
              {action.progress !== null && <MetadataBadge label="Progress" value={pct(action.progress)} tone="progress" state={action.status} />}
              <MetadataBadge label="Time" value={relativeTime(actionTime(action))} tone="time" />
            </div>
            {(action.currentFile || action.command) && (
              <div class="agent-action-source mono">{action.currentFile ? compactPath(action.currentFile) : action.command}</div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function DecisionCard({ decision, projectId, mutate }: { decision: DecisionSummary; projectId: string; mutate: Mutate }) {
  const [answer, setAnswer] = useState("");
  const [dismissReason, setDismissReason] = useState("");
  const submitAnswer = (value: string) => {
    const clean = value.trim();
    if (!projectId || !clean) return;
    void mutate(() => post(`/api/projects/${enc(projectId)}/decisions/${enc(decision.id)}/answer`, { answer: clean }));
    setAnswer("");
  };
  const dismissDecision = () => {
    if (!projectId) return;
    void mutate(() => post(`/api/projects/${enc(projectId)}/decisions/${enc(decision.id)}/dismiss`, { reason: dismissReason.trim() || undefined }));
    setDismissReason("");
  };

  return (
    <article class={`decision-card ${decision.required ? "required" : ""}`}>
      <div class="decision-card-top">
        <div>
          <strong>{decision.question}</strong>
          {decision.context && <span>{decision.context}</span>}
        </div>
        <span class={`pill ${decision.required ? "warn" : ""}`}>{decision.required ? "required" : `p${decision.priority}`}</span>
      </div>
      <div class="agent-card-meta">
        <MetadataBadge label="ID" value={decision.id} tone="id" />
        {decision.type && <MetadataBadge label="Type" value={decision.type} tone="type" />}
        {decision.taskRef && <MetadataBadge label="Task" value={decision.taskRef} tone="task" />}
        {decision.agentRunRef && <MetadataBadge label="Run" value={decision.agentRunRef} tone="owner" />}
      </div>
      {decision.options.length > 0 && (
        <div class="decision-options">
          {decision.options.map((option) => (
            <button
              key={option.id}
              type="button"
              class={`secondary decision-option ${option.id === decision.recommendedOption ? "recommended" : ""}`}
              title={option.consequence || option.description || option.id}
              onClick={() => submitAnswer(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      <form class="decision-answer-form" onSubmit={(event) => { event.preventDefault(); submitAnswer(answer); }}>
        <input value={answer} onInput={(event) => setAnswer(event.currentTarget.value)} autoComplete="off" placeholder="Answer" />
        <button type="submit">Answer</button>
      </form>
      <form class="decision-dismiss-form" onSubmit={(event) => { event.preventDefault(); dismissDecision(); }}>
        <input value={dismissReason} onInput={(event) => setDismissReason(event.currentTarget.value)} autoComplete="off" placeholder="Dismiss reason" />
        <button class="secondary" type="submit">Dismiss</button>
      </form>
    </article>
  );
}

function OutputBridge({ outputs, pendingCount }: { outputs: OutputSummary[]; pendingCount: number }) {
  const latest = outputs[0] ?? null;
  return (
    <div class="agent-output-bridge" aria-label="Visible outputs summary">
      <span class="agent-output-title">Visible Outputs</span>
      <span class={`pill ${pendingCount > 0 ? "warn" : outputs.length > 0 ? "good" : ""}`}>{pendingCount > 0 ? `${pendingCount} pending approval` : `${outputs.length} total`}</span>
      {latest ? (
        <span class="agent-output-latest">
          <span>{latest.id}</span>
          {latest.summary}
        </span>
      ) : (
        <span class="muted">No outputs yet.</span>
      )}
    </div>
  );
}

function sortRuns(runs: AgentRunSummary[]) {
  return [...runs].sort((left, right) => {
    const statusDelta = runStatusRank(left.status) - runStatusRank(right.status);
    return statusDelta === 0 ? timestamp(right.lastSeenAt || right.updatedAt) - timestamp(left.lastSeenAt || left.updatedAt) : statusDelta;
  });
}

function sortDecisions(decisions: DecisionSummary[]) {
  return [...decisions].sort((left, right) => {
    if (left.required !== right.required) return left.required ? -1 : 1;
    if (left.priority !== right.priority) return right.priority - left.priority;
    return timestamp(right.createdAt) - timestamp(left.createdAt);
  });
}

function sortRecent<T>(items: T[], dateFor: (item: T) => string | null | undefined) {
  return [...items].sort((left, right) => timestamp(dateFor(right)) - timestamp(dateFor(left)));
}

function actionTime(action: AgentActionSummary) {
  return action.endedAt || action.completedAt || action.updatedAt || action.createdAt;
}

function runStatusRank(status: string) {
  return ["running", "blocked", "merging", "verifying", "queued", "failed", "completed", "cancelled"].indexOf(status) < 0
    ? 8
    : ["running", "blocked", "merging", "verifying", "queued", "failed", "completed", "cancelled"].indexOf(status);
}

function statusLevel(status: string) {
  if (["completed", "answered", "accepted"].includes(status)) return "good";
  if (["failed", "cancelled", "dismissed", "rejected"].includes(status)) return "bad";
  if (status) return "warn";
  return "";
}

function relativeTime(value: string | null | undefined) {
  const then = timestamp(value);
  if (then === 0) return "unknown";
  return `${fmtRuntime(Math.round(Math.max(0, Date.now() - then) / 1000))} ago`;
}

function timestamp(value: string | null | undefined) {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(time) ? 0 : time;
}
