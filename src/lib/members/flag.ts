import { isFlagOn } from '@/lib/flags';

/**
 * The Vercel Flags flag behind member accounts (#136). Toggle it per environment in the Vercel
 * dashboard (Flags). It fails closed like `snow`: anything but a literal `true` is off, including
 * no credentials, an unknown flag and an unreachable Flags service. Production turns it on only
 * once Turnstile has landed (#136, PR d).
 */
const MEMBERS_FLAG = 'members';

/**
 * Off Vercel, `MEMBERS_FLAG=on` or `off` overrides the flag, so local development, the database
 * tests, a local `pnpm build` (whose prerendered pages show the member header only with the flag
 * on) and `pnpm check:built` can exercise both states. Vercel sets `VERCEL=1` in every deployment's
 * build and functions, so deployments always ask Vercel Flags. (NODE_ENV can't tell them apart:
 * `astro build` runs as production everywhere.)
 */
function localOverride(): boolean | null {
  if (process.env.VERCEL) return null;
  const value = process.env.MEMBERS_FLAG?.trim().toLowerCase();
  if (value === 'on') return true;
  if (value === 'off') return false;
  return null;
}

export async function isMembersEnabled(): Promise<boolean> {
  const override = localOverride();
  if (override !== null) return override;
  return isFlagOn(MEMBERS_FLAG);
}
