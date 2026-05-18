export const els = {
  projectButton: document.getElementById("projectButton"),
  projectMenu: document.getElementById("projectMenu"),
  projectSearch: document.getElementById("projectSearch"),
  projectList: document.getElementById("projectList"),
  connection: document.getElementById("connection"),
  goalCard: document.getElementById("goalCard"),
  statusCard: document.getElementById("statusCard"),
  taskCard: document.getElementById("taskCard"),
  scaleCard: document.getElementById("scaleCard"),
  taskCount: document.getElementById("taskCount"),
  askCount: document.getElementById("askCount"),
  evidenceCount: document.getElementById("evidenceCount"),
  outputCount: document.getElementById("outputCount"),
  scaleCount: document.getElementById("scaleCount"),
  tasks: document.getElementById("tasks"),
  asks: document.getElementById("asks"),
  outputs: document.getElementById("outputs"),
  evidence: document.getElementById("evidence"),
  scale: document.getElementById("scale"),
  errorBanner: document.getElementById("errorBanner"),
  openTaskModal: document.getElementById("openTaskModal"),
  taskModal: document.getElementById("taskModal"),
};

export function isEditing() {
  if (els.taskModal.open || !els.projectMenu.hidden) {
    return true;
  }
  const active = document.activeElement;
  return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
}

export function setConnection(online, pending = false) {
  els.connection.textContent = online ? (pending ? "live · pending" : "live") : "offline";
  els.connection.className = "connection " + (online ? "online" : "offline");
}

export function showError(error) {
  const message = error instanceof Error ? error.message : String(error);
  els.errorBanner.textContent = message;
  els.errorBanner.hidden = false;
}

export function hideError() {
  els.errorBanner.hidden = true;
  els.errorBanner.textContent = "";
}
