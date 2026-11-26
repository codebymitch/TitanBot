/* מודול משימות: רשימות נפרדות (בהתאמה אישית), תאריכי יעד, עדיפות, תתי־משימות, הערות, וחיבור ללוח השנה. */
window.TasksModule = function (ctx) {
  'use strict';
  const { $, esc, uid, dayKey, addDays, parseDay, fmtDay, toast, view } = ctx;
  const S = () => ctx.state();
  const save = () => ctx.save();
  const rerender = () => ctx.render();

  const COLORS = ['#6366f1', '#0ea5e9', '#16a34a', '#f97316', '#ec4899', '#eab308', '#14b8a6', '#64748b'];
  const EMOJIS = ['📋', '🏠', '💼', '🛒', '🎓', '💡', '✈️', '🎉', '💪', '❤️', '📚', '🔧', '💰', '🎁', '🌱', '⭐'];
  const PRIO = { low: 'נמוכה', normal: 'רגילה', high: '‼️ גבוהה' };
  const SMART = [['today', '☀️ היום'], ['planned', '📅 מתוכננות'], ['all', '🗂️ הכל']];

  let current = (() => { try { return localStorage.getItem('tasks-list') || 'today'; } catch (e) { return 'today'; } })();
  let showDone = false;
  let sh = null;
  const sheet = ctx.makeSheet('taskSheet', onAction, () => { sh = null; });

  // ---------- model ----------
  function lists() {
    const st = S();
    if (!Array.isArray(st.taskLists) || !st.taskLists.length) st.taskLists = [{ id: 'inbox', name: 'המשימות שלי', emoji: '📋', color: COLORS[0] }];
    return st.taskLists;
  }
  function tasks() {
    const st = S();
    if (!Array.isArray(st.tasks)) st.tasks = [];
    st.tasks.forEach((t) => {
      t.notes = t.notes || ''; t.due = t.due || ''; t.time = t.time || ''; t.priority = t.priority || 'normal';
      t.subtasks = t.subtasks || []; t.createdAt = t.createdAt || Date.now();
      if (!lists().some((l) => l.id === t.listId)) t.listId = lists()[0].id;
    });
    return st.tasks;
  }
  const listOf = (id) => lists().find((l) => l.id === id) || lists()[0];
  const find = (id) => tasks().find((t) => t.id === id);
  const isSmart = (id) => SMART.some(([k]) => k === id);
  const prioRank = { high: 0, normal: 1, low: 2 };
  const sortOpen = (a, b) => (a.due || '9999') .localeCompare(b.due || '9999') || (a.time || '99').localeCompare(b.time || '99') || prioRank[a.priority] - prioRank[b.priority] || a.createdAt - b.createdAt;

  function filtered(id) {
    const t = dayKey();
    const all = tasks();
    if (id === 'today') return all.filter((x) => x.due && x.due <= t);
    if (id === 'planned') return all.filter((x) => x.due);
    if (id === 'all') return all;
    return all.filter((x) => x.listId === id);
  }
  function dueText(t) {
    if (!t.due) return '';
    const today = dayKey();
    const cls = !t.done && t.due < today ? 'over' : t.due === today ? 'today' : '';
    return `<span class="t-due ${cls}">📅 ${fmtDay(t.due)}${t.time ? ' ' + t.time : ''}</span>`;
  }

  // ---------- public ----------
  function homeSummary() {
    const t = dayKey();
    const open = tasks().filter((x) => !x.done);
    const today = open.filter((x) => x.due && x.due <= t).length;
    const over = open.filter((x) => x.due && x.due < t).length;
    if (!open.length) return 'אין משימות פתוחות';
    return `${open.length} פתוחות${today ? ` · ${today} להיום` : ''}${over ? ` · ⚠️ ${over} באיחור` : ''}`;
  }
  const dueOn = (k) => tasks().filter((x) => x.due === k).sort(sortOpen);
  const overdueBefore = (k) => tasks().filter((x) => !x.done && x.due && x.due < k).sort(sortOpen);
  function toggle(id) {
    const t = find(id);
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? Date.now() : null;
    save();
    if (t.done) toast('✓ משימה הושלמה');
  }

  // ---------- render ----------
  function item(t, showList) {
    const subDone = t.subtasks.filter((s) => s.done).length;
    const l = listOf(t.listId);
    return `<li class="task ${t.done ? 'done' : ''} prio-${t.priority}" style="--lc:${l.color}">
      <button class="t-check" data-tact="toggle" data-id="${t.id}" aria-label="${t.done ? 'החזרה לפתוחות' : 'סימון כבוצעה'}">${t.done ? '✓' : ''}</button>
      <button class="t-body" data-tact="edit" data-id="${t.id}">
        <span class="title">${t.priority === 'high' ? '<b class="flag">‼️</b> ' : ''}${esc(t.title)}</span>
        <span class="t-meta">
          ${showList ? `<span class="t-list">${esc(l.emoji)} ${esc(l.name)}</span>` : ''}
          ${dueText(t)}
          ${t.subtasks.length ? `<span>☑️ ${subDone}/${t.subtasks.length}</span>` : ''}
          ${t.notes ? '<span>📝</span>' : ''}
        </span>
      </button>
    </li>`;
  }

  function render() {
    if (!isSmart(current) && !lists().some((l) => l.id === current)) current = 'today';
    const all = tasks();
    const t = dayKey();
    const items = filtered(current);
    const open = items.filter((x) => !x.done).sort(sortOpen);
    const done = items.filter((x) => x.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    const countOpen = (id) => filtered(id).filter((x) => !x.done).length;
    const cur = isSmart(current) ? null : listOf(current);
    const title = cur ? `${cur.emoji} ${cur.name}` : SMART.find(([k]) => k === current)[1];
    const over = open.filter((x) => x.due && x.due < t);
    const smartShowList = isSmart(current);
    const pct = items.length ? Math.round((done.length / items.length) * 100) : 0;

    view.innerHTML = `
      <div class="t-lists chips-scroll">
        ${SMART.map(([k, l]) => `<button class="chip ${current === k ? 'on' : ''}" data-tact="list" data-l="${k}">${l}${countOpen(k) ? ` · ${countOpen(k)}` : ''}</button>`).join('')}
        <span class="k-sep"></span>
        ${lists().map((l) => `<button class="chip t-lchip ${current === l.id ? 'on' : ''}" style="--lc:${l.color}" data-tact="list" data-l="${l.id}">${esc(l.emoji)} ${esc(l.name)}${countOpen(l.id) ? ` · ${countOpen(l.id)}` : ''}</button>`).join('')}
        <button class="chip" data-tact="new-list">＋ רשימה חדשה</button>
      </div>

      <div class="card t-head" ${cur ? `style="--lc:${cur.color}"` : ''}>
        <div class="t-head-row">
          <div><h2>${esc(title)}</h2><span class="muted">${open.length} פתוחות · ${done.length} הושלמו${over.length ? ` · <b class="bad">${over.length} באיחור</b>` : ''}</span></div>
          ${cur ? '<button class="icon-btn" data-tact="edit-list" aria-label="עריכת הרשימה">✏️</button>' : ''}
        </div>
        ${items.length ? `<div class="progress t-prog"><div style="width:${pct}%"></div></div>` : ''}
        <form id="taskQuick" class="quick-rem" style="padding:0;margin-top:12px">
          <input name="title" placeholder="➕ משימה חדשה${current === 'today' ? ' להיום' : ''}…" maxlength="120" autocomplete="off">
          <button class="btn" aria-label="הוספה">+</button>
        </form>
      </div>

      <div class="card">
        ${open.length ? `<ul class="list tasks">${open.map((x) => item(x, smartShowList)).join('')}</ul>`
          : `<p class="empty">${all.length ? 'אין משימות פתוחות כאן 🎉' : 'עוד אין משימות — כתבו משימה למעלה ✍️'}</p>`}
        ${done.length ? `
          <button class="link-btn t-done-toggle" data-tact="show-done">${showDone ? '▾' : '◂'} הושלמו (${done.length})</button>
          ${showDone ? `<ul class="list tasks">${done.map((x) => item(x, smartShowList)).join('')}</ul>
            <button class="btn ghost small" data-tact="clear-done">🧹 מחיקת המשימות שהושלמו</button>` : ''}` : ''}
      </div>`;

    $('#taskQuick').addEventListener('submit', (e) => {
      e.preventDefault();
      const title = e.target.title.value.trim();
      if (!title) return;
      const listId = cur ? cur.id : lists()[0].id;
      tasks().push({ id: uid(), listId, title, notes: '', due: current === 'today' ? t : '', time: '', priority: 'normal', subtasks: [], done: false, createdAt: Date.now() });
      save(); rerender();
      const inp = $('#taskQuick input'); if (inp) inp.focus();
    });
  }

  // ---------- task sheet ----------
  function openEdit(id, preset) {
    const t = id ? find(id) : null;
    const base = t || Object.assign({ title: '', notes: '', listId: isSmart(current) ? lists()[0].id : current, due: '', time: '', priority: 'normal', subtasks: [] }, preset || {});
    sh = { mode: 'task', id: id || null, draft: JSON.parse(JSON.stringify({ title: base.title, notes: base.notes, listId: base.listId, due: base.due, time: base.time, priority: base.priority, subtasks: base.subtasks })) };
    sheet.open();
    drawTask();
    if (!id && window.matchMedia('(pointer:fine)').matches) $('#tForm').title.focus();
  }
  function drawTask() {
    const d = sh.draft;
    const t = dayKey();
    const box = sheet.box();
    const existing = sh.id ? find(sh.id) : null;
    box.innerHTML = `
      <div class="sheet-head"><strong>${sh.id ? 'עריכת משימה' : '📋 משימה חדשה'}</strong><button class="icon-btn" data-tact="close" aria-label="סגירה">✕</button></div>
      <form id="tForm" class="sheet-body">
        <label class="field"><span>משימה</span><input name="title" required maxlength="120" value="${esc(d.title)}" placeholder="מה צריך לעשות?"></label>
        <label class="field" style="margin-top:8px"><span>הערות</span><textarea name="notes" rows="2" maxlength="1000">${esc(d.notes)}</textarea></label>

        <div class="section-label">רשימה</div>
        <div class="chips-scroll">${lists().map((l) => `<button type="button" class="chip t-lchip ${d.listId === l.id ? 'on' : ''}" style="--lc:${l.color}" data-tact="d-list" data-l="${l.id}">${esc(l.emoji)} ${esc(l.name)}</button>`).join('')}</div>

        <div class="section-label">תאריך יעד</div>
        <div class="chips-scroll">
          <button type="button" class="chip ${d.due === t ? 'on' : ''}" data-tact="d-due" data-v="${t}">היום</button>
          <button type="button" class="chip ${d.due === addDays(t, 1) ? 'on' : ''}" data-tact="d-due" data-v="${addDays(t, 1)}">מחר</button>
          <button type="button" class="chip ${d.due === addDays(t, 7) ? 'on' : ''}" data-tact="d-due" data-v="${addDays(t, 7)}">בעוד שבוע</button>
          <button type="button" class="chip ${!d.due ? 'on' : ''}" data-tact="d-due" data-v="">ללא תאריך</button>
        </div>
        <div class="row">
          <label class="field"><span>תאריך</span><input name="due" type="date" value="${d.due}"></label>
          <label class="field"><span>שעה (לא חובה)</span><input name="time" type="time" value="${d.time}" ${d.due ? '' : 'disabled'}></label>
        </div>

        <label class="field" style="margin-top:8px"><span>עדיפות</span><select name="priority">${Object.entries(PRIO).map(([k, l]) => `<option value="${k}" ${d.priority === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>

        <div class="section-label">תתי־משימות ${d.subtasks.length ? `(${d.subtasks.filter((s) => s.done).length}/${d.subtasks.length})` : ''}</div>
        <ul class="list subtasks">${d.subtasks.map((s, i) => `<li class="${s.done ? 'done' : ''}">
          <button type="button" class="t-check small" data-tact="sub-toggle" data-i="${i}">${s.done ? '✓' : ''}</button>
          <input class="sub-input" data-i="${i}" value="${esc(s.title)}" maxlength="120">
          <button type="button" class="del" data-tact="sub-del" data-i="${i}" aria-label="מחיקה">✕</button>
        </li>`).join('')}</ul>
        <div class="row" style="margin-top:6px"><input id="subNew" placeholder="➕ תת־משימה" maxlength="120"><button type="button" class="btn ghost" style="flex:0 0 auto" data-tact="sub-add">הוספה</button></div>

        ${existing && existing.done ? `<p class="muted tiny">הושלמה ${new Date(existing.doneAt || Date.now()).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</p>` : ''}
      </form>
      <div class="sheet-foot row">
        ${sh.id ? `<button class="btn ghost danger" data-tact="delete" style="flex:0 0 auto" aria-label="מחיקה">🗑️</button>
          <button class="btn ghost" data-tact="dup" style="flex:0 0 auto" aria-label="שכפול">⧉</button>
          <button class="btn ghost" data-tact="sheet-toggle" style="flex:0 0 auto">${existing && existing.done ? '↺ פתיחה מחדש' : '✓ בוצעה'}</button>` : ''}
        <button class="btn" data-tact="save">${sh.id ? 'שמירה' : 'הוספה'}</button>
      </div>`;
    const f = $('#tForm');
    f.addEventListener('input', (e) => {
      read(f);
      if (e.target.name === 'due') drawTask();
    });
    f.addEventListener('submit', (e) => { e.preventDefault(); saveTask(); });
    $('#subNew').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addSub(); } });
  }
  function read(f) {
    const d = sh.draft;
    d.title = f.title.value; d.notes = f.notes.value; d.due = f.due.value; d.time = d.due ? f.time.value : ''; d.priority = f.priority.value;
    f.querySelectorAll('.sub-input').forEach((inp) => { const s = d.subtasks[+inp.dataset.i]; if (s) s.title = inp.value; });
  }
  function addSub() {
    read($('#tForm'));
    const v = $('#subNew').value.trim();
    if (!v) return;
    sh.draft.subtasks.push({ id: uid(), title: v, done: false });
    drawTask();
    $('#subNew').focus();
  }
  function saveTask() {
    read($('#tForm'));
    const d = sh.draft;
    if (!d.title.trim()) { toast('נא לכתוב את המשימה'); return; }
    d.title = d.title.trim();
    d.subtasks = d.subtasks.filter((s) => s.title.trim());
    if (sh.id) { Object.assign(find(sh.id), d); toast('המשימה עודכנה'); }
    else { tasks().push(Object.assign({ id: uid(), done: false, createdAt: Date.now() }, d)); toast('המשימה נוספה'); }
    save(); sheet.close(); rerender();
  }

  // ---------- list sheet ----------
  function openList(id) {
    const l = id ? listOf(id) : { name: '', emoji: '📋', color: COLORS[lists().length % COLORS.length] };
    sh = { mode: 'list', id: id || null, draft: { name: l.name, emoji: l.emoji, color: l.color } };
    sheet.open();
    drawList();
  }
  function drawList() {
    const d = sh.draft;
    const n = sh.id ? tasks().filter((t) => t.listId === sh.id).length : 0;
    sheet.box().innerHTML = `
      <div class="sheet-head"><strong>${sh.id ? 'עריכת רשימה' : '🗂️ רשימה חדשה'}</strong><button class="icon-btn" data-tact="close" aria-label="סגירה">✕</button></div>
      <form id="lForm" class="sheet-body">
        <label class="field"><span>שם הרשימה</span><input name="name" required maxlength="30" value="${esc(d.name)}" placeholder="למשל: קניות, עבודה, טיול לאילת"></label>
        <div class="section-label">אייקון</div>
        <div class="emoji-grid">${EMOJIS.map((e) => `<button type="button" class="${d.emoji === e ? 'on' : ''}" data-tact="l-emoji" data-e="${e}">${e}</button>`).join('')}</div>
        <div class="section-label">צבע</div>
        <div class="swatches">${COLORS.map((c) => `<button type="button" class="${d.color === c ? 'on' : ''}" style="--c:${c}" data-tact="l-color" data-c="${c}" aria-label="צבע"></button>`).join('')}</div>
        ${sh.id && lists().length > 1 ? `<details class="danger-zone"><summary>מחיקת הרשימה</summary>
          <p class="muted tiny">${n ? `ברשימה יש ${n} משימות.` : 'הרשימה ריקה.'}</p>
          ${n ? `<button type="button" class="btn ghost small" data-tact="list-merge">העברת המשימות ל"${esc(lists().find((l) => l.id !== sh.id).name)}" ומחיקה</button>` : ''}
          <button type="button" class="btn ghost danger small" data-tact="list-delete">🗑️ מחיקת הרשימה${n ? ' וכל המשימות שבה' : ''}</button>
        </details>` : ''}
      </form>
      <div class="sheet-foot row"><button class="btn" data-tact="list-save">${sh.id ? 'שמירה' : 'יצירת רשימה'}</button></div>`;
    const f = $('#lForm');
    f.addEventListener('input', () => { sh.draft.name = f.name.value; });
    f.addEventListener('submit', (e) => { e.preventDefault(); saveList(); });
  }
  function saveList() {
    const d = sh.draft;
    const isEdit = !!sh.id;
    d.name = ($('#lForm').name.value || '').trim();
    if (!d.name) { toast('נא לתת שם לרשימה'); return; }
    if (sh.id) Object.assign(listOf(sh.id), d);
    else { const id = 'l_' + uid(); lists().push(Object.assign({ id }, d)); current = id; remember(); }
    save(); sheet.close(); rerender();
    toast(isEdit ? 'הרשימה עודכנה' : 'הרשימה נוצרה');
  }
  function removeList(moveTasks) {
    const id = sh.id;
    const target = lists().find((l) => l.id !== id);
    if (!confirm(moveTasks ? `להעביר את המשימות ל"${target.name}" ולמחוק את הרשימה?` : 'למחוק את הרשימה ואת כל המשימות שבה?')) return;
    const st = S();
    if (moveTasks) st.tasks.forEach((t) => { if (t.listId === id) t.listId = target.id; });
    else st.tasks = st.tasks.filter((t) => t.listId !== id);
    st.taskLists = st.taskLists.filter((l) => l.id !== id);
    current = 'today'; remember();
    save(); sheet.close(); rerender(); toast('הרשימה נמחקה');
  }
  const remember = () => { try { localStorage.setItem('tasks-list', current); } catch (e) { /* ignore */ } };

  // ---------- actions ----------
  function onAction(e) {
    const b = e.target.closest('[data-tact]');
    if (!b) return;
    const act = b.dataset.tact;
    switch (act) {
      case 'list': current = b.dataset.l; showDone = false; remember(); rerender(); break;
      case 'new-list': openList(null); break;
      case 'edit-list': openList(current); break;
      case 'toggle': toggle(b.dataset.id); rerender(); break;
      case 'edit': openEdit(b.dataset.id); break;
      case 'show-done': showDone = !showDone; rerender(); break;
      case 'clear-done': {
        const ids = new Set(filtered(current).filter((t) => t.done).map((t) => t.id));
        if (confirm(`למחוק ${ids.size} משימות שהושלמו?`)) { S().tasks = tasks().filter((t) => !ids.has(t.id)); save(); rerender(); }
        break;
      }
      case 'close': sheet.close(); break;
      case 'save': saveTask(); break;
      case 'delete':
        if (confirm('למחוק את המשימה?')) { S().tasks = tasks().filter((t) => t.id !== sh.id); save(); sheet.close(); rerender(); toast('נמחקה'); }
        break;
      case 'dup':
        read($('#tForm'));
        sh = { mode: 'task', id: null, draft: Object.assign(JSON.parse(JSON.stringify(sh.draft)), { title: sh.draft.title + ' (עותק)' }) };
        sh.draft.subtasks.forEach((s) => { s.id = uid(); s.done = false; });
        drawTask(); toast('עותק חדש — אפשר לערוך ולשמור');
        break;
      case 'sheet-toggle': toggle(sh.id); sheet.close(); rerender(); break;
      case 'd-list': read($('#tForm')); sh.draft.listId = b.dataset.l; drawTask(); break;
      case 'd-due': read($('#tForm')); sh.draft.due = b.dataset.v; if (!b.dataset.v) sh.draft.time = ''; drawTask(); break;
      case 'sub-add': addSub(); break;
      case 'sub-toggle': read($('#tForm')); { const s = sh.draft.subtasks[+b.dataset.i]; s.done = !s.done; } drawTask(); break;
      case 'sub-del': read($('#tForm')); sh.draft.subtasks.splice(+b.dataset.i, 1); drawTask(); break;
      case 'l-emoji': sh.draft.emoji = b.dataset.e; drawList(); break;
      case 'l-color': sh.draft.color = b.dataset.c; drawList(); break;
      case 'list-save': saveList(); break;
      case 'list-merge': removeList(true); break;
      case 'list-delete': removeList(false); break;
      default: return;
    }
  }
  view.addEventListener('click', onAction);

  return { render, homeSummary, close: () => sheet.close(), dueOn, overdueBefore, toggle, openEdit, listOf, lists };
};
