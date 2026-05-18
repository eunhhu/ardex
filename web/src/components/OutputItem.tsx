import { useState } from "preact/hooks";
import { enc, post } from "../api.ts";
import type { OutputSummary } from "../types.ts";
import { Pill, type Mutate } from "./shared.tsx";

export function OutputItem({ output, projectId, mutate }: { output: OutputSummary; projectId: string; mutate: Mutate }) {
  const [comment, setComment] = useState("");
  const source = output.url || output.path || "";
  const previewSource = output.previewUrl || source;
  const level = output.status === "accepted" ? "good" : output.status === "rejected" ? "bad" : "warn";
  const review = (action: "accept" | "reject") => mutate(() => post(`/api/projects/${enc(projectId)}/evidence/${enc(output.id)}/${action}`, { comment }));
  return (
    <article class={`item output-item ${output.visualScenario ? "visual-scenario" : ""}`}>
      {output.renderableImage && <img class="output-img" alt="" src={previewSource} />}
      <div class="item-head"><div class="item-title">{output.summary}</div><span class={`pill ${level}`}>{output.visualScenario ? `scenario ${output.status}` : output.type}</span></div>
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
