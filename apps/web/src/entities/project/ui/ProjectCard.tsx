import { Link } from "react-router";
import type { Project } from "../model";

/**
 * Plain Tailwind primitive classes for now, not invented semantic tokens —
 * the semantic tier doesn't exist yet (Phase 3.5, see docs/adr/0006). This
 * component gets revisited then, not before.
 */
export function ProjectCard({ project }: { project: Project }) {
  return (
    <li className="rounded-lg border border-gray-200 px-4 py-3">
      <Link to={`/projects/${project.id}`} className="block">
        <p className="font-medium">{project.name}</p>
        <p className="text-sm text-gray-500">{project.key}</p>
      </Link>
    </li>
  );
}
