/* מודול תזכורות: חזרות גמישות, התראה מוקדמת, נודניק, עדיפות, רשימות, הערות, חיפוש, עריכה ותזכורת במייל דרך יומן. */
window.RemindersModule = function (ctx) {
  'use strict';
  const { $, esc, uid, dayKey, addDays, parseDay, fmtDay, DAYS, toast, view, notify } = ctx;
  const S = () => ctx.state();
  const save = () => ctx.save();
  const rerender = () => ctx.render();

  const LISTS = [['personal', '👤 אישי'], ['work', '💼 עבודה'], ['health', '❤️ בריאות'], ['shopping', '🛒 קניות'], ['home', '🏠 בית'], ['other', '📌 אחר']];
  const LIST = Object.fromEntries(LISTS);
  const REPEAT = { none: 'ללא חזרה', daily: 'כל יום', weekdays: 'ימי חול (א׳–ה׳)', weekly: 'כל שבוע', monthly: 'כל חודש', yearly: 'כל שנה', interval: 'מותאם אישית' };
  const EARLY = [[0, 'רק בזמן'], [5, '5 דקות לפני'], [15, '15 דקות לפני'], [30, 'חצי שעה לפני'], [60, 'שעה לפני'], [120, 'שעתיים לפני'], [1440, 'יום לפני']];
  const UNITS = { hours: 'שעות', days: 'ימים', weeks: 'שבועות' };
  const PRIO = [['low', 'נמוכה'], ['normal', 'רגילה'], ['high', '‼️ גבוהה']];
  const pad = (n) => String(n).padStart(2, '0');
  const timeOf = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  let filter = 'today', listFilter = '', q = '';
  let sh = null;
  const sheet = ctx.makeSheet('remSheet', onAction, () => { sh = null; });

  // ---------- model ----------
  function fix(r) {
    r.notes = r.notes || '';
    r.repeat = REPEAT[r.repeat] ? r.repeat : 'none';
    r.weekDays = r.weekDays || [];
    r.interval = Object.assign({ n: 2, unit: 'days' }, r.interval || {});
    r.priority = r.priority || 'normal';
    r.list = LIST[r.list] ? r.list : 'personal';
    r.early = +r.early || 0;
    r.email = !!r.email;
    r.endDate = r.endDate || '';
    r.history = r.history || [];
    r.createdAt = r.createdAt || Date.now();
    r.dom = r.dom || new Date(r.at).getDate();
    return r;
  }
  const all = () => S().reminders.map(fix);
  const find = (id) => all().find((r) => r.id === id);
  const due = (r) => r.snoozedUntil || r.at;
  const settings = () => (S().settings = Object.assign({ email: '' }, S().settings || {}));

  function nextAfter(r, t) {
    const d = new Date(t);
    switch (r.repeat) {
      case 'daily': d.setDate(d.getDate() + 1); break;
      case 'weekdays': do { d.setDate(d.getDate() + 1); } while (d.getDay() === 5 || d.getDay() === 6); break;
      case 'weekly':
        if (r.weekDays.length) { do { d.setDate(d.getDate() + 1); } while (!r.weekDays.includes(d.getDay())); }
        else d.setDate(d.getDate() + 7);
        break;
      case 'monthly': { const m = d.getMonth() + 1; d.setDate(1); d.setMonth(m); d.setDate(Math.min(r.dom, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); break; }
      case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
      case 'interval': {
        const n = Math.max(1, +r.interval.n || 1);
        if (r.interval.unit === 'hours') d.setHours(d.getHours() + n);
        else d.setDate(d.getDate() + n * (r.interval.unit === 'weeks' ? 7 : 1));
        break;
      }
      default: return null;
    }
    return d.getTime();
  }
  function advance(r) {
    let t = r.at;
    let guard = 0;
    do { t = nextAfter(r, t); } while (t && t <= Date.now() && ++guard < 5000);
    if (!t || (r.endDate && dayKey(new Date(t)) > r.endDate)) { r.done = true; r.completedAt = Date.now(); return false; }
    Object.assign(r, { at: t, notified: false, earlyNotified: false, snoozedUntil: null });
    return true;
  }
  function complete(r) {
    r.history.push(Date.now());
    if (r.repeat === 'none' || !advance(r)) {
      r.done = true; r.completedAt = Date.now();
      toast('✓ בוצע');
    } else toast(`✓ בוצע · הפעם הבאה: ${fmtWhen(r.at)}`);
  }
  function fmtWhen(ts) { return `${fmtDay(dayKey(new Date(ts)))} · ${timeOf(ts)}`; }
  function repeatText(r) {
    if (r.repeat === 'weekly' && r.weekDays.length) return 'כל שבוע: ' + r.weekDays.slice().sort().map((d) => DAYS[d]).join(' ');
    if (r.repeat === 'interval') return `כל ${r.interval.n} ${UNITS[r.interval.unit]}`;
    if (r.repeat === 'monthly') return `כל חודש ב־${r.dom}`;
    return REPEAT[r.repeat];
  }

  // ---------- public ----------
  function homeSummary() {
    const open = all().filter((r) => !r.done).sort((a, b) => due(a) - due(b));
    const over = open.filter((r) => due(r) <= Date.now()).length;
    const next = open.find((r) => due(r) > Date.now());
    if (!open.length) return 'אין תזכורות פתוחות';
    return `${over ? `⚠️ ${over} באיחור · ` : ''}${next ? `הבאה: ${esc(next.title)} (${fmtWhen(due(next))})` : ''}`;
  }
  function check() {
    const now = Date.now();
    let changed = false;
    all().forEach((r) => {
      if (r.done) return;
      if (r.early && !r.earlyNotified && !r.snoozedUntil && now >= r.at - r.early * 60000 && now < r.at) {
        r.earlyNotified = true; changed = true;
        notify(`🔔 ${r.title}`, `בעוד ${EARLY.find((x) => x[0] === r.early)?.[1].replace(' לפני', '') || r.early + ' דק׳'} · ${fmtWhen(r.at)}`, r.id + '-early');
      }
      if (!r.notified && now >= due(r)) {
        r.notified = true; changed = true;
        notify(`${r.priority === 'high' ? '‼️' : '⏰'} ${r.title}`, r.notes || fmtWhen(due(r)), r.id);
      }
      // תזכורת חוזרת שלא סומנה — עוברת לפעם הבאה כשמגיע זמנה
      if (r.repeat !== 'none' && r.notified && !r.snoozedUntil) {
        const nx = nextAfter(r, r.at);
        if (nx && now >= nx) { advance(r); changed = true; }
      }
    });
    if (changed) { save(); if (location.hash.startsWith('#/reminders') || location.hash === '' || location.hash === '#/') rerender(); }
  }

  // ---------- list ----------
  function item(r) {
    const now = Date.now();
    const over = !r.done && due(r) <= now;
    const firstLine = r.notes.split('\n')[0];
    return `<li class="rem-item prio-${r.priority} ${r.done ? 'done' : ''} ${over ? 'overdue' : ''}">
      <button class="tick" data-ract="toggle" data-id="${r.id}" aria-label="${r.done ? 'החזרה לפתוחות' : 'סימון כבוצע'}">${r.done ? '✓' : ''}</button>
      <button class="r-body" data-ract="edit" data-id="${r.id}">
        <span class="title">${r.priority === 'high' ? '<b class="flag">‼️</b> ' : ''}${esc(r.title)}</span>
        <span class="sub">${r.done ? `בוצע ${fmtWhen(r.completedAt || r.at)}` : `${over ? 'באיחור · ' : ''}${r.snoozedUntil ? '💤 ' : ''}${fmtWhen(due(r))}`}</span>
        <span class="badges">
          <span class="badge l">${LIST[r.list]}</span>
          ${r.repeat !== 'none' ? `<span class="badge">🔁 ${repeatText(r)}</span>` : ''}
          ${r.early ? `<span class="badge">🔔 ${EARLY.find((x) => x[0] === r.early)?.[1] || ''}</span>` : ''}
          ${r.email ? '<span class="badge">📧</span>' : ''}
        </span>
        ${firstLine ? `<span class="r-notes">📝 ${esc(firstLine)}</span>` : ''}
      </button>
      <button class="del" data-ract="del-one" data-id="${r.id}" aria-label="מחיקת התזכורת" title="מחיקה">🗑️</button>
      ${over ? `<div class="snooze"><span>💤 נודניק:</span>
        <button class="chip" data-ract="snooze" data-id="${r.id}" data-m="10">10 דק׳</button>
        <button class="chip" data-ract="snooze" data-id="${r.id}" data-m="60">שעה</button>
        <button class="chip" data-ract="snooze" data-id="${r.id}" data-m="tomorrow">מחר 09:00</button></div>` : ''}
    </li>`;
  }

  function groups(list) {
    const now = Date.now();
    const t = dayKey(), tm = addDays(t, 1), wk = addDays(t, 7);
    const g = [['⚠️ באיחור', []], ['היום', []], ['מחר', []], ['ב־7 הימים הקרובים', []], ['בהמשך', []]];
    list.forEach((r) => {
      const d = dayKey(new Date(due(r)));
      const i = due(r) <= now ? 0 : d === t ? 1 : d === tm ? 2 : d <= wk ? 3 : 4;
      g[i][1].push(r);
    });
    return g.filter(([, l]) => l.length);
  }

  function render() {
    const list = all();
    const now = Date.now();
    const t = dayKey();
    const open = list.filter((r) => !r.done).sort((a, b) => due(a) - due(b));
    const done = list.filter((r) => r.done).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    const nq = q.trim().toLowerCase();
    const match = (r) => (!listFilter || r.list === listFilter) && (!nq || (r.title + ' ' + r.notes).toLowerCase().includes(nq));
    const todayList = open.filter((r) => due(r) <= now || dayKey(new Date(due(r))) === t);
    const base = filter === 'done' ? done : filter === 'all' ? open : todayList;
    const shown = base.filter(match);
    const over = open.filter((r) => due(r) <= now).length;
    const counts = Object.fromEntries(LISTS.map(([k]) => [k, open.filter((r) => r.list === k).length]));
    const canNotify = 'Notification' in window;
    const perm = canNotify ? Notification.permission : 'unsupported';

    view.innerHTML = `
      ${canNotify && perm === 'default' ? '<div class="notice"><span>🔔 אפשר/י התראות כדי לקבל תזכורת בזמן</span><button class="btn small" data-ract="ask-notify">הפעלה</button></div>' : ''}
      <form id="quickRem" class="card quick-rem">
        <input name="title" placeholder="➕ תזכורת מהירה (בעוד שעה)…" maxlength="80" autocomplete="off">
        <button class="btn" aria-label="הוספה">+</button>
        <button type="button" class="btn ghost" data-ract="new" title="תזכורת מפורטת">⚙️</button>
      </form>

      <div class="rem-stats">
        <div class="${over ? 'bad' : ''}"><strong>${over}</strong><span>באיחור</span></div>
        <div><strong>${todayList.length}</strong><span>להיום</span></div>
        <div><strong>${open.length}</strong><span>פתוחות</span></div>
        <div><strong>${done.filter((r) => dayKey(new Date(r.completedAt || 0)) === t).length + list.filter((r) => !r.done).reduce((n, r) => n + r.history.filter((h) => dayKey(new Date(h)) === t).length, 0)}</strong><span>בוצעו היום</span></div>
      </div>

      <nav class="subtabs">
        <button class="${filter === 'today' ? 'active' : ''}" data-ract="filter" data-f="today">היום</button>
        <button class="${filter === 'all' ? 'active' : ''}" data-ract="filter" data-f="all">כל הפתוחות</button>
        <button class="${filter === 'done' ? 'active' : ''}" data-ract="filter" data-f="done">בוצעו</button>
      </nav>
      <div class="chips-scroll" style="margin-top:-6px">
        <button class="chip ${!listFilter ? 'on' : ''}" data-ract="list" data-l="">הכל</button>
        ${LISTS.map(([k, l]) => `<button class="chip ${listFilter === k ? 'on' : ''}" data-ract="list" data-l="${k}">${l}${counts[k] ? ` · ${counts[k]}` : ''}</button>`).join('')}
      </div>
      <input type="search" id="remSearch" placeholder="🔍 חיפוש בתזכורות" value="${esc(q)}" style="margin:6px 0 12px">

      <div id="remList">${listHtml(shown)}</div>`;

    $('#remSearch').addEventListener('input', (e) => { q = e.target.value; rerender(); const s = $('#remSearch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); });
    $('#quickRem').addEventListener('submit', (e) => {
      e.preventDefault();
      const title = e.target.title.value.trim();
      if (!title) { openEdit(null); return; }
      const d = new Date(Date.now() + 3600000); d.setSeconds(0, 0);
      S().reminders.push(fix({ id: uid(), title, at: d.getTime(), done: false, notified: false, list: listFilter || 'personal' }));
      save(); rerender(); toast(`נשמר ל־${timeOf(d.getTime())} · לחיצה על התזכורת לעריכה`);
    });
  }
  function listHtml(shown) {
    if (!shown.length) {
      const msg = filter === 'done' ? 'עוד לא סומנו תזכורות כבוצעות' : filter === 'today' ? 'אין תזכורות להיום 👌' : 'אין תזכורות פתוחות 👌';
      return `<div class="card"><p class="empty">${q || listFilter ? 'לא נמצאו תזכורות מתאימות' : msg}</p></div>`;
    }
    if (filter === 'done') {
      return `<div class="card"><div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0;flex:none">בוצעו (${shown.length})</h3><button class="btn ghost small" style="flex:none" data-ract="clear-done">ניקוי הכל</button></div><ul class="list rems">${shown.map(item).join('')}</ul></div>`;
    }
    return groups(shown).map(([title, l]) => `<div class="card"><h3>${title} <span class="muted">(${l.length})</span></h3><ul class="list rems">${l.map(item).join('')}</ul></div>`).join('');
  }

  // ---------- edit sheet ----------
  function toLocalInputs(ts) { const d = new Date(ts); return { date: dayKey(d), time: timeOf(ts) }; }
  function draftFrom(r) {
    const { date, time } = toLocalInputs(r ? r.at : Date.now() + 3600000);
    return {
      title: r ? r.title : '', notes: r ? r.notes : '', date, time: r ? time : timeOf(Math.ceil((Date.now() + 3600000) / 900000) * 900000),
      repeat: r ? r.repeat : 'none', weekDays: r ? r.weekDays.slice() : [], interval: r ? Object.assign({}, r.interval) : { n: 2, unit: 'days' },
      endDate: r ? r.endDate : '', list: r ? r.list : listFilter || 'personal', priority: r ? r.priority : 'normal', early: r ? r.early : 0, email: r ? r.email : false,
    };
  }
  const draftTs = (d) => { const [y, m, dd] = d.date.split('-').map(Number); const [h, mi] = d.time.split(':').map(Number); return new Date(y, m - 1, dd, h || 0, mi || 0).getTime(); };

  function gcalUrl(d) {
    const s = new Date(draftTs(d)), e = new Date(s.getTime() + 15 * 60000);
    const f = (x) => x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const p = new URLSearchParams({ action: 'TEMPLATE', text: '⏰ ' + d.title, dates: `${f(s)}/${f(e)}`, details: (d.notes ? d.notes + '\n\n' : '') + 'נוצר מאפליקציית "היום שלי". מומלץ להגדיר התראה: אימייל.' });
    const rr = rrule(d);
    if (rr) p.set('recur', 'RRULE:' + rr);
    return 'https://calendar.google.com/calendar/render?' + p.toString();
  }
  function outlookUrl(d) {
    const s = new Date(draftTs(d)), e = new Date(s.getTime() + 15 * 60000);
    const p = new URLSearchParams({ path: '/calendar/action/compose', rru: 'addevent', subject: '⏰ ' + d.title, startdt: s.toISOString(), enddt: e.toISOString(), body: d.notes || '' });
    return 'https://outlook.live.com/calendar/0/deeplink/compose?' + p.toString();
  }
  function rrule(d) {
    const BY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    let r = '';
    if (d.repeat === 'daily') r = 'FREQ=DAILY';
    else if (d.repeat === 'weekdays') r = 'FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH';
    else if (d.repeat === 'weekly') r = 'FREQ=WEEKLY' + (d.weekDays.length ? ';BYDAY=' + d.weekDays.slice().sort().map((i) => BY[i]).join(',') : '');
    else if (d.repeat === 'monthly') r = 'FREQ=MONTHLY';
    else if (d.repeat === 'yearly') r = 'FREQ=YEARLY';
    else if (d.repeat === 'interval') r = `FREQ=${d.interval.unit === 'hours' ? 'HOURLY' : d.interval.unit === 'weeks' ? 'WEEKLY' : 'DAILY'};INTERVAL=${Math.max(1, +d.interval.n || 1)}`;
    if (r && d.endDate) r += ';UNTIL=' + d.endDate.replace(/-/g, '') + 'T235959Z';
    return r;
  }
  function mailtoUrl(d) {
    const to = settings().email;
    const body = `${d.title}\nמתי: ${fmtDay(d.date)} · ${d.time}${d.repeat !== 'none' ? `\nחזרה: ${REPEAT[d.repeat]}` : ''}${d.notes ? `\n\n${d.notes}` : ''}`;
    return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent('⏰ תזכורת: ' + d.title)}&body=${encodeURIComponent(body)}`;
  }

  function drawEdit() {
    const d = sh.draft;
    const isNew = !sh.id;
    const r = sh.id ? find(sh.id) : null;
    const box = sheet.box();
    const st = settings();
    box.innerHTML = `
      <div class="sheet-head"><strong>${isNew ? '⏰ תזכורת חדשה' : 'עריכת תזכורת'}</strong><button class="icon-btn" data-ract="close" aria-label="סגירה">✕</button></div>
      <form id="rForm" class="sheet-body">
        <label class="field"><span>על מה להזכיר?</span><input name="title" required maxlength="80" value="${esc(d.title)}" placeholder="למשל: לקבוע תור לרופא"></label>
        <label class="field" style="margin-top:8px"><span>הערות / פרטים</span><textarea name="notes" rows="2" maxlength="500" placeholder="כתובת, טלפון, רשימה…">${esc(d.notes)}</textarea></label>

        <div class="section-label">מתי?</div>
        <div class="chips-scroll">
          <button type="button" class="chip" data-ract="when" data-w="1h">בעוד שעה</button>
          <button type="button" class="chip" data-ract="when" data-w="eve">הערב 20:00</button>
          <button type="button" class="chip" data-ract="when" data-w="tm">מחר 09:00</button>
          <button type="button" class="chip" data-ract="when" data-w="wk">בעוד שבוע</button>
        </div>
        <div class="row">
          <label class="field"><span>תאריך</span><input name="date" type="date" value="${d.date}" required></label>
          <label class="field"><span>שעה</span><input name="time" type="time" value="${d.time}" required></label>
        </div>

        <div class="section-label">חזרה</div>
        <select name="repeat">${Object.entries(REPEAT).map(([k, v]) => `<option value="${k}" ${d.repeat === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        ${d.repeat === 'weekly' ? `<div class="day-chips">${DAYS.map((n, i) => `<button type="button" class="${d.weekDays.includes(i) ? 'on' : ''}" data-ract="wday" data-i="${i}">${n}</button>`).join('')}</div><div class="muted tiny">בלי בחירה — אותו יום כמו התאריך.</div>` : ''}
        ${d.repeat === 'interval' ? `<div class="row" style="margin-top:8px"><label class="field"><span>כל</span><input name="intN" type="number" min="1" max="365" value="${d.interval.n}" inputmode="numeric"></label>
          <label class="field"><span>יחידה</span><select name="intU">${Object.entries(UNITS).map(([k, v]) => `<option value="${k}" ${d.interval.unit === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>` : ''}
        ${d.repeat !== 'none' ? `<label class="field" style="margin-top:8px"><span>סיום החזרה (לא חובה)</span><input name="endDate" type="date" value="${d.endDate}"></label>` : ''}

        <div class="section-label">רשימה</div>
        <div class="chips-scroll">${LISTS.map(([k, l]) => `<button type="button" class="chip ${d.list === k ? 'on' : ''}" data-ract="dlist" data-l="${k}">${l}</button>`).join('')}</div>

        <div class="grid2" style="margin-top:4px">
          <label class="field"><span>עדיפות</span><select name="priority">${PRIO.map(([k, l]) => `<option value="${k}" ${d.priority === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field"><span>התראה מוקדמת</span><select name="early">${EARLY.map(([k, l]) => `<option value="${k}" ${d.early === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        </div>

        <div class="email-box">
          <label class="switch-row"><span>📧 תזכורת גם במייל</span><input type="checkbox" name="email" ${d.email ? 'checked' : ''}></label>
          ${d.email ? `
            <label class="field" style="margin-top:8px"><span>כתובת המייל שלי</span><input name="addr" type="email" value="${esc(st.email)}" placeholder="name@example.com" dir="ltr"></label>
            <p class="muted tiny">כדי לקבל מייל בזמן גם כשהאפליקציה סגורה, מוסיפים את התזכורת ליומן (Google או Outlook) ובוחרים שם התראה <b>באימייל</b>. היומן ישלח את המייל בזמן, כולל בחזרות.</p>
            <div class="email-actions">
              <a class="btn" href="${gcalUrl(d)}" target="_blank" rel="noopener" data-ract="cal-link">📅 Google Calendar</a>
              <a class="btn ghost" href="${outlookUrl(d)}" target="_blank" rel="noopener" data-ract="cal-link">📆 Outlook</a>
              <a class="btn ghost" href="${mailtoUrl(d)}" target="_blank" rel="noopener" data-ract="cal-link">✉️ שליחה למייל עכשיו</a>
            </div>` : ''}
        </div>

        ${r && r.history.length ? `<div class="section-label">היסטוריה</div><div class="muted tiny" style="margin:0">בוצעה ${r.history.length} פעמים · לאחרונה ${fmtWhen(r.history[r.history.length - 1])}</div>` : ''}
      </form>
      <div class="sheet-foot row">
        ${r ? `<button class="btn ghost danger" data-ract="delete" style="flex:0 0 auto" aria-label="מחיקה">🗑️</button>
               <button class="btn ghost" data-ract="dup" style="flex:0 0 auto" aria-label="שכפול">⧉</button>
               ${!r.done ? '<button class="btn ghost" data-ract="done-now" style="flex:0 0 auto">✓ בוצע</button>' : ''}` : ''}
        <button class="btn" data-ract="save">${isNew ? 'שמירת תזכורת' : 'שמירה'}</button>
      </div>`;
    const form = $('#rForm');
    form.addEventListener('input', (e) => {
      readForm(form);
      if (['repeat', 'email'].includes(e.target.name)) drawEdit();
      else refreshLinks();
    });
    form.addEventListener('submit', (e) => { e.preventDefault(); saveRem(); });
  }
  function refreshLinks() {
    const d = sh.draft;
    const links = document.querySelectorAll('#remSheet .email-actions a');
    if (links.length === 3) { links[0].href = gcalUrl(d); links[1].href = outlookUrl(d); links[2].href = mailtoUrl(d); }
  }
  function readForm(f) {
    const d = sh.draft;
    d.title = f.title.value; d.notes = f.notes.value; d.date = f.date.value; d.time = f.time.value;
    d.repeat = f.repeat.value; d.priority = f.priority.value; d.early = +f.early.value; d.email = f.email.checked;
    if (f.intN) { d.interval.n = +f.intN.value || 1; d.interval.unit = f.intU.value; }
    if (f.endDate) d.endDate = f.endDate.value;
    if (f.addr) settings().email = f.addr.value.trim();
  }
  function saveRem() {
    readForm($('#rForm'));
    const d = sh.draft;
    if (!d.title.trim()) { toast('נא לכתוב על מה להזכיר'); return; }
    if (!d.date || !d.time) { toast('נא לבחור תאריך ושעה'); return; }
    let at = draftTs(d);
    if (d.repeat === 'weekly' && d.weekDays.length && !d.weekDays.includes(new Date(at).getDay())) {
      at = nextAfter({ repeat: 'weekly', weekDays: d.weekDays }, at); // מתחילים ביום הראשון שנבחר
    }
    const data = {
      title: d.title.trim(), notes: d.notes.trim(), at, repeat: d.repeat, weekDays: d.weekDays, interval: d.interval,
      endDate: d.repeat === 'none' ? '' : d.endDate, list: d.list, priority: d.priority, early: d.early, email: d.email,
      dom: new Date(at).getDate(), notified: at <= Date.now(), earlyNotified: at - d.early * 60000 <= Date.now(), snoozedUntil: null,
    };
    if (sh.id) {
      const r = S().reminders.find((x) => x.id === sh.id);
      Object.assign(r, data);
      if (r.done && at > Date.now()) r.done = false;
      toast('התזכורת עודכנה');
    } else {
      S().reminders.push(fix(Object.assign({ id: uid(), done: false, createdAt: Date.now() }, data)));
      toast(`התזכורת נשמרה ל${fmtWhen(at)}`);
    }
    save(); sheet.close(); rerender();
  }
  function openEdit(id) {
    sh = { id: id || null, draft: draftFrom(id ? find(id) : null) };
    sheet.open();
    drawEdit();
    if (!id && window.matchMedia('(pointer:fine)').matches) $('#rForm').title.focus();
  }

  // ---------- actions ----------
  async function onAction(e) {
    const b = e.target.closest('[data-ract]');
    if (!b) return;
    const act = b.dataset.ract;
    const r = b.dataset.id ? S().reminders.find((x) => x.id === b.dataset.id) : sh && sh.id ? S().reminders.find((x) => x.id === sh.id) : null;
    switch (act) {
      case 'filter': filter = b.dataset.f; rerender(); break;
      case 'list': listFilter = b.dataset.l; rerender(); break;
      case 'new': openEdit(null); break;
      case 'edit': openEdit(b.dataset.id); break;
      case 'close': sheet.close(); break;
      case 'toggle':
        if (r.done) { r.done = false; r.completedAt = null; r.notified = due(r) <= Date.now(); toast('הוחזרה לפתוחות'); }
        else complete(r);
        save(); rerender();
        break;
      case 'done-now': complete(r); save(); sheet.close(); rerender(); break;
      case 'snooze': {
        let t;
        if (b.dataset.m === 'tomorrow') { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); t = d.getTime(); }
        else t = Date.now() + +b.dataset.m * 60000;
        r.snoozedUntil = t; r.notified = false;
        save(); rerender(); toast(`💤 אזכיר שוב ב${fmtWhen(t)}`);
        break;
      }
      case 'del-one':
        if (r && (r.done || confirm(`למחוק את "${r.title}"?`))) { S().reminders = S().reminders.filter((x) => x.id !== r.id); save(); rerender(); toast('התזכורת נמחקה'); }
        break;
      case 'clear-done':
        if (confirm('למחוק את כל התזכורות שבוצעו?')) { S().reminders = S().reminders.filter((x) => !x.done); save(); rerender(); }
        break;
      case 'ask-notify':
        try { await Notification.requestPermission(); } catch (err) { /* ignore */ }
        rerender();
        break;
      case 'delete':
        if (confirm('למחוק את התזכורת?')) { S().reminders = S().reminders.filter((x) => x.id !== sh.id); save(); sheet.close(); rerender(); toast('נמחקה'); }
        break;
      case 'dup': {
        readForm($('#rForm'));
        sh = { id: null, draft: Object.assign({}, sh.draft, { title: sh.draft.title + ' (עותק)', weekDays: sh.draft.weekDays.slice(), interval: Object.assign({}, sh.draft.interval) }) };
        drawEdit(); toast('עותק חדש — אפשר לערוך ולשמור');
        break;
      }
      case 'save': saveRem(); break;
      case 'when': {
        readForm($('#rForm'));
        const d = new Date();
        if (b.dataset.w === '1h') { d.setTime(Math.ceil((Date.now() + 3600000) / 300000) * 300000); }
        else if (b.dataset.w === 'eve') { d.setHours(20, 0, 0, 0); if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1); }
        else if (b.dataset.w === 'tm') { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
        else { d.setDate(d.getDate() + 7); d.setSeconds(0, 0); }
        sh.draft.date = dayKey(d); sh.draft.time = timeOf(d.getTime());
        drawEdit();
        break;
      }
      case 'wday': {
        readForm($('#rForm'));
        const w = sh.draft.weekDays; const i = +b.dataset.i; const k = w.indexOf(i);
        if (k >= 0) w.splice(k, 1); else w.push(i);
        drawEdit();
        break;
      }
      case 'dlist': readForm($('#rForm')); sh.draft.list = b.dataset.l; drawEdit(); break;
      case 'cal-link': readForm($('#rForm')); refreshLinks(); save(); return; // נותן לקישור להיפתח
      default: return;
    }
  }
  view.addEventListener('click', onAction);

  // ---------- API ללוח השנה ----------
  // כל המופעים בטווח: מופעים עתידיים של תזכורות חוזרות, תזכורות שבוצעו וביצועים קודמים מההיסטוריה
  function occurrences(from, to) {
    const out = [];
    all().forEach((r) => {
      r.history.forEach((ts) => { if (ts >= from && ts < to && r.repeat !== 'none') out.push({ r, ts, done: true, past: true }); });
      if (r.done) {
        const ts = r.repeat === 'none' ? r.at : (r.completedAt || r.at);
        if (ts >= from && ts < to && r.repeat === 'none') out.push({ r, ts, done: true });
        return;
      }
      let t = due(r), first = true, guard = 0;
      while (t && t < to && guard++ < 1000) {
        if (r.endDate && dayKey(new Date(t)) > r.endDate) break;
        if (t >= from) out.push({ r, ts: t, done: false, next: first, over: first && t <= Date.now() });
        first = false;
        t = nextAfter(r, t === due(r) ? r.at : t);
        if (r.repeat === 'none') break;
      }
    });
    return out.sort((a, b) => a.ts - b.ts);
  }
  function openNew(date, time) {
    sh = { id: null, draft: Object.assign(draftFrom(null), date ? { date } : {}, time ? { time } : {}) };
    sheet.open();
    drawEdit();
  }
  function toggle(id) {
    const r = S().reminders.find((x) => x.id === id);
    if (!r) return;
    if (r.done) { r.done = false; r.completedAt = null; r.notified = due(r) <= Date.now(); } else complete(r);
    save();
  }

  return { render, homeSummary, check, close: () => sheet.close(), occurrences, openEdit, openNew, toggle, LISTS, repeatText, timeOf };
};
