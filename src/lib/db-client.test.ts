import './../test/setup-env';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from './db-client';

const url = 'postgres://user:pass@localhost:5432/test';

describe('createDatabase', () => {
  it('builds a node-postgres client whose pool can be closed without connecting', async () => {
    const client = createDatabase({ url, driver: 'pg', maxConnections: 2 });
    assert.equal(client.driver, 'pg');
    assert.equal(typeof client.db.select, 'function');
    await client.close();
  });

  it('accepts a notice handler for the node-postgres driver', async () => {
    const client = createDatabase({ url, driver: 'pg', maxConnections: 1, onNotice: () => {} });
    assert.equal(client.driver, 'pg');
    await client.close();
  });

  it('builds a Neon HTTP client with a no-op close', async () => {
    const client = createDatabase({ url, driver: 'neon-http', maxConnections: 1, logger: true });
    assert.equal(client.driver, 'neon-http');
    assert.equal(typeof client.db.select, 'function');
    assert.equal(await client.close(), undefined);
  });
});
