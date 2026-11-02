import { get } from '@vercel/edge-config';

/** The Edge Config key behind the Christmas snowfall flag. Toggle it in the Vercel dashboard. */
const SNOW_FLAG = 'snow';

/**
 * Whether the snowfall is switched on. Anything but a literal `true` is off, including no
 * EDGE_CONFIG (local dev, unlinked previews) and an unreachable store: the flag is decoration,
 * so it fails closed.
 */
export async function isSnowEnabled(): Promise<boolean> {
  if (!process.env.EDGE_CONFIG) return false;
  try {
    return (await get(SNOW_FLAG)) === true;
  } catch {
    return false;
  }
}
