/* לוח שנה: מאגד את כל התזכורות (כולל חזרות), הרגלים, תזונה, תאריך עברי וחגים. תצוגות: חודש, שבוע, יום ורשימה. */
window.CalendarModule = function (ctx) {
  'use strict';
  const { $, esc, dayKey, addDays, parseDay, fmtDay, DAYS, toast, view } = ctx;
  const rem = () => ctx.rem;
  const hab = () => ctx.habits;
  const cal = () => ctx.cal;
  const tsk = () => ctx.tasks;
  const rerender = () => ctx.render();

  const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const LIST_COLORS = { personal: '#6366f1', work: '#0ea5e9', health: '#ef4444', shopping: '#f59e0b', home: '#16a34a', other: '#64748b' };
  const MAJOR = ['ראש השנה', 'יום כיפור', 'סוכות', 'שמחת תורה', 'פסח', 'שביעי של פסח', 'שבועות'];
  const HOUR_PX = 56;

  const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem('cal-' + k); localStorage.setItem('cal-' + k, v); } catch (e) { /* ignore */ } return null; };
  let mode = pref('mode') || 'month';
  let cursor = dayKey();
  let selected = dayKey();
  let layers = Object.assign({ holidays: true, habits: true, food: true, tasks: true }, JSON.parse(pref('layers') || '{}'));
  let hiddenLists = JSON.parse(pref('hidden') || '[]');

  // ---------- Hebrew date & holidays ----------
  const HF = new Intl.DateTimeFormat('he-u-ca-hebrew-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
  const hcache = {};
  function heb(k) {
    if (hcache[k]) return hcache[k];
    const o = {};
    HF.formatToParts(new Date(parseDay(k).getTime() + 12 * 3600e3)).forEach((p) => { o[p.type] = p.value; });
    return (hcache[k] = { d: +o.day, m: o.month, y: +o.year });
  }
  function gem(n) {
    const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'], tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
    const hund = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];
    const h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), o = n % 10;
    let s = hund[h] + (t === 1 && (o === 5 || o === 6) ? 'ט' + (o === 5 ? 'ו' : 'ז') : tens[t] + ones[o]);
    return s.length > 1 ? s.slice(0, -1) + '״' + s.slice(-1) : s + '׳';
  }
  const hebFull = (k) => { const h = heb(k); return `${gem(h.d)} ב${h.m} ${gem(h.y % 1000)}`; };

  const hol = {};
  function holidays(k) {
    if (hol[k]) return hol[k];
    const { d, m } = heb(k);
    const w = parseDay(k).getDay();
    const H = [];
    const is = (mm, dd) => m === mm && d === dd;
    const shifted = (baseDay, rule) => { const base = addDays(k, baseDay - d); return addDays(base, rule(parseDay(base).getDay())); };
    if (is('אלול', 29)) H.push('ערב ראש השנה');
    if (m === 'תשרי') {
      if (d === 1 || d === 2) H.push('ראש השנה');
      if (d <= 4 && k === shifted(3, (wb) => (wb === 6 ? 1 : 0))) H.push('צום גדליה');
      if (d === 9) H.push('ערב יום כיפור');
      if (d === 10) H.push('יום כיפור');
      if (d === 14) H.push('ערב סוכות');
      if (d === 15) H.push('סוכות');
      if (d >= 16 && d <= 20) H.push('חול המועד סוכות');
      if (d === 21) H.push('הושענא רבה');
      if (d === 22) H.push('שמחת תורה');
    }
    for (let i = 0; i < 8; i++) { const h = heb(addDays(k, -i)); if (h.m === 'כסלו' && h.d === 25) { H.push(`חנוכה · נר ${gem(i + 1)}`); break; } }
    if (is('טבת', 10)) H.push('צום עשרה בטבת');
    if (is('שבט', 15)) H.push('ט״ו בשבט');
    if (m === 'אדר' || m === 'אדר ב׳') {
      if (d === 13 && w !== 6) H.push('תענית אסתר');
      if (d === 14) H.push('פורים');
      if (d === 15) H.push('שושן פורים');
    }
    if (m === 'ניסן') {
      if (d === 14) H.push('ערב פסח');
      if (d === 15) H.push('פסח');
      if (d >= 16 && d <= 20) H.push('חול המועד פסח');
      if (d === 21) H.push('שביעי של פסח');
      if (d >= 26 && k === shifted(27, (wb) => (wb === 5 ? -1 : wb === 0 ? 1 : 0))) H.push('יום השואה');
    }
    if (m === 'אייר') {
      if (d <= 7) {
        const atz = shifted(5, (wb) => (wb === 5 ? -1 : wb === 6 ? -2 : wb === 1 ? 1 : 0));
        if (k === atz) H.push('יום העצמאות');
        if (k === addDays(atz, -1)) H.push('יום הזיכרון');
      }
      if (d === 18) H.push('ל״ג בעומר');
      if (d === 28) H.push('יום ירושלים');
    }
    if (is('סיוון', 5)) H.push('ערב שבועות');
    if (is('סיוון', 6)) H.push('שבועות');
    if (m === 'תמוז' && (d === 17 || d === 18) && k === shifted(17, (wb) => (wb === 6 ? 1 : 0))) H.push('צום י״ז בתמוז');
    if (m === 'אב') {
      if ((d === 9 || d === 10) && k === shifted(9, (wb) => (wb === 6 ? 1 : 0))) H.push('תשעה באב');
      if (d === 15) H.push('ט״ו באב');
    }
    return (hol[k] = H);
  }
  const isMajor = (k) => holidays(k).some((h) => MAJOR.includes(h));

  // ---------- data ----------
  const ms = (k) => parseDay(k).getTime();
  function eventsBetween(fromK, toK) {
    const by = {};
    rem().occurrences(ms(fromK), ms(toK)).forEach((o) => {
      if (hiddenLists.includes(o.r.list)) return;
      const k = dayKey(new Date(o.ts));
      (by[k] = by[k] || []).push(o);
    });
    return by;
  }
  // רשימת היום: כולל תזכורות שעבר זמנן (מימים קודמים) כשמדובר בהיום
  function dayList(k) {
    const list = eventsBetween(k, addDays(k, 1))[k] || [];
    if (k !== dayKey()) return list;
    const over = rem().occurrences(ms(addDays(k, -365)), ms(k)).filter((o) => o.over && !hiddenLists.includes(o.r.list)).map((o) => Object.assign({}, o, { carried: true }));
    return over.concat(list);
  }
  // משימות עם תאריך יעד (ובהיום — גם משימות פתוחות שעבר התאריך שלהן)
  function taskList(k, withOverdue) {
    if (!layers.tasks) return [];
    const list = tsk().dueOn(k);
    return withOverdue && k === dayKey() ? tsk().overdueBefore(k).map((t) => Object.assign({ carried: true }, t, { _ref: t })).concat(list) : list;
  }
  function taskItem(t) {
    const l = tsk().listOf(t.listId);
    const sub = t.subtasks.length ? ` · ☑️ ${t.subtasks.filter((x) => x.done).length}/${t.subtasks.length}` : '';
    return `<li class="kev ktask ${t.done ? 'done' : ''} ${t.carried ? 'over' : ''}" style="--c:${l.color}">
      <button class="tick sq" data-kact="task-tick" data-id="${t.id}" aria-label="${t.done ? 'החזרה' : 'סימון כבוצעה'}">${t.done ? '✓' : ''}</button>
      <button class="kev-body" data-kact="task-edit" data-id="${t.id}">
        <span class="kev-time">${t.carried ? fmtDay(t.due) : t.time || '📋'}</span>
        <span class="grow"><span class="title">${t.priority === 'high' ? '‼️ ' : ''}${esc(t.title)}</span>
        <span class="sub">${t.carried ? '<b class="bad">באיחור</b> · ' : ''}${esc(l.emoji)} ${esc(l.name)}${sub}${t.notes ? ' · 📝' : ''}</span></span>
      </button>
    </li>`;
  }
  const color = (o) => LIST_COLORS[o.r.list] || '#64748b';
  const hm = (ts) => rem().timeOf(ts);

  // ---------- header ----------
  function titleFor() {
    const d = parseDay(cursor);
    if (mode === 'month') {
      const a = heb(dayKey(new Date(d.getFullYear(), d.getMonth(), 1))), b = heb(dayKey(new Date(d.getFullYear(), d.getMonth() + 1, 0)));
      return [`${MONTHS[d.getMonth()]} ${d.getFullYear()}`, a.m === b.m ? `${a.m} ${gem(a.y % 1000)}` : `${a.m}–${b.m} ${gem(b.y % 1000)}`];
    }
    if (mode === 'week') {
      const s = addDays(cursor, -d.getDay()), e = addDays(s, 6);
      const ds = parseDay(s), de = parseDay(e);
      return [`${ds.getDate()}${ds.getMonth() !== de.getMonth() ? ' ' + MONTHS[ds.getMonth()] : ''}–${de.getDate()} ${MONTHS[de.getMonth()]}`, `${heb(s).m === heb(e).m ? heb(s).m : heb(s).m + '–' + heb(e).m} ${gem(heb(e).y % 1000)}`];
    }
    if (mode === 'day') return [`יום ${DAY_NAMES[d.getDay()]}, ${d.getDate()} ב${MONTHS[d.getMonth()]}`, hebFull(cursor)];
    return ['הקרוב אליי', `מ־${fmtDay(cursor)} · 60 יום`];
  }
  function header() {
    const [t, sub] = titleFor();
    const views = [['month', 'חודש'], ['week', 'שבוע'], ['day', 'יום'], ['agenda', 'רשימה']];
    const lists = rem().LISTS;
    return `
      <div class="k-head">
        <button class="icon-btn" data-kact="nav" data-n="1" aria-label="הבא">›</button>
        <div class="k-title"><strong>${t}</strong><span>${sub}</span></div>
        <button class="icon-btn" data-kact="nav" data-n="-1" aria-label="הקודם">‹</button>
      </div>
      <div class="k-bar">
        <div class="seg k-views">${views.map(([k, l]) => `<button class="${mode === k ? 'on' : ''}" data-kact="mode" data-m="${k}">${l}</button>`).join('')}</div>
        <button class="btn ghost small" data-kact="today" ${cursor === dayKey() && selected === dayKey() ? 'disabled' : ''}>היום</button>
      </div>
      <div class="chips-scroll k-filters">
        ${lists.map(([k, l]) => `<button class="chip k-list ${hiddenLists.includes(k) ? 'off' : ''}" style="--c:${LIST_COLORS[k]}" data-kact="list" data-l="${k}">${l}</button>`).join('')}
        <span class="k-sep"></span>
        <button class="chip ${layers.tasks ? 'on' : ''}" data-kact="layer" data-l="tasks">📋 משימות</button>
        <button class="chip ${layers.holidays ? 'on' : ''}" data-kact="layer" data-l="holidays">🕎 חגים</button>
        <button class="chip ${layers.habits ? 'on' : ''}" data-kact="layer" data-l="habits">✅ הרגלים</button>
        <button class="chip ${layers.food ? 'on' : ''}" data-kact="layer" data-l="food">🔥 תזונה</button>
      </div>`;
  }

  // ---------- month ----------
  function renderMonth() {
    const d = parseDay(cursor);
    const first = dayKey(new Date(d.getFullYear(), d.getMonth(), 1));
    const last = dayKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    const start = addDays(first, -parseDay(first).getDay());
    const weeks = Math.ceil((parseDay(first).getDay() + parseDay(last).getDate()) / 7);
    const end = addDays(start, weeks * 7);
    const ev = eventsBetween(start, end);
    const t = dayKey();
    const goal = cal().goal();

    let monthEvents = 0, monthOver = 0, habDone = 0, habTotal = 0, monthTasks = 0;
    for (let k = first; k <= last; k = addDays(k, 1)) {
      monthTasks += taskList(k).filter((x) => !x.done).length;
      (ev[k] || []).forEach((o) => { monthEvents++; if (o.over) monthOver++; });
      if (k <= t) { const s = hab().dayStatus(k); habDone += s.done; habTotal += s.total; }
    }

    let cells = '';
    for (let i = 0; i < weeks * 7; i++) {
      const k = addDays(start, i);
      const kd = parseDay(k);
      const list = ev[k] || [];
      const tl = taskList(k);
      const hd = heb(k);
      const hs = layers.holidays ? holidays(k) : [];
      const st = layers.habits && k <= t ? hab().dayStatus(k) : null;
      const kcal = layers.food && k <= t ? cal().dayTotal(k) : 0;
      const cls = [
        k.slice(0, 7) !== cursor.slice(0, 7) ? 'out' : '', k === t ? 'today' : '', k === selected ? 'sel' : '',
        kd.getDay() === 6 || (layers.holidays && isMajor(k)) ? 'rest' : '', list.some((o) => o.over) ? 'has-over' : '',
      ].join(' ');
      cells += `<button class="kc ${cls}" data-kact="pick" data-d="${k}" aria-label="${kd.getDate()} ${MONTHS[kd.getMonth()]}${list.length ? `, ${list.length} תזכורות` : ''}">
        <span class="kc-top"><span class="kc-n">${kd.getDate()}</span><span class="kc-h">${hd.d === 1 ? hd.m : gem(hd.d)}</span></span>
        ${hs.length ? `<span class="kc-hol">${esc(hs[0])}</span>` : ''}
        <span class="kc-evs">
          ${list.slice(0, 3).map((o) => `<i class="ev ${o.done ? 'done' : ''}" style="--c:${color(o)}"><b>${hm(o.ts)}</b> ${esc(o.r.title)}</i>`).join('')}
          ${tl.slice(0, Math.max(0, 3 - list.length)).map((x) => `<i class="ev etask ${x.done ? 'done' : ''}" style="--c:${tsk().listOf(x.listId).color}">${x.done ? '☑' : '☐'} ${esc(x.title)}</i>`).join('')}
          ${list.length + tl.length > 3 ? `<i class="ev more">+${list.length + tl.length - 3}</i>` : ''}
        </span>
        <span class="kc-dots">${list.slice(0, 4).map((o) => `<i style="--c:${color(o)}" class="${o.done ? 'done' : ''}"></i>`).join('')}${tl.slice(0, Math.max(0, 4 - list.length)).map((x) => `<i style="--c:${tsk().listOf(x.listId).color}" class="sq ${x.done ? 'done' : ''}"></i>`).join('')}${list.length + tl.length > 4 ? '<i class="plus">+</i>' : ''}</span>
        ${st && st.total ? `<span class="kc-hab" title="הרגלים ${st.done}/${st.total}"><b style="width:${(st.done / st.total) * 100}%"></b></span>` : ''}
        ${kcal ? `<span class="kc-kcal ${kcal > goal * 1.1 ? 'over' : kcal >= goal * 0.8 ? 'ok' : ''}" title="${Math.round(kcal)} קק״ל"></span>` : ''}
      </button>`;
    }
    return `
      <div class="k-month-stats">
        <span>📌 <b>${monthEvents}</b> תזכורות החודש</span>
        ${layers.tasks && monthTasks ? `<span>📋 <b>${monthTasks}</b> משימות פתוחות</span>` : ''}
        ${monthOver ? `<span class="bad">⚠️ <b>${monthOver}</b> באיחור</span>` : ''}
        ${layers.habits && habTotal ? `<span>✅ הרגלים <b dir="ltr">${Math.round((habDone / habTotal) * 100)}%</b></span>` : ''}
      </div>
      <div class="card k-month" id="kSwipe">
        <div class="k-dow">${DAYS.map((x, i) => `<span class="${i === 6 ? 'rest' : ''}">${x}</span>`).join('')}</div>
        <div class="k-grid">${cells}</div>
      </div>
      ${dayPanel(selected, dayList(selected))}`;
  }

  // ---------- day panel (agenda for one day) ----------
  function evItem(o) {
    const r = o.r;
    const canTick = o.next || (o.done && !o.past);
    return `<li class="kev ${o.done ? 'done' : ''} ${o.over ? 'over' : ''}" style="--c:${color(o)}">
      ${canTick ? `<button class="tick" data-kact="tick" data-id="${r.id}" aria-label="${o.done ? 'החזרה' : 'סימון כבוצע'}">${o.done ? '✓' : ''}</button>` : `<span class="kev-ico" title="${o.done ? 'בוצע' : 'מופע עתידי'}">${o.done ? '✓' : '🔁'}</span>`}
      <button class="kev-body" data-kact="edit" data-id="${r.id}">
        <span class="kev-time">${o.carried ? fmtDay(dayKey(new Date(o.ts))) : hm(o.ts)}</span>
        <span class="grow"><span class="title">${r.priority === 'high' ? '‼️ ' : ''}${esc(r.title)}</span>
        <span class="sub">${o.over ? '<b class="bad">באיחור</b> · ' : ''}${rem().LISTS.find((x) => x[0] === r.list)[1]}${r.repeat !== 'none' ? ' · 🔁 ' + rem().repeatText(r) : ''}${r.email ? ' · 📧' : ''}${r.notes ? ' · 📝' : ''}</span></span>
      </button>
    </li>`;
  }
  function dayPanel(k, list, opts = {}) {
    const d = parseDay(k);
    const t = dayKey();
    const hs = layers.holidays ? holidays(k) : [];
    const habits = layers.habits ? hab().dueOn(k) : [];
    const kcal = layers.food ? cal().dayTotal(k) : 0;
    const goal = cal().goal();
    const water = (ctx.state().water.log || {})[k] || 0;
    return `<div class="card day-panel">
      <div class="dp-head">
        <div><strong>${k === t ? 'היום · ' : ''}יום ${DAY_NAMES[d.getDay()]}, ${d.getDate()} ב${MONTHS[d.getMonth()]}</strong><span>${hebFull(k)}</span></div>
        <div class="dp-add"><button class="btn small" data-kact="new" data-d="${k}">+ תזכורת</button><button class="btn ghost small" data-kact="task-new" data-d="${k}">+ משימה</button></div>
      </div>
      ${hs.length ? `<div class="dp-hols">${hs.map((h) => `<span class="${MAJOR.includes(h) ? 'major' : ''}">🕎 ${esc(h)}</span>`).join('')}</div>` : ''}
      ${list.length ? `<ul class="list kevs">${list.map(evItem).join('')}</ul>` : `<p class="empty" style="padding:10px 0">אין תזכורות ביום הזה${k >= t ? ' — אפשר להוסיף ✨' : ''}</p>`}
      ${(() => { const tl = taskList(k, true); return tl.length ? `<div class="section-label">משימות</div><ul class="list kevs">${tl.map(taskItem).join('')}</ul>` : ''; })()}
      ${habits.length ? `<div class="section-label">הרגלים</div><div class="dp-habits">${habits.map((h) => {
        const done = hab().isDone(h, k);
        return `<button class="dp-h ${done ? 'done' : ''}" style="--hc:${h.color}" data-kact="habit" data-id="${h.id}" data-d="${k}" ${k > t ? 'disabled' : ''}>${done ? '✓' : esc(h.emoji)} ${esc(h.name)}${h.type === 'count' ? ` <small>${hab().val(h, k)}/${h.target}</small>` : ''}</button>`;
      }).join('')}</div>` : ''}
      ${layers.food && k <= t && (kcal || water) ? `<div class="dp-food">
        ${kcal ? `<a href="#/calories">🔥 <b>${Math.round(kcal).toLocaleString('he-IL')}</b> / ${goal.toLocaleString('he-IL')} קק״ל</a>` : ''}
        ${water ? `<a href="#/water">💧 <b>${water}</b> כוסות</a>` : ''}
      </div>` : ''}
      ${opts.noOpen ? '' : `<button class="link-btn" data-kact="open-day" data-d="${k}">פתיחה בתצוגת יום ←</button>`}
    </div>`;
  }

  // ---------- week ----------
  function renderWeek() {
    const s = addDays(cursor, -parseDay(cursor).getDay());
    const ev = eventsBetween(s, addDays(s, 7));
    const t = dayKey();
    const strip = Array.from({ length: 7 }, (_, i) => {
      const k = addDays(s, i); const n = (ev[k] || []).length + taskList(k).length;
      return `<button class="ws-day ${k === t ? 'today' : ''} ${k === selected ? 'sel' : ''}" data-kact="pick" data-d="${k}"><span>${DAYS[i]}</span><b>${parseDay(k).getDate()}</b><i>${n ? '•'.repeat(Math.min(n, 3)) : ''}</i></button>`;
    }).join('');
    const days = Array.from({ length: 7 }, (_, i) => addDays(s, i)).map((k) => {
      const list = ev[k] || [];
      const hs = layers.holidays ? holidays(k) : [];
      const st = layers.habits && k <= t ? hab().dayStatus(k) : null;
      const d = parseDay(k);
      return `<div class="card wk-day ${k === t ? 'today' : ''} ${d.getDay() === 6 || (layers.holidays && isMajor(k)) ? 'rest' : ''}">
        <button class="wk-head" data-kact="open-day" data-d="${k}">
          <span class="wk-num">${d.getDate()}</span>
          <span class="grow"><strong>יום ${DAY_NAMES[d.getDay()]}${k === t ? ' · היום' : ''}</strong><span>${hebFull(k)}${hs.length ? ' · 🕎 ' + esc(hs.join(' · ')) : ''}</span></span>
          ${st && st.total ? `<span class="wk-hab">✅ ${st.done}/${st.total}</span>` : ''}
        </button>
        ${list.length || taskList(k).length ? `<ul class="list kevs">${list.map(evItem).join('')}${taskList(k).map(taskItem).join('')}</ul>` : ''}
        <div class="wk-add"><button class="link-btn" data-kact="new" data-d="${k}">+ תזכורת</button><button class="link-btn" data-kact="task-new" data-d="${k}">+ משימה</button></div>
      </div>`;
    }).join('');
    return `<div class="week-strip">${strip}</div>${days}`;
  }

  // ---------- day (time grid) ----------
  function renderDay() {
    const k = cursor;
    const list = eventsBetween(k, addDays(k, 1))[k] || [];
    const panelList = dayList(k);
    const s = addDays(k, -parseDay(k).getDay());
    const t = dayKey();
    const strip = Array.from({ length: 7 }, (_, i) => {
      const kk = addDays(s, i);
      return `<button class="ws-day ${kk === t ? 'today' : ''} ${kk === k ? 'sel' : ''}" data-kact="goto-day" data-d="${kk}"><span>${DAYS[i]}</span><b>${parseDay(kk).getDate()}</b></button>`;
    }).join('');
    const minH = Math.min(7, ...list.map((o) => new Date(o.ts).getHours()));
    const maxH = Math.max(22, ...list.map((o) => new Date(o.ts).getHours() + 1));
    // פריסת אירועים חופפים לעמודות
    const placed = [];
    list.forEach((o) => {
      const m = new Date(o.ts).getHours() * 60 + new Date(o.ts).getMinutes();
      const col = [0, 1, 2, 3].find((c) => !placed.some((p) => p.col === c && Math.abs(p.m - m) < 45)) ?? 0;
      placed.push({ o, m, col });
    });
    const cols = Math.max(1, ...placed.map((p) => p.col + 1));
    let hours = '';
    for (let h = minH; h <= maxH; h++) hours += `<button class="hr" data-kact="new-at" data-d="${k}" data-h="${h}"><span>${String(h).padStart(2, '0')}:00</span></button>`;
    const now = new Date();
    const nowM = now.getHours() * 60 + now.getMinutes();
    const events = placed.map(({ o, m, col }) => `<button class="tg-ev ${o.done ? 'done' : ''} ${o.over ? 'over' : ''}" data-kact="edit" data-id="${o.r.id}"
        style="--c:${color(o)};top:${10 + ((m - minH * 60) / 60) * HOUR_PX}px;inset-inline-start:calc(52px + (100% - 56px) * ${col / cols});width:calc((100% - 60px) / ${cols})">
        <b>${hm(o.ts)}</b> ${o.done ? '✓ ' : ''}${esc(o.r.title)}</button>`).join('');
    return `
      <div class="week-strip">${strip}</div>
      ${dayPanel(k, panelList, { noOpen: true })}
      <div class="card tgrid-card">
        <div class="tgrid" style="height:${(maxH - minH + 1) * HOUR_PX + 10}px">
          ${hours}
          ${k === t && nowM >= minH * 60 && nowM <= (maxH + 1) * 60 ? `<div class="now-line" style="top:${10 + ((nowM - minH * 60) / 60) * HOUR_PX}px"></div>` : ''}
          ${events}
        </div>
        <p class="muted tiny">לחיצה על שעה פנויה יוצרת תזכורת בשעה הזו.</p>
      </div>`;
  }

  // ---------- agenda ----------
  function renderAgenda() {
    const from = cursor, to = addDays(cursor, 60);
    const ev = eventsBetween(from, to);
    let html = '';
    for (let k = from; k < to; k = addDays(k, 1)) {
      const list = ev[k] || [];
      const tl = taskList(k);
      const hs = layers.holidays ? holidays(k) : [];
      if (!list.length && !hs.length && !tl.length) continue;
      const d = parseDay(k);
      html += `<div class="ag-day ${k === dayKey() ? 'today' : ''}">
        <button class="ag-date" data-kact="open-day" data-d="${k}"><b>${d.getDate()}</b><span>${DAYS[d.getDay()]}</span><small>${MONTHS[d.getMonth()].slice(0, 3)}</small></button>
        <div class="ag-body">
          <div class="ag-sub">${fmtDay(k)} · ${hebFull(k)}</div>
          ${hs.length ? `<div class="dp-hols">${hs.map((h) => `<span class="${MAJOR.includes(h) ? 'major' : ''}">🕎 ${esc(h)}</span>`).join('')}</div>` : ''}
          ${list.length || tl.length ? `<ul class="list kevs">${list.map(evItem).join('')}${tl.map(taskItem).join('')}</ul>` : ''}
        </div>
      </div>`;
    }
    return `<div class="card">${html || '<p class="empty">אין תזכורות, משימות או חגים ב־60 הימים הקרובים</p>'}</div>
      <button class="btn" style="width:100%" data-kact="new" data-d="${dayKey()}">+ תזכורת חדשה</button>`;
  }

  // ---------- render ----------
  function render() {
    const body = mode === 'week' ? renderWeek() : mode === 'day' ? renderDay() : mode === 'agenda' ? renderAgenda() : renderMonth();
    view.innerHTML = header() + body;
    const sw = $('#kSwipe');
    if (sw) {
      let x0 = null, y0 = null;
      sw.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
      sw.addEventListener('touchend', (e) => {
        if (x0 == null) return;
        const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
        x0 = null;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) nav(dx > 0 ? 1 : -1); // RTL: החלקה ימינה = קדימה
      });
    }
    if (mode === 'day' && cursor === dayKey()) {
      const line = $('.now-line');
      if (line && !render.scrolled) { render.scrolled = true; line.scrollIntoView({ block: 'center' }); }
    }
  }
  function nav(n) {
    if (mode === 'month') {
      const d = parseDay(cursor);
      const nd = new Date(d.getFullYear(), d.getMonth() + n, 1);
      cursor = dayKey(nd);
      selected = cursor.slice(0, 7) === dayKey().slice(0, 7) ? dayKey() : cursor;
    } else if (mode === 'week') { cursor = addDays(cursor, 7 * n); selected = cursor; }
    else if (mode === 'day') { cursor = addDays(cursor, n); selected = cursor; }
    else cursor = addDays(cursor, 30 * n);
    rerender();
  }

  function onAction(e) {
    const b = e.target.closest('[data-kact]');
    if (!b) return;
    const k = b.dataset.d;
    switch (b.dataset.kact) {
      case 'nav': nav(+b.dataset.n); break;
      case 'today': cursor = selected = dayKey(); render.scrolled = false; rerender(); break;
      case 'mode': mode = b.dataset.m; pref('mode', mode); if (mode !== 'agenda') cursor = selected; render.scrolled = false; rerender(); break;
      case 'pick':
        selected = k;
        if (mode === 'month' && k.slice(0, 7) !== cursor.slice(0, 7)) cursor = k;
        rerender();
        if (mode === 'month') { const p = $('.day-panel'); if (p && window.innerWidth < 700) p.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
        break;
      case 'open-day': case 'goto-day': cursor = selected = k; mode = 'day'; pref('mode', mode); rerender(); window.scrollTo(0, 0); break;
      case 'new': rem().openNew(k, k === dayKey() ? null : '09:00'); break;
      case 'task-new': tsk().openEdit(null, { due: k }); break;
      case 'task-edit': tsk().openEdit(b.dataset.id); break;
      case 'task-tick': tsk().toggle(b.dataset.id); rerender(); break;
      case 'new-at': rem().openNew(k, String(b.dataset.h).padStart(2, '0') + ':00'); break;
      case 'edit': rem().openEdit(b.dataset.id); break;
      case 'tick': rem().toggle(b.dataset.id); rerender(); toast('עודכן ✓'); break;
      case 'habit': hab().toggleOn(b.dataset.id, k); rerender(); break;
      case 'list': {
        const l = b.dataset.l; const i = hiddenLists.indexOf(l);
        if (i >= 0) hiddenLists.splice(i, 1); else hiddenLists.push(l);
        pref('hidden', JSON.stringify(hiddenLists)); rerender();
        break;
      }
      case 'layer': layers[b.dataset.l] = !layers[b.dataset.l]; pref('layers', JSON.stringify(layers)); rerender(); break;
      default: return;
    }
  }
  view.addEventListener('click', onAction);

  function homeSummary() {
    const t = dayKey();
    const n = (eventsBetween(t, addDays(t, 7))[t] || []).length;
    const hs = holidays(t);
    return `${hebFull(t)}${hs.length ? ' · ' + hs[0] : ''} · ${n ? `${n} תזכורות היום` : 'אין תזכורות היום'}`;
  }
  return { render, homeSummary };
};
