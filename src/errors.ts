export type ErrorDetails = Record<string, unknown>;

export class ArdexError extends Error {
  readonly code: string;
  readonly exitCode: number;
  readonly details: ErrorDetails;

  constructor(code: string, message: string, exitCode: number, details: ErrorDetails = {}) {
    super(message);
    this.name = "ArdexError";
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}

export function usageError(message: string, details: ErrorDetails = {}): ArdexError {
  return new ArdexError("VALIDATION_ERROR", message, 2, details);
}

export function daemonUnavailable(message: string, details: ErrorDetails = {}): ArdexError {
  return new ArdexError("DAEMON_UNAVAILABLE", message, 3, details);
}

export function notFound(message: string, details: ErrorDetails = {}): ArdexError {
  return new ArdexError("NOT_FOUND", message, 4, details);
}

export function transitionRejected(message: string, details: ErrorDetails = {}): ArdexError {
  return new ArdexError("TRANSITION_REJECTED", message, 5, details);
}

export function qualityGateMissing(message: string, details: ErrorDetails = {}): ArdexError {
  return new ArdexError("QUALITY_GATE_MISSING_EVIDENCE", message, 5, details);
}

export function qualityGateFailed(message: string, details: ErrorDetails = {}): ArdexError {
  return new ArdexError("QUALITY_GATE_FAILED_EVIDENCE", message, 5, details);
}

export function scaleBlocked(message: string, details: ErrorDetails = {}): ArdexError {
  return new ArdexError("SCALE_BLOCKING_FINDING", message, 5, details);
}

export function scaleSplitRequired(message: string, details: ErrorDetails = {}): ArdexError {
  return new ArdexError("SCALE_SPLIT_REQUIRED", message, 5, details);
}

export function internalError(message: string, details: ErrorDetails = {}): ArdexError {
  return new ArdexError("DAEMON_INTERNAL_ERROR", message, 1, details);
}
