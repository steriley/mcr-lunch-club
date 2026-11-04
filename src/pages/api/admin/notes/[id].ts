import { adminRoute, jsonError, jsonResponse } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { deleteNote, editNote } from '@/lib/field-notes';
import { noteInputSchema } from '@/lib/field-notes-schema';

export const prerender = false;

const NOT_YOURS = 'Only the Chair who made this visit can change its notes.';

/** PATCH /api/admin/notes/[id]: replace the text of a note on your own visit, body `{ body }`. */
export const PATCH = adminRoute(
  {
    action: 'Edit field note',
    params: { id: 'note_not_found' },
    body: noteInputSchema,
  },
  async ({ params, body, actor }) => {
    const outcome = await editNote(db, params.id, actor, body.body);
    if (outcome.result === 'not_found') return jsonError(404, 'Note not found.');
    if (outcome.result === 'not_your_visit') return jsonError(403, NOT_YOURS);
    return jsonResponse({ note: outcome.note });
  }
);

/** DELETE /api/admin/notes/[id]: delete a note on your own visit. */
export const DELETE = adminRoute(
  { action: 'Delete field note', params: { id: 'note_not_found' } },
  async ({ params, actor }) => {
    const outcome = await deleteNote(db, params.id, actor);
    if (outcome.result === 'not_found') return jsonError(404, 'Note not found.');
    if (outcome.result === 'not_your_visit') return jsonError(403, NOT_YOURS);
    return jsonResponse({ ok: true });
  }
);
