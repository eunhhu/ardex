import type { OutputSummary } from "../types.ts";
import { OutputItem } from "./OutputItem.tsx";
import { Empty, type Mutate } from "./shared.tsx";

export function VisibleOutputsPanel({ outputs, projectId, mutate }: { outputs: OutputSummary[]; projectId: string; mutate: Mutate }) {
  if (outputs.length === 0) {
    return <Empty text="No demo, screenshot, generated image, or browser result yet." />;
  }

  const newestFirst = [...outputs].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  const pendingScenarios = newestFirst.filter((output) => output.visualScenario && output.needsApproval);
  const pendingIds = new Set(pendingScenarios.map((output) => output.id));
  const acceptedPreviews = newestFirst.filter((output) => output.status === "accepted" && !pendingIds.has(output.id)).slice(0, 2);
  const previewIds = new Set([...pendingScenarios, ...acceptedPreviews].map((output) => output.id));
  const folded = newestFirst.filter((output) => !previewIds.has(output.id));

  return (
    <div class="visible-outputs">
      <div class="visible-output-previews">
        {[...pendingScenarios, ...acceptedPreviews].map((output) => (
          <OutputItem key={output.id} output={output} projectId={projectId} mutate={mutate} mode="preview" />
        ))}
      </div>
      {folded.length > 0 && (
        <details class="folded-outputs">
          <summary>Processed outputs <span class="muted">{folded.length}</span></summary>
          <div class="folded-output-list">
            {folded.map((output) => (
              <OutputItem key={output.id} output={output} projectId={projectId} mutate={mutate} mode="list" />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
