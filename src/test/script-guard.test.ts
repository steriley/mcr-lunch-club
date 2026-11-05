import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// Scripts that write to the database must call guardScriptTarget (or be listed
// here with the reason). Without it a run can quietly hit the wrong database.
const NO_GUARD_NEEDED: Record<string, string> = {
  'migrate-deploy.ts': 'has its own production/preview decision (deploy-migration.ts)',
  'publish-mark.ts': 'runs only inside the production build and only reads the database clock',
  'publish-settle.ts':
    'runs only inside the production build, which has already chosen the database',
};

describe('database scripts', () => {
  it('call guardScriptTarget unless they are exempt', () => {
    const missing = readdirSync('scripts')
      .filter((file) => file.endsWith('.ts') && !(file in NO_GUARD_NEEDED))
      .filter((file) => {
        const source = readFileSync(`scripts/${file}`, 'utf8');
        return source.includes("'@/lib/db-script'") && !source.includes('guardScriptTarget(');
      });
    assert.deepEqual(missing, []);
  });
});
