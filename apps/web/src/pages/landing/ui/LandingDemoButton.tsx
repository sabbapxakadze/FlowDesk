import { startAppTour } from "../../../features/app-tour";
import { TryDemoButton } from "../../../features/try-demo";

/**
 * "Try the demo" as the landing page shows it (ADR 0044): the same size as the other two buttons, and once the visitor is in, the guided
 * tour starts. "WEB" is the demo copy's first project (the demo data always has it), which the tour walks through. This is the page layer
 * putting two features together; the features themselves never import each other.
 */
export function LandingDemoButton() {
  return <TryDemoButton onStarted={() => startAppTour("WEB")} className="h-12 bg-[var(--color-bg-surface)] px-8 text-base" />;
}
