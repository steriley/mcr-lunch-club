import '@/lib/env'; // loads .env.local before the target is read, whatever the import order
import { checkScriptTarget } from '@/lib/script-target';

/**
 * Prints the database a script will use and exits if it may not write there.
 * Call it first in any script that writes: `guardScriptTarget(args, { writes: !dryRun })`.
 */
export function guardScriptTarget(args: readonly string[], options: { writes: boolean }): void {
  const target = checkScriptTarget(process.env, {
    writes: options.writes,
    confirmedProduction: args.includes('--production'),
  });
  console.log(target.message);
  if (!target.proceed) process.exit(1);
}
