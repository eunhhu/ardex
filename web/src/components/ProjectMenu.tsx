import { projectName, shortPath } from "../format.ts";
import type { ProjectSummary } from "../types.ts";
import { Empty } from "./shared.tsx";
import { useEffect, useRef, useState } from "preact/hooks";

export function ProjectMenu({
  projects,
  activeProject,
  search,
  onSearch,
  onSelect,
  onRename,
  onArchive,
  onClose,
}: {
  projects: ProjectSummary[];
  activeProject: ProjectSummary | null;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (id: string) => void;
  onRename: (name: string) => Promise<void>;
  onArchive: () => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(activeProject?.name ?? "");
  const [busy, setBusy] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const query = search.trim().toLowerCase();
  const filteredProjects = projects.filter((project) => query.length === 0 || [project.id, project.name, project.path].join(" ").toLowerCase().includes(query));
  const cleanName = name.trim();
  const canRename = activeProject !== null && cleanName.length > 0 && cleanName !== activeProject.name;

  useEffect(() => {
    searchInput.current?.focus();
  }, []);

  useEffect(() => {
    setName(activeProject?.name ?? "");
  }, [activeProject?.id, activeProject?.name]);

  async function submitRename(event: Event) {
    event.preventDefault();
    if (!canRename || busy) return;
    setBusy(true);
    try {
      await onRename(cleanName);
    } finally {
      setBusy(false);
    }
  }

  async function archiveCurrent() {
    if (activeProject === null || busy) return;
    setBusy(true);
    try {
      await onArchive();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="command-menu" onClick={(event) => event.currentTarget === event.target && onClose()}>
      <div class="command-panel" role="dialog" aria-label="Projects">
        <input ref={searchInput} autoComplete="off" placeholder="Search projects" value={search} onInput={(event) => onSearch(event.currentTarget.value)} />
        {activeProject && (
          <div class="project-cleanup" aria-label="Current project cleanup">
            <div>
              <strong>{projectName(activeProject)}</strong>
              <span>{shortPath(activeProject.path)}</span>
            </div>
            <form onSubmit={submitRename}>
              <input aria-label="Project name" value={name} onInput={(event) => setName(event.currentTarget.value)} />
              <button type="submit" disabled={!canRename || busy}>
                Rename
              </button>
            </form>
            <button type="button" class="danger-button" disabled={busy} onClick={archiveCurrent}>
              Archive
            </button>
          </div>
        )}
        <div class="command-list">
          {filteredProjects.length === 0 ? (
            <Empty text="No matching projects." />
          ) : (
            filteredProjects.map((project) => (
              <button type="button" class="command-item" key={project.id} onClick={() => onSelect(project.id)}>
                <strong>{projectName(project)}</strong>
                <span>{shortPath(project.path)}</span>
                <em>{project.id}</em>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
