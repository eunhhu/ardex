export const state = {
  projects: [],
  projectId: localStorage.getItem("ardex.projectId"),
  snapshot: null,
  source: null,
  pendingRender: false,
};
