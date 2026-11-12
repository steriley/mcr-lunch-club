import { isFlagSwitchedOff } from '@/lib/flags';

/**
 * The kill switch for the public contact form (#132): the `contact` Vercel Flag. Unlike `members`
 * it fails open: the form is on unless the flag is reachable and set to `false`, so a Flags outage
 * or a flag nobody has made yet never takes it down. Switching it off needs no deploy: the API
 * answers 503 and the island (on a prerendered page) asks GET /api/contact on load and shows the
 * fallback.
 */
const CONTACT_FLAG = 'contact';

/**
 * Off Vercel, `CONTACT_FORM=on` or `off` overrides the flag, so local builds, the tests and
 * `pnpm check:built` can exercise both states. Vercel sets `VERCEL=1` in every deployment, so
 * deployments always ask Vercel Flags.
 */
function localOverride(): boolean | null {
  if (process.env.VERCEL) return null;
  const value = process.env.CONTACT_FORM?.trim().toLowerCase();
  if (value === 'on') return true;
  if (value === 'off') return false;
  return null;
}

export async function isContactEnabled(): Promise<boolean> {
  const override = localOverride();
  if (override !== null) return override;
  return !(await isFlagSwitchedOff(CONTACT_FLAG));
}
