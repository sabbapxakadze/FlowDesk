import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, cn } from "../../../shared/ui";
import { CreateProjectDialog } from "./CreateProjectDialog";

/**
 * "+ New project": the way to create a project (the inline form is gone, ADR 0059), the same button-and-popup shape as New issue and New label. It owns
 * the popup's open state; `className` lets the page space it (in a page header's right side it needs a little room under it, or it sits on the header's line). The page shows it only to owners and admins; the API is what actually refuses anyone else (`manage_project`).
 */
export function NewProjectButton({ organizationId, className }: { organizationId: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="create" className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)} onClick={() => setOpen(true)}>
        <Plus size={14} aria-hidden="true" />
        New project
      </Button>
      {open && <CreateProjectDialog organizationId={organizationId} onClose={() => setOpen(false)} />}
    </>
  );
}
