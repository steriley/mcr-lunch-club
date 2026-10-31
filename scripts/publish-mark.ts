import { writeFileSync } from 'node:fs';
import { closeDatabase, db } from '@/lib/db-script';
import { databaseNow, isProductionBuild } from '@/lib/publishing';

// First step of the Vercel build. Records when this production build started,
// by the database's clock, so publish:settle clears only the changes it could
// have included. Other builds skip.
const CUT_FILE = '.publish-cut';

if (!isProductionBuild(process.env)) {
  console.log(
    `Skipping publish mark: not a production build (VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'}).`
  );
} else {
  const cut = await databaseNow(db);
  writeFileSync(CUT_FILE, cut);
  console.log(`Publish cut: ${cut}.`);
  await closeDatabase();
}
