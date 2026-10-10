import { useState } from "react";
import { Plus } from "lucide-react";
import { useProjects } from "../../../entities/project";
import { Button, Dialog, Dropdown, Field } from "../../../shared/ui";
import { CreateIssueDialog } from "./CreateIssueDialog";

/**
 * "New issue" for a page that is not inside one project (My work): the same popup as the project pages, preceded by a choice of
 * project when there is more than one. `defaultProjectId` (the project of the issue you touched last) is preselected, else the
 * first project. With exactly one project it goes straight to the popup, and with none the button is disabled and says why.
 * No "C" shortcut here: the project pages own that key (ADR 0035).
 */
export function NewIssueAnywhere({ organizationId, defaultProjectId }: { organizationId: string; defaultProjectId?: string }) {
  const projects = useProjects(organizationId);
  const list = projects.data ?? [];
  const [step, setStep] = useState<"closed" | "choose" | "create">("closed");
  const [picked, setPicked] = useState<string | null>(null);
  const projectId = picked ?? list.find((project) => project.id === defaultProjectId)?.id ?? list[0]?.id ?? null;

  function begin() {
    setPicked(null);
    setStep(list.length === 1 ? "create" : "choose");
  }

  return (
    <>
      <Button
        type="button"
        variant="create"
        disabled={list.length === 0}
        title={list.length === 0 && projects.isSuccess ? "Create a project first" : undefined}
        className="inline-flex items-center gap-1.5 whitespace-nowrap"
        onClick={begin}
      >
        <Plus size={14} aria-hidden="true" />
        New issue
      </Button>
      {step === "choose" && (
        <Dialog title="New issue" onClose={() => setStep("closed")}>
          <div className="flex flex-col gap-3">
            <Field label="Project">
              <Dropdown value={projectId ?? ""} onChange={setPicked} options={list.map((project) => ({ value: project.id, label: `${project.name} (${project.key})` }))} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep("closed")}>
                Cancel
              </Button>
              <Button type="button" variant="success" disabled={projectId === null} onClick={() => setStep("create")}>
                Continue
              </Button>
            </div>
          </div>
        </Dialog>
      )}
      {step === "create" && projectId !== null && <CreateIssueDialog organizationId={organizationId} projectId={projectId} onClose={() => setStep("closed")} />}
    </>
  );
}
