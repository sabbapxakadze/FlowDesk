import { Avatar, PersonHover } from "../../../shared/ui";
import { useMembers } from "../api/useMembers";

const ROLE_LABELS = { owner: "Owner", admin: "Admin", member: "Member", viewer: "Viewer" } as const;

/**
 * A person wherever a sentence or a row mentions one: their name (optionally with
 * a small avatar) as a button that opens the hover card with their role and email,
 * taken from the organization's member list (fetched once and shared). Using this
 * everywhere a person appears keeps them looking the same on every screen.
 *
 * `name` is the fallback when the person is not in the member list any more (they
 * left the organization): the card then shows only the name and avatar.
 */
export function PersonName({
  organizationId,
  userId,
  name,
  withAvatar = false,
  avatarSize = "sm",
}: {
  organizationId: string;
  userId: string;
  name: string;
  withAvatar?: boolean;
  avatarSize?: "sm" | "md";
}) {
  const { data: members } = useMembers(organizationId);
  const member = members?.find((m) => m.userId === userId);
  const shownName = member?.name ?? name;

  return (
    <PersonHover
      name={shownName}
      roleLabel={member ? ROLE_LABELS[member.role] : undefined}
      email={member?.email}
    >
      {withAvatar ? (
        <>
          <Avatar name={shownName} size={avatarSize} />
          {shownName}
        </>
      ) : undefined}
    </PersonHover>
  );
}
