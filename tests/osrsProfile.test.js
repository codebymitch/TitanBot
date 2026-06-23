import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeLinkedOsrsUsernames,
  formatProfileCurrency,
  buildLinkedRsnsValue,
  buildFightStats,
  buildRecentActivityRows,
} from '../src/utils/osrsProfile.js';

test('normalizeLinkedOsrsUsernames supports multiple stored shapes and de-duplicates case-insensitively', () => {
  assert.deepEqual(
    normalizeLinkedOsrsUsernames({ usernames: ['  Main PKer  ', 'main pker', 'Alt Pure'] }),
    ['Main PKer', 'Alt Pure'],
  );

  assert.deepEqual(
    normalizeLinkedOsrsUsernames(['', ' Iron Tank ', null, 'iron tank']),
    ['Iron Tank'],
  );
});

test('formatProfileCurrency uses compact uppercase OSRS-style formatting', () => {
  assert.equal(formatProfileCurrency(999), '999 gp');
  assert.equal(formatProfileCurrency(12_300), '12.3K gp');
  assert.equal(formatProfileCurrency(1_200_000), '1.2M gp');
});

test('buildLinkedRsnsValue renders compact emoji rows', () => {
  assert.equal(
    buildLinkedRsnsValue(['Main PKer', 'Alt Pure']),
    '🟢 Main PKer\n🔹 Alt Pure',
  );
});

test('buildFightStats aggregates linked usernames and derives streaks from recent results', () => {
  const stats = buildFightStats(
    ['Main PKer', 'Alt Pure'],
    {
      'main pker': { kills: 3, deaths: 1 },
      'alt pure': { kills: 2, deaths: 2 },
    },
    [
      { killer: 'Main PKer', victim: 'Enemy One', timestamp: '2026-06-23T10:00:00.000Z' },
      { killer: 'Alt Pure', victim: 'Enemy Two', timestamp: '2026-06-23T09:00:00.000Z' },
      { killer: 'Enemy Three', victim: 'Main PKer', timestamp: '2026-06-23T08:00:00.000Z' },
    ],
  );

  assert.deepEqual(stats, {
    totalFights: 8,
    wins: 5,
    losses: 3,
    winRate: 63,
    currentStreak: 'Win 2',
  });
});

test('buildRecentActivityRows formats wins, losses, mentions, stakes, and timestamps', () => {
  const rows = buildRecentActivityRows(
    [
      { killer: 'Main PKer', victim: 'Enemy One', amount: 100_000, timestamp: '2026-06-23T10:00:00.000Z' },
      { killer: 'Enemy Two', victim: 'Alt Pure', stake: 50_000, timestamp: '2026-06-23T09:00:00.000Z' },
      { killer: 'Someone Else', victim: 'Another', timestamp: '2026-06-23T08:00:00.000Z' },
    ],
    ['Main PKer', 'Alt Pure'],
    { 'enemy one': '123', 'enemy two': '456' },
    5,
  );

  assert.deepEqual(rows, [
    '✅ Won against <@123> for 100K • <t:1782208800:R>',
    '❌ Lost to <@456> (50K) • <t:1782205200:R>',
  ]);
});
