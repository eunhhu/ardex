import { usageError } from "./errors.ts";
import { success, type CommandSuccess } from "./output.ts";
import {
  addAsk,
  addEvidence,
  answerAsk,
  listAsks,
  listEvidence,
  listScaleReports,
  latestScaleReport,
  requireAsk,
  requireEvidence,
  requireFileScaleFinding,
  setEvidenceStatus,
  splitTaskFromScale,
  storeScaleReport,
  waiveScaleFinding,
} from "./repository.ts";
import { scanScale } from "./scale.ts";
import type { ParsedArgs } from "./cli-types.ts";
import { collectRepeatedLongOption, collectRepeatedOption, parseOptions } from "./cli-options.ts";
import {
  askSummary,
  evidenceSummary,
  fileScaleFindingSummary,
  formatObject,
  formatScaleReport,
  scaleEstimateSummary,
  scaleReportSummary,
  taskSummary,
} from "./cli-format.ts";
import { resolveProject, withDb } from "./cli-db.ts";

export async function scaleCommand(parsed: ParsedArgs): Promise<CommandSuccess> {
  const [, action, second, ...rest] = parsed.args;
  return await withDb(async (db) => {
    const project = await resolveProject(db, parsed.projectId);
    switch (action) {
      case "check": {
        const rawArgs = [second, ...rest].filter((item): item is string => item !== undefined);
        const options = parseOptions(rawArgs);
        const paths = collectRepeatedLongOption(rawArgs, "path");
        const files = collectRepeatedLongOption(rawArgs, "files");
        const scan = await scanScale({ projectPath: project.path, paths: [...paths, ...files], goal: options.goal });
        const report = storeScaleReport(db, project.alias, scan);
        return success({ report: scaleReportSummary(report) }, formatScaleReport(report));
      }
      case "report": {
        const rawOptions = [second, ...rest].filter((item): item is string => item !== undefined);
        if (rawOptions.includes("--all")) {
          const reports = listScaleReports(db, project.alias);
          return success(
            { reports: reports.map(scaleEstimateSummary) },
            reports.length === 0
              ? "No scale reports."
              : reports.map((report) => `${report.alias}\t${report.weight}\t${report.recommendedAgent}\t${report.targetId ?? ""}`).join("\n"),
          );
        }
        const report = latestScaleReport(db, project.alias);
        return success({ report: scaleReportSummary(report) }, formatScaleReport(report));
      }
      case "waive": {
        if (second === undefined) {
          throw usageError("scale waive requires a finding id.");
        }
        const reason = parseOptions(rest).reason;
        if (reason === undefined) {
          throw usageError("scale waive requires --reason.");
        }
        const finding = requireFileScaleFinding(db, second);
        const waived = waiveScaleFinding(db, project.alias, finding.alias, reason);
        return success({ finding: fileScaleFindingSummary(waived) }, `Scale finding ${waived.alias}: waived`);
      }
      case "split": {
        const options = parseOptions([second, ...rest].filter((item): item is string => item !== undefined));
        const taskId = options.task;
        if (taskId === undefined) {
          throw usageError("scale split requires --task.");
        }
        const split = splitTaskFromScale(db, project.alias, taskId);
        return success(
          { split: { parentTaskId: split.parentTaskId, sourceScaleId: split.sourceScaleId, tasks: split.tasks.map((task) => taskSummary(task)) } },
          split.tasks.map((task) => `${task.priority}\t${task.alias}\t${task.owner}\t${task.title}`).join("\n"),
        );
      }
      default:
        throw usageError("Unknown scale command.", { action });
    }
  });
}

export async function evidenceCommand(parsed: ParsedArgs): Promise<CommandSuccess> {
  const [, action, second, ...rest] = parsed.args;
  return await withDb(async (db) => {
    const project = await resolveProject(db, parsed.projectId);
    switch (action) {
      case "add": {
        if (second === undefined) {
          throw usageError("evidence add requires a type.");
        }
        const options = parseOptions(rest);
        const target = parseEvidenceTarget(options);
        const evidence = addEvidence(db, project.alias, {
          type: second,
          targetType: target.targetType,
          targetRef: target.targetRef,
          summary: options.summary ?? defaultEvidenceSummary(second, options),
          payload: evidencePayload(second, options),
          status: options.status,
        });
        return success({ evidence: evidenceSummary(evidence) }, `${evidence.alias}\t${evidence.type}\t${evidence.summary}`);
      }
      case "ls": {
        const options = parseOptions([second, ...rest].filter((item): item is string => item !== undefined));
        const evidence = listEvidence(db, project.alias, { taskRef: options.task, featureRef: options.feature, status: options.status });
        return success(
          { evidence: evidence.map(evidenceSummary) },
          evidence.length === 0 ? "No evidence." : evidence.map((item) => `${item.alias}\t${item.status}\t${item.type}\t${item.summary}`).join("\n"),
        );
      }
      default: {
        if (action === undefined || second === undefined) {
          throw usageError("Unknown evidence command.", { action });
        }
        if (second === "accept" || second === "reject") {
          const options = parseOptions(rest);
          const evidence = setEvidenceStatus(db, project.alias, action, second === "accept" ? "accepted" : "rejected", {
            comment: options.comment ?? options.reason,
          });
          return success({ evidence: evidenceSummary(evidence) }, `Evidence ${evidence.alias}: ${evidence.status}`);
        }
        if (second === "check") {
          const evidence = requireEvidence(db, action);
          return success({ evidence: evidenceSummary(evidence) }, formatObject(evidenceSummary(evidence)));
        }
        throw usageError("Unknown evidence command.", { action, subcommand: second });
      }
    }
  });
}

export async function askCommand(parsed: ParsedArgs): Promise<CommandSuccess> {
  const [, first, second, ...rest] = parsed.args;
  return await withDb(async (db) => {
    const project = await resolveProject(db, parsed.projectId);
    if (first === "ls") {
      const asks = listAsks(db, project.alias, parseOptions([second, ...rest].filter((item): item is string => item !== undefined)).status);
      return success({ asks: asks.map(askSummary) }, asks.length === 0 ? "No asks." : asks.map((ask) => `${ask.alias}\t${ask.status}\t${ask.question}`).join("\n"));
    }
    if (first !== undefined && second === "answer") {
      const answer = rest.join(" ");
      if (answer.length === 0) {
        throw usageError("ask answer requires answer text.");
      }
      const ask = answerAsk(db, project.alias, first, answer);
      return success({ ask: askSummary(ask) }, `Ask ${ask.alias}: answered`);
    }
    if (first !== undefined && second === "check") {
      const ask = requireAsk(db, first);
      return success({ ask: askSummary(ask) }, formatObject(askSummary(ask)));
    }
    if (first === undefined) {
      throw usageError("ask requires a question, ls, or <ask_id> answer.");
    }

    const options = parseOptions([second, ...rest].filter((item): item is string => item !== undefined));
    const ask = addAsk(db, project.alias, {
      question: first,
      answer: options.a ?? options.answer,
      answerSource: options.a === undefined && options.answer === undefined ? undefined : "assumed",
      attachments: collectRepeatedOption([second, ...rest].filter((item): item is string => item !== undefined), "i"),
    });
    return success({ ask: askSummary(ask) }, `${ask.alias}\t${ask.status}\t${ask.question}`);
  });
}

function parseEvidenceTarget(options: Record<string, string>): { targetType: string; targetRef?: string } {
  if (options.task !== undefined) return { targetType: "task", targetRef: options.task };
  if (options.feature !== undefined) return { targetType: "feature", targetRef: options.feature };
  if (options.file !== undefined) return { targetType: "file", targetRef: options.file };
  if (options.session !== undefined) return { targetType: "session", targetRef: options.session };
  return { targetType: "session" };
}

function evidencePayload(type: string, options: Record<string, string>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (options.cmd !== undefined) payload["cmd"] = options.cmd;
  if (options.path !== undefined) payload["path"] = options.path;
  if (options.url !== undefined) payload["url"] = options.url;
  if (options.kind !== undefined) payload["kind"] = options.kind;
  if (options.prompt !== undefined) payload["prompt"] = options.prompt;
  if (options.tool !== undefined) payload["tool"] = options.tool;
  if (options.comment !== undefined) payload["comment"] = options.comment;
  if (options.pass !== undefined) payload["pass"] = options.pass === "true" || options.pass === "1" || options.pass === "yes";
  if (type === "test" && payload["pass"] === undefined) payload["pass"] = true;
  return payload;
}

function defaultEvidenceSummary(type: string, options: Record<string, string>): string {
  if (options.cmd !== undefined) return options.cmd;
  if (options.url !== undefined) return options.url;
  if (options.path !== undefined) return options.path;
  return `${type} evidence`;
}
