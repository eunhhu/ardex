import { useState } from "preact/hooks";
import { enc, post } from "../api.ts";
import type { ScaleReportSummary } from "../types.ts";
import { Empty, Pill, type Mutate } from "./shared.tsx";

export function ScalePanel({ report, projectId, mutate }: { report: ScaleReportSummary | null; projectId: string; mutate: Mutate }) {
  const [paths, setPaths] = useState("src,web");
  const [taskId, setTaskId] = useState("");
  return (
    <>
      <form class="scale-form" onSubmit={(event) => {
        event.preventDefault();
        const pathList = paths.split(",").map((item) => item.trim()).filter(Boolean);
        void mutate(() => post(`/api/projects/${enc(projectId)}/scale/check`, { paths: pathList }));
      }}>
        <input value={paths} onInput={(event) => setPaths(event.currentTarget.value)} />
        <button type="submit">Run</button>
      </form>
      <form class="scale-form" onSubmit={(event) => {
        event.preventDefault();
        if (taskId) void mutate(() => post(`/api/projects/${enc(projectId)}/scale/split`, { taskId }));
      }}>
        <input value={taskId} onInput={(event) => setTaskId(event.currentTarget.value)} placeholder="Task to split" />
        <button type="submit">Split</button>
      </form>
      {!report ? (
        <Empty text="No scale report." />
      ) : (
        <>
          <article class="item">
            <div class="item-head"><div class="item-title">{report.estimate.id} · weight {report.estimate.weight}</div><span class={`pill ${report.blocked ? "bad" : "good"}`}>{report.blocked ? "blocked" : "clear"}</span></div>
            <div class="meta"><Pill value={report.estimate.complexity} /><Pill value={report.estimate.recommendedAgent} /><Pill value={`context ${report.estimate.contextRisk.toFixed(2)}`} /></div>
            <div class="subvalue mono">{report.estimate.basis}</div>
          </article>
          {report.findings.filter((finding) => finding.severity !== "info").map((finding) => <FindingItem key={finding.id} finding={finding} projectId={projectId} mutate={mutate} />)}
        </>
      )}
    </>
  );
}

function FindingItem({ finding, projectId, mutate }: { finding: ScaleReportSummary["findings"][number]; projectId: string; mutate: Mutate }) {
  const [reason, setReason] = useState("");
  const level = finding.severity === "block" ? "bad" : finding.severity === "warn" ? "warn" : "";
  return (
    <article class="item">
      <div class="item-head"><div class="item-title mono">{finding.path}</div><span class={`pill ${level}`}>{finding.severity}</span></div>
      <div class="meta"><Pill value={finding.id} /><Pill value={`${finding.lineCount} lines`} /><Pill value={finding.role} />{finding.waivedAt && <Pill value="waived" />}</div>
      <div class="subvalue">{finding.recommendation}</div>
      {finding.severity === "block" && !finding.waivedAt && (
        <form class="waive-form" onSubmit={(event) => {
          event.preventDefault();
          if (reason) void mutate(() => post(`/api/projects/${enc(projectId)}/scale/findings/${enc(finding.id)}/waive`, { reason }));
        }}>
          <input value={reason} onInput={(event) => setReason(event.currentTarget.value)} placeholder="Waiver reason" />
          <button type="submit">Waive</button>
        </form>
      )}
    </article>
  );
}
