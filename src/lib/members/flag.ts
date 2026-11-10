import { isProduction } from '@/lib/env';
import { isFlagOn } from '@/lib/flags';

/**
 * The Vercel Flags flag behind member accounts (#136). Toggle it per environment in the Vercel
 * dashboard (Flags). It fails closed like `snow`: anything but a literal `true` is off, including
 * no credentials, an unknown flag and an unreachable Flags service. Production turns it on only
 * once Turnstile has landed (#136, PR d).
 */
const MEMBERS_FLAG = 'members';

/**
 * Outside production, `MEMBERS_FLAG=on` or `off` overrides the flag, so local development, the
 * database tests and `pnpm check:built` can exercise both states. Deployments (NODE_ENV is
 * production on every Vercel deployment) always ask Vercel Flags.
 */
function localOverride(): boolean | null {
  if (isProduction()) return null;
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
