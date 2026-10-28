import type { APIRoute } from 'astro';
import { venueSuggestions } from '@/db/schema';
import {
  hasTrustedOrigin,
  jsonError,
  jsonResponse,
  readJson,
  serverError,
  validationError,
} from '@/lib/admin-api';
import { db } from '@/lib/db';
import { suggestionInputSchema } from '@/lib/suggestion-schema';
import { isSuggestionRateLimited, senderHash } from '@/lib/suggestions';

export const prerender = false;

/** Astro's clientAddress getter throws where the host can't supply it, so it's read lazily here. */
function clientIp(request: Request, readClientAddress: () => string): string | null {
  try {
    return readClientAddress();
  } catch {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  }
}

/** Public "Suggest a Venue" endpoint. Suggestions land in the Chairs' Area inbox, never on the site. */
export const POST: APIRoute = async (context) => {
  const { request } = context;
  if (!hasTrustedOrigin(request)) return jsonError(403, 'Forbidden');

  const parsed = suggestionInputSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  // A filled honeypot means a bot: report success and store nothing.
  if (parsed.data.website?.trim()) return jsonResponse({ ok: true }, 201);

  try {
    const hash = senderHash(clientIp(request, () => context.clientAddress));
    if (await isSuggestionRateLimited(db, hash)) {
      return jsonError(
        429,
        'The Chairs have received a lot of petitions recently. Please try again later.'
      );
    }

    const { website: _website, ...values } = parsed.data;
    await db.insert(venueSuggestions).values({ ...values, senderHash: hash });
    return jsonResponse({ ok: true }, 201);
  } catch (error) {
    return serverError('Create suggestion', error);
  }
};
