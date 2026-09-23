import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLabels, labelKeys, LabelBadge } from "../../../entities/label";
import { useIssueLabels, issueKeys } from "../../../entities/issue";
import { attachLabel } from "../api/attachLabel";
import { detachLabel } from "../api/detachLabel";
import { createLabel } from "../api/createLabel";

/**
 * Fetches this issue's attached labels only while mounted (the edit form
 * being open) — see entities/issue/api/useIssueLabels.ts. Attach/detach
 * both invalidate this issue's label query; creating a label also
 * invalidates the org-wide label list so it shows up for other issues too.
 */
export function LabelPicker({
  organizationId,
  projectId,
  issueId,
}: {
  organizationId: string;
  projectId: string;
  issueId: string;
}) {
  const queryClient = useQueryClient();
  const { data: attached } = useIssueLabels(organizationId, projectId, issueId);
  const { data: orgLabels } = useLabels(organizationId);

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#888888");

  const attachMutation = useMutation({
    mutationFn: (labelId: string) => attachLabel(organizationId, projectId, issueId, labelId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: issueKeys.labels(issueId) });
    },
  });

  const detachMutation = useMutation({
    mutationFn: (labelId: string) => detachLabel(organizationId, projectId, issueId, labelId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: issueKeys.labels(issueId) });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const label = await createLabel(organizationId, { name: newName, color: newColor });
      await attachLabel(organizationId, projectId, issueId, label.id);
    },
    onSuccess: () => {
      setNewName("");
      void queryClient.invalidateQueries({ queryKey: labelKeys.list(organizationId) });
      void queryClient.invalidateQueries({ queryKey: issueKeys.labels(issueId) });
    },
  });

  const attachedIds = new Set((attached ?? []).map((l) => l.id));
  const available = (orgLabels ?? []).filter((l) => !attachedIds.has(l.id));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {attached?.map((label) => (
          <LabelBadge key={label.id} label={label} onRemove={() => detachMutation.mutate(label.id)} />
        ))}
      </div>

      <div className="flex items-center gap-2 text-sm">
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) attachMutation.mutate(e.target.value);
          }}
          className="rounded border border-gray-300 px-2 py-1"
        >
          <option value="">+ Add label</option>
          {available.map((label) => (
            <option key={label.id} value={label.id}>
              {label.name}
            </option>
          ))}
        </select>
      </div>

      {/*
        A plain div, not a <form> — this whole picker lives inside
        EditIssueForm's own <form>, and HTML forms can't nest. Enter in
        the name field submits the same way a form's submit would.
      */}
      <div className="flex items-center gap-2 text-sm">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim()) {
              e.preventDefault();
              createMutation.mutate();
            }
          }}
          placeholder="New label name"
          className="rounded border border-gray-300 px-2 py-1"
        />
        <input
          type="color"
          value={newColor}
          onChange={(e) => setNewColor(e.target.value)}
          className="h-8 w-8"
        />
        <button
          type="button"
          onClick={() => newName.trim() && createMutation.mutate()}
          disabled={createMutation.isPending}
          className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50"
        >
          Create
        </button>
      </div>
    </div>
  );
}
