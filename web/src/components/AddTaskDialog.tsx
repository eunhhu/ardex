import type { RefObject } from "preact";
import { enc, post } from "../api.ts";
import type { Mutate } from "./shared.tsx";

export function AddTaskDialog({ dialogRef, projectId, mutate }: { dialogRef: RefObject<HTMLDialogElement>; projectId: string; mutate: Mutate }) {
  return (
    <dialog ref={dialogRef} class="modal">
      <form class="modal-card" onSubmit={(event) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        const title = String(form.get("title") || "").trim();
        if (!title) return;
        const priority = Number(form.get("priority"));
        const importance = Number(form.get("importance"));
        void mutate(() => post(`/api/projects/${enc(projectId)}/tasks`, {
          title,
          content: String(form.get("content") || ""),
          priority: Number.isFinite(priority) ? priority : undefined,
          importance: Number.isFinite(importance) ? importance : undefined,
          owner: String(form.get("owner") || "main"),
          qualityGate: String(form.get("qualityGate") || "none"),
        }));
        formElement.reset();
        dialogRef.current?.close();
      }}>
        <div class="modal-head">
          <h2>Add task</h2>
          <button class="secondary icon-button" value="cancel" type="button" onClick={() => dialogRef.current?.close()}>x</button>
        </div>
        <label>Title <input name="title" autoComplete="off" required /></label>
        <label>Content <textarea name="content" rows={5} /></label>
        <div class="form-grid">
          <label>Priority <input name="priority" type="number" min="1" step="1" /></label>
          <label>Importance <input name="importance" type="number" min="0" max="1" step="0.1" defaultValue="0.5" /></label>
          <label>Owner <input name="owner" defaultValue="main" /></label>
          <label>Gate
            <select name="qualityGate">
              {["none", "scale", "spec", "visual", "test", "demo", "review"].map((gate) => <option key={gate} value={gate}>{gate}</option>)}
            </select>
          </label>
        </div>
        <div class="modal-actions">
          <button class="secondary" type="button" onClick={() => dialogRef.current?.close()}>Cancel</button>
          <button type="submit">Create</button>
        </div>
      </form>
    </dialog>
  );
}
