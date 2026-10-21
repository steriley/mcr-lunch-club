import { decidePreviewMigration } from '@/lib/preview-migration';

// Runs in the Vercel build: applies migrations to a preview deployment's own
// Neon branch so its schema matches the code. Production and local builds skip.
const decision = decidePreviewMigration(process.env);

if (!decision.run) {
  console.log(`Skipping migrations: ${decision.reason}.`);
} else {
  console.log(`Applying migrations to preview database branch (${decision.host}).`);
  await import('./migrate');
}
