import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { STAFF_APPLICATION_CATEGORY_ID, STAFF_APPLICATION_CHANNEL_NAME, STAFF_APPLICATION_GUILD_ID } from '../src/services/staffApplicationService.js';

test('staff application targets only the configured EditIL guild and private category', () => {
  assert.equal(STAFF_APPLICATION_GUILD_ID, '1526671786387705907');
  assert.equal(STAFF_APPLICATION_CATEGORY_ID, '1526687081848504442');
  assert.equal(STAFF_APPLICATION_CHANNEL_NAME, 'staff-applications');
});

test('staff applications use one staff-only inbox and never grant applicants channel access', async () => {
  const service = await readFile(new URL('../src/services/staffApplicationService.js', import.meta.url), 'utf8');
  assert.match(service, /ensureStaffApplicationChannel/);
  assert.match(service, /upsert\(guild\.id, \{ allow: \[\], deny: \[PermissionFlagsBits\.ViewChannel\] \}\)/);
  assert.doesNotMatch(service, /upsert\(member\.id/);
  assert.doesNotMatch(service, /content: `[^`]*\$\{channel\}/);
  assert.doesNotMatch(service, /allowedMentions: \{ users: \[member\.id\]/);
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
  assert.match(html, /name="privacyConsent"[^>]+required/);
  assert.doesNotMatch(html, /name="age"/);
});

test('website publishes legal notices and removes age collection end to end', async () => {
  const [privacy, terms, worker, service] = await Promise.all([
    readFile(new URL('../public/privacy-policy.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/terms-of-use.html', import.meta.url), 'utf8'),
    readFile(new URL('../cloudflare/worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/staffApplicationService.js', import.meta.url), 'utf8')
  ]);
  assert.match(privacy, /מדיניות פרטיות/);
  assert.match(privacy, /1127099544560205914/);
  assert.match(terms, /אינה קשורה, מאושרת, ממומנת או מופעלת על־ידי Discord Inc/);
  assert.match(terms, /אין בתנאים אלה כדי לשלול אחריות שלא ניתן לשלול/);
  assert.doesNotMatch(worker, /['"]age['"]/);
  assert.doesNotMatch(service, /application\.age/);
});

test('website editing tutorials are privacy enhanced and click to load', async () => {
  const [html, script, worker] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/landing.js', import.meta.url), 'utf8'),
    readFile(new URL('../cloudflare/worker.js', import.meta.url), 'utf8')
  ]);
  assert.match(html, /data-youtube="vjcAwHrAkAM"/);
  assert.match(html, /data-youtube="4uaBMwsMwIY"/);
  assert.match(script, /youtube-nocookie\.com\/embed/);
  assert.match(worker, /frame-src https:\/\/www\.youtube-nocookie\.com/);
});

test('worker protects bot polling and rate limits public submissions', async () => {
  const worker = await readFile(new URL('../cloudflare/worker.js', import.meta.url), 'utf8');
  assert.match(worker, /HEARTBEAT_SECRET/);
  assert.match(worker, /staffapp:rate:/);
  assert.match(worker, /staffapp:user:/);
  assert.match(worker, /expirationTtl: 3600/);
  assert.match(worker, /frame-ancestors 'none'/);
  assert.match(worker, /delete saved\[field\]/);
  assert.match(worker, /STAFF_SETTINGS_KEY/);
  assert.match(worker, /settings\?\.open !== true/);
  assert.match(worker, /staff-applications\/availability/);
});

test('owner can open, close, or inspect website staff applications', async () => {
  const command = (await import('../src/commands/owner/staffapplications.js')).default;
  const json = command.data.toJSON();
  assert.equal(json.name, 'staffapplications');
  assert.deepEqual(json.options.map(option => option.name), ['open', 'close', 'status']);
  assert.match(command.execute.toString(), /interaction\.user\.id !== interaction\.guild\.ownerId/);
});
