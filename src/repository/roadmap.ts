import { Database } from "bun:sqlite";
import { transitionRejected } from "../errors.ts";
import { addTask, requireTask, setTaskField } from "./tasks.ts";
import { latestScaleReport } from "./scale.ts";
import type { Task } from "./types.ts";

export type RoadmapSplit = {
  parentTaskId: string;
  sourceScaleId: string;
  tasks: Task[];
};

export function splitTaskFromScale(db: Database, projectRef: string, taskRef: string): RoadmapSplit {
  const parent = requireTask(db, taskRef);
  const report = latestScaleReport(db, projectRef);
  const suggestedParts = Number(report.estimate.recommendedSplit?.["suggestedParts"] ?? Math.ceil(report.estimate.weight / 8));
  const partCount = Math.max(2, Math.min(8, Number.isFinite(suggestedParts) ? suggestedParts : 2));
  const partWeight = Math.max(1, Math.round((report.estimate.weight / partCount) * 10) / 10);

  if (report.estimate.weight <= 8 && report.estimate.recommendedAgent !== "split") {
    throw transitionRejected("Scale split is only useful for large or split-recommended work.", {
      taskId: parent.alias,
      weight: report.estimate.weight,
      recommendedAgent: report.estimate.recommendedAgent,
    });
  }

  const created: Task[] = [];
  for (let index = 0; index < partCount; index += 1) {
    const task = addTask(db, projectRef, {
      title: `${parent.title} - part ${index + 1}`,
      content: [
        `Generated from scale report ${report.estimate.alias}.`,
        `Parent task: ${parent.alias}.`,
        `Target slice ${index + 1}/${partCount}. Keep implementation bounded and update Ardex state before done.`,
      ].join("\n"),
      priority: parent.priority + index + 1,
      importance: parent.importance,
      qualityGate: parent.qualityGate,
      sessionId: parent.sessionId ?? undefined,
    });
    setTaskField(db, projectRef, task.alias, "estimated_weight", String(partWeight));
    setTaskField(db, projectRef, task.alias, "owner", ownerForSplit(index));
    created.push(requireTask(db, task.alias));
  }

  setTaskField(db, projectRef, parent.alias, "status", "blocked");
  setTaskField(db, projectRef, parent.alias, "content", `${parent.content}\n\nSplit by ${report.estimate.alias} into ${partCount} child tasks.`);

  return {
    parentTaskId: parent.alias,
    sourceScaleId: report.estimate.alias,
    tasks: created,
  };
}

function ownerForSplit(index: number): string {
  return `subagent:worker-${index + 1}`;
}
