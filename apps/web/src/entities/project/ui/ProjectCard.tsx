import { Link } from "react-router";
import { projectPath } from "../../../shared/lib/paths";
import { Card, type RowState } from "../../../shared/ui";
import type { Project } from "../model";

export function ProjectCard({
  project,
  rowState,
  rowIndex,
}: {
  project: Project;
  /** Motion of a row in a useAnimatedList list (see Card). */
  rowState?: RowState;
  rowIndex?: number;
}) {
  return (
    <Card as="li" hoverable rowState={rowState} rowIndex={rowIndex}>
      <Link to={projectPath(project.key)} className="flex items-center justify-between gap-3">
        <p className="font-medium">{project.name}</p>
        <span className="rounded-full border border-[var(--color-border-input)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-muted)]">
          {project.key}
        </span>
      </Link>
    </Card>
  );
}
