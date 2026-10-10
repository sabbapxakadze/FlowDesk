import { useState } from "react";
import { Plus } from "lucide-react";
import { useLabels } from "../../entities/label";
import { useMyRole } from "../../entities/member";
import { NewLabelForm } from "../../features/create-label";
import { DeleteLabelButton } from "../../features/delete-label";
import { EditLabelForm } from "../../features/edit-label";
import { useAuth } from "../../shared/auth/useAuth";
import {
  Button,
  EmptyState,
  ErrorText,
  Page,
  PageHeader,
  Skeleton,
  useAnimatedList,
} from "../../shared/ui";
import { LABEL_COLUMNS, LabelRow } from "./ui/LabelRow";

/**
 * Labels are shared by the whole organization (not per project), so they get an
 * organization-level page. Creating, renaming and recolouring are open to every
 * member who can manage issues (not viewers); delete is admin-level, since it
 * changes every issue that uses the label. "New label" opens the same kind of
 * inline row as Edit, at the top of the list.
 */
export function LabelsPage() {
  const { organization } = useAuth();
  const { data: labels, isPending, isError, error } = useLabels(organization!.id);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const labelRows = useAnimatedList(labels ?? [], (label) => label.id, { ready: !isPending });
  const role = useMyRole(organization!.id);
  const canDelete = role === "owner" || role === "admin";
  const canCreate = role !== undefined && role !== "viewer";

  return (
    <Page>
      <PageHeader
        title="Labels"
        aside={
          canCreate && !creating ? (
            <Button type="button" variant="create" className="mb-2 inline-flex items-center gap-1.5 whitespace-nowrap" onClick={() => setCreating(true)}>
              <Plus size={14} aria-hidden="true" />
              New label
            </Button>
          ) : undefined
        }
      />
      <p className="mb-4 text-sm text-[var(--color-text-muted)]">
        Labels are shared by every project in {organization!.name}. Renaming or
        recolouring one changes it everywhere it is used.
        {labels && labels.length > 0 && (
          <span className="mt-1 block font-medium text-[var(--color-text-default)]">
            {labels.length} {labels.length === 1 ? "label" : "labels"}
          </span>
        )}
      </p>

      {creating && (
        <div className="mb-3 rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3.5 py-3">
          <NewLabelForm organizationId={organization!.id} onDone={() => setCreating(false)} />
        </div>
      )}

      {isPending ? (
        <Skeleton className="h-12 w-full" />
      ) : isError ? (
        <ErrorText>Failed to load labels: {error.message}</ErrorText>
      ) : labelRows.length === 0 ? (
        <EmptyState block>
          No labels yet. {canCreate ? "Use New label above, or create one" : "Create one"} from an issue's edit form.
        </EmptyState>
      ) : (
        // One surface, like the Issues list (ADR 0036): a header strip above, the rows beneath it.
        <div className="@container overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
          <div
            aria-hidden="true"
            className={`hidden gap-x-3 border-b border-[var(--color-border-default)] bg-[var(--color-border-default)]/30 px-3.5 py-1.5 text-xs text-[var(--color-text-muted)] @2xl:grid ${LABEL_COLUMNS}`}
          >
            <span>Label</span>
            <span>Colour</span>
            <span>Created</span>
            <span />
          </div>
          <ul className="divide-y divide-[var(--color-border-default)]">
            {labelRows.map(({ key, item: label, state, index }) => (
              <LabelRow
                key={key}
                label={label}
                state={state}
                index={index}
                editing={
                  editingId === label.id ? (
                    <EditLabelForm organizationId={organization!.id} label={label} onDone={() => setEditingId(null)} />
                  ) : null
                }
                actions={
                  <>
                    <Button variant="secondary" size="sm" onClick={() => setEditingId(label.id)}>
                      Edit
                    </Button>
                    {canDelete && <DeleteLabelButton organizationId={organization!.id} label={label} />}
                  </>
                }
              />
            ))}
          </ul>
        </div>
      )}
    </Page>
  );
}
