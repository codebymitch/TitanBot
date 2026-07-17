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
  assert.match(html, /מצב מפתח/);
  assert.match(html, /העתקת מזהה המשתמש/);
  assert.match(html, /אל תשלחו סיסמה או אסימון גישה/);
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

test('public command grid cannot create horizontal page overflow', async () => {
  const [html, css, script, worker] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/animations.css', import.meta.url), 'utf8'),
    readFile(new URL('../public/landing.js', import.meta.url), 'utf8'),
    readFile(new URL('../cloudflare/worker.js', import.meta.url), 'utf8')
  ]);
    assert.match(html, /animations\.css\?v=4\.1\.0/);
    assert.match(html, /redesign\.css\?v=4\.1\.0/);
    assert.match(html, /class="editor-stage/);
    assert.match(html, /class="creative-ticker"/);
  assert.match(css, /html, body \{[^}]*overflow-x: clip/);
  assert.match(css, /\.commands-section \{[^}]*overflow-x: clip/);
  assert.match(css, /\.commands-section > \.shell \{[^}]*margin-right: auto; margin-left: auto/);
  assert.match(css, /\.public-command-grid \{[^}]*repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /\.public-command-grid article \{[^}]*min-width: 0/);
  assert.match(script, /containCommandLayout/);
  assert.match(worker, /const siteResponse[\s\S]*?'cache-control': 'no-cache'/);
});

test('custom animated background stays lightweight and accessible', async () => {
  const [html, css, script, worker] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/animations.css', import.meta.url), 'utf8'),
    readFile(new URL('../public/landing.js', import.meta.url), 'utf8'),
    readFile(new URL('../cloudflare/worker.js', import.meta.url), 'utf8')
  ]);
  assert.match(html, /class="editil-background"/);
  assert.match(css, /@keyframes bg-playhead/);
  assert.doesNotMatch(css, /@keyframes bg-orbit/);
  assert.doesNotMatch(css, /filter: blur\(75px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(css, /canvas/);
  assert.match(css, /--brand: #2f80ff/);
  assert.match(css, /--purple: #ff4fae/);
  assert.match(css, /linear-gradient\(90deg,#fff 0%,#72b7ff 42%,#ff5db8 100%\)/);
  assert.match(css, /\.channel-browser\.tilt-card::after \{ display: none/);
  assert.match(css, /@media \(max-width: 1200px\) \{[\s\S]*?\.discord-card \.float-note \{ display: none/);
  assert.match(css, /\.discord-card \.servers,[\s\S]*?\.discord-card \.channels \{ display: none/);
  assert.match(css, /\.bot-visual \{ min-height: 245px/);
  assert.match(script, /entry\.target\.textContent = '—'/);
  assert.match(script, /const hasLiveStatus = Boolean\(data\.updatedAt\)/);
  assert.match(script, /'המצב מתעדכן'/);
  assert.match(worker, /MAX_STATUS_AGE_MS = 11 \* 60_000/);
  assert.match(html, /class="section shell explore-section" id="explore"/);
  assert.match(html, /data-open-dialog="faqDialog"/);
  assert.match(css, /\.explore-grid \{ display: grid; grid-template-columns: repeat\(6,minmax\(0,1fr\)\)/);
  assert.match(html, /class="bot-stats" hidden/);
  assert.match(script, /\.bot-stats'\)\.hidden = !hasLiveStatus/);
  assert.match(worker, /invites\/6Hu8xpTYqQ\?with_counts=true/);
  assert.match(css, /\[hidden\] \{ display: none !important; \}/);
  assert.match(html, /class="status-chip" hidden/);
  assert.match(script, /\.status-chip'\)\.hidden = !hasLiveStatus/);
});

test('public command directory starts compact and can reveal every command', async () => {
  const [html, css, script] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/animations.css', import.meta.url), 'utf8'),
    readFile(new URL('../public/landing.js', import.meta.url), 'utf8')
  ]);
  assert.match(html, /id="commandExpand"[^>]*aria-expanded="false"/);
  assert.match(script, /commandsExpanded = false/);
  assert.match(script, /compact && matches > 6/);
  assert.match(script, /commandExpand\.addEventListener\('click'/);
  assert.match(css, /\.section \{ padding-block: 62px; \}/);
  assert.match(html, /<dialog class="staff-application-dialog" id="staffApplicationDialog">/);
  assert.match(script, /staffDialog\.showModal\(\)/);
  assert.equal((html.match(/<details class="compact-panel">/g) || []).length, 0);
  assert.equal((html.match(/<dialog class="content-dialog/g) || []).length, 4);
  assert.match(script, /\$\$\('\[data-open-dialog\]'\)/);
  assert.match(css, /\.compact-host \{ padding-block: 10px; \}/);
  assert.doesNotMatch(html, /class="software shell/);
  assert.doesNotMatch(html, /class="cta shell/);
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
