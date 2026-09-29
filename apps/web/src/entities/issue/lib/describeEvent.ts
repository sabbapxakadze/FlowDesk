import type { IssueEvent } from "@flowdesk/contracts";
import { STATUS_LABELS } from "../../../shared/ui";

/**
 * Moved out of IssueDetailPage.tsx (Phase 7 slice 3) — the notification
 * feed needs the exact same "actor did X" sentences for events on
 * issues the viewer isn't currently looking at. A second real
 * consumer, so this earns its own place in entities/issue rather than
 * staying page-local.
 */
export function describeEvent(event: IssueEvent): string {
  switch (event.type) {
    case "issue.created":
      return "created this issue";
    case "issue.label_added":
      return `added the "${String(event.payload.labelName)}" label`;
    case "issue.label_removed":
      return `removed the "${String(event.payload.labelName)}" label`;
    case "issue.updated": {
      const parts: string[] = [];
      if ("title" in event.payload) parts.push(`changed the title to "${String(event.payload.title)}"`);
      if ("status" in event.payload) parts.push(`changed status to ${String(event.payload.status)}`);
      if ("description" in event.payload) parts.push("updated the description");
      return parts.length > 0 ? parts.join(", ") : "updated this issue";
    }
    case "issue.moved": {
      const fromStatus = String(event.payload.fromStatus);
      const toStatus = String(event.payload.toStatus);
      return fromStatus === toStatus
        ? "reordered this issue"
        : `moved this issue to ${STATUS_LABELS[toStatus as keyof typeof STATUS_LABELS] ?? toStatus}`;
    }
    case "issue.commented":
      return "commented";
    case "issue.attachment_added":
      return `attached "${String(event.payload.filename)}"`;
    case "issue.attachment_removed":
      return `removed the attachment "${String(event.payload.filename)}"`;
    case "issue.sprint_assigned":
      return `assigned this issue to ${String(event.payload.sprintName)}`;
    case "issue.sprint_removed":
      return event.payload.reason === "sprint_completed"
        ? `moved this issue back to the backlog (${String(event.payload.sprintName)} completed)`
        : "moved this issue back to the backlog";
    default:
      return event.type;
  }
}
