import { useMutation } from "@tanstack/react-query";
import { apiPostVoid } from "../../../shared/api/client";
import { Button, Dialog, ErrorText } from "../../../shared/ui";

/**
 * "Forgot it?" for someone who is already logged in: a small popup instead of the public forgot-password page. The
 * address is the account's own (no field to type), so one click sends the same reset link the public page sends.
 * That endpoint answers the same way for any address, so the message below is the same wording as the public page.
 */
export function ResetByEmailDialog({ email, onClose }: { email: string; onClose: () => void }) {
  const mutation = useMutation({ mutationFn: () => apiPostVoid("/v1/auth/password-reset/request", { email }) });

  return (
    <Dialog title="Reset your password by email" onClose={onClose} className="max-w-md">
      {mutation.isSuccess ? (
        <>
          <p role="status" className="text-sm">
            If that email has an account, a reset link is on its way to <strong>{email}</strong>. The link opens a page where you choose a new password.
          </p>
          <div className="mt-5 flex justify-end">
            <Button type="button" onClick={onClose} data-autofocus>
              Close
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm">
            We will send a link to <strong>{email}</strong>. Opening it lets you choose a new password without the old one.
          </p>
          {mutation.isError && <ErrorText>{mutation.error.message}</ErrorText>}
          <div className="mt-5 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" pending={mutation.isPending} onClick={() => mutation.mutate()} data-autofocus>
              {mutation.isPending ? "Sending…" : "Send reset link"}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
