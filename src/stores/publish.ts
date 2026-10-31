import { atom } from 'nanostores';

/**
 * Set whenever an admin response reports the pending-change count (the
 * `X-Unpublished-Changes` header, see src/lib/api-fetch.ts), so the bar across
 * the Chairs' Area can refresh without a page reload. A fresh object each time,
 * so an unchanged count still tells the bar something was saved.
 */
export const $unpublishedChanges = atom<{ count: number } | null>(null);

export function noteUnpublishedChanges(count: number): void {
  $unpublishedChanges.set({ count });
}
