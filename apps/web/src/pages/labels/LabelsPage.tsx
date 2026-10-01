import { useState } from "react";
import { LabelBadge, useLabels } from "../../entities/label";
import { EditLabelForm } from "../../features/edit-label";
import { useAuth } from "../../shared/auth/useAuth";
import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  Page,
  PageHeader,
  Skeleton,
} from "../../shared/ui";

/**
 * Labels are shared by the whole organization (not per project), so they get an
 * organization-level page. Rename and recolour are open to every member who can
 * manage issues, like creating a label. Delete arrives in Phase 8.5 slice 3B
 * (admin-level, since it changes every issue that uses the label).
 */
export function LabelsPage() {
  const { organization } = useAuth();
  const { data: labels, isPending, isError, error } = useLabels(organization!.id);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <Page>
      <PageHeader title="Labels" />
      <p className="mb-4 text-sm text-[var(--color-text-muted)]">
        Labels are shared by every project in {organization!.name}. Renaming or
        recolouring one changes it everywhere it is used.
      </p>

      {isPending ? (
        <Skeleton className="h-12 w-full" />
      ) : isError ? (
        <ErrorText>Failed to load labels: {error.message}</ErrorText>
      ) : labels.length === 0 ? (
        <EmptyState block>
          No labels yet. Create one from an issue's edit form.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {labels.map((label) => (
            <Card
              key={label.id}
              as="li"
              className="flex items-center justify-between gap-3"
            >
              {editingId === label.id ? (
                <EditLabelForm
                  organizationId={organization!.id}
                  label={label}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <>
                  <LabelBadge label={label} />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditingId(label.id)}
                  >
                    Edit
                  </Button>
                </>
              )}
            </Card>
          ))}
        </ul>
      )}
    </Page>
  );
}
