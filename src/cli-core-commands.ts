import { readConfig } from "./config.ts";
import { migrateCodexProjects } from "./codex-migration.ts";
import { checkDaemon, startDaemon, stopDaemon } from "./daemon.ts";
import { usageError, daemonUnavailable } from "./errors.ts";
import { initializeArdex } from "./init.ts";
import { getArdexPaths } from "./paths.ts";
import { success, type CommandSuccess, VERSION } from "./output.ts";
import {
  addProject,
  archiveProject,
  addTask,
  buildProductionChecklist,
  buildStatement,
  claimTask,
  completeSession,
  completeTask,
  currentProject,
  deleteTask,
  listTaskEvents,
  currentSession,
  listProjects,
  restoreProject,
  listSessions,
  listTasks,
  pauseTask,
  requireProject,
  requireTask,
  resumeTask,
  setSessionField,
  setProjectName,
  setTaskOwner,
  setTaskField,
  startSession,
} from "./repository.ts";
import type { ParsedArgs } from "./cli-types.ts";
import { parseOptions } from "./cli-options.ts";
import {
  formatObject,
  formatStatement,
  helpData,
  projectSummary,
  sessionSummary,
  checklistSummary,
  taskEventSummary,
  taskSummary,
  usageText,
} from "./cli-format.ts";
import { resolveProject, withDb } from "./cli-db.ts";

export async function initCommand(): Promise<CommandSuccess> {
  const initialized = await initializeArdex(getArdexPaths(), { installCodex: true });
  return success(
    {
      home: initialized.home,
      dbPath: initialized.dbPath,
      installStatePath: initialized.installStatePath,
      schemaVersion: initialized.schemaVersion,
      codex: initialized.codex,
    },
    [
      "Ardex initialized.",
      `home: ${initialized.home}`,
      `db: ${initialized.dbPath}`,
      `schema: ${initialized.schemaVersion}`,
      `skill: ${initialized.codex.skillPath}`,
      `hooks: ${initialized.codex.hooksConfigPath}`,
    ].join("\n"),
  );
}

export async function checkCommand(): Promise<CommandSuccess> {
  const health = await checkDaemon();
  if (health === null) {
    throw daemonUnavailable("Ardex daemon is not running.");
  }
  return success(
    { daemon: "running", url: health.url, dbPath: health.dbPath, version: health.version, pid: health.pid, uptimeSeconds: health.uptimeSeconds },
    [`Ardex daemon: running`, `url: ${health.url}`, `pid: ${health.pid}`].join("\n"),
  );
}

export async function startCommand(): Promise<CommandSuccess> {
  const started = await startDaemon();
  return success(
    { daemon: "running", reused: started.reused, url: started.health.url, dbPath: started.health.dbPath, version: started.health.version, pid: started.health.pid },
    [started.reused ? "Ardex daemon already running." : "Ardex daemon started.", `url: ${started.health.url}`, `pid: ${started.health.pid}`].join("\n"),
  );
}

export async function stopCommand(): Promise<CommandSuccess> {
  const stopped = await stopDaemon();
  return success({ daemon: "stopped", stopped: stopped.stopped, pid: stopped.pid }, stopped.stopped ? `Ardex daemon stopped. pid: ${stopped.pid}` : "Ardex daemon was not running.");
}

export async function statusCommand(): Promise<CommandSuccess> {
  const paths = getArdexPaths();
  const [config, health] = await Promise.all([readConfig(paths), checkDaemon(paths)]);
  const running = health !== null;
  return success(
    { daemon: running ? "running" : "stopped", url: config.serverUrl, dbPath: config.dbPath, pid: health?.pid ?? config.pid, version: health?.version ?? VERSION },
    running ? [`Ardex daemon: running`, `url: ${health.url}`, `pid: ${health.pid}`].join("\n") : [`Ardex daemon: stopped`, `url: ${config.serverUrl}`].join("\n"),
  );
}

export async function projectCommand(parsed: ParsedArgs): Promise<CommandSuccess> {
  const [, action, value, ...rest] = parsed.args;
  return await withDb(async (db) => {
    switch (action) {
      case "ls": {
        const projects = listProjects(db);
        return success({ projects: projects.map(projectSummary) }, projects.length === 0 ? "No projects." : projects.map((project) => `${project.alias}\t${project.name}\t${project.path}`).join("\n"));
      }
      case "add": {
        if (value === undefined) throw usageError("project add requires a path.");
        const project = await addProject(db, value);
        return success({ project: projectSummary(project) }, `Project ${project.alias}: ${project.path}`);
      }
      case "show": {
        if (value === undefined) throw usageError("project show requires a project id.");
        const project = requireProject(db, value);
        return success({ project: projectSummary(project) }, formatObject(projectSummary(project)));
      }
      case "rename": {
        if (value === undefined || rest.length === 0) throw usageError("project rename requires a project id and name.");
        const project = setProjectName(db, value, rest.join(" "));
        return success({ project: projectSummary(project) }, `${project.alias}\t${project.name}`);
      }
      case "archive": {
        if (value === undefined) throw usageError("project archive requires a project id.");
        const project = archiveProject(db, value);
        return success({ project: projectSummary(project) }, `${project.alias}\tarchived`);
      }
      case "restore": {
        if (value === undefined) throw usageError("project restore requires a project id.");
        const project = restoreProject(db, value);
        return success({ project: projectSummary(project) }, `${project.alias}\trestored`);
      }
      case "current": {
        const project = parsed.projectId === undefined ? await currentProject(db) : requireProject(db, parsed.projectId);
        return success({ project: projectSummary(project) }, `${project.alias}\t${project.path}`);
      }
      case "migrate-codex": {
        const options = parseOptions([value, ...rest].filter((item): item is string => item !== undefined));
        const result = await migrateCodexProjects(db, options.root);
        return success(
          {
            migration: {
              codexHome: result.codexHome,
              scannedFiles: result.scannedFiles,
              discoveredPaths: result.discoveredPaths,
              registeredProjects: result.registeredProjects.map(projectSummary),
              skipped: result.skipped,
            },
          },
          [
            `Codex home: ${result.codexHome}`,
            `scanned: ${result.scannedFiles}`,
            `discovered: ${result.discoveredPaths}`,
            `registered: ${result.registeredProjects.length}`,
            `skipped: ${result.skipped.length}`,
          ].join("\n"),
        );
      }
      default:
        throw usageError("Unknown project command.", { action });
    }
  });
}

export async function sessionCommand(parsed: ParsedArgs): Promise<CommandSuccess> {
  const [, action, maybeField, ...rest] = parsed.args;
  return await withDb(async (db) => {
    const project = await resolveProject(db, parsed.projectId);
    switch (action) {
      case "ls": {
        const sessions = listSessions(db, project.alias);
        return success({ sessions: sessions.map(sessionSummary) }, sessions.length === 0 ? "No sessions." : sessions.map((session) => `${session.alias}\t${session.status}\t${session.goal ?? ""}`).join("\n"));
      }
      case "current": {
        const session = currentSession(db, project.alias);
        return success({ session: sessionSummary(session) }, formatObject(sessionSummary(session)));
      }
      case "start": {
        const options = parseOptions(maybeField === undefined ? [] : [maybeField, ...rest]);
        const session = startSession(db, project.alias, { threadId: options.thread, goal: options.goal, mode: options.mode, model: options.model });
        return success({ session: sessionSummary(session) }, `Session ${session.alias}: ${session.status}`);
      }
      case "set": {
        if (maybeField === undefined || rest.length === 0) throw usageError("session set requires a field and value.");
        const session = setSessionField(db, project.alias, maybeField, rest.join(" "));
        return success({ session: sessionSummary(session) }, formatObject(sessionSummary(session)));
      }
      case "done": {
        const session = completeSession(db, project.alias);
        return success({ session: sessionSummary(session) }, `Session ${session.alias}: done`);
      }
      default:
        throw usageError("Unknown session command.", { action });
    }
  });
}

export async function taskCommand(parsed: ParsedArgs): Promise<CommandSuccess> {
  const [, first, second, third, ...rest] = parsed.args;
  return await withDb(async (db) => {
    const project = await resolveProject(db, parsed.projectId);
    switch (first) {
      case "ls": {
        const tasks = listTasks(db, project.alias);
        return success({ tasks: tasks.map(taskSummary) }, tasks.length === 0 ? "No tasks." : tasks.map((task) => `${task.priority}\t${task.alias}\t${task.status}\t${task.progress}\t${task.title}`).join("\n"));
      }
      case "add": {
        if (second === undefined) throw usageError("task add requires a title.");
        const options = parseOptions(third === undefined ? [] : [third, ...rest]);
        const task = addTask(db, project.alias, {
          title: second,
          content: options.content,
          priority: options.priority === undefined ? undefined : Number(options.priority),
          importance: options.importance === undefined ? undefined : Number(options.importance),
          qualityGate: options.qualityGate ?? options["quality-gate"],
        });
        return success({ task: taskSummary(task) }, `${task.priority}\t${task.alias}\t${task.title}`);
      }
      default:
        return taskItemCommand(db, project.alias, first, second, third, rest);
    }
  });
}

export async function statementCommand(parsed: ParsedArgs): Promise<CommandSuccess> {
  const [, action, field, ...rest] = parsed.args;
  return await withDb(async (db) => {
    const project = await resolveProject(db, parsed.projectId);
    if (action === "set") {
      if (field !== "next" || rest.length === 0) throw usageError("statement set supports only: next <text>.");
      setSessionField(db, project.alias, "next", rest.join(" "));
    }
    const statement = buildStatement(db, project.alias);
    return success({ statement }, formatStatement(statement));
  });
}

export function helpCommand(): CommandSuccess {
  return success(helpData(), usageText(), { command: "help" });
}

function taskItemCommand(db: Parameters<typeof requireTask>[0], projectAlias: string, first?: string, second?: string, third?: string, rest: string[] = []): CommandSuccess {
  if (first === undefined || second === undefined) throw usageError("Unknown task command.", { action: first });
  if (second === "check") {
    const task = requireTask(db, first);
    return success({ task: taskSummary(task) }, formatObject(taskSummary(task)));
  }
  if (second === "claim") {
    const task = claimTask(db, projectAlias, first);
    return success({ task: taskSummary(task) }, `Task ${task.alias}: active`);
  }
  if (second === "pause") {
    const options = parseOptions([third, ...rest].filter((item): item is string => item !== undefined));
    const task = pauseTask(db, projectAlias, first, options.reason);
    return success({ task: taskSummary(task) }, `Task ${task.alias}: paused`);
  }
  if (second === "resume") {
    const task = resumeTask(db, projectAlias, first);
    return success({ task: taskSummary(task) }, `Task ${task.alias}: active`);
  }
  if (second === "assign") {
    const owner = third;
    if (owner === undefined) throw usageError("task assign requires an owner.");
    const task = setTaskOwner(db, projectAlias, first, owner);
    return success({ task: taskSummary(task) }, `Task ${task.alias}: ${task.owner}`);
  }
  if (second === "delete") {
    const event = deleteTask(db, projectAlias, first);
    return success({ event: taskEventSummary(event) }, `Task ${event.taskAlias}: deleted`);
  }
  if (second === "events") {
    const events = listTaskEvents(db, projectAlias, first);
    return success(
      { events: events.map(taskEventSummary) },
      events.length === 0 ? "No task events." : events.map((event) => `${event.alias}\t${event.type}\t${event.summary}`).join("\n"),
    );
  }
  if (second === "checklist") {
    const checklist = buildProductionChecklist(db, projectAlias, first);
    return success({ checklist: checklistSummary(checklist) }, formatObject(checklistSummary(checklist)));
  }
  if (second === "done") {
    const task = completeTask(db, projectAlias, first);
    return success({ task: taskSummary(task) }, `Task ${task.alias}: done`);
  }
  if (second !== "set" || third === undefined || rest.length === 0) {
    throw usageError("Unknown task command.", { action: first, subcommand: second });
  }
  const task = setTaskField(db, projectAlias, first, third, rest.join(" "));
  return success({ task: taskSummary(task) }, formatObject(taskSummary(task)));
}
