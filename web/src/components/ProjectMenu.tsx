import { projectName, shortPath } from "../format.ts";
import type { ProjectSummary } from "../types.ts";
import { Empty } from "./shared.tsx";

export function ProjectMenu({ projects, search, onSearch, onSelect, onClose }: { projects: ProjectSummary[]; search: string; onSearch: (value: string) => void; onSelect: (id: string) => void; onClose: () => void }) {
  const query = search.trim().toLowerCase();
  const filteredProjects = projects.filter((project) => query.length === 0 || [project.id, project.name, project.path].join(" ").toLowerCase().includes(query));
  return (
    <div class="command-menu" onClick={(event) => event.currentTarget === event.target && onClose()}>
      <div class="command-panel" role="dialog" aria-label="Projects">
        <input autoFocus autoComplete="off" placeholder="Search projects" value={search} onInput={(event) => onSearch(event.currentTarget.value)} />
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
