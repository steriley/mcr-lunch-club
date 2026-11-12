import { createHmac } from 'node:crypto';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { contactMessages } from '@/db/schema';
import type { ContactInput } from '@/lib/contact-schema';
import type { Database } from '@/lib/db-client';
import { getAuthEnvironment } from '@/lib/env';

/**
 * The public contact form's write path (#132): the only code outside the Chairs' Area that
 * touches contact_messages, and it only writes. Reading, updating and deleting messages is in
 * src/lib/contact-inbox.ts.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const CONTACT_RATE_LIMITS = {
  perSenderHour: 3,
  perSenderDay: 10,
  /** Site-wide, so a flood can't bury the inbox. */
  perDay: 50,
} as const;

function keyed(purpose: string, value: string): string {
  return createHmac('sha256', getAuthEnvironment().secret)
    .update(`${purpose}:${value}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Keyed hash of the sender's IP, domain-separated from the other forms'; the IP is never stored.
 * Senders whose address the host can't supply share one bucket, so the per-sender limits and the
 * repeat check still apply to them together.
 */
export const contactSenderHash = (ip: string | null) => keyed('contact', ip ?? 'unknown');

/**
 * Keyed hash of a message body for the duplicate check. Case, spacing and Unicode compatibility
 * forms are folded first, so the same message pasted again with a changed line break still counts.
 */
export function contactBodyHash(message: string): string {
  const folded = message.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  return keyed('contact:body', folded);
}

export type ContactSubmitResult =
  { result: 'stored'; id: string } | { result: 'duplicate' | 'sender' | 'site' };

/**
 * Stores a message unless it breaks a limit (#132). Like the sign-in requests, the row is written
 * first and then counted with everything before it in one query, so messages sent at the same
 * moment can't all pass a check none of them has been counted against. A refused or repeated
 * message takes its row back out, so it never shows in the inbox or uses up an allowance.
 *
 * A repeat is the same sender and the same body (after folding) within a day, sent before this one.
 */
export async function submitContactMessage(
  db: Database,
  input: Pick<ContactInput, 'name' | 'email' | 'topic' | 'message'>,
  senderHash: string | null,
  now: Date = new Date()
): Promise<ContactSubmitResult> {
  const bodyHash = contactBodyHash(input.message);
  const [stored] = await db
    .insert(contactMessages)
    .values({
      name: input.name,
      email: input.email,
      topic: input.topic,
      message: input.message,
      senderHash,
      bodyHash,
      createdAt: now,
    })
    .returning({ id: contactMessages.id });

  const { createdAt, senderHash: sender, bodyHash: body, id } = contactMessages;
  const fromSender = senderHash ? sql`${sender} = ${senderHash}` : sql`false`;
  // Only a message strictly before this one makes it a repeat, so of two identical messages sent
  // at the same moment (a double click), the first is kept and only the second is dropped.
  const earlier = sql`(${createdAt}, ${id}) < (${now}, ${stored.id})`;
  const [counts] = await db
    .select({
      site: sql<number>`count(*)::int`,
      senderDay: sql<number>`count(*) filter (where ${fromSender})::int`,
      senderHour: sql<number>`count(*) filter (where ${fromSender} and ${createdAt} >= ${new Date(now.getTime() - HOUR)})::int`,
      repeats: sql<number>`count(*) filter (where ${fromSender} and ${body} = ${bodyHash} and ${earlier})::int`,
    })
    .from(contactMessages)
    .where(and(gte(createdAt, new Date(now.getTime() - DAY)), lte(createdAt, now)));

  const { perSenderHour, perSenderDay, perDay } = CONTACT_RATE_LIMITS;
  const refused =
    (counts?.repeats ?? 0) > 0
      ? 'duplicate'
      : (counts?.site ?? 0) > perDay
        ? 'site'
        : (counts?.senderHour ?? 0) > perSenderHour || (counts?.senderDay ?? 0) > perSenderDay
          ? 'sender'
          : null;

  if (refused) {
    await db.delete(contactMessages).where(eq(contactMessages.id, stored.id));
    return { result: refused };
  }
  return { result: 'stored', id: stored.id };
}
