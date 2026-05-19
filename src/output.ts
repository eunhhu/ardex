import { ArdexError } from "./errors.ts";

export const VERSION = "0.1.4";

export type JsonEnvelope =
  | {
      ok: true;
      data: unknown;
      meta: Record<string, unknown>;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        details: Record<string, unknown>;
      };
      meta: Record<string, unknown>;
    };

export type CommandSuccess = {
  data: unknown;
  human: string;
  meta?: Record<string, unknown>;
};

export function success(data: unknown, human: string, meta: Record<string, unknown> = {}): CommandSuccess {
  return { data, human, meta };
}

export function printSuccess(result: CommandSuccess, json: boolean, command: string): void {
  if (json) {
    const envelope: JsonEnvelope = {
      ok: true,
      data: result.data,
      meta: {
        command,
        version: VERSION,
        ...result.meta,
      },
    };
    console.log(JSON.stringify(envelope, null, 2));
    return;
  }

  if (result.human.length > 0) {
    console.log(result.human);
  }
}

export function printError(error: unknown, json: boolean, command: string): number {
  const ardexError =
    error instanceof ArdexError
      ? error
      : new ArdexError("DAEMON_INTERNAL_ERROR", error instanceof Error ? error.message : String(error), 1);

  if (json) {
    const envelope: JsonEnvelope = {
      ok: false,
      error: {
        code: ardexError.code,
        message: ardexError.message,
        details: ardexError.details,
      },
      meta: {
        command,
        version: VERSION,
      },
    };
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.error(`${ardexError.code}: ${ardexError.message}`);
  }

  return ardexError.exitCode;
}
