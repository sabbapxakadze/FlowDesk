import { useInvitations, useRevokeInvitation } from "../../entities/invitation";
import { ROLE_LABELS, useMembers, useMyRole } from "../../entities/member";
import { InviteMemberForm, ResendInvitation } from "../../features/invite-member";
import { MemberControls } from "../../features/manage-member";
import { useAuth } from "../../shared/auth/useAuth";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorText,
  Page,
  PageHeader,
  Skeleton,
  Time,
} from "../../shared/ui";

/**
 * The organization's people and, for owners and admins, who has been invited. Everyone
 * in the organization can see the member list; the invite form and the pending list are
 * for owners and admins only (the API enforces it with manage_members; hiding them here
 * is just so nobody is offered a button that would be refused).
 */
export function MembersPage() {
  const { organization, user } = useAuth();
  const organizationId = organization!.id;
  const role = useMyRole(organizationId);
  const canManage = role === "owner" || role === "admin";

  const members = useMembers(organizationId);
  const invitations = useInvitations(organizationId, { enabled: canManage });
  const revoke = useRevokeInvitation(organizationId);

  return (
    <Page>
      <PageHeader title="Members" />
      <p className="mb-4 text-sm text-[var(--color-text-muted)]">People in {organization!.name}.</p>

      {canManage && <InviteMemberForm organizationId={organizationId} />}

      {members.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : members.isError ? (
        <ErrorText>Failed to load members: {members.error.message}</ErrorText>
      ) : (
        <ul aria-label="Members" className="flex flex-col gap-2">
          {members.data.map((member) => (
            <Card key={member.userId} as="li" className="flex flex-wrap items-center gap-3">
              <Avatar name={member.name} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {member.name}
                  {member.userId === user?.id && (
                    <span className="ml-2 text-xs font-normal text-[var(--color-text-muted)]">(you)</span>
                  )}
                </p>
                <p className="truncate text-xs text-[var(--color-text-muted)]">{member.email}</p>
              </div>
              <span className="shrink-0 text-xs font-medium">{ROLE_LABELS[member.role]}</span>
              <span className="hidden shrink-0 text-xs text-[var(--color-text-muted)] sm:inline">
                Joined <Time iso={member.joinedAt} />
              </span>
              {/* Not for yourself and never for the owner: the API refuses both (ADR 0024). */}
              {canManage && member.userId !== user?.id && member.role !== "owner" && (
                <div className="w-full">
                  <MemberControls organizationId={organizationId} member={member} />
                </div>
              )}
            </Card>
          ))}
        </ul>
      )}

      {canManage && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-semibold">Pending invitations</h2>
          {invitations.isPending ? (
            <Skeleton className="h-12 w-full" />
          ) : invitations.isError ? (
            <ErrorText>Failed to load invitations: {invitations.error.message}</ErrorText>
          ) : invitations.data.length === 0 ? (
            <EmptyState block>No pending invitations.</EmptyState>
          ) : (
            <ul aria-label="Pending invitations" className="flex flex-col gap-2">
              {invitations.data.map((invitation) => (
                // Keyed by email, not id: a re-send replaces the row with a new id, and the
                // new link it shows must survive that refetch.
                <Card key={invitation.email} as="li" className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{invitation.email}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      Invited by {invitation.invitedByName} <Time iso={invitation.createdAt} />
                      {invitation.expired && (
                        <span className="ml-2 font-medium text-[var(--color-text-warning)]">Expired</span>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium">{ROLE_LABELS[invitation.role]}</span>
                  <ResendInvitation
                    organizationId={organizationId}
                    invitationId={invitation.id}
                    email={invitation.email}
                  />
                  <Button
                    type="button"
                    variant="link"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(invitation.id)}
                  >
                    Revoke
                  </Button>
                </Card>
              ))}
            </ul>
          )}
          {revoke.isError && <ErrorText className="mt-2">{revoke.error.message}</ErrorText>}
        </section>
      )}
    </Page>
  );
}
