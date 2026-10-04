import { useOutletContext } from "react-router";
import type { Project } from "../model";

/**
 * The project the current address names. The `ProjectRoute` layout (pages/project-route) resolves the key
 * in the URL against the project list ONCE and renders its child pages only when a project was found, so
 * inside those pages this is never null; they carry on with `project.id` exactly as before.
 */
export function useCurrentProject(): Project {
  return useOutletContext<Project>();
}
