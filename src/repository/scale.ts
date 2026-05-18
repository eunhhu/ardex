import { Database } from "bun:sqlite";
import { notFound, scaleBlocked, scaleSplitRequired, usageError } from "../errors.ts";
import { createId, nextAlias } from "../ids.ts";
import type { ScaleScanResult } from "../scale.ts";
import { requireProject } from "./projects.ts";
import { findCurrentSessionId, syncSessionWorkflow } from "./sessions.ts";
import {
  type FileScaleFinding,
  type ScaleEstimate,
  type ScaleReport,
} from "./types.ts";
import {
  type FileScaleFindingRow,
  type ScaleEstimateRow,
  fileScaleFindingFromRow,
  scaleEstimateFromRow,
} from "./rows.ts";

export function storeScaleReport(db: Database, projectRef: string, scan: ScaleScanResult): ScaleReport {
  const project = requireProject(db, projectRef);
  const sessionId = findCurrentSessionId(db, project.id);
  const now = new Date().toISOString();
  const estimateId = createId();
  const estimateAlias = nextAlias(db, "scale_estimates");

  db.exec("BEGIN;");
  try {
    db.query(
      `
        INSERT INTO scale_estimates (
          id, alias, project_id, session_id, target_type, target_id, weight, complexity,
          context_risk, modularity_risk, recommended_agent, recommended_split_json,
          basis, created_by, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'heuristic', ?)
      `,
    ).run(
      estimateId,
      estimateAlias,
      project.id,
      sessionId,
      scan.estimate.targetType,
      scan.estimate.targetId,
      scan.estimate.weight,
      scan.estimate.complexity,
      scan.estimate.contextRisk,
      scan.estimate.modularityRisk,
      scan.estimate.recommendedAgent,
      scan.estimate.recommendedSplit === null ? null : JSON.stringify(scan.estimate.recommendedSplit),
      scan.estimate.basis,
      now,
    );

    for (const file of scan.files) {
      db.query(
        `
          INSERT INTO file_scale_findings (
            id, alias, project_id, path, line_count, byte_count, content_hash, mtime_ms,
            role, severity, reason, recommendation, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        createId(),
        nextAlias(db, "file_scale_findings"),
        project.id,
        file.path,
        file.lineCount,
        file.byteCount,
        file.contentHash,
        file.mtimeMs,
        file.role,
        file.severity,
        file.reason,
        file.recommendation,
        now,
      );
    }
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }

  syncSessionWorkflow(db, project.alias, "scale_checked");
  return latestScaleReport(db, project.alias);
}

export function latestScaleReport(db: Database, projectRef: string): ScaleReport {
  const project = requireProject(db, projectRef);
  const estimateRow = db
    .query("SELECT * FROM scale_estimates WHERE project_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(project.id) as ScaleEstimateRow | null;
  if (estimateRow === null) {
    throw notFound("No scale report found.", { projectRef });
  }
  const findingRows = db
    .query("SELECT * FROM file_scale_findings WHERE project_id = ? AND created_at = ? ORDER BY severity DESC, path ASC")
    .all(project.id, estimateRow.created_at) as FileScaleFindingRow[];
  return {
    estimate: scaleEstimateFromRow(estimateRow),
    findings: findingRows.map(fileScaleFindingFromRow),
    blocked: activeBlockingFindings(db, project.id).length > 0 || estimateRow.weight > 13,
  };
}

export function listScaleReports(db: Database, projectRef: string): ScaleEstimate[] {
  const project = requireProject(db, projectRef);
  const rows = db
    .query("SELECT * FROM scale_estimates WHERE project_id = ? ORDER BY created_at DESC")
    .all(project.id) as ScaleEstimateRow[];
  return rows.map(scaleEstimateFromRow);
}

export function waiveScaleFinding(db: Database, projectRef: string, findingRef: string, reason: string): FileScaleFinding {
  if (reason.trim().length < 20) {
    throw usageError("Scale waiver reason must be at least 20 characters.", { reasonLength: reason.trim().length });
  }
  const project = requireProject(db, projectRef);
  const finding = requireFileScaleFinding(db, findingRef);
  if (finding.projectId !== project.id) {
    throw notFound("Scale finding is not in selected project.", { findingRef });
  }
  const now = new Date().toISOString();
  db.query("UPDATE file_scale_findings SET waived_at = ?, waived_reason = ?, waiver_hash = ? WHERE id = ?").run(
    now,
    reason,
    finding.contentHash,
    finding.id,
  );
  return requireFileScaleFinding(db, finding.id);
}

export function requireFileScaleFinding(db: Database, findingRef: string): FileScaleFinding {
  const row = db.query("SELECT * FROM file_scale_findings WHERE id = ? OR alias = ?").get(findingRef, findingRef) as FileScaleFindingRow | null;
  if (row === null) {
    throw notFound("Scale finding not found.", { findingRef });
  }
  return fileScaleFindingFromRow(row);
}

export function assertImplementationScaleGate(db: Database, projectId: string): void {
  const estimate = db
    .query("SELECT * FROM scale_estimates WHERE project_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(projectId) as ScaleEstimateRow | null;
  if (estimate === null) {
    throw scaleSplitRequired("Implementation requires a scale report first.", { missing: ["scale_report"] });
  }
  if (estimate.weight > 13) {
    throw scaleSplitRequired("Latest scale estimate requires split before implementation.", { estimateId: estimate.alias, weight: estimate.weight });
  }
  const blocking = activeBlockingFindings(db, projectId);
  if (blocking.length > 0) {
    throw scaleBlocked("Blocking scale findings must be waived or resolved before implementation.", {
      findings: blocking.map((finding) => finding.alias),
    });
  }
}

export function getScaleSummary(
  db: Database,
  projectId: string,
): { latestReportId: string | null; maxWeight: number | null; blockingFindings: number; nextSplitRequired: boolean } {
  const estimate = db
    .query("SELECT * FROM scale_estimates WHERE project_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(projectId) as ScaleEstimateRow | null;
  const blockingFindings = activeBlockingFindings(db, projectId).length;
  return {
    latestReportId: estimate?.alias ?? null,
    maxWeight: estimate?.weight ?? null,
    blockingFindings,
    nextSplitRequired: (estimate?.weight ?? 0) > 13 || blockingFindings > 0,
  };
}

function activeBlockingFindings(db: Database, projectId: string): FileScaleFinding[] {
  const rows = db
    .query(
      `
        SELECT * FROM file_scale_findings
        WHERE project_id = ?
          AND severity = 'block'
          AND (waived_at IS NULL OR waiver_hash IS NULL OR waiver_hash != content_hash)
        ORDER BY path ASC
      `,
    )
    .all(projectId) as FileScaleFindingRow[];
  return rows.map(fileScaleFindingFromRow);
}
