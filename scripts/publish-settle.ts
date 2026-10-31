import { existsSync, readFileSync } from 'node:fs';
import { closeDatabase, db } from '@/lib/db-script';
import { isProductionBuild, settlePublish } from '@/lib/publishing';

// Last step of the Vercel build, so a failed build never gets here and its
// changes stay pending. Clears the changes saved before the cut that
// publish:mark recorded at the start of this build. Production builds only.
const CUT_FILE = '.publish-cut';

if (!isProductionBuild(process.env)) {
  console.log(
    `Skipping publish settle: not a production build (VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'}).`
  );
} else if (!existsSync(CUT_FILE)) {
  // The site itself built fine, so do not fail the deploy over bookkeeping: the changes stay
  // pending, and the nightly publish would build them again.
  console.error(`No ${CUT_FILE}, so pending changes were left in place.`);
} else {
  const cut = readFileSync(CUT_FILE, 'utf8').trim();
  const cleared = await settlePublish(db, cut);
  console.log(`Publish settled at ${cut}: ${cleared} pending change(s) cleared.`);
  await closeDatabase();
}
