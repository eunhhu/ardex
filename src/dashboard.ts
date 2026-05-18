import { dashboardAssetResponse } from "./dashboard-assets.ts";
import { ArdexError, internalError, usageError } from "./errors.ts";
import { openDatabase } from "./db.ts";
import type { ArdexPaths } from "./paths.ts";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import { VERSION, type JsonEnvelope } from "./output.ts";
import { requireProject } from "./repository.ts";
import {
  addTaskForDashboard,
  archiveProjectForDashboard,
  claimTaskForDashboard,
  completeSessionForDashboard,
  completeTaskForDashboard,
  deleteTaskForDashboard,
  pauseTaskForDashboard,
  resumeTaskForDashboard,
  runScaleCheckForDashboard,
  renameProjectForDashboard,
  setSessionStatusForDashboard,
  setTaskOwnerForDashboard,
  setTaskPriorityForDashboard,
  setTaskProgressForDashboard,
  splitTaskFromScaleForDashboard,
  startSessionForDashboard,
  taskChecklistForDashboard,
  waiveScaleFindingForDashboard,
} from "./dashboard-actions.ts";
import {
  answerAskForDashboard,
  buildDashboardSnapshot,
  readProjects,
  setEvidenceStatusForDashboard,
} from "./dashboard-data.ts";

export async function handleDashboardRequest(request: Request, paths: ArdexPaths): Promise<Response | null> {
  const url = new URL(request.url);
  const segments = pathSegments(url.pathname);

  try {
    if (isMutatingMethod(request.method)) {
      assertLocalMutation(request);
    }
    if (request.method === "GET") {
      const asset = await dashboardAssetResponse(url.pathname);
      if (asset !== null) {
        return asset;
      }
    }
    if (request.method === "GET" && url.pathname === "/favicon.ico") {
      return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
    }
    if (request.method === "GET" && segments.length === 1 && segments[0] === "events") {
      return sseResponse(paths, url.searchParams.get("project") ?? undefined);
    }
    if (segments[0] !== "api") {
      return null;
    }

    if (request.method === "GET" && segments[1] === "projects" && segments.length === 2) {
      return dataResponse({ projects: readProjects(paths) });
    }
    if (request.method === "POST" && segments[1] === "projects" && segments[3] === "rename") {
      const body = await readJsonBody(request);
      return dataResponse({
        project: renameProjectForDashboard(paths, requiredSegment(segments, 2, "project"), requiredString(body, "name")),
      });
    }
    if (request.method === "POST" && segments[1] === "projects" && segments[3] === "archive") {
      return dataResponse({ project: archiveProjectForDashboard(paths, requiredSegment(segments, 2, "project")) });
    }
    if (request.method === "GET" && segments[1] === "projects" && segments[3] === "dashboard") {
      return dataResponse(await buildDashboardSnapshot(paths, requiredSegment(segments, 2, "project")));
    }
    if (request.method === "GET" && segments[1] === "projects" && segments[3] === "artifacts") {
      return artifactResponse(paths, requiredSegment(segments, 2, "project"), requiredStringParam(url, "path"));
    }
    if (request.method === "POST" && segments[1] === "projects" && segments[3] === "session" && segments[4] === "start") {
      const body = await readJsonBody(request);
      return dataResponse({
        session: startSessionForDashboard(paths, requiredSegment(segments, 2, "project"), {
          goal: optionalString(body, "goal"),
          mode: optionalString(body, "mode"),
          model: optionalString(body, "model"),
        }),
      });
    }
    if (request.method === "POST" && segments[1] === "projects" && segments[3] === "session" && segments[4] === "status") {
      const body = await readJsonBody(request);
      return dataResponse({
        session: setSessionStatusForDashboard(paths, requiredSegment(segments, 2, "project"), requiredString(body, "status")),
      });
    }
    if (request.method === "POST" && segments[1] === "projects" && segments[3] === "session" && segments[4] === "done") {
      return dataResponse({ session: completeSessionForDashboard(paths, requiredSegment(segments, 2, "project")) });
    }
    if (request.method === "POST" && segments[1] === "projects" && segments[3] === "tasks" && segments.length === 4) {
      const body = await readJsonBody(request);
      return dataResponse({
        task: addTaskForDashboard(paths, requiredSegment(segments, 2, "project"), {
          title: requiredString(body, "title"),
          content: optionalString(body, "content"),
          priority: optionalNumber(body, "priority"),
          importance: optionalNumber(body, "importance"),
          qualityGate: optionalString(body, "qualityGate"),
          owner: optionalString(body, "owner"),
        }),
      });
    }
    if (request.method === "POST" && segments[1] === "projects" && segments[3] === "tasks" && segments[5] === "claim") {
      return dataResponse({ task: claimTaskForDashboard(paths, requiredSegment(segments, 2, "project"), requiredSegment(segments, 4, "task")) });
    }
    if (request.method === "POST" && segments[1] === "projects" && segments[3] === "tasks" && segments[5] === "pause") {
      const body = await readJsonBody(request);
      return dataResponse({
        task: pauseTaskForDashboard(paths, requiredSegment(segments, 2, "project"), requiredSegment(segments, 4, "task"), optionalString(body, "reason")),
      });
    }
    if (request.method === "POST" && segments[1] === "projects" && segments[3] === "tasks" && segments[5] === "resume") {
      return dataResponse({ task: resumeTaskForDashboard(paths, requiredSegment(segments, 2, "project"), requiredSegment(segments, 4, "task")) });
    }
    if (request.method === "POST" && segments[1] === "projects" && segments[3] === "tasks" && segments[5] === "owner") {
      const body = await readJsonBody(request);
      return dataResponse({
        task: setTaskOwnerForDashboard(paths, requiredSegment(segments, 2, "project"), requiredSegment(segments, 4, "task"), requiredString(body, "owner")),
      });
    }
    if (request.method === "POST" && segments[1] === "projects" && segments[3] === "tasks" && segments[5] === "progress") {
      const body = await readJsonBody(request);
      return dataResponse({
        task: setTaskProgressForDashboard(
          paths,
          requiredSegment(segments, 2, "project"),
          requiredSegment(segments, 4, "task"),
          requiredNumber(body, "progress"),
        ),
      });
    }
    if (request.method === "POST" && segments[1] === "projects" && segments[3] === "tasks" && segments[5] === "priority") {
      const body = await readJsonBody(request);
      return dataResponse({
        task: setTaskPriorityForDashboard(
          paths,
          requiredSegment(segments, 2, "project"),
          requiredSegment(segments, 4, "task"),
          requiredNumber(body, "priority"),
        ),
      });
    }
    if (request.method === "POST" && segments[1] === "projects" && segments[3] === "tasks" && segments[5] === "delete") {
      return dataResponse({ event: deleteTaskForDashboard(paths, requiredSegment(segments, 2, "project"), requiredSegment(segments, 4, "task")) });
    }
    if (request.method === "GET" && segments[1] === "projects" && segments[3] === "tasks" && segments[5] === "checklist") {
      return dataResponse({ checklist: taskChecklistForDashboard(paths, requiredSegment(segments, 2, "project"), requiredSegment(segments, 4, "task")) });
    }
    if (request.method === "POST" && segments[1] === "projects" && segments[3] === "tasks" && segments[5] === "done") {
      return dataResponse({ task: completeTaskForDashboard(paths, requiredSegment(segments, 2, "project"), requiredSegment(segments, 4, "task")) });
    }
    if (request.method === "POST" && segments[1] === "projects" && segments[3] === "asks" && segments[5] === "answer") {
      const body = await readJsonBody(request);
      const answer = typeof body["answer"] === "string" ? body["answer"].trim() : "";
      if (answer.length === 0) {
        throw usageError("Ask answer is required.", { field: "answer" });
      }
      const ask = answerAskForDashboard(paths, requiredSegment(segments, 2, "project"), requiredSegment(segments, 4, "ask"), answer);
      return dataResponse({ ask });
    }
    if (
      request.method === "POST" &&
      segments[1] === "projects" &&
      segments[3] === "evidence" &&
      (segments[5] === "accept" || segments[5] === "reject")
    ) {
      const body = await readJsonBody(request);
      const status = segments[5] === "accept" ? "accepted" : "rejected";
      const evidence = setEvidenceStatusForDashboard(
        paths,
        requiredSegment(segments, 2, "project"),
        requiredSegment(segments, 4, "evidence"),
        status,
        optionalString(body, "comment"),
      );
      return dataResponse({ evidence });
    }
    if (request.method === "POST" && segments[1] === "projects" && segments[3] === "scale" && segments[4] === "check") {
      const body = await readJsonBody(request);
      const pathList = Array.isArray(body["paths"]) ? body["paths"].filter((item): item is string => typeof item === "string") : [];
      return dataResponse({
        report: await runScaleCheckForDashboard(paths, requiredSegment(segments, 2, "project"), {
          paths: pathList,
          goal: optionalString(body, "goal"),
        }),
      });
    }
    if (request.method === "POST" && segments[1] === "projects" && segments[3] === "scale" && segments[4] === "split") {
      const body = await readJsonBody(request);
      return dataResponse({
        split: splitTaskFromScaleForDashboard(paths, requiredSegment(segments, 2, "project"), requiredString(body, "taskId")),
      });
    }
    if (request.method === "POST" && segments[1] === "projects" && segments[3] === "scale" && segments[4] === "findings" && segments[6] === "waive") {
      const body = await readJsonBody(request);
      return dataResponse({
        finding: waiveScaleFindingForDashboard(
          paths,
          requiredSegment(segments, 2, "project"),
          requiredSegment(segments, 5, "finding"),
          requiredString(body, "reason"),
        ),
      });
    }

    return errorResponse(new ArdexError("NOT_FOUND", "Endpoint not found.", 4, { path: url.pathname }), 404);
  } catch (error) {
    return errorResponse(error);
  }
}

function pathSegments(pathname: string): string[] {
  return pathname
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => decodeURIComponent(segment));
}

function requiredSegment(segments: string[], index: number, name: string): string {
  const value = segments[index];
  if (value === undefined || value.length === 0) {
    throw usageError(`Missing ${name} path segment.`, { name });
  }
  return value;
}

function requiredString(body: Record<string, unknown>, field: string): string {
  const value = optionalString(body, field);
  if (value === undefined || value.length === 0) {
    throw usageError(`Field ${field} is required.`, { field });
  }
  return value;
}

function requiredStringParam(url: URL, field: string): string {
  const value = url.searchParams.get(field)?.trim() ?? "";
  if (value.length === 0) {
    throw usageError(`Query parameter ${field} is required.`, { field });
  }
  return value;
}

function optionalString(body: Record<string, unknown>, field: string): string | undefined {
  const value = body[field];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

async function artifactResponse(paths: ArdexPaths, projectRef: string, rawPath: string): Promise<Response> {
  const db = openDatabase(paths);
  try {
    const project = requireProject(db, projectRef);
    const projectRoot = await realpath(project.path);
    const candidate = isAbsolute(rawPath) ? rawPath : resolve(projectRoot, rawPath);
    const resolved = await realpath(candidate);
    if (resolved !== projectRoot && !resolved.startsWith(projectRoot + sep)) {
      throw usageError("Artifact path must stay inside the project root.", { path: rawPath });
    }
    if (!/\.(png|jpe?g|gif|webp|avif)$/i.test(resolved)) {
      throw usageError("Artifact preview supports image files only.", { path: rawPath });
    }
    const body = await readFile(resolved);
    return new Response(body, {
      headers: {
        "content-type": imageContentType(resolved),
        "cache-control": "no-store",
      },
    });
  } finally {
    db.close();
  }
}

function imageContentType(path: string): string {
  if (/\.png$/i.test(path)) return "image/png";
  if (/\.jpe?g$/i.test(path)) return "image/jpeg";
  if (/\.gif$/i.test(path)) return "image/gif";
  if (/\.webp$/i.test(path)) return "image/webp";
  if (/\.avif$/i.test(path)) return "image/avif";
  return "application/octet-stream";
}

function requiredNumber(body: Record<string, unknown>, field: string): number {
  const value = optionalNumber(body, field);
  if (value === undefined) {
    throw usageError(`Field ${field} must be a number.`, { field });
  }
  return value;
}

function optionalNumber(body: Record<string, unknown>, field: string): number | undefined {
  const value = body[field];
  if (value === undefined) {
    return undefined;
  }
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(numberValue)) {
    throw usageError(`Field ${field} must be a number.`, { field });
  }
  return numberValue;
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > 64_000) {
    throw usageError("Request body too large.", { maxBytes: 64_000 });
  }
  if (text.trim().length === 0) {
    return {};
  }
  const parsed = JSON.parse(text) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw usageError("Request body must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function isMutatingMethod(method: string): boolean {
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}

function assertLocalMutation(request: Request): void {
  const url = new URL(request.url);
  if (!isLocalHostname(url.hostname)) {
    throw usageError("Mutating dashboard requests require local host.", { host: url.hostname });
  }

  const origin = request.headers.get("origin");
  if (origin === null) {
    return;
  }
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    throw usageError("Invalid Origin header.", { origin });
  }
  if (originUrl.origin !== url.origin || !isLocalHostname(originUrl.hostname)) {
    throw usageError("Cross-origin dashboard mutation rejected.", { origin, expected: url.origin });
  }
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

function dataResponse(data: unknown, status = 200): Response {
  const envelope: JsonEnvelope = {
    ok: true,
    data,
    meta: {
      surface: "dashboard",
      version: VERSION,
    },
  };
  return Response.json(envelope, { status });
}

function errorResponse(error: unknown, forcedStatus?: number): Response {
  const ardexError =
    error instanceof ArdexError
      ? error
      : internalError(error instanceof Error ? error.message : "Unknown dashboard error.", {
          cause: error instanceof Error ? error.name : typeof error,
        });
  const envelope: JsonEnvelope = {
    ok: false,
    error: {
      code: ardexError.code,
      message: ardexError.message,
      details: ardexError.details,
    },
    meta: {
      surface: "dashboard",
      version: VERSION,
    },
  };
  return Response.json(envelope, { status: forcedStatus ?? httpStatusForError(ardexError) });
}

function httpStatusForError(error: ArdexError): number {
  if (error.exitCode === 2) {
    return 400;
  }
  if (error.exitCode === 3) {
    return 503;
  }
  if (error.exitCode === 4) {
    return 404;
  }
  if (error.exitCode === 5) {
    return 409;
  }
  return 500;
}

function sseResponse(paths: ArdexPaths, projectRef?: string): Response {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = async () => {
        try {
          const snapshot = await buildDashboardSnapshot(paths, projectRef);
          controller.enqueue(encoder.encode(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`));
        } catch (error) {
          const ardexError = error instanceof ArdexError ? error : internalError("Dashboard snapshot failed.");
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify(ardexError)}\n\n`));
        }
      };

      void emit();
      timer = setInterval(() => void emit(), 1000);
    },
    cancel() {
      if (timer !== undefined) {
        clearInterval(timer);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
    },
  });
}
