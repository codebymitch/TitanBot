import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_OWNER_USER_ID } from '../src/config/owner.js';
import { botConfig } from '../src/config/botConfig.js';
import { OWNER_INBOX_USER_ID } from '../src/services/ownerInboxService.js';

test('the bot has exactly one canonical owner identity', () => {
  assert.equal(BOT_OWNER_USER_ID, '1127099544560205914');
  assert.equal(OWNER_INBOX_USER_ID, BOT_OWNER_USER_ID);
  assert.deepEqual(botConfig.commands.owners, [BOT_OWNER_USER_ID]);
});

test('former owner IDs and dashboard owner bypass are absent', () => {
  const sensitiveFiles = [
    'src/app.js',
    'src/config/botConfig.js',
    'src/config/owner.js',
    'src/services/ownerInboxService.js',
    '.env.example',
  ].map(file => fs.readFileSync(file, 'utf8')).join('\n');

  assert.doesNotMatch(sensitiveFiles, /1366736898030309417/);
  assert.doesNotMatch(sensitiveFiles, /1421013874701893652/);
  assert.doesNotMatch(sensitiveFiles, /\|\|\s*true/);
  assert.match(sensitiveFiles, /OWNER_IDS=1127099544560205914/);
});
