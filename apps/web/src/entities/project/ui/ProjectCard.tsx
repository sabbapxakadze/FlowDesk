import { Link } from "react-router";
import { Card } from "../../../shared/ui";
import type { Project } from "../model";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Card as="li" hoverable>
      <Link to={`/projects/${project.id}`} className="flex items-center justify-between gap-3">
        <p className="font-medium">{project.name}</p>
        <span className="rounded-full border border-[var(--color-border-input)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-muted)]">
          {project.key}
        </span>
      </Link>
    </Card>
  );
}
