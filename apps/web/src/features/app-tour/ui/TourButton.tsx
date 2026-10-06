import { CircleHelp } from "lucide-react";
import { useProjects } from "../../../entities/project";
import { useAuth } from "../../../shared/auth/useAuth";
import { startTour } from "../../../shared/tour";
import { buildTourSteps } from "../tourSteps";

/**
 * The Tutorial button (ADR 0040): starts the guided tour. It is a sidebar row, so the sidebar passes the row's look in `className`;
 * the tour goes through the person's first project, which is read here so the steps can point at it.
 */
export function TourButton({ className }: { className?: string }) {
  const { organization } = useAuth();
  const { data: projects } = useProjects(organization?.id ?? "", {
    enabled: Boolean(organization),
  });
  return (
    <button
      type="button"
      data-tour="tour-button"
      className={className}
      onClick={() => startTour(buildTourSteps(projects?.[0]?.key))}
    >
      <span className="flex items-center gap-2">
        <CircleHelp aria-hidden className="h-4 w-4" />
        Tutorial
      </span>
    </button>
  );
}
