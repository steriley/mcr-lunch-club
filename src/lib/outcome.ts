import type { Database, Tx } from '@/lib/db-client';

/**
 * One outcome type for every domain operation (#112).
 *
 * A domain module returns an `Outcome` instead of throwing or inventing its
 * own result shape. The error is a code (`venue_not_found`, `slug_taken`, …),
 * never an HTTP status or a message: `adminRoute` maps codes to responses
 * once (src/lib/admin-api.ts). An operation that changed what the public site
 * shows also says so with `published`, and `adminRoute` records the pending
 * change and, for `'now'`, asks for a build.
 */

/** A change to the public site, as the operation that made it describes it. */
export interface PublicChange {
  /** Names the action in the publish bar and the log, e.g. "Update venue". */
  action: string;
  /** The venue the operation changed, or null when it concerns no venue. */
  venueId: string | null;
  /**
   * The venue's name as the operation saw it. Leave it out and the name is
   * looked up when the change is recorded; give it when the venue is about to
   * go (a deletion), so the bar can still name it.
   */
  venueName?: string | null;
  /** `'queue'` records the change only; `'now'` also asks Vercel for a build. */
  when: 'queue' | 'now';
}

export type Outcome<T, E extends string = string> =
  | { ok: true; value: T; published?: PublicChange }
  | {
      ok: false;
      error: E;
      /** A message specific to this failure, for the few that depend on data (a venue's name). */
      detail?: string;
    };

/** A public change that waits for the Chairs to publish (`'queue'`), or builds the site at once (`'now'`). */
export function publicChange(
  action: string,
  venueId: string | null,
  when: PublicChange['when'] = 'queue'
): PublicChange {
  return { action, venueId, when };
}

export function ok<T>(value: T, published?: PublicChange): Outcome<T, never> {
  return published ? { ok: true, value, published } : { ok: true, value };
}

export function fail<E extends string>(error: E, detail?: string): Outcome<never, E> {
  return detail === undefined ? { ok: false, error } : { ok: false, error, detail };
}

/** Transforms the value of a success; a failure passes through untouched. */
export function mapOutcome<T, U, E extends string>(
  outcome: Outcome<T, E>,
  transform: (value: T) => U
): Outcome<U, E> {
  return outcome.ok ? { ...outcome, value: transform(outcome.value) } : outcome;
}

/**
 * Runs `work` in a transaction that rolls back when it returns a failure, so
 * an operation can refuse part-way through without throwing. A failure is
 * returned as it was; any other error still throws.
 */
export async function outcomeTransaction<T, E extends string>(
  db: Database | Tx,
  work: (tx: Tx) => Promise<Outcome<T, E>>
): Promise<Outcome<T, E>> {
  let refused: Outcome<never, E> | null = null;
  try {
    return await db.transaction(async (tx) => {
      const outcome = await work(tx);
      if (!outcome.ok) {
        refused = outcome;
        tx.rollback();
      }
      return outcome;
    });
  } catch (error) {
    if (refused) return refused;
    throw error;
  }
}
