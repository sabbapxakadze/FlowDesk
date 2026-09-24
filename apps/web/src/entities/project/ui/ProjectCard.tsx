import { Link } from "react-router";
import type { Project } from "../model";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <li className="rounded-[var(--radius-card)] border border-[var(--color-border-default)] px-4 py-3">
      <Link to={`/projects/${project.id}`} className="block">
        <p className="font-medium">{project.name}</p>
        <p className="text-sm text-[var(--color-text-muted)]">{project.key}</p>
      </Link>
    </li>
  );
}
