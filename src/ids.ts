import { Database } from "bun:sqlite";

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function createId(): string {
  const time = encodeTime(Date.now(), 10);
  const random = crypto.getRandomValues(new Uint8Array(10));
  return `${time}${encodeRandom(random)}`;
}

export function nextAlias(db: Database, table: AliasTable): string {
  const prefix = aliasPrefixes[table];
  const rows = db.query(`SELECT alias FROM ${table} WHERE alias LIKE ?`).all(`${prefix}_%`) as Array<{ alias: string }>;
  const max = rows.reduce((currentMax, row) => {
    const match = new RegExp(`^${prefix}_(\\d+)$`).exec(row.alias);
    if (match === null || match[1] === undefined) {
      return currentMax;
    }
    return Math.max(currentMax, Number(match[1]));
  }, 0);
  return `${prefix}_${String(max + 1).padStart(3, "0")}`;
}

export type AliasTable =
  | "projects"
  | "sessions"
  | "tasks"
  | "task_events"
  | "evidence"
  | "asks"
  | "scale_estimates"
  | "file_scale_findings";

const aliasPrefixes: Record<AliasTable, string> = {
  projects: "p",
  sessions: "s",
  tasks: "t",
  task_events: "te",
  evidence: "e",
  asks: "a",
  scale_estimates: "sc",
  file_scale_findings: "sf",
};

function encodeTime(now: number, length: number): string {
  let value = now;
  let output = "";
  for (let index = length - 1; index >= 0; index -= 1) {
    output = ENCODING[value % 32] + output;
    value = Math.floor(value / 32);
  }
  return output;
}

function encodeRandom(bytes: Uint8Array): string {
  let bits = 0;
  let bitLength = 0;
  let output = "";

  for (const byte of bytes) {
    bits = (bits << 8) | byte;
    bitLength += 8;

    while (bitLength >= 5) {
      output += ENCODING[(bits >> (bitLength - 5)) & 31];
      bitLength -= 5;
    }
  }

  if (bitLength > 0) {
    output += ENCODING[(bits << (5 - bitLength)) & 31];
  }

  return output.slice(0, 16);
}
