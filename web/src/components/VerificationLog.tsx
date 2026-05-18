import { enc, post } from "../api.ts";
import type { EvidenceSummary } from "../types.ts";
import { Empty, Pill, type Mutate } from "./shared.tsx";

export function VerificationLog({ evidence, projectId, mutate }: { evidence: EvidenceSummary[]; projectId: string; mutate: Mutate }) {
  if (evidence.length === 0) {
    return <details class="verification-log"><summary>No verification receipts yet</summary><Empty text="Agent receipts will appear here when external artifacts, user decisions, or manual QA notes are attached." /></details>;
  }
  const accepted = evidence.filter((item) => item.status === "accepted").length;
  const candidates = evidence.filter((item) => item.status === "candidate").length;
  return (
    <details class="verification-log">
      <summary>{accepted} accepted · {candidates} pending · {evidence.length} total</summary>
      {evidence.map((item) => <EvidenceItem key={item.id} evidence={item} projectId={projectId} mutate={mutate} />)}
    </details>
  );
}

function EvidenceItem({ evidence, projectId, mutate }: { evidence: EvidenceSummary; projectId: string; mutate: Mutate }) {
  const level = evidence.status === "accepted" ? "good" : evidence.status === "rejected" ? "bad" : "warn";
  return (
    <article class="item">
      <div class="item-head"><div class="item-title">{evidence.summary}</div><span class={`pill ${level}`}>{evidence.status}</span></div>
      <div class="meta"><Pill value={evidence.id} /><Pill value={evidence.type} /><Pill value={evidence.targetType + (evidence.targetRef ? `:${evidence.targetRef}` : "")} /></div>
      <details><summary>Payload</summary><pre class="mono">{JSON.stringify(evidence.payload || {}, null, 2)}</pre></details>
      {evidence.status === "candidate" && (
        <div class="actions">
          <button type="button" onClick={() => void mutate(() => post(`/api/projects/${enc(projectId)}/evidence/${enc(evidence.id)}/accept`, {}))}>Accept</button>
          <button type="button" class="secondary" onClick={() => void mutate(() => post(`/api/projects/${enc(projectId)}/evidence/${enc(evidence.id)}/reject`, {}))}>Reject</button>
        </div>
      )}
    </article>
  );
}
