import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { api, enc, post } from "./api.ts";
import { currentSession, currentTask, projectReview } from "./review.ts";
import { projectName, shortPath } from "./format.ts";
import type { DashboardSnapshot, ProjectSummary } from "./types.ts";
import { AddTaskDialog } from "./components/AddTaskDialog.tsx";
import { AgentControlRoom } from "./components/AgentControlRoom.tsx";
import { AskItem } from "./components/AskItem.tsx";
import { ProjectMenu } from "./components/ProjectMenu.tsx";
import { ScalePanel } from "./components/ScalePanel.tsx";
import { SessionStrip } from "./components/SessionStrip.tsx";
import { FocusCard, SummaryCard } from "./components/Summary.tsx";
import { TaskItem } from "./components/TaskItem.tsx";
import { VerificationLog } from "./components/VerificationLog.tsx";
import { VisibleOutputsPanel } from "./components/VisibleOutputsPanel.tsx";
import { Empty, Panel } from "./components/shared.tsx";
import "../styles.css";

function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectId, setProjectId] = useState(() => localStorage.getItem("ardex.projectId") || "");
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [online, setOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taskModal = useRef<HTMLDialogElement>(null);

  const activeProject = projects.find((project) => project.id === projectId) || null;
  const session = currentSession(snapshot);
  const activeTask = currentTask(snapshot, session);
  const openAsks = snapshot?.asks.filter((ask) => ask.status === "open") ?? [];
  const latestScale = snapshot?.scale.latest ?? null;
  const blockingFindings = latestScale ? latestScale.findings.filter((finding) => finding.severity === "block" && !finding.waivedAt).length : 0;
  const review = snapshot?.project ? projectReview(snapshot, session, activeTask, latestScale, openAsks, blockingFindings) : null;
  const tasks = snapshot?.tasks ?? [];
  const completedTasks = tasks.filter((task) => task.status === "done");
  const openTasks = tasks.filter((task) => task.status !== "done");

  useEffect(() => {
    void loadProjects();
  }, []);

  useEffect(() => {
    if (!projectId) {
      setOnline(false);
      setSnapshot(null);
      return;
    }
    let closed = false;
    const source = new EventSource(`/events?project=${enc(projectId)}`);
    source.addEventListener("open", () => setOnline(true));
    source.addEventListener("snapshot", (event) => {
      if (!closed) setSnapshot(JSON.parse((event as MessageEvent).data) as DashboardSnapshot);
      setOnline(true);
    });
    source.addEventListener("error", () => setOnline(false));
    void refresh(projectId);
    return () => {
      closed = true;
      source.close();
    };
  }, [projectId]);

  async function loadProjects(preferredProjectId = projectId) {
    try {
      const data = await api<{ projects: ProjectSummary[] }>("/api/projects");
      const visible = data.projects.filter((project) => project.archivedAt == null);
      setProjects(visible);
      const nextProjectId = preferredProjectId && visible.some((project) => project.id === preferredProjectId) ? preferredProjectId : visible[0]?.id ?? "";
      if (nextProjectId !== projectId) {
        selectProject(nextProjectId);
      } else if (nextProjectId) {
        await refresh(nextProjectId);
      } else {
        selectProject("");
        setSnapshot(null);
      }
      return visible;
    } catch (err) {
      showError(err);
      return [];
    }
  }

  async function refresh(id = projectId) {
    if (!id) return;
    try {
      setSnapshot(await api<DashboardSnapshot>(`/api/projects/${enc(id)}/dashboard`));
      setError(null);
    } catch (err) {
      showError(err);
    }
  }

  function selectProject(id: string) {
    setProjectId(id);
    if (id) localStorage.setItem("ardex.projectId", id);
    else localStorage.removeItem("ardex.projectId");
    setProjectMenuOpen(false);
    setProjectSearch("");
  }

  function showError(err: unknown) {
    setError(err instanceof Error ? err.message : "Ardex request failed");
  }

  async function mutate(callback: () => Promise<unknown>) {
    try {
      await callback();
      await refresh();
      setError(null);
    } catch (err) {
      showError(err);
    }
  }

  async function renameProject(name: string) {
    if (!projectId) return;
    try {
      await post(`/api/projects/${enc(projectId)}/rename`, { name });
      await loadProjects(projectId);
      setError(null);
    } catch (err) {
      showError(err);
    }
  }

  async function archiveProject() {
    if (!projectId) return;
    try {
      const archivedId = projectId;
      await post(`/api/projects/${enc(archivedId)}/archive`, {});
      await loadProjects("");
      setError(null);
    } catch (err) {
      showError(err);
    }
  }

  return (
    <>
      <header class="topbar">
        <div class="brand">
          <strong>Ardex</strong>
          <span>Live Session</span>
        </div>
        <SessionStrip snapshot={snapshot} session={session} task={activeTask} />
        <div class="project-switcher">
          <button class="project-button" type="button" aria-haspopup="dialog" onClick={() => setProjectMenuOpen(true)}>
            {activeProject ? (
              <>
                {projectName(activeProject)}
                <span>{shortPath(activeProject.path)}</span>
              </>
            ) : (
              "No project"
            )}
          </button>
          <span class={`connection ${online ? "online" : "offline"}`}>{online ? "live" : "offline"}</span>
        </div>
      </header>

      {projectMenuOpen && (
        <ProjectMenu
          projects={projects}
          activeProject={activeProject}
          search={projectSearch}
          onSearch={setProjectSearch}
          onSelect={selectProject}
          onRename={renameProject}
          onArchive={archiveProject}
          onClose={() => setProjectMenuOpen(false)}
        />
      )}

      <main>
        {error && <div class="error-banner">{error}</div>}
        <section class="summary-grid" aria-label="Project review">
          <SummaryCard label="Project Review" value={review?.level ?? "No project"} detail={review?.levelDetail ?? "register a project from CLI"} />
          <SummaryCard label="Progress" value={review?.progress ?? "0%"} detail={review?.progressDetail ?? ""} />
          <article class="summary-card">
            <FocusCard snapshot={snapshot} session={session} task={activeTask} review={review} onStart={(goal) => mutate(() => post(`/api/projects/${enc(projectId)}/session/start`, { goal, mode: "sdd_vdd" }))} />
          </article>
          <SummaryCard label="Readiness" value={review?.readiness ?? "No report"} detail={review?.readinessDetail ?? ""} />
        </section>

        <AgentControlRoom snapshot={snapshot} projectId={projectId} mutate={mutate} />

        <section class="work-grid">
          <section class="panel task-panel">
            <div class="panel-head">
              <h2>Roadmap</h2>
              <div class="panel-actions">
                <span class="muted">{snapshot?.tasks.length ?? 0}</span>
                <button type="button" onClick={() => taskModal.current?.showModal()}>Add</button>
              </div>
            </div>
            <div class="roadmap-list">
              {!tasks.length ? (
                <Empty text="No tasks." />
              ) : (
                <>
                  {openTasks.map((task) => <TaskItem key={task.id} task={task} projectId={projectId} mutate={mutate} />)}
                  {completedTasks.length > 0 && (
                    <details class="completed-tasks">
                      <summary>
                        <span class="fold-label"><span class="fold-caret" aria-hidden="true" />Completed</span>
                        <span class="fold-action"><span class="fold-show">Show</span><span class="fold-hide">Hide</span> {completedTasks.length}</span>
                      </summary>
                      <div>
                        {completedTasks.map((task) => <TaskItem key={task.id} task={task} projectId={projectId} mutate={mutate} />)}
                      </div>
                    </details>
                  )}
                </>
              )}
            </div>
          </section>

          <aside class="side-stack">
            <Panel title="Visible Outputs" count={String(snapshot?.outputs.length ?? 0)}>
              <VisibleOutputsPanel outputs={snapshot?.outputs ?? []} projectId={projectId} mutate={mutate} />
            </Panel>
            <Panel title="User Asks" count={`${openAsks.length} open`}>
              {!snapshot?.asks.length ? <Empty text="No asks." /> : snapshot.asks.map((ask) => <AskItem key={ask.id} ask={ask} projectId={projectId} mutate={mutate} />)}
            </Panel>
            <Panel title="Verification Log" count={`${snapshot?.evidence.length ?? 0} receipts`}>
              <VerificationLog evidence={snapshot?.evidence ?? []} projectId={projectId} mutate={mutate} />
            </Panel>
            <Panel title="Scale & Risk" count={latestScale ? `${latestScale.findings.length} findings` : "0"}>
              <ScalePanel report={latestScale} projectId={projectId} mutate={mutate} />
            </Panel>
          </aside>
        </section>
      </main>

      <AddTaskDialog dialogRef={taskModal} projectId={projectId} mutate={mutate} />
    </>
  );
}

render(<App />, document.getElementById("app")!);
