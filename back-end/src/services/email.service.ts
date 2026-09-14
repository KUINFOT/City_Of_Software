import nodemailer from 'nodemailer';
import { env } from '../config/env';

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Single send path for every outbound email in the app — Gmail SMTP first
 * (when GMAIL_USER/GMAIL_APP_PASSWORD are set), then the Resend HTTP API,
 * then a dev-only console log so local setup never requires real
 * credentials. Extracted out of email-verification.service.ts, which used to
 * duplicate this three-way branch once per message type.
 */
export async function sendEmail({ to, subject, text, html }: SendEmailInput): Promise<void> {
  if (env.gmailUser && env.gmailAppPassword) {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: env.gmailUser,
        pass: env.gmailAppPassword.replace(/\s/g, ''),
      },
    });
    await transporter.sendMail({
      from: `City of Software <${env.gmailUser}>`,
      to,
      subject,
      text,
      html,
    });
    return;
  }

  if (!env.resendApiKey || !env.emailFrom) {
    if (env.nodeEnv === 'production') throw new Error('Email delivery is not configured.');
    console.info(`[email] Development log for ${to}: ${subject}\n${text}`);
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.emailFrom,
      to: [to],
      subject,
      html,
    }),
  });
  if (!response.ok) throw new Error('Email delivery provider rejected the email.');
}
