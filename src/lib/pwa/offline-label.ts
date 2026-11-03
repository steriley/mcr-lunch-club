import { formatDateTime } from '@/lib/dates';

/**
 * The banner on a page served from the device's cache: "Offline · verdicts as of 3rd Nov 26, 14:05".
 * `builtAt` is the ISO time the site was built (the `mcr-built-at` meta tag).
 */
export function staleDataLabel(builtAt: string | null | undefined): string {
  const when = formatDateTime(builtAt, { fallback: '' });
  return when ? `Offline · verdicts as of ${when}` : 'Offline · saved copy of this page';
}
