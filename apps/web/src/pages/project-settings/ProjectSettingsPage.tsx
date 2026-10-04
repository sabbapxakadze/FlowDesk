import { useNavigate } from "react-router";
import { useCurrentProject } from "../../entities/project";
import { useMyRole } from "../../entities/member";
import { DeleteProjectForm } from "../../features/delete-project";
import { RenameProjectForm } from "../../features/rename-project";
import { useAuth } from "../../shared/auth/useAuth";
import { Page, PageHeader } from "../../shared/ui";

/**
 * Project settings: rename today (delete arrives in Phase 8.5 slice 3C). The
 * key is shown but not editable, because it is part of every issue key. The API
 * only accepts a rename from an owner or admin; for everyone else this page
 * shows the settings read-only instead of a form that would just fail.
 */
export function ProjectSettingsPage() {
  const { organization } = useAuth();
  const role = useMyRole(organization!.id);
  const navigate = useNavigate();
  const project = useCurrentProject();

  const canManage = role === "owner" || role === "admin";

  return (
    <Page>
      <PageHeader eyebrow={project.name} title="Settings" />

      <section className="max-w-xl">
        <h2 className="mb-3 text-lg font-semibold">General</h2>
        {canManage ? (
          <RenameProjectForm organizationId={organization!.id} project={project} />
        ) : (
          <div className="flex flex-col gap-1 text-sm">
            <p>
              <span className="text-[var(--color-text-muted)]">Name: </span>
              {project.name}
            </p>
            <p className="text-[var(--color-text-muted)]">
              Only owners and admins can change project settings.
            </p>
          </div>
        )}

        <p className="mt-6 text-sm">
          <span className="text-[var(--color-text-muted)]">Key: </span>
          <span className="font-medium">{project.key}</span>
        </p>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          The key cannot be changed: it is part of every issue key, such as {project.key}
          -12.
        </p>
      </section>

      {canManage && (
        <section className="mt-10 max-w-xl border-t border-[var(--color-border-default)] pt-4">
          <h2 className="mb-2 text-sm font-semibold">Danger zone</h2>
          <DeleteProjectForm
            organizationId={organization!.id}
            project={project}
            onDeleted={() => navigate("/projects", { replace: true, state: { notice: "This project was deleted." } })}
          />
        </section>
      )}
    </Page>
  );
}
