import type { APIRoute } from 'astro';
import {
  hasTrustedOrigin,
  jsonError,
  jsonResponse,
  serverError,
  validationError,
} from '@/lib/admin-api';
import { isContactEnabled } from '@/lib/contact-flag';
import { contactInputSchema } from '@/lib/contact-schema';
import { contactSenderHash, submitContactMessage } from '@/lib/contact-submit';
import { db } from '@/lib/db';
import { formTokens } from '@/lib/form-token';
import { notifyChairs } from '@/lib/push/dispatch';

export const prerender = false;

/** Generous for a 3000-character message in any script, JSON-escaped, plus the other fields. */
export const CONTACT_MAX_BODY_BYTES = 16 * 1024;

const contactForm = formTokens('contact-timetrap');

const DISABLED = 'The contact form is closed for now. Please try again later.';

/** Honeypot, too fast and repeats answer exactly like a stored message. */
const accepted = () => jsonResponse({ ok: true }, 201);

type ContactLogOutcome =
  | 'accepted'
  | 'honeypot'
  | 'too_fast'
  | 'expired'
  | 'duplicate'
  | 'rate_limited_sender'
  | 'rate_limited_site';

/** One line per outcome, never a name, address, IP or message, so the thresholds can be tuned. */
function logOutcome(outcome: ContactLogOutcome): void {
  console.info(`[contact] ${outcome}`);
}

function clientIp(request: Request, readClientAddress: () => string): string | null {
  try {
    return readClientAddress();
  } catch {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  }
}

/** The body as JSON, or a Response saying why not: too large (413) or not JSON at all (400). */
async function readCappedJson(request: Request): Promise<unknown | Response> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > CONTACT_MAX_BODY_BYTES) {
    return jsonError(413, 'That message is too long to send.');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > CONTACT_MAX_BODY_BYTES) {
    return jsonError(413, 'That message is too long to send.');
  }
  try {
    return JSON.parse(text);
  } catch {
    return jsonError(400, 'Please correct the highlighted fields.');
  }
}

/**
 * Whether the form is open, and its time-trap token. The page is prerendered, so the island asks
 * this when it loads; never cached.
 */
export const GET: APIRoute = async () => {
  const enabled = await isContactEnabled();
  return jsonResponse(enabled ? { enabled, formToken: contactForm.issue() } : { enabled });
};

/**
 * The public contact form (#132). Messages land in the Chairs' inbox and nowhere else: nothing
 * public changes, so there is no publishing, and nothing here sends email. Checks run cheapest
 * first; a bot that trips the honeypot, the time trap or the repeat check is told it worked.
 */
export const POST: APIRoute = async (context) => {
  const { request } = context;
  if (!(await isContactEnabled())) return jsonError(503, DISABLED);
  if (!hasTrustedOrigin(request)) return jsonError(403, 'Forbidden');

  const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') {
    return jsonError(415, 'Send the form as JSON.');
  }
  const body = await readCappedJson(request);
  if (body instanceof Response) return body;

  const parsed = contactInputSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const { formToken, website, ...input } = parsed.data;

  if (website?.trim()) {
    logOutcome('honeypot');
    return accepted();
  }
  const timing = contactForm.check(formToken);
  if (timing === 'too_fast') {
    logOutcome('too_fast');
    return accepted();
  }
  if (timing !== 'ok') {
    logOutcome('expired');
    return jsonError(400, 'This form has expired. Please reload the page and send it again.');
  }

  try {
    const sender = contactSenderHash(clientIp(request, () => context.clientAddress));
    const submitted = await submitContactMessage(db, input, sender);
    switch (submitted.result) {
      case 'stored':
        logOutcome('accepted');
        // Only once the message is safely stored, and never awaited: a failed push fails nothing.
        notifyChairs({ type: 'contact' });
        return accepted();
      case 'duplicate':
        logOutcome('duplicate');
        return accepted();
      case 'site':
        logOutcome('rate_limited_site');
        return jsonError(
          429,
          'The Chairs’ post tray is overflowing today. Please write again tomorrow.'
        );
      case 'sender':
        logOutcome('rate_limited_sender');
        return jsonError(
          429,
          'The Chairs have had several letters from you already. Please give them time to read them before writing again.'
        );
    }
  } catch (error) {
    return serverError('Contact message', error);
  }
};
