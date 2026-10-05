import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiPostVoid } from "../../../shared/api/client";
import { useAuth } from "../../../shared/auth/useAuth";
import { Button, ErrorText } from "../../../shared/ui";

/**
 * "Sign out of all devices": ends every session of this account, this one included, so a lost laptop or a forgotten
 * public computer cannot be used any more. Asks first, in place. The server finds the account from this browser's
 * refresh cookie and revokes every session family (`POST /auth/logout-all`); then this tab clears itself and the
 * router sends the person to the login page. Other devices stop working when their short-lived access token runs out
 * (a few minutes), the same as after a password change.
 */
export function SignOutEverywhere() {
  const { logout } = useAuth();
  const [asking, setAsking] = useState(false);
  const mutation = useMutation({
    mutationFn: () => apiPostVoid("/v1/auth/logout-all"),
    onSuccess: () => logout(),
  });

  if (!asking) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setAsking(true)}>
        Sign out of all devices
      </Button>
    );
  }

  return (
    <div role="alertdialog" aria-label="Sign out of all devices" className="motion-rise-in flex flex-col gap-2">
      <p className="text-sm">This signs you out here and on every other device. You will need to log in again.</p>
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? "Signing out…" : "Yes, sign out everywhere"}
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={mutation.isPending} onClick={() => setAsking(false)}>
          Cancel
        </Button>
      </div>
      {mutation.isError && <ErrorText>{mutation.error.message}</ErrorText>}
    </div>
  );
}
