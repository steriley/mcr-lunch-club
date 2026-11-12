import { count, desc, eq, lt, ne } from 'drizzle-orm';
import { contactMessages, type ContactMessageRow } from '@/db/schema';
import { CONTACT_RETENTION_DAYS, type ContactStatus } from '@/lib/contact-schema';
import type { Database } from '@/lib/db-client';
import { fail, ok, type Outcome } from '@/lib/outcome';

/**
 * The Chairs' contact inbox (#132): reading, marking and deleting messages from the public contact
 * form. Chairs-only; nothing public imports this module (src/test/public-safety.test.ts). None of
 * these operations changes the public site, so none returns `published`.
 */

/** What the inbox shows: never the sender or body hashes. */
function serializeContactMessage(row: ContactMessageRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    topic: row.topic,
    message: row.message,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export type SerializedContactMessage = ReturnType<typeof serializeContactMessage>;

/** The inbox lists new and read messages together, newest first; the other tab, handled ones. */
export type ContactInboxView = 'inbox' | 'handled';

export async function loadContactMessages(db: Database, view: ContactInboxView) {
  const where =
    view === 'handled'
      ? eq(contactMessages.status, 'handled')
      : ne(contactMessages.status, 'handled');
  const [rows, counts] = await Promise.all([
    db
      .select()
      .from(contactMessages)
      .where(where)
      .orderBy(desc(contactMessages.createdAt))
      .limit(200),
    db
      .select({ status: contactMessages.status, total: count() })
      .from(contactMessages)
      .groupBy(contactMessages.status),
  ]);
  const totals = new Map<ContactStatus, number>(counts.map((row) => [row.status, row.total]));
  return { messages: rows.map(serializeContactMessage), totals };
}

type ContactInboxError = 'contact_message_not_found';

export async function setContactMessageStatus(
  db: Database,
  id: string,
  status: ContactStatus
): Promise<Outcome<{ message: SerializedContactMessage }, ContactInboxError>> {
  const [row] = await db
    .update(contactMessages)
    .set({ status })
    .where(eq(contactMessages.id, id))
    .returning();
  return row ? ok({ message: serializeContactMessage(row) }) : fail('contact_message_not_found');
}

export async function deleteContactMessage(
  db: Database,
  id: string
): Promise<Outcome<{ ok: true }, ContactInboxError>> {
  const [row] = await db
    .delete(contactMessages)
    .where(eq(contactMessages.id, id))
    .returning({ id: contactMessages.id });
  return row ? ok({ ok: true as const }) : fail('contact_message_not_found');
}

/** The retention rule: messages older than CONTACT_RETENTION_DAYS go, whatever their status. */
export async function deleteExpiredContactMessages(
  db: Database,
  now: Date = new Date()
): Promise<number> {
  const cutoff = new Date(now.getTime() - CONTACT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .delete(contactMessages)
    .where(lt(contactMessages.createdAt, cutoff))
    .returning({ id: contactMessages.id });
  return rows.length;
}
