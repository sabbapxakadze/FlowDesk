import { startTour } from "../../../shared/tour";
import { buildTourSteps } from "../tourSteps";

/** Starts the guided tour (ADR 0040) without the sidebar button, for the one who knows the project to walk through (the demo's "WEB"). */
export function startAppTour(projectKey?: string): void {
  startTour(buildTourSteps(projectKey));
}
