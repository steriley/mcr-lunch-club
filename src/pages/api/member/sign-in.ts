import type { APIRoute } from 'astro';
import { waitUntil } from '@vercel/functions';
import {
  hasTrustedOrigin,
  jsonError,
  jsonResponse,
  readJson,
  serverError,
  validationError,
} from '@/lib/admin-api';
import { auth } from '@/lib/auth';
import { isChairEmail } from '@/lib/chair-accounts';
import { db } from '@/lib/db';
import { isMemberSignupEnabled } from '@/lib/env';
import { sendMail } from '@/lib/mail/send';
import { isMembersEnabled } from '@/lib/members/flag';
import {
  checkFormToken,
  checkSignInLimits,
  collectSignInEmail,
  emailHash,
  issueFormToken,
  recordSignInRequest,
  senderHash,
  signInEmail,
} from '@/lib/members/sign-in';
import { signInRequestSchema } from '@/lib/members/sign-in-schema';

export const prerender = false;

const NO_STORE = { 'Cache-Control': 'no-store' };

/** The same answer whether or not an email belongs to anyone, a Chair, or a refused request. */
const accepted = () =>
  jsonResponse({ ok: true, message: 'Check your email for a sign-in link and code.' });

function clientIp(request: Request, readClientAddress: () => string): string | null {
  try {
    return readClientAddress();
  } catch {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  }
}

/** The time-trap token for the sign-in form, fetched when the form opens. */
export const GET: APIRoute = async () => {
  if (!(await isMembersEnabled())) return jsonError(404, 'Not found');
  return new Response(JSON.stringify({ formToken: issueFormToken() }), {
    headers: { 'Content-Type': 'application/json', ...NO_STORE },
  });
};

/**
 * Asks for a member sign-in email (#136): one email with a magic link and a 6-digit code.
 * Checks run cheapest first; refusals that could reveal something answer like a success.
 */
export const POST: APIRoute = async (context) => {
  const { request } = context;
  if (!(await isMembersEnabled())) return jsonError(404, 'Not found');
  if (!isMemberSignupEnabled()) {
    return jsonError(503, 'Signing in by email is paused. Please try again later.');
  }
  if (!hasTrustedOrigin(request)) return jsonError(403, 'Forbidden');

  const parsed = signInRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const { email, formToken, website } = parsed.data;

  // A filled honeypot or an instant submit is a bot: answer as usual, send nothing.
  if (website?.trim()) return accepted();
  const timing = checkFormToken(formToken);
  if (timing === 'too_fast') return accepted();
  if (timing !== 'ok') return jsonError(400, 'This form has expired. Please reload the page.');

  try {
    const hashes = {
      email: emailHash(email),
      sender: senderHash(clientIp(request, () => context.clientAddress)),
    };
    const limited = await checkSignInLimits(db, hashes);
    if (limited !== 'ok') {
      return jsonError(
        429,
        limited === 'site'
          ? 'The club’s post room is overwhelmed today. Please try again tomorrow.'
          : 'Too many sign-in emails. Please wait a few minutes and try again.'
      );
    }
    await recordSignInRequest(db, hashes);

    // Chairs never sign in by email: no link or code is made for them (src/lib/auth-config.ts).
    if (await isChairEmail(db, email)) return accepted();

    const parts = await collectSignInEmail(async () => {
      await auth.api.signInMagicLink({
        headers: request.headers,
        body: { email, callbackURL: '/' },
      });
      await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
    });
    if (!parts.url || !parts.otp) throw new Error('The sign-in link or code was not made.');

    // Not awaited, so the response time never depends on the mail service.
    waitUntil(sendMail(signInEmail(email, { url: parts.url, otp: parts.otp })));
    return accepted();
  } catch (error) {
    return serverError('Member sign-in request', error);
  }
};
