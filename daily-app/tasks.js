/* מודול משימות: רשימות אישיות ורשימות משותפות (עורך / מגיב / צופה), תאריכי יעד, עדיפות, תתי־משימות,
   הערות, תגובות, קודי הזמנה וחיבור ללוח השנה. */
window.TasksModule = function (ctx) {
  'use strict';
  const { $, esc, uid, dayKey, addDays, fmtDay, toast, view } = ctx;
  const S = () => ctx.state();
  const save = () => ctx.save();
  const rerender = () => ctx.render();
  const SH = () => ctx.shared; // שירות הרשימות המשותפות (או null)
  const sharedOn = () => !!(SH() && SH().available());

  const COLORS = ['#6366f1', '#0ea5e9', '#16a34a', '#f97316', '#ec4899', '#eab308', '#14b8a6', '#64748b'];
  const EMOJIS = ['📋', '🏠', '💼', '🛒', '🎓', '💡', '✈️', '🎉', '💪', '❤️', '📚', '🔧', '💰', '🎁', '🌱', '⭐'];
  const PRIO = { low: 'נמוכה', normal: 'רגילה', high: '‼️ גבוהה' };
  const SMART = [['today', '☀️ היום'], ['planned', '📅 מתוכננות'], ['all', '🗂️ הכל']];
  const ROLE_ICON = { owner: '👑', editor: '✏️', commenter: '💬', viewer: '👁️' };

  let current = (() => { try { return localStorage.getItem('tasks-list') || 'today'; } catch (e) { return 'today'; } })();
  let showDone = false;
  let pendingSince = 0, pendingTimer = null;
  const pref = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
  const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
  let sortBy = pref('tasks-sort', 'due');
  let colorFilter = '';
  // צבעי סימון למשימות (לפי הסדר הזה נעשה המיון לפי צבע)
  const TASK_COLORS = [['#ef4444', 'אדום'], ['#f97316', 'כתום'], ['#eab308', 'צהוב'], ['#16a34a', 'ירוק'], ['#14b8a6', 'טורקיז'], ['#0ea5e9', 'כחול'], ['#6366f1', 'סגול'], ['#ec4899', 'ורוד'], ['#64748b', 'אפור']];
  const COLOR_NAME = Object.fromEntries(TASK_COLORS);
  const SORTS = [['due', '📅 לפי תאריך יעד'], ['color', '🎨 לפי צבע'], ['priority', '‼️ לפי עדיפות'], ['alpha', '🔤 לפי שם (א–ת)'], ['newest', '🆕 החדשות קודם'], ['oldest', '⏳ הישנות קודם'], ['list', '🗂️ לפי רשימה']];
  let sh = null;
  let commentsUnsub = null;
  const sheet = ctx.makeSheet('taskSheet', onAction, () => { sh = null; if (commentsUnsub) { commentsUnsub(); commentsUnsub = null; } });

  // ---------- model ----------
  function localLists() {
    const st = S();
    if (!Array.isArray(st.taskLists) || !st.taskLists.length) st.taskLists = [{ id: 'inbox', name: 'המשימות שלי', emoji: '📋', color: COLORS[0] }];
    return st.taskLists;
  }
  function localTasks() {
    const st = S();
    if (!Array.isArray(st.tasks)) st.tasks = [];
    st.tasks.forEach((t) => { if (!localLists().some((l) => l.id === t.listId)) t.listId = localLists()[0].id; });
    return st.tasks;
  }
  const norm = (t) => {
    t.notes = t.notes || ''; t.due = t.due || ''; t.time = t.time || ''; t.priority = t.priority || 'normal';
    t.subtasks = t.subtasks || []; t.createdAt = t.createdAt || Date.now();
    return t;
  };
  function lists() {
    const out = localLists().map((l) => Object.assign({}, l, { shared: false, role: 'owner' }));
    if (sharedOn()) SH().lists().forEach((l) => out.push({ id: 'S:' + l.id, sid: l.id, shared: true, role: SH().role(l.id), name: l.name, emoji: l.emoji, color: l.color, owner: l.owner, raw: l }));
    return out;
  }
  function allTasks() {
    const out = localTasks().map((t) => Object.assign(norm(t), { key: t.id }));
    if (sharedOn()) SH().lists().forEach((l) => SH().tasksOf(l.id).forEach((t) => out.push(norm(Object.assign({}, t, { key: `S:${l.id}:${t.id}`, sid: l.id, listId: 'S:' + l.id, shared: true })))));
    return out;
  }
  const listOf = (id) => lists().find((l) => l.id === id) || lists()[0];
  const find = (key) => allTasks().find((t) => t.key === key);
  const roleOf = (listId) => listOf(listId).role;
  const RANK = { viewer: 0, commenter: 1, editor: 2, owner: 3 };
  const canList = (listId, need) => RANK[roleOf(listId)] >= RANK[need];
  const isSmart = (id) => SMART.some(([k]) => k === id);
  const prioRank = { high: 0, normal: 1, low: 2 };
  const sortOpen = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (a.time || '99').localeCompare(b.time || '99') || prioRank[a.priority] - prioRank[b.priority] || a.createdAt - b.createdAt;
  const colorRank = (t) => { const i = TASK_COLORS.findIndex(([c]) => c === t.color); return i < 0 ? 99 : i; };
  const SORTERS = {
    due: sortOpen,
    color: (a, b) => colorRank(a) - colorRank(b) || sortOpen(a, b),
    priority: (a, b) => prioRank[a.priority] - prioRank[b.priority] || sortOpen(a, b),
    alpha: (a, b) => a.title.localeCompare(b.title, 'he'),
    newest: (a, b) => b.createdAt - a.createdAt,
    oldest: (a, b) => a.createdAt - b.createdAt,
    list: (a, b) => listOf(a.listId).name.localeCompare(listOf(b.listId).name, 'he') || sortOpen(a, b),
  };
  // כותרות קבוצה כשממיינים לפי צבע / עדיפות / רשימה
  function groupKey(t) {
    if (sortBy === 'color') return t.color ? `<i class="t-dot" style="--tc:${t.color}"></i> ${COLOR_NAME[t.color] || 'צבע'}` : 'ללא צבע';
    if (sortBy === 'priority') return PRIO[t.priority];
    if (sortBy === 'list') { const l = listOf(t.listId); return `${esc(l.emoji)} ${esc(l.name)}`; }
    return null;
  }
  function listHtml(arr, showList) {
    let html = '', last = null;
    arr.forEach((x) => {
      const g = groupKey(x);
      if (g !== null && g !== last) { html += `<li class="t-group">${g}</li>`; last = g; }
      html += item(x, showList);
    });
    return html;
  }
  const writable = () => lists().filter((l) => RANK[l.role] >= RANK.editor);

  function filtered(id) {
    const t = dayKey();
    const all = allTasks();
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
  const fail = (e) => { toast(e && e.code === 'quota_exceeded' ? 'נגמר המקום במסד הנתונים' : 'הפעולה נכשלה — ייתכן שאין לך הרשאת עריכה'); };

  // ---------- writes (personal or shared) ----------
  async function writeTask(listId, key, data) {
    const l = listOf(listId);
    if (l.shared) {
      const t = key && find(key);
      await SH().saveTask(l.sid, t && t.shared && t.sid === l.sid ? t.id : null, data);
    } else {
      const st = S();
      const existing = key && st.tasks.find((x) => x.id === key);
      if (existing) Object.assign(existing, data, { listId });
      else st.tasks.push(Object.assign({ id: uid(), createdAt: Date.now() }, data, { listId }));
      save();
    }
  }
  async function removeTask(t) {
    if (t.shared) await SH().deleteTask(t.sid, t.id);
    else { S().tasks = S().tasks.filter((x) => x.id !== t.id); save(); }
  }
  async function toggle(key) {
    const t = find(key);
    if (!t) return;
    if (!canList(t.listId, 'editor')) { toast('אין לך הרשאה לסמן משימות ברשימה הזו'); return; }
    const done = !t.done;
    try {
      if (t.shared) await SH().patchTask(t.sid, t.id, { done, doneAt: done ? Date.now() : null });
      else { const x = S().tasks.find((y) => y.id === t.id); x.done = done; x.doneAt = done ? Date.now() : null; save(); }
      if (done) toast('✓ משימה הושלמה');
    } catch (e) { fail(e); }
  }
  const taskData = (d) => ({ title: d.title, notes: d.notes, due: d.due, time: d.time, priority: d.priority, subtasks: d.subtasks, color: d.color || '' });

  // ---------- public ----------
  function homeSummary() {
    const t = dayKey();
    const open = allTasks().filter((x) => !x.done);
    const today = open.filter((x) => x.due && x.due <= t).length;
    const over = open.filter((x) => x.due && x.due < t).length;
    if (!open.length) return 'אין משימות פתוחות';
    return `${open.length} פתוחות${today ? ` · ${today} להיום` : ''}${over ? ` · ⚠️ ${over} באיחור` : ''}`;
  }
  const dueOn = (k) => allTasks().filter((x) => x.due === k).sort(sortOpen);
  const overdueBefore = (k) => allTasks().filter((x) => !x.done && x.due && x.due < k).sort(sortOpen);

  // ---------- render ----------
  function item(t, showList) {
    const subDone = t.subtasks.filter((s) => s.done).length;
    const l = listOf(t.listId);
    const ro = !canList(t.listId, 'editor');
    return `<li class="task ${t.done ? 'done' : ''} prio-${t.priority} ${t.color ? 'has-color' : ''}" style="--lc:${l.color};--tc:${t.color || l.color}">
      <button class="t-check ${ro ? 'ro' : ''}" data-tact="toggle" data-id="${t.key}" aria-label="${t.done ? 'החזרה לפתוחות' : 'סימון כבוצעה'}" ${ro ? 'aria-disabled="true"' : ''}>${t.done ? '✓' : ''}</button>
      <button class="t-body" data-tact="edit" data-id="${t.key}">
        <span class="title">${t.priority === 'high' ? '<b class="flag">‼️</b> ' : ''}${esc(t.title)}</span>
        <span class="t-meta">
          ${showList ? `<span class="t-list">${esc(l.emoji)} ${esc(l.name)}${l.shared ? ' 🤝' : ''}</span>` : ''}
          ${dueText(t)}
          ${t.subtasks.length ? `<span>☑️ ${subDone}/${t.subtasks.length}</span>` : ''}
          ${t.notes ? '<span>📝</span>' : ''}
          ${t.commentCount ? `<span>💬 ${t.commentCount}</span>` : ''}
          ${t.shared && t.updatedBy && t.updatedBy !== SH().me() ? `<span class="t-by">עודכן ע״י ${esc(SH().nameOf(t.updatedBy))}</span>` : ''}
        </span>
      </button>
    </li>`;
  }

  function render() {
    if (!isSmart(current) && !lists().some((l) => l.id === current)) {
      // רשימה משותפת שעוד לא הגיעה מהשרת (למשל מיד אחרי הצטרפות או שיתוף) — מחכים לה עד 10 שניות
      if (String(current).startsWith('S:') && sharedOn() && Date.now() - (pendingSince || (pendingSince = Date.now())) < 10000) {
        view.innerHTML = '<div class="card"><p class="empty">⏳ טוען את הרשימה המשותפת…</p></div>';
        clearTimeout(pendingTimer); pendingTimer = setTimeout(rerender, 1000);
        return;
      }
      current = 'today';
    }
    pendingSince = 0;
    const t = dayKey();
    const allItems = filtered(current);
    const usedColors = TASK_COLORS.filter(([c]) => allItems.some((x) => x.color === c));
    if (colorFilter && colorFilter !== 'none' && !usedColors.some(([c]) => c === colorFilter)) colorFilter = '';
    const items = colorFilter === 'none' ? allItems.filter((x) => !x.color) : colorFilter ? allItems.filter((x) => x.color === colorFilter) : allItems;
    const open = items.filter((x) => !x.done).sort(SORTERS[sortBy] || sortOpen);
    const done = items.filter((x) => x.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    const countOpen = (id) => filtered(id).filter((x) => !x.done).length;
    const cur = isSmart(current) ? null : listOf(current);
    const title = cur ? `${cur.emoji} ${cur.name}` : SMART.find(([k]) => k === current)[1];
    const over = open.filter((x) => x.due && x.due < t);
    const pct = items.length ? Math.round((done.length / items.length) * 100) : 0;
    const canAdd = cur ? canList(cur.id, 'editor') : writable().length > 0;
    const all = lists();
    const mine = all.filter((l) => !l.shared), shared = all.filter((l) => l.shared);

    view.innerHTML = `
      <div class="t-lists chips-scroll">
        ${SMART.map(([k, l]) => `<button class="chip ${current === k ? 'on' : ''}" data-tact="list" data-l="${k}">${l}${countOpen(k) ? ` · ${countOpen(k)}` : ''}</button>`).join('')}
        <span class="k-sep"></span>
        ${mine.map((l) => `<button class="chip t-lchip ${current === l.id ? 'on' : ''}" style="--lc:${l.color}" data-tact="list" data-l="${l.id}">${esc(l.emoji)} ${esc(l.name)}${countOpen(l.id) ? ` · ${countOpen(l.id)}` : ''}</button>`).join('')}
        ${shared.length ? '<span class="k-sep"></span>' : ''}
        ${shared.map((l) => `<button class="chip t-lchip ${current === l.id ? 'on' : ''}" style="--lc:${l.color}" data-tact="list" data-l="${l.id}">🤝 ${esc(l.emoji)} ${esc(l.name)}${countOpen(l.id) ? ` · ${countOpen(l.id)}` : ''}</button>`).join('')}
        <button class="chip" data-tact="new-list">＋ רשימה</button>
        ${sharedOn() ? '<button class="chip" data-tact="join">🔑 הצטרפות בקוד</button>' : ctx.canSignIn && ctx.canSignIn() ? '<a class="chip" href="#/account">🔑 התחברות כדי להצטרף לרשימה משותפת</a>' : ''}
      </div>

      <div class="card t-head" ${cur ? `style="--lc:${cur.color}"` : ''}>
        <div class="t-head-row">
          <div><h2>${esc(title)}</h2><span class="muted">${open.length} פתוחות · ${done.length} הושלמו${over.length ? ` · <b class="bad">${over.length} באיחור</b>` : ''}</span>
            ${cur && cur.shared ? `<div class="t-role">${ROLE_ICON[cur.role]} ${SH().ROLE_NAME[cur.role]}${cur.role !== 'owner' ? ` · רשימה של ${esc(SH().nameOf(cur.owner))}` : ` · ${Object.keys(cur.raw.members || {}).length} משתתפים`}</div>` : ''}
          </div>
          ${cur ? `<button class="icon-btn" data-tact="edit-list" aria-label="${cur.shared ? 'שיתוף והגדרות' : 'עריכת הרשימה'}">${cur.shared && cur.role === 'owner' ? '👥' : cur.shared ? 'ℹ️' : '✏️'}</button>` : ''}
        </div>
        ${items.length ? `<div class="progress t-prog"><div style="width:${pct}%"></div></div>` : ''}
        ${canAdd ? `<form id="taskQuick" class="quick-rem" style="padding:0;margin-top:12px">
          <input name="title" placeholder="➕ משימה חדשה${current === 'today' ? ' להיום' : ''}…" maxlength="120" autocomplete="off">
          <button class="btn" aria-label="הוספה">+</button>
        </form>` : `<p class="muted tiny">${cur && cur.role === 'commenter' ? 'אפשר לקרוא ולהגיב על משימות ברשימה הזו.' : 'צפייה בלבד ברשימה הזו.'}</p>`}
      </div>

      ${allItems.length ? `<div class="t-tools">
        <label class="t-sort"><span>מיון</span><select id="tSort">${SORTS.map(([k, l]) => `<option value="${k}" ${sortBy === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        ${usedColors.length ? `<div class="t-cfilter" role="group" aria-label="סינון לפי צבע">
          <button class="cf ${!colorFilter ? 'on' : ''}" data-tact="cfilter" data-c="" title="כל הצבעים">הכל</button>
          ${usedColors.map(([c, n]) => `<button class="cf dot ${colorFilter === c ? 'on' : ''}" style="--tc:${c}" data-tact="cfilter" data-c="${c}" title="${n}" aria-label="${n}"></button>`).join('')}
          <button class="cf ${colorFilter === 'none' ? 'on' : ''}" data-tact="cfilter" data-c="none" title="משימות בלי צבע">ללא</button>
        </div>` : ''}
      </div>` : ''}

      <div class="card">
        ${open.length ? `<ul class="list tasks">${listHtml(open, !cur)}</ul>`
          : `<p class="empty">${allTasks().length ? 'אין משימות פתוחות כאן 🎉' : 'עוד אין משימות — כתבו משימה למעלה ✍️'}</p>`}
        ${done.length ? `
          <button class="link-btn t-done-toggle" data-tact="show-done">${showDone ? '▾' : '◂'} הושלמו (${done.length})</button>
          ${showDone ? `<ul class="list tasks">${done.map((x) => item(x, !cur)).join('')}</ul>
            ${done.some((x) => canList(x.listId, 'editor')) ? '<button class="btn ghost small" data-tact="clear-done">🧹 מחיקת המשימות שהושלמו</button>' : ''}` : ''}` : ''}
      </div>`;

    const so = $('#tSort');
    if (so) so.addEventListener('change', () => { sortBy = so.value; setPref('tasks-sort', sortBy); rerender(); });
    const q = $('#taskQuick');
    if (q) q.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = e.target.title.value.trim();
      if (!title) return;
      const target = cur ? cur.id : (writable().find((l) => !l.shared) || writable()[0]).id;
      try { await writeTask(target, null, { title, notes: '', due: current === 'today' ? t : '', time: '', priority: 'normal', subtasks: [], done: false, createdAt: Date.now() }); }
      catch (err) { fail(err); }
      rerender();
      const inp = $('#taskQuick input'); if (inp) inp.focus();
    });
  }

  // ---------- task sheet ----------
  function openEdit(key, preset) {
    const t = key ? find(key) : null;
    if (key && !t) return;
    const defList = isSmart(current) || !canList(current, 'editor') ? (writable().find((l) => !l.shared) || writable()[0]).id : current;
    const base = t || Object.assign({ title: '', notes: '', listId: defList, due: '', time: '', priority: 'normal', subtasks: [], color: colorFilter && colorFilter !== 'none' ? colorFilter : '' }, preset || {});
    sh = { mode: 'task', key: key || null, draft: JSON.parse(JSON.stringify({ title: base.title, notes: base.notes, listId: base.listId, due: base.due, time: base.time, priority: base.priority, subtasks: base.subtasks, color: base.color || '' })), comments: null };
    sheet.open();
    drawTask();
    if (t && t.shared) {
      commentsUnsub = SH().watchComments(t.sid, t.id, (cs) => { if (!sh || sh.key !== key) return; sh.comments = cs; drawComments(); });
    }
    if (!key && window.matchMedia('(pointer:fine)').matches) $('#tForm').title.focus();
  }
  function drawComments() {
    const box = $('#tComments');
    if (!box || !sh) return;
    const t = find(sh.key);
    const canC = t && canList(t.listId, 'commenter');
    const cs = sh.comments;
    box.innerHTML = `
      <div class="section-label">💬 תגובות ${cs && cs.length ? `(${cs.length})` : ''}</div>
      ${cs == null ? '<p class="muted tiny">טוען תגובות…</p>' : cs.length ? `<ul class="comments">${cs.map((c) => `<li>
          <div class="c-head"><b>${esc(SH().nameOf(c.author))}</b><span>${new Date(c.ts).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</span>
          ${c.author === SH().me() || roleOf(t.listId) === 'owner' ? `<button type="button" class="del" data-tact="c-del" data-c="${c.id}" aria-label="מחיקת תגובה">✕</button>` : ''}</div>
          <div class="c-text">${esc(c.text)}</div></li>`).join('')}</ul>` : '<p class="muted tiny">עוד אין תגובות.</p>'}
      ${canC ? `<div class="row c-new"><input id="cNew" placeholder="כתיבת תגובה…" maxlength="500"><button type="button" class="btn" style="flex:0 0 auto" data-tact="c-add">שליחה</button></div>` : ''}`;
    const inp = $('#cNew');
    if (inp) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addComment(); } });
  }
  async function addComment() {
    const inp = $('#cNew');
    const text = inp && inp.value.trim();
    if (!text) return;
    const t = find(sh.key);
    inp.value = '';
    try { await SH().addComment(t.sid, t.id, text); } catch (e) { fail(e); }
  }
  function drawTask() {
    const d = sh.draft;
    const t = dayKey();
    const existing = sh.key ? find(sh.key) : null;
    const ro = existing ? !canList(existing.listId, 'editor') : false;
    const dis = ro ? 'disabled' : '';
    const targets = writable();
    const box = sheet.box();
    box.innerHTML = `
      <div class="sheet-head"><strong>${!sh.key ? '📋 משימה חדשה' : ro ? 'משימה' : 'עריכת משימה'}</strong><button class="icon-btn" data-tact="close" aria-label="סגירה">✕</button></div>
      <form id="tForm" class="sheet-body ${ro ? 'readonly' : ''}">
        ${ro ? `<p class="t-ro-note">${ROLE_ICON[roleOf(existing.listId)]} יש לך הרשאת ${SH().ROLE_NAME[roleOf(existing.listId)]} ברשימה הזו${roleOf(existing.listId) === 'commenter' ? ' — אפשר להגיב למטה' : ''}.</p>` : ''}
        <label class="field"><span>משימה</span><input name="title" required maxlength="120" value="${esc(d.title)}" placeholder="מה צריך לעשות?" ${dis}></label>
        ${ro ? (d.notes ? `<div class="h-notes">📝 ${esc(d.notes)}</div>` : '') : `<label class="field" style="margin-top:8px"><span>הערות</span><textarea name="notes" rows="2" maxlength="1000">${esc(d.notes)}</textarea></label>`}
        ${ro ? `<div class="ro-info"><span>📅 ${d.due ? fmtDay(d.due) + (d.time ? ' · ' + d.time : '') : 'ללא תאריך יעד'}</span><span>עדיפות: ${PRIO[d.priority]}</span>${existing.done ? '<span>✓ הושלמה</span>' : ''}</div>` : `

        ${ro ? '' : `<div class="section-label">רשימה</div>
        <div class="chips-scroll">${targets.map((l) => `<button type="button" class="chip t-lchip ${d.listId === l.id ? 'on' : ''}" style="--lc:${l.color}" data-tact="d-list" data-l="${l.id}">${l.shared ? '🤝 ' : ''}${esc(l.emoji)} ${esc(l.name)}</button>`).join('')}</div>`}

        ${ro ? '' : `<div class="section-label">תאריך יעד</div>`}
        ${ro ? '' : `<div class="chips-scroll">
          <button type="button" class="chip ${d.due === t ? 'on' : ''}" data-tact="d-due" data-v="${t}">היום</button>
          <button type="button" class="chip ${d.due === addDays(t, 1) ? 'on' : ''}" data-tact="d-due" data-v="${addDays(t, 1)}">מחר</button>
          <button type="button" class="chip ${d.due === addDays(t, 7) ? 'on' : ''}" data-tact="d-due" data-v="${addDays(t, 7)}">בעוד שבוע</button>
          <button type="button" class="chip ${!d.due ? 'on' : ''}" data-tact="d-due" data-v="">ללא תאריך</button>
        </div>`}
        ${ro ? '' : `<div class="row">
          <label class="field"><span>תאריך</span><input name="due" type="date" value="${d.due}"></label>
          <label class="field"><span>שעה (לא חובה)</span><input name="time" type="time" value="${d.time}" ${d.due ? '' : 'disabled'}></label>
        </div>`}

        <label class="field" style="margin-top:8px"><span>עדיפות</span><select name="priority">${Object.entries(PRIO).map(([k, l]) => `<option value="${k}" ${d.priority === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`}

        ${ro ? '' : `<div class="section-label">צבע העיגול</div>
        <div class="swatches t-colors">
          <button type="button" class="none ${!d.color ? 'on' : ''}" data-tact="d-color" data-c="" aria-label="ללא צבע (צבע הרשימה)" title="ללא — צבע הרשימה">✕</button>
          ${TASK_COLORS.map(([c, n]) => `<button type="button" class="${d.color === c ? 'on' : ''}" style="--c:${c}" data-tact="d-color" data-c="${c}" aria-label="${n}" title="${n}"></button>`).join('')}
        </div>`}
        <div class="section-label">תתי־משימות ${d.subtasks.length ? `(${d.subtasks.filter((s) => s.done).length}/${d.subtasks.length})` : ''}</div>
        <ul class="list subtasks">${d.subtasks.map((s, i) => `<li class="${s.done ? 'done' : ''}">
          <button type="button" class="t-check small" data-tact="sub-toggle" data-i="${i}" ${dis}>${s.done ? '✓' : ''}</button>
          <input class="sub-input" data-i="${i}" value="${esc(s.title)}" maxlength="120" ${dis}>
          ${ro ? '' : `<button type="button" class="del" data-tact="sub-del" data-i="${i}" aria-label="מחיקה">✕</button>`}
        </li>`).join('')}</ul>
        ${ro ? (d.subtasks.length ? '' : '<p class="muted tiny" style="margin:0">אין תתי־משימות.</p>') : `<div class="row" style="margin-top:6px"><input id="subNew" placeholder="➕ תת־משימה" maxlength="120"><button type="button" class="btn ghost" style="flex:0 0 auto" data-tact="sub-add">הוספה</button></div>`}

        ${existing && existing.done ? `<p class="muted tiny">הושלמה ${new Date(existing.doneAt || Date.now()).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</p>` : ''}
        ${existing && existing.shared && existing.updatedBy ? `<p class="muted tiny">עודכן לאחרונה ע״י ${esc(SH().nameOf(existing.updatedBy))}</p>` : ''}
        ${existing && existing.shared ? '<div id="tComments" class="t-comments"></div>' : ''}
      </form>
      ${ro ? '' : `<div class="sheet-foot row">
        ${sh.key ? `<button class="btn ghost danger" data-tact="delete" style="flex:0 0 auto" aria-label="מחיקה">🗑️</button>
          <button class="btn ghost" data-tact="dup" style="flex:0 0 auto" aria-label="שכפול">⧉</button>
          <button class="btn ghost" data-tact="sheet-toggle" style="flex:0 0 auto">${existing && existing.done ? '↺ פתיחה מחדש' : '✓ בוצעה'}</button>` : ''}
        <button class="btn" data-tact="save">${sh.key ? 'שמירה' : 'הוספה'}</button>
      </div>`}`;
    const f = $('#tForm');
    if (!ro) {
      f.addEventListener('input', (e) => { if (e.target.id === 'cNew') return; read(f); if (e.target.name === 'due') drawTask(); });
      f.addEventListener('submit', (e) => { e.preventDefault(); saveTask(); });
      const sn = $('#subNew'); if (sn) sn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addSub(); } });
    } else f.addEventListener('submit', (e) => e.preventDefault());
    drawComments();
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
  async function saveTask() {
    read($('#tForm'));
    const d = sh.draft;
    if (!d.title.trim()) { toast('נא לכתוב את המשימה'); return; }
    d.title = d.title.trim();
    d.subtasks = d.subtasks.filter((s) => s.title.trim());
    const old = sh.key ? find(sh.key) : null;
    try {
      if (old && old.listId !== d.listId) {
        // מעבר בין רשימות: יוצרים ברשימת היעד ומוחקים מהמקור
        await writeTask(d.listId, null, Object.assign(taskData(d), { done: !!old.done, doneAt: old.doneAt || null, createdAt: old.createdAt }));
        await removeTask(old);
      } else if (old) {
        await writeTask(d.listId, old.key, Object.assign({}, old.shared ? stripTask(old) : {}, taskData(d), { done: !!old.done, doneAt: old.doneAt || null, createdAt: old.createdAt }));
      } else {
        await writeTask(d.listId, null, Object.assign(taskData(d), { done: false, createdAt: Date.now() }));
      }
      toast(old ? 'המשימה עודכנה' : 'המשימה נוספה');
      sheet.close(); rerender();
    } catch (e) { fail(e); }
  }
  const stripTask = (t) => { const o = Object.assign({}, t); ['key', 'sid', 'listId', 'shared', 'id'].forEach((k) => delete o[k]); return o; };

  // ---------- list sheet ----------
  function openList(id) {
    const l = id ? listOf(id) : { name: '', emoji: '📋', color: COLORS[localLists().length % COLORS.length], shared: false, role: 'owner' };
    sh = { mode: 'list', id: id || null, draft: { name: l.name, emoji: l.emoji, color: l.color }, invite: null };
    sheet.open();
    drawList();
  }
  function drawList() {
    const d = sh.draft;
    const l = sh.id ? listOf(sh.id) : null;
    const shared = l && l.shared;
    const owner = !l || l.role === 'owner';
    const n = sh.id ? allTasks().filter((t) => t.listId === sh.id).length : 0;
    const ROLE = SH() ? SH().ROLE_NAME : {};

    if (shared && !owner) {
      sheet.box().innerHTML = `
        <div class="sheet-head"><strong>🤝 ${esc(l.emoji)} ${esc(l.name)}</strong><button class="icon-btn" data-tact="close" aria-label="סגירה">✕</button></div>
        <div class="sheet-body">
          <p>רשימה משותפת של <b>${esc(SH().nameOf(l.owner))}</b>.</p>
          <p>התפקיד שלך: <b>${ROLE_ICON[l.role]} ${ROLE[l.role]}</b></p>
          <ul class="facts">
            ${l.role === 'editor' ? '<li>אפשר להוסיף, לערוך, לסמן ולמחוק משימות, ולהגיב.</li>' : l.role === 'commenter' ? '<li>אפשר לראות את המשימות ולהגיב עליהן.</li>' : '<li>אפשר לראות את המשימות ואת התגובות.</li>'}
            ${!SH().canWrite() ? '<li>כדי לערוך או להגיב צריך הרשאת עריכה לאפליקציה עצמה — בקשו מבעל/ת האפליקציה להזמין אתכם במייל כעורכים.</li>' : ''}
          </ul>
          <button class="btn ghost danger" data-tact="list-leave" style="width:100%;margin-top:10px">🚪 עזיבת הרשימה</button>
        </div>`;
      return;
    }

    const raw = shared ? l.raw : null;
    const members = raw ? Object.entries(raw.members || {}) : [];
    const invites = raw ? Object.entries(raw.invites || {}) : [];
    sheet.box().innerHTML = `
      <div class="sheet-head"><strong>${!sh.id ? '🗂️ רשימה חדשה' : shared ? '👥 שיתוף והגדרות' : 'עריכת רשימה'}</strong><button class="icon-btn" data-tact="close" aria-label="סגירה">✕</button></div>
      <form id="lForm" class="sheet-body">
        <label class="field"><span>שם הרשימה</span><input name="name" required maxlength="30" value="${esc(d.name)}" placeholder="למשל: קניות, עבודה, טיול לאילת"></label>
        <div class="section-label">אייקון</div>
        <div class="emoji-grid">${EMOJIS.map((e) => `<button type="button" class="${d.emoji === e ? 'on' : ''}" data-tact="l-emoji" data-e="${e}">${e}</button>`).join('')}</div>
        <div class="section-label">צבע</div>
        <div class="swatches">${COLORS.map((c) => `<button type="button" class="${d.color === c ? 'on' : ''}" style="--c:${c}" data-tact="l-color" data-c="${c}" aria-label="צבע"></button>`).join('')}</div>

        ${shared ? `
          <div class="share-box">
            <div class="section-label" style="margin-top:0">👥 משתתפים</div>
            <ul class="list members">
              <li><span class="grow"><b>אני</b></span><span class="role-tag">👑 בעלים</span></li>
              ${members.map(([u, r]) => `<li><span class="grow">${esc(SH().nameOf(u))}</span>
                <select data-member="${u}" aria-label="תפקיד">${['editor', 'commenter', 'viewer'].map((x) => `<option value="${x}" ${r === x ? 'selected' : ''}>${ROLE_ICON[x]} ${ROLE[x]}</option>`).join('')}</select>
                <button type="button" class="del" data-tact="m-remove" data-u="${u}" aria-label="הסרה">✕</button></li>`).join('')}
            </ul>
            ${members.length ? '' : '<p class="muted tiny" style="margin:0 0 6px">עוד לא הצטרפו משתתפים.</p>'}

            <div class="section-label">➕ הזמנת אנשים</div>
            <p class="muted tiny" style="margin:0 0 8px">בוחרים תפקיד ושולחים את הקוד. מי שמקבל/ת פותח/ת את האפליקציה ← משימות ← 🔑 הצטרפות בקוד.</p>
            <div class="row invite-btns">
              <button type="button" class="btn ghost small" data-tact="inv-new" data-r="editor">✏️ עורך/ת</button>
              <button type="button" class="btn ghost small" data-tact="inv-new" data-r="commenter">💬 מגיב/ה</button>
              <button type="button" class="btn ghost small" data-tact="inv-new" data-r="viewer">👁️ צופה</button>
            </div>
            ${invites.length ? `<ul class="list invites">${invites.map(([c, r]) => `<li>
              <code dir="ltr">${SH().codeLabel(l.sid, c)}</code><span class="role-tag">${ROLE_ICON[r]} ${ROLE[r]}</span>
              <button type="button" class="btn ghost small" data-tact="inv-copy" data-code="${SH().codeLabel(l.sid, c)}">העתקה</button>
              <button type="button" class="del" data-tact="inv-revoke" data-c="${c}" aria-label="ביטול הקוד">✕</button></li>`).join('')}</ul>` : ''}
            <ul class="facts tiny">
              <li><b>עורך/ת</b> — מוסיף/ה, עורך/ת, מסמן/ת ומוחק/ת משימות ומגיב/ה.</li>
              <li><b>מגיב/ה</b> — רואה משימות ומוסיף/ה תגובות.</li>
              <li><b>צופה</b> — רואה בלבד.</li>
            </ul>
          </div>` : ''}

        ${!shared && sh.id && sharedOn() ? `<div class="share-box">
          <div class="section-label" style="margin-top:0">🤝 שיתוף</div>
          <p class="muted tiny" style="margin:0 0 8px">הפיכת הרשימה למשותפת מאפשרת להזמין אנשים כעורכים, מגיבים או צופים. המשימות שבה יעברו לרשימה המשותפת.</p>
          <button type="button" class="btn" data-tact="list-share" ${SH().canWrite() ? '' : 'disabled'}>🤝 שיתוף הרשימה</button>
        </div>` : ''}

        ${sh.id && (shared || localLists().length > 1) ? `<details class="danger-zone"><summary>מחיקת הרשימה</summary>
          <p class="muted tiny">${n ? `ברשימה יש ${n} משימות.` : 'הרשימה ריקה.'}${shared ? ' המחיקה תסיר אותה גם אצל כל המשתתפים.' : ''}</p>
          ${n && !shared ? `<button type="button" class="btn ghost small" data-tact="list-merge">העברת המשימות ל"${esc(localLists().find((x) => x.id !== sh.id).name)}" ומחיקה</button>` : ''}
          <button type="button" class="btn ghost danger small" data-tact="list-delete">🗑️ מחיקת הרשימה${n ? ' וכל המשימות שבה' : ''}</button>
        </details>` : ''}
      </form>
      <div class="sheet-foot row"><button class="btn" data-tact="list-save">${sh.id ? 'שמירה' : 'יצירת רשימה'}</button></div>`;
    const f = $('#lForm');
    f.addEventListener('input', () => { sh.draft.name = f.name.value; });
    f.addEventListener('submit', (e) => { e.preventDefault(); saveList(); });
    f.querySelectorAll('select[data-member]').forEach((s) => s.addEventListener('change', async () => {
      try { await SH().setRole(l.sid, s.dataset.member, s.value); toast('התפקיד עודכן'); } catch (e) { fail(e); }
    }));
  }
  async function saveList() {
    const d = sh.draft;
    const isEdit = !!sh.id;
    d.name = ($('#lForm').name.value || '').trim();
    if (!d.name) { toast('נא לתת שם לרשימה'); return; }
    const l = isEdit ? listOf(sh.id) : null;
    try {
      if (l && l.shared) await SH().updateList(l.sid, { name: d.name, emoji: d.emoji, color: d.color });
      else if (isEdit) { Object.assign(localLists().find((x) => x.id === sh.id), d); save(); }
      else { const id = 'l_' + uid(); localLists().push(Object.assign({ id }, d)); current = id; remember(); save(); }
      sheet.close(); rerender();
      toast(isEdit ? 'הרשימה עודכנה' : 'הרשימה נוצרה');
    } catch (e) { fail(e); }
  }
  async function shareList() {
    const id = sh.id;
    const local = localLists().find((x) => x.id === id);
    if (!(await ctx.ask(`להפוך את "${local.name}" לרשימה משותפת? אחרי זה אפשר להזמין אליה אנשים.`, { ok: '🤝 שיתוף' }))) return;
    try {
      const own = S().tasks.filter((t) => t.listId === id);
      const sid = await SH().shareLocal(Object.assign({}, local, { name: ($('#lForm').name.value || local.name).trim(), emoji: sh.draft.emoji, color: sh.draft.color }), own);
      S().tasks = S().tasks.filter((t) => t.listId !== id);
      S().taskLists = S().taskLists.filter((x) => x.id !== id);
      save();
      current = 'S:' + sid; remember();
      toast('הרשימה משותפת עכשיו 🤝 — אפשר להזמין אנשים');
      sheet.close();
      setTimeout(() => { rerender(); if (lists().some((x) => x.id === current)) openList(current); }, 700);
    } catch (e) { fail(e); }
  }
  async function removeList(moveTasks) {
    const id = sh.id;
    const l = listOf(id);
    if (l.shared) {
      if (!(await ctx.ask('למחוק את הרשימה המשותפת, את כל המשימות והתגובות שבה, אצל כל המשתתפים?', { ok: 'מחיקה', danger: true }))) return;
      try { await SH().deleteList(l.sid); } catch (e) { fail(e); return; }
    } else {
      const target = localLists().find((x) => x.id !== id);
      if (!(await ctx.ask(moveTasks ? `להעביר את המשימות ל"${target.name}" ולמחוק את הרשימה?` : 'למחוק את הרשימה ואת כל המשימות שבה?', { ok: 'מחיקה', danger: true }))) return;
      const st = S();
      if (moveTasks) st.tasks.forEach((t) => { if (t.listId === id) t.listId = target.id; });
      else st.tasks = st.tasks.filter((t) => t.listId !== id);
      st.taskLists = st.taskLists.filter((x) => x.id !== id);
      save();
    }
    current = 'today'; remember();
    sheet.close(); rerender(); toast('הרשימה נמחקה');
  }
  const remember = () => { try { localStorage.setItem('tasks-list', current); } catch (e) { /* ignore */ } };

  // ---------- join sheet ----------
  function openJoin() {
    sh = { mode: 'join' };
    sheet.open();
    sheet.box().innerHTML = `
      <div class="sheet-head"><strong>🔑 הצטרפות לרשימה משותפת</strong><button class="icon-btn" data-tact="close" aria-label="סגירה">✕</button></div>
      <form id="jForm" class="sheet-body">
        <p class="muted">הדביקו את קוד ההזמנה שקיבלתם מבעל/ת הרשימה.</p>
        <input name="code" dir="ltr" placeholder="הדביקו כאן את הקוד" autocomplete="off" required>
        <button class="btn" style="width:100%;margin-top:10px">הצטרפות</button>
      </form>`;
    $('#jForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await SH().join(e.target.code.value);
        current = 'S:' + r.id; remember();
        sheet.close(); rerender();
        toast(`הצטרפת לרשימה כ${SH().ROLE_NAME[r.role] || 'צופה'} 🎉`);
      } catch (err) { toast(err && err.message === 'bad-code' ? 'הקוד לא תקין או שבוטל' : 'ההצטרפות נכשלה'); }
    });
  }

  // ---------- actions ----------
  async function onAction(e) {
    const b = e.target.closest('[data-tact]');
    if (!b) return;
    const act = b.dataset.tact;
    switch (act) {
      case 'list': current = b.dataset.l; showDone = false; remember(); rerender(); break;
      case 'new-list': openList(null); break;
      case 'edit-list': openList(current); break;
      case 'join': openJoin(); break;
      case 'toggle': await toggle(b.dataset.id); rerender(); break;
      case 'edit': openEdit(b.dataset.id); break;
      case 'show-done': showDone = !showDone; rerender(); break;
      case 'clear-done': {
        const ds = filtered(current).filter((t) => t.done && canList(t.listId, 'editor'));
        if (!ds.length) break;
        if (!(await ctx.ask(`למחוק ${ds.length} משימות שהושלמו?`, { ok: 'מחיקה', danger: true }))) break;
        const localIds = new Set(ds.filter((t) => !t.shared).map((t) => t.id));
        if (localIds.size) { S().tasks = S().tasks.filter((t) => !localIds.has(t.id)); save(); }
        try { for (const t of ds.filter((x) => x.shared)) await SH().deleteTask(t.sid, t.id); toast(`נמחקו ${ds.length} משימות שהושלמו 🧹`); } catch (err) { fail(err); }
        showDone = false;
        rerender();
        break;
      }
      case 'close': sheet.close(); break;
      case 'save': saveTask(); break;
      case 'delete':
        if (await ctx.ask('למחוק את המשימה?', { ok: 'מחיקה', danger: true })) { try { await removeTask(find(sh.key)); sheet.close(); rerender(); toast('נמחקה'); } catch (err) { fail(err); } }
        break;
      case 'dup':
        read($('#tForm'));
        if (commentsUnsub) { commentsUnsub(); commentsUnsub = null; }
        sh = { mode: 'task', key: null, draft: Object.assign(JSON.parse(JSON.stringify(sh.draft)), { title: sh.draft.title + ' (עותק)' }) };
        sh.draft.subtasks.forEach((s) => { s.id = uid(); s.done = false; });
        drawTask(); toast('עותק חדש — אפשר לערוך ולשמור');
        break;
      case 'sheet-toggle': { const k = sh.key; sheet.close(); await toggle(k); rerender(); break; }
      case 'd-list': read($('#tForm')); sh.draft.listId = b.dataset.l; drawTask(); break;
      case 'd-color': read($('#tForm')); sh.draft.color = b.dataset.c; drawTask(); break;
      case 'cfilter': colorFilter = b.dataset.c; rerender(); break;
      case 'd-due': read($('#tForm')); sh.draft.due = b.dataset.v; if (!b.dataset.v) sh.draft.time = ''; drawTask(); break;
      case 'sub-add': addSub(); break;
      case 'sub-toggle': read($('#tForm')); { const s = sh.draft.subtasks[+b.dataset.i]; s.done = !s.done; } drawTask(); break;
      case 'sub-del': read($('#tForm')); sh.draft.subtasks.splice(+b.dataset.i, 1); drawTask(); break;
      case 'c-add': addComment(); break;
      case 'c-del': { const t = find(sh.key); try { await SH().deleteComment(t.sid, b.dataset.c, t.id); } catch (err) { fail(err); } break; }
      case 'l-emoji': sh.draft.name = $('#lForm').name.value; sh.draft.emoji = b.dataset.e; drawList(); break;
      case 'l-color': sh.draft.name = $('#lForm').name.value; sh.draft.color = b.dataset.c; drawList(); break;
      case 'list-save': saveList(); break;
      case 'list-share': shareList(); break;
      case 'list-merge': removeList(true); break;
      case 'list-delete': removeList(false); break;
      case 'list-leave': {
        const l = listOf(sh.id);
        if (!(await ctx.ask(`לעזוב את "${l.name}"? אפשר להצטרף שוב רק עם קוד חדש.`, { ok: 'עזיבה', danger: true }))) break;
        try { await SH().leave(l.sid); } catch (err) { fail(err); }
        current = 'today'; remember(); sheet.close(); rerender();
        break;
      }
      case 'inv-new': {
        const l = listOf(sh.id);
        try {
          const code = await SH().createInvite(l.sid, b.dataset.r);
          let copied = false;
          try { await navigator.clipboard.writeText(code); copied = true; } catch (err) { /* blocked in some frames */ }
          await ctx.ask(copied ? 'הקוד נוצר והועתק 📋 — שלחו אותו למי שרוצים להזמין:' : 'הקוד נוצר — העתיקו אותו ושלחו למי שרוצים להזמין:', { code, ok: 'סגירה' });
          setTimeout(() => { if (sh && sh.mode === 'list') drawList(); }, 400);
        } catch (err) { fail(err); }
        break;
      }
      case 'inv-copy':
        try { await navigator.clipboard.writeText(b.dataset.code); toast('הועתק 📋'); } catch (err) { await ctx.ask('העתיקו את הקוד ושלחו אותו:', { code: b.dataset.code, ok: 'סגירה' }); }
        break;
      case 'inv-revoke': {
        const l = listOf(sh.id);
        try { await SH().revokeInvite(l.sid, b.dataset.c); toast('הקוד בוטל'); setTimeout(() => { if (sh && sh.mode === 'list') drawList(); }, 400); } catch (err) { fail(err); }
        break;
      }
      case 'm-remove': {
        const l = listOf(sh.id);
        if (!(await ctx.ask('להסיר את המשתתף/ת מהרשימה?', { ok: 'הסרה', danger: true }))) break;
        try { await SH().removeMember(l.sid, b.dataset.u); toast('הוסר/ה'); setTimeout(() => { if (sh && sh.mode === 'list') drawList(); }, 400); } catch (err) { fail(err); }
        break;
      }
      default: return;
    }
  }
  view.addEventListener('click', onAction);

  return { render, homeSummary, close: () => sheet.close(), dueOn, overdueBefore, toggle, openEdit, listOf, lists };
};
