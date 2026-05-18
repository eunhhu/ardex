import type { ProjectSummary } from "./types.ts";

export function projectName(project: ProjectSummary): string {
  return project.name || basename(project.path) || project.id;
}

export function basename(path: string): string {
  return String(path || "").split("/").filter(Boolean).at(-1) || "";
}

export function shortPath(path: string): string {
  const parts = String(path || "").split("/").filter(Boolean);
  return parts.length <= 2 ? "/" + parts.join("/") : ".../" + parts.slice(-2).join("/");
}

export function compactPath(path: string): string {
  const value = String(path || "");
  return value.length > 74 ? "..." + value.slice(-73) : value;
}

export function pct(value: number): string {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

export function fmtRuntime(seconds: number | null | undefined): string {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const rest = value % 60;
  return minutes < 60 ? `${minutes}m ${rest}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
