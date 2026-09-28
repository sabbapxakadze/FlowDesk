import * as notificationsRepository from "./notifications.repository.js";

// Pure pass-throughs — no broadcast to add here. The one thing that
// needs a live push (a new notification arriving) is triggered from
// issues.service.ts, right where notifiedUserIds comes back from
// writeIssueEvent; see the Phase 7 slice 3 plan's "Decisions". Reading
// or marking-read here has no one else who needs to hear about it this
// slice (no cross-tab read-state sync yet — named explicitly in the
// plan, not silently skipped).

export async function listNotifications(organizationId: string, userId: string) {
  return notificationsRepository.listForUser(organizationId, userId);
}

export async function getUnreadCount(organizationId: string, userId: string) {
  return notificationsRepository.countUnread(organizationId, userId);
}

export async function markNotificationRead(userId: string, notificationId: string) {
  return notificationsRepository.markRead(userId, notificationId);
}

export async function markAllNotificationsRead(organizationId: string, userId: string) {
  return notificationsRepository.markAllRead(organizationId, userId);
}
