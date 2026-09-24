import { Link } from "react-router";
import { Card } from "../../../shared/ui";
import type { Project } from "../model";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Card as="li">
      <Link to={`/projects/${project.id}`} className="block">
        <p className="font-medium">{project.name}</p>
        <p className="text-sm text-[var(--color-text-muted)]">{project.key}</p>
      </Link>
    </Card>
  );
}
