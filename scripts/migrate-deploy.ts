import { decideDeployMigration } from '@/lib/deploy-migration';

// Last step of the Vercel build, so a failed test or build never migrates.
// Production builds migrate production before the new deployment goes live;
// preview builds migrate their own Neon branch. Local builds skip.
const decision = decideDeployMigration(process.env);

if (!decision.run) {
  console.log(`Skipping migrations: ${decision.reason}.`);
} else {
  console.log(`Applying migrations to the ${decision.target} database (${decision.host}).`);
  await import('./migrate');
}
