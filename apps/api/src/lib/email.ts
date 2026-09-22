import { Resend } from "resend";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * A small wrapper, not the Resend client used directly everywhere — this
 * is the actual port/adapter boundary. Swapping providers later means
 * rewriting this one file; nothing that calls sendEmail (or the two
 * template functions below) needs to change.
 */
const resend = new Resend(env.RESEND_API_KEY);

async function sendEmail(input: { to: string; subject: string; html: string }): Promise<void> {
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: input.to,
    subject: input.subject,
    html: input.html,
  });

  if (error) {
    // A failed send is logged, not thrown — see the callers in
    // auth.service.ts for why (registration/reset-request shouldn't fail
    // just because the email provider had a bad moment).
    logger.error({ err: error, to: input.to }, "failed to send email");
  }
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = `${env.APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to,
    subject: "Verify your FlowDesk email",
    html: `<p>Confirm your email address to finish setting up your FlowDesk account.</p><p><a href="${link}">Verify email</a></p><p>This link expires in 24 hours.</p>`,
  });
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to,
    subject: "Reset your FlowDesk password",
    html: `<p>Someone requested a password reset for this FlowDesk account. If that was you:</p><p><a href="${link}">Reset password</a></p><p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`,
  });
}
