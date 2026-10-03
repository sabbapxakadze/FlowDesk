import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { profileKeys, useProfileNudge } from "../../../entities/profile";
import { apiPostVoid } from "../../../shared/api/client";
import { useAuth } from "../../../shared/auth/useAuth";
import { Avatar, Button, buttonVariants, Card, cn } from "../../../shared/ui";

/**
 * "Finish your profile" (the owner's design N): a small dismissible card at the top of Projects,
 * shown while the profile has no photo, job title or bio. Sign-up stays as short as it was; this
 * is the invitation afterwards. "Not now" is remembered on the account (not the browser) and the
 * card never returns; filling in anything makes it go away by itself.
 */
export function ProfileNudgeCard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: show } = useProfileNudge({ enabled: Boolean(user) });
  const dismiss = useMutation({
    mutationFn: () => apiPostVoid("/v1/users/me/profile-nudge/dismiss"),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: profileKeys.all }),
  });

  if (!show || !user) return null;

  return (
    <Card aria-label="Finish your profile" role="region" className="mb-4 flex flex-wrap items-center gap-4 p-4">
      <Avatar name={user.name} size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Finish your profile</p>
        <p className="text-xs text-[var(--color-text-muted)]">
          Add a photo and a line about yourself so your team knows who they are talking to.
        </p>
      </div>
      <div className="flex gap-2">
        <Link to="/profile" className={cn(buttonVariants({ size: "sm" }), "inline-block")}>
          Add photo
        </Link>
        <Button type="button" size="sm" variant="secondary" disabled={dismiss.isPending} onClick={() => dismiss.mutate()}>
          Not now
        </Button>
      </div>
    </Card>
  );
}
