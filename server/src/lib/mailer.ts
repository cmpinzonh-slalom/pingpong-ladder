import nodemailer from 'nodemailer';
import { config } from '../config';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Test hook: capture outgoing mail instead of sending. */
let testOutbox: MailMessage[] | null = null;
export function captureMailForTesting(outbox: MailMessage[] | null): void {
  testOutbox = outbox;
}

/**
 * Sends an email via SMTP (Gmail by default). If SMTP isn't configured,
 * the message is logged to the console so local development still works.
 * Swap this implementation to change providers (Resend, Graph API, ...).
 */
export async function sendMail(msg: MailMessage): Promise<void> {
  if (testOutbox) {
    testOutbox.push(msg);
    return;
  }
  const { host, port, user, pass, from } = config.smtp;
  if (!user || !pass) {
    console.log(`\n[mailer] SMTP not configured. Email to ${msg.to}:\n  ${msg.subject}\n  ${msg.text}\n`);
    return;
  }
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  await transporter.sendMail({ from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
}
