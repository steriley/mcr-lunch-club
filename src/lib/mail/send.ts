import { getMailEnvironment } from '@/lib/env';

/**
 * The one module that sends email (#136). It talks to Resend's HTTP API from the server only, so
 * no browser code or CSP entry is involved. Outside the Production deployment it never sends:
 * it logs the message instead, so local development, CI and Previews can follow sign-in links
 * without an inbox and without using the production quota.
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type MailResult = 'sent' | 'logged' | 'failed';

const RESEND_URL = 'https://api.resend.com/emails';

/** Swapped out by tests, which assert on what would be sent. */
export const mailTransport = {
  async post(apiKey: string, body: unknown): Promise<Response> {
    return fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },
  log(message: MailMessage): void {
    console.info(
      `[mail] Not sending (not Production). To ${message.to}: ${message.subject}\n${message.text}`
    );
  },
};

/** Sends, or logs outside Production. Never throws: a failed send is logged and reported. */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  const mail = getMailEnvironment();
  if (mail.mode === 'log') {
    mailTransport.log(message);
    return 'logged';
  }
  // Production: send or fail, and never log the message itself (it carries sign-in secrets).
  if (!mail.apiKey || !mail.from) {
    console.error('[mail] Not sent: set RESEND_API_KEY and MAIL_FROM or RESEND_EMAIL_DOMAIN.');
    return 'failed';
  }
  try {
    const response = await mailTransport.post(mail.apiKey, {
      from: mail.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    if (response.ok) return 'sent';
    // The body may echo the address; log the status only.
    console.error(`[mail] Resend answered ${response.status}.`);
    return 'failed';
  } catch (error) {
    console.error('[mail] Send failed:', error instanceof Error ? error.message : 'unknown error');
    return 'failed';
  }
}
