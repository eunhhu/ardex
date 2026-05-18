export function enc(value) {
  return encodeURIComponent(value);
}

export function formValue(form, name) {
  const input = form.elements.namedItem(name);
  return input instanceof HTMLInputElement || input instanceof HTMLSelectElement || input instanceof HTMLTextAreaElement ? input.value.trim() : "";
}

export function setFormValue(form, name, value) {
  const input = form.elements.namedItem(name);
  if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement || input instanceof HTMLTextAreaElement) {
    input.value = value;
  }
}

export function optionalFormNumber(form, name) {
  const value = formValue(form, name);
  if (value.length === 0) return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

export function projectName(project) {
  return project.name || basename(project.path) || project.id;
}

export function basename(path) {
  return String(path || "").split("/").filter(Boolean).at(-1) || "";
}

export function shortPath(path) {
  const parts = String(path || "").split("/").filter(Boolean);
  return parts.length <= 2 ? "/" + parts.join("/") : "…/" + parts.slice(-2).join("/");
}

export function compactPath(path) {
  const value = String(path || "");
  return value.length > 74 ? "…" + value.slice(-73) : value;
}

export function card(label, value, subvalue) {
  return '<div class="label">' + h(label) + '</div><div class="value">' + h(value) + '</div><div class="subvalue">' + h(subvalue || "") + "</div>";
}

export function pill(value) {
  return '<span class="pill">' + h(value) + "</span>";
}

export function empty(text) {
  return '<div class="empty">' + h(text) + "</div>";
}

export function pct(value) {
  return Math.round((Number(value) || 0) * 100) + "%";
}

export function fmtRuntime(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const rest = value % 60;
  return minutes < 60 ? minutes + "m " + rest + "s" : Math.floor(minutes / 60) + "h " + (minutes % 60) + "m";
}

export function h(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
