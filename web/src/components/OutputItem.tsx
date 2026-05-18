import { useState } from "preact/hooks";
import { enc, post } from "../api.ts";
import type { OutputSummary } from "../types.ts";
import { Pill, type Mutate } from "./shared.tsx";

type OutputItemMode = "preview" | "list";

export function OutputItem({ output, projectId, mutate, mode = "preview" }: { output: OutputSummary; projectId: string; mutate: Mutate; mode?: OutputItemMode }) {
  const [comment, setComment] = useState("");
  const source = output.url || output.path || "";
  const previewSource = output.previewUrl || source;
  const level = output.status === "accepted" ? "good" : output.status === "rejected" ? "bad" : "warn";
  const review = (action: "accept" | "reject") => mutate(() => post(`/api/projects/${enc(projectId)}/evidence/${enc(output.id)}/${action}`, { comment }));
  const label = output.visualScenario ? `scenario ${output.status}` : output.format;
  return (
    <article class={`item output-item output-${mode} ${output.visualScenario ? "visual-scenario" : ""}`}>
      <div class="item-head"><div class="item-title">{output.summary}</div><span class={`pill ${level}`}>{label}</span></div>
      {mode === "preview" && <OutputPreview output={output} source={previewSource} />}
      <div class="meta"><Pill value={output.id} /><Pill value={output.type} />{output.taskRef && <Pill value={`task ${output.taskRef}`} />}</div>
      <div class="subvalue">{output.url ? <a href={output.url} target="_blank" rel="noreferrer">{output.url}</a> : <span class="mono">{output.path}</span>}</div>
      {output.visualScenario && output.prompt && <details><summary>Scenario prompt</summary><pre class="mono">{output.prompt}</pre></details>}
      {output.reviewComment && <div class="subvalue">Review: {output.reviewComment}</div>}
      {output.needsApproval && (
        <form class="output-review-form" onSubmit={(event) => event.preventDefault()}>
          <input value={comment} onInput={(event) => setComment(event.currentTarget.value)} autoComplete="off" placeholder="Approval note or rejection reason" />
          <button type="button" onClick={() => void review("accept")}>Approve</button>
          <button type="button" class="secondary" onClick={() => void review("reject")}>Reject</button>
        </form>
      )}
    </article>
  );
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
