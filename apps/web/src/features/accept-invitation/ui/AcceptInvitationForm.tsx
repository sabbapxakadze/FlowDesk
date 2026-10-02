import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { z } from "zod";
import { acceptInvitationRequestSchema } from "@flowdesk/contracts";
import { ApiError } from "../../../shared/api/client";
import { Button, buttonVariants, ErrorText, Field, Input, Skeleton } from "../../../shared/ui";
import { acceptInvitation } from "../api/acceptInvitation";
import { previewInvitation } from "../api/previewInvitation";

// The token comes from the URL, not from the form.
const formSchema = acceptInvitationRequestSchema.omit({ token: true });
type FormValues = z.infer<typeof formSchema>;

/**
 * The accept page's content. It first asks the server what this link is for (who
 * invited you, to which organization, with which role, for which email); a link that
 * is unknown, used, revoked or expired shows one plain message. The email is fixed:
 * it is the address the invitation was sent to, so it is shown, not editable. Like
 * registering, accepting does not log you in; the next step is the login page.
 */
export function AcceptInvitationForm({ token }: { token: string }) {
  const preview = useQuery({
    queryKey: ["invitation-preview", token],
    queryFn: () => previewInvitation(token),
    // A bad link will not become good by asking again.
    retry: false,
  });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  const mutation = useMutation({
    mutationFn: (data: FormValues) => acceptInvitation({ token, ...data }),
    onError: (err) => {
      if (err instanceof ApiError && err.details) {
        for (const [field, messages] of Object.entries(err.details)) {
          setError(field as keyof FormValues, { message: messages[0] });
        }
      }
    },
  });

  if (preview.isPending) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (preview.isError) {
    return (
      <div className="flex flex-col gap-3">
        <ErrorText>{preview.error.message}</ErrorText>
        <p className="text-sm text-[var(--color-text-muted)]">Ask the person who invited you to send a new invitation.</p>
      </div>
    );
  }

  const { organizationName, inviterName, email, role } = preview.data;

  if (mutation.isSuccess) {
    return (
      <p className="text-sm">
        Welcome to <strong>{mutation.data.organization.name}</strong>. Your account is ready.{" "}
        <Link to="/login" className={buttonVariants({ variant: "link" })}>
          Log in
        </Link>
      </p>
    );
  }

  const showGeneralError =
    mutation.isError && !(mutation.error instanceof ApiError && mutation.error.details);

  return (
    <>
      <p className="mb-5 text-sm">
        <strong>{inviterName}</strong> invited you to join <strong>{organizationName}</strong> as a {role}.
        Choose your name and a password to create your account.
      </p>
      <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="flex flex-col gap-4">
        <Field label="Email">
          <Input type="email" value={email} readOnly className="w-full" />
        </Field>

        <Field label="Name" error={errors.name?.message}>
          <Input {...register("name")} autoComplete="name" aria-invalid={errors.name ? true : undefined} className="w-full" />
        </Field>

        <Field label="Password" error={errors.password?.message}>
          <Input type="password" {...register("password")} autoComplete="new-password" aria-invalid={errors.password ? true : undefined} className="w-full" />
        </Field>

        {showGeneralError && <ErrorText>{mutation.error?.message}</ErrorText>}

        <Button type="submit" fullWidth disabled={mutation.isPending}>
          {mutation.isPending ? "Creating account…" : "Join"}
        </Button>
      </form>
    </>
  );
}
