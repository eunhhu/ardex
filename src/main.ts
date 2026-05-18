import { checkDaemon, runDaemon, startDaemon } from "./daemon.ts";
import { daemonUnavailable, usageError } from "./errors.ts";
import { printError, printSuccess, success, type CommandSuccess, VERSION } from "./output.ts";
import type { ParsedArgs } from "./cli-types.ts";
import {
  checkCommand,
  helpCommand,
  initCommand,
  projectCommand,
  sessionCommand,
  startCommand,
  statementCommand,
  statusCommand,
  stopCommand,
  taskCommand,
} from "./cli-core-commands.ts";
import { askCommand, evidenceCommand, scaleCommand } from "./cli-workflow-commands.ts";

export async function main(rawArgs: string[]): Promise<void> {
  const parsed = parseArgs(rawArgs);

  try {
    await ensureDaemonForCommand(parsed);
    const result = await dispatch(parsed);
    printSuccess(result, parsed.json, parsed.commandName);
    process.exitCode = 0;
  } catch (error) {
    process.exitCode = printError(error, parsed.json, parsed.commandName);
  }
}

async function ensureDaemonForCommand(parsed: ParsedArgs): Promise<void> {
  if (!commandNeedsDaemon(parsed)) {
    return;
  }
  if (parsed.noStart) {
    const health = await checkDaemon();
    if (health === null) {
      throw daemonUnavailable("Ardex daemon is not running and --no-start was provided.");
    }
    return;
  }
  await startDaemon();
}

function commandNeedsDaemon(parsed: ParsedArgs): boolean {
  const [command, subcommand] = parsed.args;
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    return false;
  }
  if (command === "version" || command === "--version" || command === "-v") {
    return false;
  }
  if (command === "init" || command === "start" || command === "stop" || command === "check" || command === "status") {
    return false;
  }
  if (command === "daemon" && subcommand === "run") {
    return false;
  }
  return true;
}

function parseArgs(rawArgs: string[]): ParsedArgs {
  const args: string[] = [];
  let json = false;
  let noStart = false;
  let projectId: string | undefined;

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === undefined) continue;
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--no-start") {
      noStart = true;
      continue;
    }
    if (arg === "-p" || arg === "--project") {
      const value = rawArgs[index + 1];
      if (value === undefined) throw usageError(`${arg} requires a project id.`);
      projectId = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--project=")) {
      projectId = arg.slice("--project=".length);
      continue;
    }
    args.push(arg);
  }

  return {
    args,
    json,
    noStart,
    projectId,
    commandName: args.length === 0 ? "help" : args.join("."),
  };
}

async function dispatch(parsed: ParsedArgs): Promise<CommandSuccess> {
  const [command, subcommand] = parsed.args;

  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    return helpCommand();
  }
  if (command === "version" || command === "--version" || command === "-v") {
    return success({ version: VERSION }, VERSION);
  }
  if (command === "daemon" && subcommand === "run") {
    await runDaemon();
  }

  switch (command) {
    case "init":
      return await initCommand();
    case "check":
      return await checkCommand();
    case "start":
      return await startCommand();
    case "stop":
      return await stopCommand();
    case "status":
      return await statusCommand();
    case "project":
      return await projectCommand(parsed);
    case "session":
      return await sessionCommand(parsed);
    case "task":
      return await taskCommand(parsed);
    case "statement":
      return await statementCommand(parsed);
    case "evidence":
      return await evidenceCommand(parsed);
    case "ask":
      return await askCommand(parsed);
    case "scale":
      return await scaleCommand(parsed);
    default:
      throw usageError(`Unknown command: ${command}`, { command, args: parsed.args });
  }
}
