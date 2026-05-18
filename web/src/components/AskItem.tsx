import { useState } from "preact/hooks";
import { enc, post } from "../api.ts";
import type { AskSummary } from "../types.ts";
import { Pill, type Mutate } from "./shared.tsx";

export function AskItem({ ask, projectId, mutate }: { ask: AskSummary; projectId: string; mutate: Mutate }) {
  const [answer, setAnswer] = useState("");
  const isOpen = ask.status === "open";
  return (
    <article class="item">
      <div class="item-head"><div class="item-title">{ask.question}</div><span class={`pill ${isOpen ? "warn" : "good"}`}>{ask.status}</span></div>
      <div class="meta"><Pill value={ask.id} />{ask.answerSource && <Pill value={ask.answerSource} />}</div>
      {ask.answer && <div class="subvalue">{ask.answer}</div>}
      {isOpen && (
        <form class="ask-form" onSubmit={(event) => {
          event.preventDefault();
          if (!answer.trim()) return;
          void mutate(() => post(`/api/projects/${enc(projectId)}/asks/${enc(ask.id)}/answer`, { answer }));
          setAnswer("");
        }}>
          <input value={answer} onInput={(event) => setAnswer(event.currentTarget.value)} autoComplete="off" placeholder="Answer" />
          <button type="submit">Answer</button>
        </form>
      )}
    </article>
  );
}
