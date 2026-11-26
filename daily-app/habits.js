/* מודול הרגלים: הרגלי סימון וכמות, תזמון גמיש, רצפים, לוח חודשי, תזכורות, עריכה וארכיון. */
window.HabitsModule = function (ctx) {
  'use strict';
  const { $, esc, uid, dayKey, addDays, parseDay, fmtDay, DAYS, toast, view, notify } = ctx;
  const S = () => ctx.state();
  const save = () => ctx.save();
  const rerender = () => ctx.render();

  const COLORS = ['#16a34a', '#0ea5e9', '#6366f1', '#f97316', '#ec4899', '#eab308', '#14b8a6', '#ef4444'];
  const EMOJIS = ['💧', '🏃', '🚶', '🏋️', '🧘', '📚', '✍️', '🧠', '😴', '🛏️', '🦷', '💊', '🥗', '🍎', '🚭', '📵', '🧹', '💰', '🎸', '🙏', '☀️', '🌱', '❤️', '🎯'];
  const TEMPLATES = [
    { name: 'לשתות מים', emoji: '💧', color: '#0ea5e9', type: 'count', target: 8, unit: 'כוסות', step: 1 },
    { name: 'הליכה', emoji: '🚶', color: '#16a34a', type: 'count', target: 30, unit: 'דקות', step: 10 },
    { name: 'קריאה', emoji: '📚', color: '#6366f1', type: 'count', target: 20, unit: 'עמודים', step: 5 },
    { name: 'אימון', emoji: '🏋️', color: '#f97316', type: 'check', schedule: { kind: 'weekly', days: [0, 1, 2, 3, 4, 5, 6], perWeek: 3 } },
    { name: 'מדיטציה', emoji: '🧘', color: '#14b8a6', type: 'check', reminderTime: '07:30' },
    { name: 'ויטמינים', emoji: '💊', color: '#eab308', type: 'check', reminderTime: '09:00' },
    { name: 'לישון לפני 23:00', emoji: '😴', color: '#6366f1', type: 'check', reminderTime: '22:30' },
    { name: 'בלי טלפון לפני השינה', emoji: '📵', color: '#ec4899', type: 'check' },
  ];
  const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

  let filter = 'today';
  let sh = null; // sheet state
  const sheet = ctx.makeSheet('habitSheet', onAction, () => { sh = null; });

  // ---------- model ----------
  function fix(h) {
    if (!h.log) { h.log = {}; (h.done || []).forEach((d) => { h.log[d] = 1; }); }
    delete h.done;
    h.type = h.type === 'count' ? 'count' : 'check';
    h.target = h.type === 'check' ? 1 : Math.max(1, +h.target || 1);
    h.step = Math.max(1, +h.step || 1);
    h.unit = h.unit || '';
    h.schedule = Object.assign({ kind: 'daily', days: [0, 1, 2, 3, 4, 5, 6], perWeek: 3 }, h.schedule || {});
    h.color = h.color || COLORS[0];
    h.emoji = h.emoji || '🎯';
    h.reminderTime = h.reminderTime || '';
    h.notes = h.notes || '';
    h.archived = !!h.archived;
    h.createdAt = h.createdAt || Object.keys(h.log).sort()[0] || dayKey();
    return h;
  }
  const all = () => S().habits.map(fix);
  const find = (id) => all().find((h) => h.id === id);
  const val = (h, d) => h.log[d] || 0;
  const isDone = (h, d) => val(h, d) >= h.target;
  const frac = (h, d) => Math.min(val(h, d) / h.target, 1);
  const scheduledOn = (h, d) => (h.schedule.kind === 'days' ? h.schedule.days.includes(parseDay(d).getDay()) : true);
  const weekStart = (d) => addDays(d, -parseDay(d).getDay());
  const weekCount = (h, d) => { const ws = weekStart(d); let n = 0; for (let i = 0; i < 7; i++) if (isDone(h, addDays(ws, i))) n++; return n; };
  const dueToday = (h) => {
    const t = dayKey();
    if (h.schedule.kind === 'weekly') return weekCount(h, t) < h.schedule.perWeek || isDone(h, t);
    return scheduledOn(h, t);
  };
  function setVal(h, d, v) {
    if (v > 0) h.log[d] = v; else delete h.log[d];
  }

  function periods(h) {
    const today = dayKey();
    const out = [];
    let start = h.createdAt;
    const first = Object.keys(h.log).sort()[0];
    if (first && first < start) start = first;
    if (start < addDays(today, -730)) start = addDays(today, -730);
    if (h.schedule.kind === 'weekly') {
      for (let w = weekStart(start); w <= today; w = addDays(w, 7)) out.push({ d: w, ok: weekCount(h, w) >= h.schedule.perWeek, cur: w === weekStart(today) });
    } else {
      for (let d = start; d <= today; d = addDays(d, 1)) if (scheduledOn(h, d)) out.push({ d, ok: isDone(h, d), cur: d === today });
    }
    return out;
  }
  function stats(h) {
    const p = periods(h);
    const closed = p.length && p[p.length - 1].cur && !p[p.length - 1].ok ? p.slice(0, -1) : p;
    let cur = 0; for (let i = closed.length - 1; i >= 0 && closed[i].ok; i--) cur++;
    let best = 0, run = 0; p.forEach((x) => { run = x.ok ? run + 1 : 0; best = Math.max(best, run); });
    const since = h.schedule.kind === 'weekly' ? weekStart(addDays(dayKey(), -27)) : addDays(dayKey(), -29);
    const recent = closed.filter((x) => x.d >= since);
    const rate = recent.length ? Math.round((recent.filter((x) => x.ok).length / recent.length) * 100) : null;
    const total = Object.keys(h.log).filter((d) => isDone(h, d)).length;
    return { cur, best, rate, total, unit: h.schedule.kind === 'weekly' ? 'שבועות' : 'ימים' };
  }
  function scheduleText(h) {
    const s = h.schedule;
    if (s.kind === 'weekly') return `${s.perWeek} פעמים בשבוע`;
    if (s.kind === 'days') return s.days.length === 7 ? 'כל יום' : s.days.slice().sort().map((d) => DAYS[d]).join(' ');
    return 'כל יום';
  }
  const P = (n) => `<span dir="ltr">${n}%</span>`;

  // ---------- public ----------
  function homeSummary() {
    const list = all().filter((h) => !h.archived && dueToday(h));
    if (!S().habits.length) return 'עוד לא הוספת הרגלים';
    const done = list.filter((h) => isDone(h, dayKey())).length;
    return `${done} מתוך ${list.length} הושלמו היום`;
  }
  function check() {
    const now = new Date();
    const t = dayKey();
    const mins = now.getHours() * 60 + now.getMinutes();
    let changed = false;
    all().forEach((h) => {
      if (h.archived || !h.reminderTime || h.lastRemind === t || !dueToday(h) || isDone(h, t)) return;
      const [hh, mm] = h.reminderTime.split(':').map(Number);
      if (mins < hh * 60 + mm) return;
      h.lastRemind = t;
      changed = true;
      notify(`${h.emoji} ${h.name}`, h.type === 'count' ? `${val(h, t)}/${h.target} ${h.unit} היום` : 'הגיע הזמן להרגל שלך', 'habit-' + h.id);
    });
    if (changed) save();
  }

  // ---------- list ----------
  function ring(h, d) {
    const C = 2 * Math.PI * 20;
    const f = frac(h, d);
    return `<svg viewBox="0 0 48 48" class="h-ring" aria-hidden="true"><circle cx="24" cy="24" r="20" class="tr"/><circle cx="24" cy="24" r="20" class="pr" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - f)}" transform="rotate(-90 24 24)"/></svg>`;
  }
  function item(h) {
    const t = dayKey();
    const done = isDone(h, t);
    const st = stats(h);
    const week = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));
    const wk = h.schedule.kind === 'weekly' ? ` · השבוע ${weekCount(h, t)}/${h.schedule.perWeek}` : '';
    return `<li class="habit-item ${done ? 'is-done' : ''}" style="--hc:${h.color}">
      <button class="h-check" data-hact="tap" data-id="${h.id}" aria-label="${done ? 'בוצע' : h.type === 'count' ? 'הוספת ' + h.step : 'סימון כבוצע'}">
        ${ring(h, t)}<span class="h-face">${done ? '✓' : esc(h.emoji)}</span>
      </button>
      <button class="h-body" data-hact="open" data-id="${h.id}">
        <span class="title">${esc(h.name)}</span>
        <span class="sub">${h.type === 'count' ? `<b>${val(h, t)}/${h.target}</b> ${esc(h.unit)} · ` : ''}${scheduleText(h)}${wk}${h.reminderTime ? ` · ⏰ ${h.reminderTime}` : ''}</span>
        <span class="week">${week.map((d) => `<i class="${isDone(h, d) ? 'on' : frac(h, d) > 0 ? 'part' : !scheduledOn(h, d) ? 'off' : ''}" title="${fmtDay(d)}">${DAYS[parseDay(d).getDay()]}</i>`).join('')}</span>
      </button>
      ${st.cur ? `<span class="streak" title="רצף נוכחי">🔥 ${st.cur}</span>` : ''}
    </li>`;
  }

  function render() {
    const list = all();
    const t = dayKey();
    const active = list.filter((h) => !h.archived);
    const archived = list.filter((h) => h.archived);
    const today = active.filter(dueToday);
    const rest = active.filter((h) => !dueToday(h));
    const done = today.filter((h) => isDone(h, t)).length;
    const pct = today.length ? Math.round((done / today.length) * 100) : 0;
    const bestNow = active.reduce((m, h) => Math.max(m, stats(h).cur), 0);
    const shown = filter === 'archive' ? archived : filter === 'all' ? active : today;
    const msg = !today.length ? 'אין הרגלים מתוכננים להיום' : done === today.length ? 'כל ההרגלים של היום הושלמו! 🎉' : pct >= 50 ? 'יותר מחצי הדרך, ממשיכים 💪' : 'יום חדש, הזדמנות חדשה 🌱';

    view.innerHTML = `
      ${active.length ? `<div class="card h-summary">
        <div class="h-sum-top"><div><div class="big">${done}<small> / ${today.length}</small></div><div class="muted">${msg}</div></div>
        ${bestNow ? `<div class="best">🔥 ${bestNow}<small>הרצף הארוך כרגע</small></div>` : ''}</div>
        <div class="progress"><div style="width:${pct}%"></div></div>
      </div>` : ''}

      <nav class="subtabs">
        <button class="${filter === 'today' ? 'active' : ''}" data-hact="filter" data-f="today">היום (${today.length})</button>
        <button class="${filter === 'all' ? 'active' : ''}" data-hact="filter" data-f="all">כל ההרגלים (${active.length})</button>
        <button class="${filter === 'archive' ? 'active' : ''}" data-hact="filter" data-f="archive">ארכיון (${archived.length})</button>
      </nav>

      <div class="card">
        ${shown.length ? `<ul class="list habits">${shown.map(item).join('')}</ul>`
          : `<p class="empty">${filter === 'archive' ? 'אין הרגלים בארכיון' : active.length ? 'אין כאן הרגלים כרגע' : 'עוד אין הרגלים — בואו נתחיל 🌱'}</p>`}
        ${filter === 'today' && rest.length ? `<div class="section-label">לא מתוכננים להיום</div><ul class="list habits dim">${rest.map(item).join('')}</ul>` : ''}
      </div>
      <button class="btn" style="width:100%" data-hact="new">+ הרגל חדש</button>`;
  }

  // ---------- detail sheet ----------
  function monthGrid(h, ym) {
    const [y, m] = ym;
    const first = new Date(y, m, 1);
    const days = new Date(y, m + 1, 0).getDate();
    const t = dayKey();
    let cells = '';
    for (let i = 0; i < first.getDay(); i++) cells += '<span></span>';
    for (let d = 1; d <= days; d++) {
      const k = dayKey(new Date(y, m, d));
      const f = frac(h, k);
      const cls = k > t ? 'future' : f >= 1 ? 'done' : f > 0 ? 'part' : !scheduledOn(h, k) || k < h.createdAt ? 'off' : 'miss';
      cells += `<button class="cal-cell ${cls} ${k === t ? 'today' : ''}" data-hact="cal-toggle" data-d="${k}" ${k > t ? 'disabled' : ''} style="--f:${f}">${d}</button>`;
    }
    return `<div class="cal-head"><button class="icon-btn" data-hact="cal-month" data-m="1" aria-label="חודש הבא">›</button><strong>${MONTHS[m]} ${y}</strong><button class="icon-btn" data-hact="cal-month" data-m="-1" aria-label="חודש קודם">‹</button></div>
      <div class="cal-grid">${DAYS.map((d) => `<span class="cal-dow">${d}</span>`).join('')}${cells}</div>
      <div class="muted tiny">לחיצה על יום מסמנת או מבטלת אותו.</div>`;
  }

  function drawDetail() {
    const h = find(sh.id);
    if (!h) { sheet.close(); return; }
    const t = dayKey();
    const st = stats(h);
    const v = val(h, t);
    const box = sheet.box();
    box.innerHTML = `
      <div class="sheet-head" style="--hc:${h.color}">
        <span class="h-badge">${esc(h.emoji)}</span><strong>${esc(h.name)}</strong>
        <button class="icon-btn" data-hact="edit" data-id="${h.id}" aria-label="עריכה">✏️</button>
        <button class="icon-btn" data-hact="close" aria-label="סגירה">✕</button>
      </div>
      <div class="sheet-body" style="--hc:${h.color}">
        <div class="muted tiny" style="margin:0 0 10px">${scheduleText(h)}${h.reminderTime ? ` · תזכורת ב־${h.reminderTime}` : ''}${h.type === 'count' ? ` · יעד ${h.target} ${esc(h.unit)} ביום` : ''}</div>
        ${h.type === 'count' ? `
          <div class="h-counter">
            <button class="btn ghost" data-hact="dec" aria-label="הורדה">−${h.step}</button>
            <div><strong>${v}</strong><span>/ ${h.target} ${esc(h.unit)}</span></div>
            <button class="btn h-btn" data-hact="inc" aria-label="הוספה">+${h.step}</button>
          </div>
          <form class="row" id="hAmount" style="margin-top:8px"><input name="v" type="number" min="0" step="any" placeholder="כמות מדויקת להיום" inputmode="decimal"><button class="btn ghost" style="flex:0 0 auto">עדכון</button></form>`
        : `<button class="btn h-btn big-toggle ${isDone(h, t) ? 'is-done' : ''}" data-hact="tap" data-id="${h.id}">${isDone(h, t) ? '✓ בוצע היום (לחיצה לביטול)' : 'סימון כבוצע היום'}</button>`}

        <div class="stat-tiles" style="margin-top:14px">
          <div><strong>🔥 ${st.cur}</strong><span>רצף נוכחי (${st.unit})</span></div>
          <div><strong>🏆 ${st.best}</strong><span>שיא</span></div>
          <div><strong>${st.rate == null ? '—' : P(st.rate)}</strong><span>הצלחה ב־30 יום</span></div>
          <div><strong>${st.total}</strong><span>ימים שהושלמו</span></div>
        </div>

        <div class="card cal">${monthGrid(h, sh.month)}</div>
        ${h.notes ? `<div class="h-notes">📝 ${esc(h.notes)}</div>` : ''}

        <div class="row h-actions">
          <button class="btn ghost small" data-hact="move" data-dir="-1">⬆️ למעלה</button>
          <button class="btn ghost small" data-hact="move" data-dir="1">⬇️ למטה</button>
          <button class="btn ghost small" data-hact="archive">${h.archived ? '📤 החזרה מהארכיון' : '📦 לארכיון'}</button>
          <button class="btn ghost small danger" data-hact="delete">🗑️ מחיקה</button>
        </div>
      </div>`;
    const f = $('#hAmount');
    if (f) f.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = parseFloat(e.target.v.value);
      if (n >= 0) { setVal(h, t, n); save(); drawDetail(); rerender(); }
    });
  }

  // ---------- edit sheet ----------
  function drawEdit() {
    const d = sh.draft;
    const box = sheet.box();
    const isNew = !sh.id;
    box.innerHTML = `
      <div class="sheet-head"><strong>${isNew ? '✨ הרגל חדש' : 'עריכת הרגל'}</strong><button class="icon-btn" data-hact="close" aria-label="סגירה">✕</button></div>
      <form id="hForm" class="sheet-body">
        ${isNew ? `<div class="section-label" style="margin-top:0">רעיונות מוכנים</div><div class="chips-scroll">${TEMPLATES.map((tp, i) => `<button type="button" class="chip" data-hact="tpl" data-i="${i}">${tp.emoji} ${tp.name}</button>`).join('')}</div>` : ''}
        <label class="field"><span>שם ההרגל</span><input name="name" required maxlength="50" value="${esc(d.name)}" placeholder="למשל: לקרוא 20 עמודים"></label>

        <div class="section-label">אייקון</div>
        <div class="emoji-grid">${EMOJIS.map((e) => `<button type="button" class="${d.emoji === e ? 'on' : ''}" data-hact="emoji" data-e="${e}">${e}</button>`).join('')}</div>
        <div class="section-label">צבע</div>
        <div class="swatches">${COLORS.map((c) => `<button type="button" class="${d.color === c ? 'on' : ''}" style="--c:${c}" data-hact="color" data-c="${c}" aria-label="צבע"></button>`).join('')}</div>

        <div class="section-label">סוג מעקב</div>
        <div class="seg">
          <button type="button" class="${d.type === 'check' ? 'on' : ''}" data-hact="type" data-t="check">✔️ בוצע / לא בוצע</button>
          <button type="button" class="${d.type === 'count' ? 'on' : ''}" data-hact="type" data-t="count">🔢 כמות יומית</button>
        </div>
        ${d.type === 'count' ? `<div class="grid3" style="margin-top:8px">
          <label class="field"><span>יעד יומי</span><input name="target" type="number" min="1" value="${d.target}" inputmode="numeric"></label>
          <label class="field"><span>יחידה</span><input name="unit" maxlength="15" value="${esc(d.unit)}" placeholder="כוסות, דקות…"></label>
          <label class="field"><span>קפיצה בלחיצה</span><input name="step" type="number" min="1" value="${d.step}" inputmode="numeric"></label>
        </div>` : ''}

        <div class="section-label">מתי?</div>
        <div class="seg">
          <button type="button" class="${d.schedule.kind === 'daily' ? 'on' : ''}" data-hact="sched" data-k="daily">כל יום</button>
          <button type="button" class="${d.schedule.kind === 'days' ? 'on' : ''}" data-hact="sched" data-k="days">ימים מסוימים</button>
          <button type="button" class="${d.schedule.kind === 'weekly' ? 'on' : ''}" data-hact="sched" data-k="weekly">X בשבוע</button>
        </div>
        ${d.schedule.kind === 'days' ? `<div class="day-chips">${DAYS.map((n, i) => `<button type="button" class="${d.schedule.days.includes(i) ? 'on' : ''}" data-hact="day" data-i="${i}">${n}</button>`).join('')}</div>` : ''}
        ${d.schedule.kind === 'weekly' ? `<label class="field" style="margin-top:8px"><span>כמה פעמים בשבוע</span><select name="perWeek">${[1, 2, 3, 4, 5, 6].map((n) => `<option ${d.schedule.perWeek === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>` : ''}

        <div class="section-label">תזכורת יומית</div>
        <div class="row">
          <input name="reminderTime" type="time" value="${d.reminderTime}">
          ${d.reminderTime ? '<button type="button" class="btn ghost" style="flex:0 0 auto" data-hact="no-remind">ללא</button>' : ''}
        </div>
        <div class="muted tiny">התזכורת קופצת רק בימים שבהם ההרגל מתוכנן ועוד לא בוצע.</div>

        <label class="field" style="margin-top:12px"><span>הערות / למה זה חשוב לי</span><textarea name="notes" rows="2" maxlength="300">${esc(d.notes)}</textarea></label>
      </form>
      <div class="sheet-foot row">
        ${isNew ? '' : '<button class="btn ghost danger" data-hact="delete" style="flex:0 0 auto" aria-label="מחיקת ההרגל">🗑️ מחיקה</button>'}
        <button class="btn" data-hact="save-habit">${isNew ? 'יצירת הרגל' : 'שמירה'}</button>
      </div>`;
    const form = $('#hForm');
    form.addEventListener('input', () => readForm(form));
    form.addEventListener('submit', (e) => { e.preventDefault(); saveHabit(); });
  }
  function readForm(f) {
    const d = sh.draft;
    d.name = f.name.value;
    if (f.target) { d.target = +f.target.value || 1; d.unit = f.unit.value; d.step = +f.step.value || 1; }
    if (f.perWeek) d.schedule.perWeek = +f.perWeek.value;
    d.reminderTime = f.reminderTime.value;
    d.notes = f.notes.value;
  }
  function saveHabit() {
    readForm($('#hForm'));
    const d = sh.draft;
    if (!d.name.trim()) { toast('נא לתת שם להרגל'); return; }
    if (d.schedule.kind === 'days' && !d.schedule.days.length) { toast('נא לבחור לפחות יום אחד'); return; }
    d.name = d.name.trim();
    if (sh.id) {
      const h = S().habits.find((x) => x.id === sh.id);
      Object.assign(h, d, { log: h.log });
      if (d.type === 'check') Object.keys(h.log).forEach((k) => { h.log[k] = Math.min(h.log[k], 1); });
      save(); toast('ההרגל עודכן');
      openDetail(sh.id);
    } else {
      S().habits.push(Object.assign({ id: uid(), log: {}, createdAt: dayKey(), archived: false }, d));
      save(); sheet.close(); toast('ההרגל נוסף 🌱');
    }
    rerender();
  }
  function openDetail(id) {
    const n = new Date();
    sh = { mode: 'detail', id, month: [n.getFullYear(), n.getMonth()] };
    sheet.open();
    drawDetail();
  }
  function openEdit(id) {
    const base = id ? find(id) : fix({ name: '', emoji: '🎯', color: COLORS[0], log: {} });
    const draft = JSON.parse(JSON.stringify({
      name: base.name, emoji: base.emoji, color: base.color, type: base.type, target: base.target, unit: base.unit, step: base.step,
      schedule: base.schedule, reminderTime: base.reminderTime, notes: base.notes,
    }));
    sh = { mode: 'edit', id: id || null, draft };
    sheet.open();
    drawEdit();
  }

  // ---------- actions ----------
  async function onAction(e) {
    const b = e.target.closest('[data-hact]');
    if (!b) return;
    const t = dayKey();
    const act = b.dataset.hact;
    const h = b.dataset.id ? find(b.dataset.id) : sh && sh.id ? find(sh.id) : null;
    switch (act) {
      case 'filter': filter = b.dataset.f; rerender(); break;
      case 'new': openEdit(null); break;
      case 'open': openDetail(b.dataset.id); break;
      case 'edit': openEdit(b.dataset.id); break;
      case 'close': sheet.close(); break;
      case 'tap': {
        const was = isDone(h, t);
        if (h.type === 'check') setVal(h, t, was ? 0 : 1);
        else setVal(h, t, val(h, t) + h.step);
        save();
        if (!was && isDone(h, t)) toast(`${h.emoji} כל הכבוד! ${stats(h).cur > 1 ? `רצף של ${stats(h).cur} ${stats(h).unit} 🔥` : 'הושלם להיום'}`);
        rerender(); if (sh && sh.mode === 'detail') drawDetail();
        break;
      }
      case 'inc': case 'dec': {
        const was = isDone(h, t);
        setVal(h, t, Math.max(0, val(h, t) + (act === 'inc' ? h.step : -h.step)));
        save(); drawDetail(); rerender();
        if (!was && isDone(h, t)) toast(`${h.emoji} הגעת ליעד היומי! 🎉`);
        break;
      }
      case 'cal-month': {
        let [y, m] = sh.month; m += +b.dataset.m;
        if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
        sh.month = [y, m]; drawDetail();
        break;
      }
      case 'cal-toggle': {
        const d = b.dataset.d;
        setVal(h, d, isDone(h, d) ? 0 : h.target);
        if (d < h.createdAt) h.createdAt = d;
        save(); drawDetail(); rerender();
        break;
      }
      case 'move': {
        const list = S().habits; const i = list.findIndex((x) => x.id === h.id); const j = i + +b.dataset.dir;
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        save(); rerender(); toast('הסדר עודכן');
        break;
      }
      case 'archive':
        h.archived = !h.archived; save(); sheet.close(); rerender();
        toast(h.archived ? 'ההרגל הועבר לארכיון — ההיסטוריה נשמרת' : 'ההרגל חזר לרשימה');
        break;
      case 'delete':
        if (await ctx.ask(`למחוק את "${h.name}" וכל ההיסטוריה שלו? (אפשר במקום זה להעביר לארכיון)`, { ok: 'מחיקה', danger: true })) {
          S().habits = S().habits.filter((x) => x.id !== h.id); save(); sheet.close(); rerender(); toast('ההרגל נמחק');
        }
        break;
      // edit form controls
      case 'tpl': Object.assign(sh.draft, JSON.parse(JSON.stringify(Object.assign({ type: 'check', target: 1, unit: '', step: 1, reminderTime: '', schedule: { kind: 'daily', days: [0, 1, 2, 3, 4, 5, 6], perWeek: 3 } }, TEMPLATES[+b.dataset.i])))); drawEdit(); break;
      case 'emoji': readForm($('#hForm')); sh.draft.emoji = b.dataset.e; drawEdit(); break;
      case 'color': readForm($('#hForm')); sh.draft.color = b.dataset.c; drawEdit(); break;
      case 'type': readForm($('#hForm')); sh.draft.type = b.dataset.t; if (b.dataset.t === 'count' && sh.draft.target < 2) sh.draft.target = 8; drawEdit(); break;
      case 'sched': readForm($('#hForm')); sh.draft.schedule.kind = b.dataset.k; drawEdit(); break;
      case 'day': {
        readForm($('#hForm'));
        const ds = sh.draft.schedule.days; const i = +b.dataset.i; const k = ds.indexOf(i);
        if (k >= 0) ds.splice(k, 1); else ds.push(i);
        drawEdit();
        break;
      }
      case 'no-remind': readForm($('#hForm')); sh.draft.reminderTime = ''; drawEdit(); break;
      case 'save-habit': saveHabit(); break;
      default: return;
    }
  }
  view.addEventListener('click', onAction);

  // ---------- API ללוח השנה ----------
  function dueOn(d) {
    return all().filter((h) => !h.archived && d >= h.createdAt && (h.schedule.kind === 'weekly' ? isDone(h, d) || weekCount(h, d) < h.schedule.perWeek : scheduledOn(h, d)));
  }
  function dayStatus(d) {
    const list = dueOn(d);
    return { total: list.length, done: list.filter((h) => isDone(h, d)).length };
  }
  function toggleOn(id, d) {
    const h = find(id);
    if (!h || d > dayKey()) return;
    setVal(h, d, isDone(h, d) ? 0 : h.target);
    if (d < h.createdAt) h.createdAt = d;
    save();
  }
  return { render, homeSummary, check, close: () => sheet.close(), dueOn, dayStatus, toggleOn, isDone, val, open: openDetail };
};
