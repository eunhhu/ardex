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

export function Empty({ text }: { text: string }) {
  return <div class="empty">{text}</div>;
}
