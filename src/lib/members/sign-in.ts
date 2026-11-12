import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac } from 'node:crypto';
import { and, eq, gte, lt, lte, sql } from 'drizzle-orm';
import { memberSignInRequests } from '@/db/schema';
import type { Database } from '@/lib/db-client';
import { getAuthEnvironment, getMemberSignInDailyCap } from '@/lib/env';
import { formTokens } from '@/lib/form-token';
import type { MailMessage } from '@/lib/mail/send';

/**
 * Member sign-in by email (#136): one request sends one email carrying a magic link and a 6-digit
 * code. The public route (src/pages/api/member/sign-in.ts) runs the checks here, cheapest first;
 * Better Auth's own request endpoints are closed to the web (src/lib/members/auth-paths.ts), so
 * nothing reaches the mail sender without passing them.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long a link or code works, in seconds. */
export const SIGN_IN_EXPIRES_SECONDS = 10 * 60;
/** Wrong codes allowed before a code stops working. */
export const SIGN_IN_CODE_ATTEMPTS = 5;

const SIGN_IN_LIMITS = {
  perEmailShort: { max: 3, windowMs: 15 * MINUTE },
  perEmailDay: { max: 10, windowMs: DAY },
  perSenderHour: { max: 10, windowMs: HOUR },
} as const;

function keyed(purpose: string, value: string): string {
  return createHmac('sha256', getAuthEnvironment().secret)
    .update(`${purpose}:${value}`)
    .digest('hex')
    .slice(0, 32);
}

/** Keyed hash of an email address, normalised; the address itself is never stored. */
export const emailHash = (email: string) => keyed('member-sign-in:email', normaliseEmail(email));
/** Keyed hash of the sender's IP, domain-separated from the suggestion form's. */
export const senderHash = (ip: string | null) => (ip ? keyed('member-sign-in:ip', ip) : null);

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type LimitResult = 'ok' | 'email' | 'sender' | 'site';

/**
 * Reserves a sign-in email against the limits (#136): the request is recorded first and then
 * counted together with everything before it, in one query, so requests sent at the same moment
 * can't all pass a check that none of them has been recorded against yet. A refused request
 * takes its row back out, so refusals never use up anyone's allowance. Rows older than two days
 * are dropped.
 */
export async function reserveSignIn(
  db: Database,
  hashes: { email: string; sender: string | null },
  now: Date = new Date()
): Promise<LimitResult> {
  const [reserved] = await db
    .insert(memberSignInRequests)
    .values({ emailHash: hashes.email, senderHash: hashes.sender, createdAt: now })
    .returning({ id: memberSignInRequests.id });

  const since = (ms: number) => new Date(now.getTime() - ms);
  const { perEmailShort, perEmailDay, perSenderHour } = SIGN_IN_LIMITS;
  const { createdAt, emailHash: email, senderHash: sender } = memberSignInRequests;
  const within = (ms: number) => sql`${createdAt} >= ${since(ms)}`;
  const [counts] = await db
    .select({
      site: sql<number>`count(*)::int`,
      emailShort: sql<number>`count(*) filter (where ${email} = ${hashes.email} and ${within(perEmailShort.windowMs)})::int`,
      emailDay: sql<number>`count(*) filter (where ${email} = ${hashes.email})::int`,
      senderHour: sql<number>`count(*) filter (where ${sender} = ${hashes.sender} and ${within(perSenderHour.windowMs)})::int`,
    })
    .from(memberSignInRequests)
    .where(and(gte(createdAt, since(DAY)), lte(createdAt, now)));

  const result: LimitResult =
    (counts?.site ?? 0) > getMemberSignInDailyCap()
      ? 'site'
      : (counts?.emailShort ?? 0) > perEmailShort.max || (counts?.emailDay ?? 0) > perEmailDay.max
        ? 'email'
        : hashes.sender && (counts?.senderHour ?? 0) > perSenderHour.max
          ? 'sender'
          : 'ok';

  if (result !== 'ok') {
    await db.delete(memberSignInRequests).where(eq(memberSignInRequests.id, reserved.id));
  } else {
    await db.delete(memberSignInRequests).where(lt(createdAt, since(2 * DAY)));
  }
  return result;
}

/** The sign-in form's time trap (src/lib/form-token.ts); the purpose keeps its tokens its own. */
const signInForm = formTokens('member-sign-in-form');
export const issueFormToken = (now?: Date) => signInForm.issue(now);
export const checkFormToken = (token: unknown, now?: Date) => signInForm.check(token, now);
export { MAX_FORM_MS, MIN_FORM_MS } from '@/lib/form-token';

/**
 * Better Auth hands the magic link and the code to two separate callbacks. While the route asks
 * for both, it collects them here so the member gets one email. A callback with no collection
 * running (Better Auth called some other way) drops the message rather than send it.
 */
export interface SignInEmailParts {
  url?: string;
  otp?: string;
}

const collection = new AsyncLocalStorage<SignInEmailParts>();

export async function collectSignInEmail(run: () => Promise<unknown>): Promise<SignInEmailParts> {
  const parts: SignInEmailParts = {};
  await collection.run(parts, run);
  return parts;
}

/** Called from the Better Auth callbacks in auth-config.ts. False when nothing is collecting. */
export function recordSignInEmailPart(part: SignInEmailParts): boolean {
  const parts = collection.getStore();
  if (!parts) return false;
  Object.assign(parts, part);
  return true;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** The sign-in email: the link, the code, how long they last, and what to do if it wasn't you. */
export function signInEmail(to: string, parts: Required<SignInEmailParts>): MailMessage {
  const minutes = SIGN_IN_EXPIRES_SECONDS / 60;
  const text = [
    'Sign in to the MCR Lunch Club',
    '',
    `Open this link to sign in: ${parts.url}`,
    '',
    `Or enter this code on the sign-in page: ${parts.otp}`,
    '',
    `The link and the code work once and for the next ${minutes} minutes.`,
    'If you didn’t ask to sign in, ignore this email; nothing changes.',
  ].join('\n');
  const html = `<p>Sign in to the MCR Lunch Club</p>
<p><a href="${escapeHtml(parts.url)}">Sign in</a></p>
<p>Or enter this code on the sign-in page: <strong style="font-size:1.4em;letter-spacing:0.15em">${escapeHtml(parts.otp)}</strong></p>
<p>The link and the code work once and for the next ${minutes} minutes.</p>
<p>If you didn’t ask to sign in, ignore this email; nothing changes.</p>`;
  return { to, subject: 'Sign in to the MCR Lunch Club', text, html };
}
