// שולח התראות במייל לאתר "היום שלי": תזכורות שסומנו "📧 במייל" + סיכום יומי (משימות, תזכורות והרגלים להיום).
// רץ ב־GitHub Actions כל 10 דקות. קורא את נתוני המשתמשים מ־Firestore (users/{uid}) ושומר מה כבר נשלח ב־emailLog/{uid}.
//
// משתני סביבה (GitHub Secrets):
//   FIREBASE_SERVICE_ACCOUNT  — JSON של Service Account מ־Firebase (Project settings → Service accounts → Generate new private key)
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS — שרת המייל (למשל Gmail: smtp.gmail.com, 465, הכתובת שלך, App Password)
//   MAIL_FROM (לא חובה) — השולח שיופיע, למשל: "היום שלי <me@gmail.com>"
//   SITE_URL  (לא חובה) — כתובת האתר לקישורים במייל
// לבדיקות: DRY_RUN=1 (לא שולח, רק מדפיס), FIRESTORE_EMULATOR_HOST (אמולטור מקומי).
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';

const DRY = process.env.DRY_RUN === '1';
const NOW = process.env.NOW_MS ? Number(process.env.NOW_MS) : Date.now();
const CATCH_UP_MS = 40 * 60 * 1000; // ריצות של GitHub לפעמים מתעכבות — שולחים גם מה שהגיע זמנו ב־40 הדקות האחרונות
const SITE_URL = process.env.SITE_URL || 'https://ofeknave.github.io/KayDee/';

function init() {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-daily' });
    return true;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) { console.log('FIREBASE_SERVICE_ACCOUNT לא הוגדר — מדלגים.'); return false; }
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  return true;
}
function transport() {
  if (DRY) return nodemailer.createTransport({ jsonTransport: true });
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) { console.log('הגדרות SMTP חסרות — מדלגים.'); return null; }
  const port = Number(SMTP_PORT || 465);
  return nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
}

// ---------- זמנים ----------
const pad = (n) => String(n).padStart(2, '0');
function localParts(ts, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), time: `${p.hour}:${p.minute}` };
}
const fmtTime = (ts, tz) => localParts(ts, tz).time;
const fmtDate = (ts, tz) => new Intl.DateTimeFormat('he-IL', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ts));

// אותו חישוב חזרות כמו באתר (reminders.js). רץ באזור הזמן של המשתמש (process.env.TZ).
function nextAfter(r, t) {
  const d = new Date(t);
  const wd = r.weekDays || [];
  switch (r.repeat) {
    case 'daily': d.setDate(d.getDate() + 1); break;
    case 'weekdays': do { d.setDate(d.getDate() + 1); } while (d.getDay() === 5 || d.getDay() === 6); break;
    case 'weekly':
      if (wd.length) { do { d.setDate(d.getDate() + 1); } while (!wd.includes(d.getDay())); }
      else d.setDate(d.getDate() + 7);
      break;
    case 'monthly': { const dom = r.dom || new Date(r.at).getDate(); const m = d.getMonth() + 1; d.setDate(1); d.setMonth(m); d.setDate(Math.min(dom, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); break; }
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
    case 'interval': {
      const iv = r.interval || { n: 1, unit: 'days' };
      const n = Math.max(1, Number(iv.n) || 1);
      if (iv.unit === 'hours') d.setHours(d.getHours() + n);
      else d.setDate(d.getDate() + n * (iv.unit === 'weeks' ? 7 : 1));
      break;
    }
    default: return null;
  }
  return d.getTime();
}
// כל המופעים של תזכורת בטווח [from, to)
function occurrences(r, from, to, tz) {
  const out = [];
  let t = r.snoozedUntil || r.at;
  let guard = 0;
  while (t && t < to && guard++ < 2000) {
    if (r.endDate && localParts(t, tz).day > r.endDate) break;
    if (t >= from) out.push(t);
    if (!r.repeat || r.repeat === 'none') break;
    t = nextAfter(r, t === (r.snoozedUntil || r.at) ? r.at : t);
  }
  return out;
}

// ---------- תוכן המייל ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wrap = (title, body) => `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;background:#f5f6fb;font-family:Arial,sans-serif;color:#1c1f2e">
  <div style="max-width:520px;margin:0 auto;padding:20px">
    <div style="background:#fff;border-radius:16px;padding:20px;border:1px solid #e4e6f0">
      <h2 style="margin:0 0 12px;font-size:20px">${title}</h2>${body}
      <p style="margin:18px 0 0"><a href="${esc(SITE_URL)}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;display:inline-block">פתיחת האתר</a></p>
    </div>
    <p style="color:#6b7085;font-size:12px;text-align:center">נשלח מ"היום שלי". אפשר לכבות התראות במייל במסך החשבון באתר.</p>
  </div></body></html>`;

function reminderMail(r, t, tz, early) {
  const when = `${fmtDate(t, tz)} · ${fmtTime(t, tz)}`;
  const subject = `${r.priority === 'high' ? '‼️' : '⏰'} ${early ? 'בקרוב: ' : ''}${r.title}`;
  const body = `<p style="font-size:16px;margin:0 0 8px"><b>${esc(r.title)}</b></p>
    <p style="margin:0 0 8px;color:#4f46e5">🕒 ${esc(when)}</p>
    ${r.notes ? `<p style="white-space:pre-wrap;background:#f5f6fb;border-radius:10px;padding:10px;margin:0">${esc(r.notes)}</p>` : ''}`;
  return { subject, html: wrap(subject, body), text: `${r.title}\n${when}${r.notes ? '\n\n' + r.notes : ''}\n\n${SITE_URL}` };
}

function digestMail(state, day, tz, dayStart, dayEnd) {
  const rems = (state.reminders || []).filter((r) => !r.done).flatMap((r) => occurrences(r, dayStart, dayEnd, tz).map((t) => ({ r, t }))).sort((a, b) => a.t - b.t);
  const overdueRems = (state.reminders || []).filter((r) => !r.done && (r.snoozedUntil || r.at) < dayStart && (!r.repeat || r.repeat === 'none'));
  const lists = Object.fromEntries((state.taskLists || []).map((l) => [l.id, l]));
  const tasks = (state.tasks || []).filter((x) => !x.done && x.due && x.due <= day).sort((a, b) => (a.due + (a.time || '')).localeCompare(b.due + (b.time || '')));
  const dow = new Date(dayStart + 12 * 3600e3).getDay();
  const habits = (state.habits || []).filter((h) => !h.archived && (!h.schedule || h.schedule.kind !== 'days' || (h.schedule.days || []).includes(dow)));
  if (!rems.length && !overdueRems.length && !tasks.length && !habits.length) return null;
  const li = (s) => `<li style="margin:4px 0">${s}</li>`;
  const sec = (title, items) => (items.length ? `<h3 style="margin:16px 0 6px;font-size:15px">${title}</h3><ul style="margin:0;padding-inline-start:18px">${items.join('')}</ul>` : '');
  const body = `<p style="margin:0;color:#6b7085">${esc(fmtDate(dayStart + 12 * 3600e3, tz))}</p>
    ${sec(`⏰ תזכורות להיום (${rems.length})`, rems.map(({ r, t }) => li(`<b>${esc(fmtTime(t, tz))}</b> · ${esc(r.title)}`)))}
    ${sec(`⚠️ תזכורות באיחור (${overdueRems.length})`, overdueRems.map((r) => li(esc(r.title))))}
    ${sec(`📋 משימות להיום${tasks.some((x) => x.due < day) ? ' ובאיחור' : ''} (${tasks.length})`, tasks.map((x) => li(`${x.due < day ? '<span style="color:#dc2626">באיחור · </span>' : ''}${x.priority === 'high' ? '‼️ ' : ''}${esc(x.title)}${x.time ? ` · ${esc(x.time)}` : ''}${lists[x.listId] ? ` <span style="color:#6b7085">(${esc(lists[x.listId].name)})</span>` : ''}`)))}
    ${sec(`✅ הרגלים להיום (${habits.length})`, habits.map((h) => li(`${esc(h.emoji || '')} ${esc(h.name)}`)))}`;
  const subject = `☀️ הסיכום שלך להיום — ${rems.length} תזכורות, ${tasks.length} משימות`;
  return { subject, html: wrap('☀️ בוקר טוב! זה מה שמחכה לך היום', body), text: subject + '\n' + SITE_URL };
}

// ---------- ריצה ----------
async function main() {
  if (!init()) return;
  const mailer = transport();
  if (!mailer) return;
  const db = admin.firestore();
  const users = await db.collection('users').get();
  let sentCount = 0;
  for (const doc of users.docs) {
    let state;
    try { state = JSON.parse(doc.data().json || '{}'); } catch (e) { continue; }
    const cfg = (state.settings && state.settings.emailNotif) || {};
    if (!cfg.enabled || !cfg.email) continue;
    const tz = cfg.tz || 'Asia/Jerusalem';
    process.env.TZ = tz;
    const logRef = db.collection('emailLog').doc(doc.id);
    const log = (await logRef.get()).data() || {};
    const sent = log.sent || {};
    const send = async (mail, key) => {
      const info = await mailer.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER || 'daily-app@example.com', to: cfg.email, ...mail });
      if (DRY) console.log('DRY', JSON.stringify({ to: cfg.email, subject: mail.subject, key }));
      else console.log('נשלח:', info.messageId || '', '→', doc.id, key);
      sent[key] = NOW; sentCount++;
    };

    // 1) תזכורות שסומנו "במייל"
    if (cfg.reminders !== false) {
      for (const r of state.reminders || []) {
        if (r.done || !r.email) continue;
        const early = Number(r.early) || 0;
        for (const t of occurrences(r, NOW - CATCH_UP_MS + early * 60000, NOW + early * 60000 + 1, tz)) {
          const notifyAt = t - early * 60000;
          if (notifyAt > NOW || notifyAt < NOW - CATCH_UP_MS) continue;
          const key = `r:${r.id}:${t}`;
          if (sent[key]) continue;
          await send(reminderMail(r, t, tz, early > 0), key);
        }
      }
    }

    // 2) סיכום יומי
    if (cfg.digest) {
      const lp = localParts(NOW, tz);
      if (lp.hour >= (Number(cfg.digestHour) || 7) && log.digestDay !== lp.day) {
        const [y, m, d] = lp.day.split('-').map(Number);
        const dayStart = new Date(y, m - 1, d).getTime(), dayEnd = new Date(y, m - 1, d + 1).getTime();
        const mail = digestMail(state, lp.day, tz, dayStart, dayEnd);
        if (mail) await send(mail, 'digest:' + lp.day);
        log.digestDay = lp.day;
      }
    }

    // ניקוי רשומות ישנות ושמירה
    for (const k of Object.keys(sent)) if (NOW - sent[k] > 4 * 864e5) delete sent[k];
    await logRef.set({ sent, digestDay: log.digestDay || null, updatedAt: NOW });
  }
  console.log(`סיום: ${users.size} משתמשים, ${sentCount} מיילים.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
