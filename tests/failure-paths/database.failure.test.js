import test from 'node:test';
import assert from 'node:assert/strict';

import { db, initializeDatabase } from '../../src/utils/database.js';
import { pgDb } from '../../src/utils/postgresDatabase.js';

function resetDbSingleton() {
  db.initialized = false;
  db.db = null;
  db.useFallback = false;
  db.connectionType = 'none';
  db.degradedModeWarningShown = false;
  db.degradedReason = null;
}

test('DB down path falls back to memory with degraded status', async () => {
  const originalConnect = pgDb.connect;
  const originalGetLastFailure = pgDb.getLastFailure;

  try {
    resetDbSingleton();

    pgDb.connect = async () => false;
    pgDb.getLastFailure = () => ({
      reason: 'POSTGRES_CONNECTION_FAILED',
      message: 'connect ECONNREFUSED'
    });

    await initializeDatabase();

    const status = db.getStatus();
    assert.equal(status.initialized, true);
    assert.equal(status.isDegraded, true);
    assert.equal(status.connectionType, 'memory');
    assert.equal(status.degradedReason, 'POSTGRES_UNAVAILABLE');

    await db.set('health:key', { ok: true });
    const value = await db.get('health:key');
    assert.deepEqual(value, { ok: true });
  } finally {
    pgDb.connect = originalConnect;
    pgDb.getLastFailure = originalGetLastFailure;
    resetDbSingleton();
  }
});
