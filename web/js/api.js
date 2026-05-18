import { hideError, showError } from "./dom.js";

export async function api(path, init) {
  const response = await fetch(path, init);
  const envelope = await response.json();
  if (!envelope.ok) {
    const message = envelope.error?.message || "Ardex request failed";
    showError(message);
    throw new Error(message);
  }
  hideError();
  return envelope.data;
}

export async function post(path, body) {
  return await api(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
