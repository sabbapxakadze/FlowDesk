// This is the entity's public API — everything outside entities/project
// imports from here, never a deep path like entities/project/api/useProjects.
// That's what keeps entities/project's internal structure free to change.
export type { Project } from "./model";
export { useProjects } from "./api/useProjects";
export { ProjectCard } from "./ui/ProjectCard";
