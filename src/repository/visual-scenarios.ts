import { Database } from "bun:sqlite";
import { notFound, transitionRejected } from "../errors.ts";
import { createId, nextAlias } from "../ids.ts";
import { sanitizeEvidencePayload, sanitizeEvidenceSummary } from "../redaction.ts";
import type { Evidence, Project, Task } from "./types.ts";
import { type EvidenceRow, evidenceFromRow } from "./rows.ts";
import { findCurrentSessionId } from "./sessions.ts";

export const VISUAL_SCENARIO_PROMPT_KIND = "visual_scenario_prompt";
export const VISUAL_SCENARIO_CONFIRM_KIND = "visual_scenario_confirm";

export type VisualScenarioState = {
  required: boolean;
  approved: boolean;
  taskId: string;
  promptEvidenceId: string | null;
  imageEvidenceId: string | null;
  pendingEvidenceIds: string[];
  rejectedEvidenceIds: string[];
  prompt: string | null;
  nextAction: string | null;
  detail: string;
};

type ChecklistItem = {
  id: string;
  label: string;
  required: boolean;
  passed: boolean;
  detail: string;
};

export function isVisualScenarioRequired(task: Task): boolean {
  if (task.qualityGate === "visual") {
    return true;
  }
  const uxText = `${task.title}\n${task.content}`;
  return /\b(ui|ux|dashboard|frontend|front-end|screen|layout|interaction|user flow|browser|css)\b/i.test(uxText);
}

export function buildVisualScenarioPrompt(project: Project, task: Task): string {
  const content = task.content.trim().length > 0 ? task.content.trim() : "No additional task content.";
  return [
    "Use case: ui-mockup",
    "Asset type: VDD pre-implementation scenario confirmation for Ardex dashboard Visible Outputs",
    `Primary request: show the expected user-facing result before implementing task ${task.alias}: ${task.title}`,
    `Project context: ${project.name} at ${project.path}`,
    `Scenario details: ${content}`,
    "Style/medium: polished product UI mockup, realistic dashboard screen state, implementation-review fidelity",
    "Composition/framing: desktop dashboard viewport with clear current task, visible output panel, pending approval controls, and concise state indicators",
    "Constraints: no fictional brand logos, no unreadable tiny text, no decorative blobs, no marketing hero layout, no watermark",
    "Output intent: user should be able to approve, reject, or comment on whether this is the expected direction before coding starts.",
  ].join("\n");
}

export function ensureVisualScenarioPrompt(db: Database, project: Project, task: Task, promptOverride?: string): Evidence {
  assertTaskInProject(project, task);
  const existing = visualScenarioEvidence(db, project.id, task.id).find(
    (evidence) => evidence.payload["kind"] === VISUAL_SCENARIO_PROMPT_KIND && evidence.status !== "rejected",
  );
  if (existing !== undefined && promptOverride === undefined) {
    return existing;
  }

  const id = createId();
  const alias = nextAlias(db, "evidence");
  const now = new Date().toISOString();
  const prompt = promptOverride?.trim() || buildVisualScenarioPrompt(project, task);
  const payload = sanitizeEvidencePayload({
    kind: VISUAL_SCENARIO_PROMPT_KIND,
    prompt,
    expectedTool: "imagegen",
    expectedEvidenceType: "generated_image",
    expectedEvidenceKind: VISUAL_SCENARIO_CONFIRM_KIND,
  });
  const summary = sanitizeEvidenceSummary(`Visual scenario prompt for ${task.alias}: ${task.title}`);

  db.query(
    `
      INSERT INTO evidence (
        id, alias, project_id, session_id, target_type, target_id, type, status, summary, payload_json, created_at
      )
      VALUES (?, ?, ?, ?, 'task', ?, 'prototype', 'candidate', ?, ?, ?)
    `,
  ).run(id, alias, project.id, findCurrentSessionId(db, project.id), task.id, summary, JSON.stringify(payload), now);

  return requireEvidenceById(db, id);
}

export function visualScenarioState(db: Database, projectId: string, task: Task): VisualScenarioState {
  const required = isVisualScenarioRequired(task);
  const evidence = visualScenarioEvidence(db, projectId, task.id);
  const promptEvidence = evidence.find((item) => item.payload["kind"] === VISUAL_SCENARIO_PROMPT_KIND && item.status !== "rejected") ?? null;
  const imageEvidence = evidence.filter((item) => item.payload["kind"] === VISUAL_SCENARIO_CONFIRM_KIND && item.type === "generated_image");
  const approvedImage = imageEvidence.find((item) => item.status === "accepted" && hasRenderableSource(item)) ?? null;
  const pendingImages = imageEvidence.filter((item) => item.status === "candidate");
  const rejectedImages = imageEvidence.filter((item) => item.status === "rejected");
  const prompt = typeof promptEvidence?.payload["prompt"] === "string" ? promptEvidence.payload["prompt"] : null;
  const nextAction = !required || approvedImage !== null ? null : promptEvidence === null ? `create_visual_scenario_prompt:${task.alias}` : `confirm_visual_scenario:${task.alias}`;

  return {
    required,
    approved: approvedImage !== null,
    taskId: task.alias,
    promptEvidenceId: promptEvidence?.alias ?? null,
    imageEvidenceId: approvedImage?.alias ?? pendingImages[0]?.alias ?? null,
    pendingEvidenceIds: pendingImages.map((item) => item.alias),
    rejectedEvidenceIds: rejectedImages.map((item) => item.alias),
    prompt,
    nextAction,
    detail: !required
      ? "visual scenario not required"
      : approvedImage !== null
        ? `approved=${approvedImage.alias}`
        : promptEvidence === null
          ? "missing visual scenario prompt"
          : "waiting for approved imagegen scenario",
  };
}

export function visualScenarioChecklistItem(db: Database, projectId: string, task: Task): ChecklistItem {
  const state = visualScenarioState(db, projectId, task);
  return {
    id: "visual_scenario_confirm",
    label: "Visual scenario approved before implementation",
    required: state.required,
    passed: !state.required || state.approved,
    detail: state.detail,
  };
}

export function assertVisualScenarioReadyForClaim(db: Database, projectId: string, task: Task): void {
  const state = visualScenarioState(db, projectId, task);
  if (state.required && !state.approved) {
    throw transitionRejected("Visual scenario approval is required before implementation claim.", {
      taskId: task.alias,
      promptEvidenceId: state.promptEvidenceId,
      pendingEvidenceIds: state.pendingEvidenceIds,
      nextAction: state.nextAction,
    });
  }
}

function visualScenarioEvidence(db: Database, projectId: string, taskId: string): Evidence[] {
  const rows = db
    .query(
      `
        SELECT * FROM evidence
        WHERE project_id = ?
          AND target_type = 'task'
          AND target_id = ?
          AND type IN ('prototype', 'generated_image')
        ORDER BY created_at DESC
      `,
    )
    .all(projectId, taskId) as EvidenceRow[];
  return rows.map(evidenceFromRow);
}

function hasRenderableSource(evidence: Evidence): boolean {
  return typeof evidence.payload["path"] === "string" || typeof evidence.payload["url"] === "string";
}

function assertTaskInProject(project: Project, task: Task): void {
  if (task.projectId !== project.id) {
    throw notFound("Task is not in selected project.", { projectRef: project.alias, taskRef: task.alias });
  }
}

function requireEvidenceById(db: Database, evidenceId: string): Evidence {
  const row = db.query("SELECT * FROM evidence WHERE id = ?").get(evidenceId) as EvidenceRow | null;
  if (row === null) {
    throw notFound("Evidence not found.", { evidenceId });
  }
  return evidenceFromRow(row);
}
