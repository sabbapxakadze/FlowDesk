import { IDLE_LIMIT_MS, IDLE_WARNING_MS } from "../../../shared/auth/idle-config";
import { useAuth } from "../../../shared/auth/useAuth";
import { useIdleTimeout } from "../../../shared/auth/useIdleTimeout";
import { Button, Dialog } from "../../../shared/ui";

/**
 * The inactivity warning (ADR 0038). Mounted once for the whole app; it renders nothing while someone is active or signed out.
 * After `IDLE_LIMIT_MS` without the person's own input a dialog says they will be signed out in a minute and offers
 * "Stay signed in"; at zero the session ends (revoked on the server too) and the login page explains why. Esc or the X count as
 * "stay": the person pressed something, so they are there.
 */
export function IdleLogout() {
  const { user, logout, endSession } = useAuth();
  const { secondsLeft, keepAlive } = useIdleTimeout({
    enabled: Boolean(user),
    idleMs: IDLE_LIMIT_MS,
    warnMs: IDLE_WARNING_MS,
    onTimeout: () => endSession("idle"),
  });

  if (secondsLeft === null) return null;
  return (
    <Dialog title="Still there?" onClose={keepAlive} dismissOnBackdrop={false}>
      <p className="text-sm">
        You have been inactive for a while. To keep your account safe you will be signed
        out in{" "}
        <b>
          {secondsLeft} {secondsLeft === 1 ? "second" : "seconds"}
        </b>
        .
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={logout}>
          Sign out now
        </Button>
        <Button type="button" variant="success" data-autofocus onClick={keepAlive}>
          Stay signed in
        </Button>
      </div>
    </Dialog>
  );
}
