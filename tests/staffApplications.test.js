import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { STAFF_APPLICATION_CATEGORY_ID, STAFF_APPLICATION_GUILD_ID } from '../src/services/staffApplicationService.js';

test('staff application targets only the configured EditIL guild and private category', () => {
  assert.equal(STAFF_APPLICATION_GUILD_ID, '1526671786387705907');
  assert.equal(STAFF_APPLICATION_CATEGORY_ID, '1526687081848504442');
});

test('website staff form requires Discord identity and includes a bot-verification message', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="staffApplicationForm"/);
  assert.match(html, /name="discordId"[^>]+required/);
  assert.match(html, /הבוט ישלח לכם הודעת אימות פרטית/);
  assert.match(html, /id="discordIdGuide"/);
  assert.match(html, /Developer Mode/);
  assert.match(html, /Copy User ID/);
  assert.match(html, /אל תשלחו סיסמה או טוקן/);
});

test('worker protects bot polling and rate limits public submissions', async () => {
  const worker = await readFile(new URL('../cloudflare/worker.js', import.meta.url), 'utf8');
  assert.match(worker, /HEARTBEAT_SECRET/);
  assert.match(worker, /staffapp:rate:/);
  assert.match(worker, /staffapp:user:/);
  assert.match(worker, /expirationTtl: 3600/);
  assert.match(worker, /frame-ancestors 'none'/);
  assert.match(worker, /delete saved\[field\]/);
});
