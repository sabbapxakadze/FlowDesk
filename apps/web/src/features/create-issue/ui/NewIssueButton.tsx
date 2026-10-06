import { useState } from "react";
import { Plus } from "lucide-react";
import { useShortcut } from "../../../shared/lib/useShortcut";
import { Button } from "../../../shared/ui";
import { CreateIssueDialog } from "./CreateIssueDialog";

/**
 * "+ New issue" with a small C badge: the one way to create an issue, on both the Issues and the Board page (ADR 0035). It owns
 * the popup's open state and the "C" key; `useShortcut` already ignores the key while typing, with a modifier, or with any
 * dialog or the issue side panel in the way. Teal (`create`), the same in light and dark; the default `primary` flips between near-black
 * and near-white with the theme. The badge only says the key exists, so a phone (no keyboard) hides it.
 */
export function NewIssueButton({
  organizationId,
  projectId,
}: {
  organizationId: string;
  projectId: string;
}) {
  const [open, setOpen] = useState(false);
  useShortcut("c", () => setOpen(true));

  return (
    <>
      <Button
        type="button"
        variant="create"
        aria-keyshortcuts="c"
        className="inline-flex items-center gap-1.5 whitespace-nowrap"
        onClick={() => setOpen(true)}
      >
        <Plus size={14} aria-hidden="true" />
        New issue
        <kbd
          aria-hidden="true"
          className="rounded-[var(--radius-control)] border border-current/40 px-1.5 text-xs opacity-70 max-sm:hidden"
        >
          C
        </kbd>
      </Button>
      {open && (
        <CreateIssueDialog
          organizationId={organizationId}
          projectId={projectId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
