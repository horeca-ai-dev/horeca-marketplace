/**
 * sendEmail() — the only way the app sends e-mail (D2-B4). SMTP to Mailpit in every environment.
 *
 * Called ONLY from job processors in the worker (CLAUDE.md rule 11): never inside a transaction or a
 * web request. To send an e-mail, enqueue an `email.send` job in the same transaction as the data.
 * Templates (React Email) arrive with D6-B3; until then callers pass plain text (and optional HTML).
 */
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/env";

export type Email = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

let transporter: Transporter | undefined;

function transport(): Transporter {
  // One connection pool per worker process, created on first use (SMTP_URL exists only in the worker).
  transporter ??= nodemailer.createTransport(env.SMTP_URL);
  return transporter;
}

/** Sends one e-mail; resolves with the SMTP message id. Throws on failure → pg-boss retries the job. */
export async function sendEmail(email: Email): Promise<string> {
  const info = await transport().sendMail({
    from: env.EMAIL_FROM,
    to: email.to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
  return info.messageId;
}

/** Worker shutdown and tests. */
export function closeEmail(): void {
  transporter?.close();
  transporter = undefined;
}
