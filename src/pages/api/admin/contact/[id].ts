import { adminRoute } from '@/lib/admin-api';
import { deleteContactMessage, setContactMessageStatus } from '@/lib/contact-inbox';
import { contactStatusSchema } from '@/lib/contact-schema';
import { db } from '@/lib/db';

export const prerender = false;

const NOT_FOUND = 'contact_message_not_found' as const;

/** Mark a contact message read, handled, or back to new (#132). Changes nothing public. */
export const PATCH = adminRoute(
  { action: 'Update contact message', params: { id: NOT_FOUND }, body: contactStatusSchema },
  ({ params, body }) => setContactMessageStatus(db, params.id, body.status)
);

/** Delete a message for good: replying is done, or it was spam. */
export const DELETE = adminRoute(
  { action: 'Delete contact message', params: { id: NOT_FOUND } },
  ({ params }) => deleteContactMessage(db, params.id)
);
