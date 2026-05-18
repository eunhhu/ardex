import type { ComponentChildren } from "preact";

export type Mutate = (callback: () => Promise<unknown>) => Promise<void>;

export function Panel({ title, count, children }: { title: string; count: string; children: ComponentChildren }) {
  return (
    <section class="panel">
      <div class="panel-head">
        <h2>{title}</h2>
        <span class="muted">{count}</span>
      </div>
      <div>{children}</div>
    </section>
  );
}

export function Pill({ value }: { value: string }) {
  return <span class="pill">{value}</span>;
}

export type BadgeTone = "id" | "status" | "gate" | "owner" | "time" | "progress" | "type" | "task" | "runtime" | "weight";

export function MetadataBadge({
  label,
  value,
  tone,
  state,
}: {
  label: string;
  value: string | number;
  tone: BadgeTone;
  state?: string;
}) {
  const text = String(value);
  const stateClass = state ? ` metadata-badge--state-${classToken(state)}` : "";
  return (
    <span class={`pill metadata-badge metadata-badge--${tone}${stateClass}`} title={`${label}: ${text}`} aria-label={`${label}: ${text}`}>
      <span class="metadata-badge-label">{label}</span>
      <span class="metadata-badge-value">{text}</span>
    </span>
  );
}

function classToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function Empty({ text }: { text: string }) {
  return <div class="empty">{text}</div>;
}
