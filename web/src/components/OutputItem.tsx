import { useState } from "preact/hooks";
import { enc, post } from "../api.ts";
import type { OutputSummary } from "../types.ts";
import { Pill, type Mutate } from "./shared.tsx";

type OutputItemMode = "preview" | "compact";

export function OutputItem({ output, projectId, mutate, mode = "preview" }: { output: OutputSummary; projectId: string; mutate: Mutate; mode?: OutputItemMode }) {
  const [comment, setComment] = useState("");
  const source = output.url || output.path || "";
  const previewSource = output.previewUrl || source;
  const level = output.status === "accepted" ? "good" : output.status === "rejected" ? "bad" : "warn";
  const review = (action: "accept" | "reject") => mutate(() => post(`/api/projects/${enc(projectId)}/evidence/${enc(output.id)}/${action}`, { comment }));
  const label = output.visualScenario ? `scenario ${output.status}` : output.format;
  const createdAt = formatOutputTime(output.createdAt);

  if (mode === "compact") {
    return (
      <details class={`item output-item output-compact ${output.visualScenario ? "visual-scenario" : ""}`}>
        <summary class="output-compact-summary">
          <span class="output-compact-title">{output.summary}</span>
          <span class="output-compact-meta">
            <span class={`pill ${level}`}>{label}</span>
            {output.taskRef && <span class="pill">task {output.taskRef}</span>}
            <span class="pill">{createdAt}</span>
            <span class="output-expand">Expand</span>
          </span>
        </summary>
        <OutputDetails output={output} source={previewSource} comment={comment} setComment={setComment} review={review} />
      </details>
    );
  }

  return (
    <article class={`item output-item output-preview ${output.visualScenario ? "visual-scenario" : ""}`}>
      <div class="item-head"><div class="item-title">{output.summary}</div><span class={`pill ${level}`}>{label}</span></div>
      <OutputDetails output={output} source={previewSource} comment={comment} setComment={setComment} review={review} />
    </article>
  );
}

function OutputDetails({
  output,
  source,
  comment,
  setComment,
  review,
}: {
  output: OutputSummary;
  source: string;
  comment: string;
  setComment: (value: string) => void;
  review: (action: "accept" | "reject") => Promise<void>;
}) {
  return (
    <div class="output-details">
      <OutputPreview output={output} source={source} />
      <div class="meta"><Pill value={output.id} /><Pill value={output.type} />{output.taskRef && <Pill value={`task ${output.taskRef}`} />}<Pill value={formatOutputTime(output.createdAt)} /></div>
      <div class="subvalue">{output.url ? <a href={output.url} target="_blank" rel="noreferrer">{output.url}</a> : <span class="mono">{output.path}</span>}</div>
      {output.visualScenario && output.status === "accepted" && <div class="visual-state accepted">Approved visual scenario</div>}
      {output.visualScenario && output.prompt && <details><summary>Scenario prompt</summary><pre class="mono">{output.prompt}</pre></details>}
      {output.reviewComment && <div class="subvalue">Review: {output.reviewComment}</div>}
      {output.needsApproval && (
        <form class="output-review-form" onSubmit={(event) => event.preventDefault()}>
          <input value={comment} onInput={(event) => setComment(event.currentTarget.value)} autoComplete="off" placeholder="Approval note or rejection reason" />
          <button type="button" onClick={() => void review("accept")}>Approve</button>
          <button type="button" class="secondary" onClick={() => void review("reject")}>Reject</button>
        </form>
      )}
    </div>
  );
}

function formatOutputTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function OutputPreview({ output, source }: { output: OutputSummary; source: string }) {
  if (output.renderableImage && source) {
    return <img class="output-img" alt="" src={source} />;
  }
  if (output.format === "html" && output.html) {
    return <iframe class="output-frame" title={output.summary} sandbox="" srcDoc={output.html} />;
  }
  if (output.format === "markdown" && output.markdown) {
    return <pre class="output-text output-markdown">{output.markdown}</pre>;
  }
  if (output.format === "text" && output.text) {
    return <pre class="output-text">{output.text}</pre>;
  }
  if (output.format === "link" && output.url) {
    return <a class="output-link-preview" href={output.url} target="_blank" rel="noreferrer">{output.url}</a>;
  }
  if ((output.format === "file" || output.kind === "artifact") && source) {
    return <div class="output-file-preview"><span class="mono">{source}</span></div>;
  }
  return null;
}
