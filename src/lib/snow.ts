import { isFlagOn } from '@/lib/flags';

/** The Vercel Flags flag behind the Christmas snowfall. Toggle it in the Vercel dashboard (Flags). */
const SNOW_FLAG = 'snow';

/** Whether the snowfall is switched on. The flag is decoration, so it fails closed (src/lib/flags.ts). */
export function isSnowEnabled(): Promise<boolean> {
  return isFlagOn(SNOW_FLAG);
}
