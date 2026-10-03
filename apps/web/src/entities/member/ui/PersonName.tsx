import { Avatar, PersonHover } from "../../../shared/ui";
import { useMembers } from "../api/useMembers";
import { ROLE_LABELS } from "../lib/roleLabels";

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
  avatarOnly = false,
  avatarSize = "sm",
  align,
}: {
  organizationId: string;
  userId: string;
  name: string;
  withAvatar?: boolean;
  /** Just the picture (for a list row that writes the name separately); same card, same link. */
  avatarOnly?: boolean;
  avatarSize?: "sm" | "md";
  /** "right" for a name at the right end of a row, so its card opens leftwards. */
  align?: "left" | "right";
}) {
  const { data: members } = useMembers(organizationId);
  const member = members?.find((m) => m.userId === userId);
  const shownName = member?.name ?? name;

  return (
    <PersonHover
      name={shownName}
      roleLabel={member ? ROLE_LABELS[member.role] : undefined}
      email={member?.email}
      avatarUrl={member?.avatarUrl}
      jobTitle={member?.jobTitle}
      // Only people still in the organization have a profile to open.
      profileHref={member ? `/people/${member.userId}` : undefined}
      align={align}
    >
      {avatarOnly ? (
        <Avatar name={shownName} src={member?.avatarUrl} size={avatarSize} />
      ) : withAvatar ? (
        <>
          <Avatar name={shownName} src={member?.avatarUrl} size={avatarSize} />
          {shownName}
        </>
      ) : undefined}
    </PersonHover>
  );
}
