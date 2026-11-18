/* היום שלי — קלוריות, הרגלים ותזכורות. כל הנתונים נשמרים במכשיר (localStorage). */
(function () {
  'use strict';

  // ---------- Storage ----------
  const KEY = 'daily-app-v1';
  const defaults = { calorieGoal: 2000, foods: [], habits: [], reminders: [] };
  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? Object.assign({}, defaults, JSON.parse(raw)) : structuredClone(defaults);
    } catch (e) {
      return structuredClone(defaults);
    }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  }

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDay = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = parseDay(k); d.setDate(d.getDate() + n); return dayKey(d); };
  const DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
  const fmtDay = (k) => {
    const today = dayKey();
    if (k === today) return 'היום';
    if (k === addDays(today, -1)) return 'אתמול';
    if (k === addDays(today, 1)) return 'מחר';
    return parseDay(k).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' });
  };
  const fmtDateTime = (ts) => {
    const d = new Date(ts);
    const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    return `${fmtDay(dayKey(d))} · ${time}`;
  };

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ---------- Router ----------
  const view = $('#view');
  const routes = {
    '': { title: 'היום שלי', render: renderHome },
    calories: { title: '🔥 קלוריות', render: renderCalories },
    habits: { title: '✅ הרגלים', render: renderHabits },
    reminders: { title: '⏰ תזכורות', render: renderReminders },
  };
  function currentRoute() {
    const r = location.hash.replace(/^#\/?/, '');
    return routes[r] ? r : '';
  }
  function render() {
    const r = currentRoute();
    $('#pageTitle').textContent = routes[r].title;
    $('#backBtn').hidden = r === '';
    document.querySelectorAll('#tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.route === r));
    routes[r].render();
  }
  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
  $('#backBtn').addEventListener('click', () => { location.hash = '#/'; });

  // ---------- Home ----------
  function renderHome() {
    const today = dayKey();
    const eaten = state.foods.filter((f) => f.day === today).reduce((s, f) => s + f.kcal, 0);
    const doneHabits = state.habits.filter((h) => h.done.includes(today)).length;
    const pending = state.reminders.filter((r) => !r.done);
    const sorted = pending.slice().sort((a, b) => a.at - b.at);
    const next = sorted.find((r) => r.at > Date.now()) || sorted[0];
    const hour = new Date().getHours();
    const hello = hour < 12 ? 'בוקר טוב ☀️' : hour < 18 ? 'צהריים טובים 🌤️' : 'ערב טוב 🌙';

    view.innerHTML = `
      <p class="greeting">${hello} · ${new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <div class="menu">
        <a class="menu-card c-cal" href="#/calories">
          <div class="emoji">🔥</div>
          <div><h2>קלוריות</h2><p>${eaten} מתוך ${state.calorieGoal} קק״ל היום</p></div>
          <span class="arrow">‹</span>
        </a>
        <a class="menu-card c-hab" href="#/habits">
          <div class="emoji">✅</div>
          <div><h2>הרגלים</h2><p>${state.habits.length ? `${doneHabits} מתוך ${state.habits.length} הושלמו היום` : 'עוד לא הוספת הרגלים'}</p></div>
          <span class="arrow">‹</span>
        </a>
        <a class="menu-card c-rem" href="#/reminders">
          <div class="emoji">⏰</div>
          <div><h2>תזכורות</h2><p>${next ? `הבאה: ${esc(next.title)} (${fmtDateTime(next.at)})` : 'אין תזכורות פתוחות'}</p></div>
          <span class="arrow">‹</span>
        </a>
      </div>`;
  }

  // ---------- Calories ----------
  let calDay = dayKey();
  const MEALS = ['בוקר', 'צהריים', 'ערב', 'נשנוש'];
  const QUICK = [['תפוח', 80], ['בננה', 105], ['ביצה', 75], ['פרוסת לחם', 80], ['יוגורט', 120], ['קפה עם חלב', 60]];

  function guessMeal() {
    const h = new Date().getHours();
    return h < 11 ? 'בוקר' : h < 16 ? 'צהריים' : h < 21 ? 'ערב' : 'נשנוש';
  }

  function renderCalories() {
    const items = state.foods.filter((f) => f.day === calDay);
    const total = items.reduce((s, f) => s + f.kcal, 0);
    const goal = state.calorieGoal || 1;
    const left = state.calorieGoal - total;
    const C = 2 * Math.PI * 50;
    const pct = Math.min(total / goal, 1);
    const byMeal = MEALS.map((m) => [m, items.filter((f) => f.meal === m)]).filter(([, l]) => l.length);

    view.innerHTML = `
      <div class="date-nav">
        <button class="icon-btn" data-act="next-day" aria-label="יום הבא">›</button>
        <strong>${fmtDay(calDay)}</strong>
        <button class="icon-btn" data-act="prev-day" aria-label="יום קודם">‹</button>
      </div>

      <div class="card">
        <div class="summary">
          <svg class="ring ${left < 0 ? 'over' : ''}" viewBox="0 0 120 120">
            <circle class="track" cx="60" cy="60" r="50"/>
            <circle class="bar" cx="60" cy="60" r="50" transform="rotate(-90 60 60)"
              stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/>
            <text x="60" y="62">${total}</text>
            <text class="lbl" x="60" y="80">קק״ל</text>
          </svg>
          <div class="stats">
            <div><span class="muted">יעד</span><strong>${state.calorieGoal}</strong></div>
            <div><span class="muted">נאכל</span><strong>${total}</strong></div>
            <div><span class="muted">${left >= 0 ? 'נשאר' : 'חריגה'}</span><strong style="color:${left >= 0 ? 'var(--hab)' : 'var(--danger)'}">${Math.abs(left)}</strong></div>
          </div>
        </div>
        <form class="goal-edit" id="goalForm">
          <span class="muted">יעד יומי:</span>
          <input type="number" name="goal" min="500" max="10000" value="${state.calorieGoal}" inputmode="numeric">
          <button class="btn ghost small">עדכון</button>
        </form>
      </div>

      <div class="card">
        <h3>הוספת מאכל</h3>
        <form id="foodForm">
          <div class="row">
            <input name="name" placeholder="מה אכלת?" required maxlength="60">
            <input name="kcal" type="number" placeholder="קלוריות" min="0" max="5000" required inputmode="numeric">
          </div>
          <div class="row" style="margin-top:8px">
            <select name="meal">${MEALS.map((m) => `<option ${m === guessMeal() ? 'selected' : ''}>${m}</option>`).join('')}</select>
            <button class="btn">+ הוספה</button>
          </div>
        </form>
        <div class="quick">${QUICK.map(([n, k]) => `<button class="chip" data-act="quick" data-name="${n}" data-kcal="${k}">${n} · ${k}</button>`).join('')}</div>
      </div>

      <div class="card">
        <h3>מה אכלתי</h3>
        ${items.length ? byMeal.map(([meal, list]) => `
          <div class="section-label">${meal} · ${list.reduce((s, f) => s + f.kcal, 0)} קק״ל</div>
          <ul class="list">${list.map((f) => `
            <li>
              <span class="meal-tag">${f.meal}</span>
              <span class="grow title">${esc(f.name)}</span>
              <span class="kcal">${f.kcal}</span>
              <button class="del" data-act="del-food" data-id="${f.id}" aria-label="מחיקה">✕</button>
            </li>`).join('')}
          </ul>`).join('') : '<p class="empty">עוד לא נרשם כלום ליום הזה 🍽️</p>'}
      </div>`;

    $('#goalForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = parseInt(e.target.goal.value, 10);
      if (v > 0) { state.calorieGoal = v; save(); renderCalories(); toast('היעד עודכן'); }
    });
    $('#foodForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      addFood(f.name.value.trim(), parseInt(f.kcal.value, 10), f.meal.value);
    });
  }

  function addFood(name, kcal, meal) {
    if (!name || !(kcal >= 0)) return;
    state.foods.push({ id: uid(), day: calDay, name, kcal, meal: meal || guessMeal() });
    save();
    renderCalories();
    toast(`נוסף: ${name} (${kcal} קק״ל)`);
  }

  // ---------- Habits ----------
  const HABIT_EMOJIS = ['💧', '🏃', '📚', '🧘', '🥗', '😴', '🦷', '💊', '✍️', '🚶'];

  function streak(h) {
    let k = dayKey();
    if (!h.done.includes(k)) k = addDays(k, -1); // היום עוד לא נגמר
    let n = 0;
    while (h.done.includes(k)) { n++; k = addDays(k, -1); }
    return n;
  }

  function renderHabits() {
    const today = dayKey();
    const done = state.habits.filter((h) => h.done.includes(today)).length;
    const total = state.habits.length;
    const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));

    view.innerHTML = `
      ${total ? `
      <div class="card">
        <div class="row" style="justify-content:space-between;align-items:center">
          <strong style="flex:none">התקדמות היום</strong>
          <span class="muted" style="flex:none">${done}/${total}</span>
        </div>
        <div class="progress"><div style="width:${(done / total) * 100}%"></div></div>
        ${done === total ? '<p class="muted" style="margin:10px 0 0">כל ההרגלים הושלמו היום! 🎉</p>' : ''}
      </div>` : ''}

      <div class="card">
        <h3>ההרגלים שלי</h3>
        ${total ? `<ul class="list">${state.habits.map((h) => {
          const isDone = h.done.includes(today);
          const s = streak(h);
          return `
          <li class="habit">
            <button class="check ${isDone ? 'done' : ''}" data-act="toggle-habit" data-id="${h.id}" aria-label="סימון">${isDone ? '✓' : esc(h.emoji)}</button>
            <div class="grow">
              <div class="title">${esc(h.emoji)} ${esc(h.name)}</div>
              <div class="week">${week.map((d) => `<span class="${h.done.includes(d) ? 'on' : ''}" title="${d}">${DAYS[parseDay(d).getDay()]}</span>`).join('')}</div>
            </div>
            ${s ? `<span class="streak">🔥 ${s}</span>` : ''}
            <button class="del" data-act="del-habit" data-id="${h.id}" aria-label="מחיקה">✕</button>
          </li>`;
        }).join('')}</ul>` : '<p class="empty">הוסף/י הרגל ראשון כדי להתחיל 🌱</p>'}
      </div>

      <div class="card">
        <h3>הרגל חדש</h3>
        <form id="habitForm">
          <div class="row">
            <select name="emoji" style="flex:0 0 76px">${HABIT_EMOJIS.map((e) => `<option>${e}</option>`).join('')}</select>
            <input name="name" placeholder="למשל: לשתות 8 כוסות מים" required maxlength="50">
          </div>
          <button class="btn" style="margin-top:8px;width:100%">+ הוספת הרגל</button>
        </form>
      </div>`;

    $('#habitForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = e.target.name.value.trim();
      if (!name) return;
      state.habits.push({ id: uid(), name, emoji: e.target.emoji.value, done: [] });
      save();
      renderHabits();
      toast('ההרגל נוסף');
    });
  }

  // ---------- Reminders ----------
  const REPEAT = { none: 'חד פעמי', daily: 'כל יום', weekly: 'כל שבוע' };

  function defaultReminderTime() {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function renderReminders() {
    const now = Date.now();
    const open = state.reminders.filter((r) => !r.done).sort((a, b) => a.at - b.at);
    const closed = state.reminders.filter((r) => r.done).sort((a, b) => b.at - a.at);
    const canNotify = 'Notification' in window;
    const perm = canNotify ? Notification.permission : 'unsupported';

    const item = (r) => `
      <li class="rem ${r.done ? 'done' : ''} ${!r.done && r.at < now ? 'overdue' : ''}">
        <button class="tick" data-act="toggle-rem" data-id="${r.id}" aria-label="סימון כבוצע">${r.done ? '✓' : ''}</button>
        <div class="grow">
          <div class="title">${esc(r.title)}</div>
          <div class="sub">${!r.done && r.at < now ? 'עבר זמנה · ' : ''}${fmtDateTime(r.at)} ${r.repeat !== 'none' ? `<span class="badge">🔁 ${REPEAT[r.repeat]}</span>` : ''}</div>
        </div>
        <button class="del" data-act="del-rem" data-id="${r.id}" aria-label="מחיקה">✕</button>
      </li>`;

    view.innerHTML = `
      ${canNotify && perm === 'default' ? `
        <div class="notice"><span>🔔 אפשר/י התראות כדי לקבל תזכורת בזמן</span><button class="btn small" data-act="ask-notify">הפעלה</button></div>` : ''}
      ${perm === 'denied' ? '<div class="notice">ההתראות חסומות בדפדפן — התזכורות יוצגו כהודעה בתוך האפליקציה.</div>' : ''}

      <div class="card">
        <h3>תזכורת חדשה</h3>
        <form id="remForm">
          <input name="title" placeholder="על מה להזכיר?" required maxlength="80">
          <div class="row" style="margin-top:8px">
            <input name="at" type="datetime-local" value="${defaultReminderTime()}" required>
            <select name="repeat">${Object.entries(REPEAT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          </div>
          <button class="btn" style="margin-top:8px;width:100%">+ הוספת תזכורת</button>
        </form>
      </div>

      <div class="card">
        <h3>פתוחות (${open.length})</h3>
        ${open.length ? `<ul class="list">${open.map(item).join('')}</ul>` : '<p class="empty">אין תזכורות פתוחות 👌</p>'}
      </div>

      ${closed.length ? `
      <div class="card">
        <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:6px">
          <h3 style="margin:0;flex:none">בוצעו (${closed.length})</h3>
          <button class="btn ghost small" style="flex:none" data-act="clear-done">ניקוי</button>
        </div>
        <ul class="list">${closed.map(item).join('')}</ul>
      </div>` : ''}`;

    $('#remForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      const at = new Date(f.at.value).getTime();
      if (!f.title.value.trim() || isNaN(at)) return;
      state.reminders.push({ id: uid(), title: f.title.value.trim(), at, repeat: f.repeat.value, done: false, notified: false });
      save();
      renderReminders();
      toast('התזכורת נשמרה');
    });
  }

  function nextOccurrence(r) {
    const days = r.repeat === 'daily' ? 1 : 7;
    let at = r.at;
    do { const d = new Date(at); d.setDate(d.getDate() + days); at = d.getTime(); } while (at <= Date.now());
    return at;
  }

  function fireReminder(r) {
    const body = fmtDateTime(r.at);
    let shown = false;
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification('⏰ ' + r.title, { body, icon: 'icon.svg', tag: r.id }); shown = true; } catch (e) { /* mobile requires SW */ }
      if (!shown && navigator.serviceWorker) {
        navigator.serviceWorker.ready.then((reg) => reg.showNotification('⏰ ' + r.title, { body, icon: 'icon.svg', tag: r.id })).catch(() => {});
        shown = true;
      }
    }
    toast('⏰ ' + r.title);
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }

  function checkReminders() {
    const now = Date.now();
    let changed = false;
    state.reminders.forEach((r) => {
      if (r.done || r.notified || r.at > now) return;
      fireReminder(r);
      if (r.repeat === 'none') r.notified = true;
      else r.at = nextOccurrence(r);
      changed = true;
    });
    if (changed) { save(); if (currentRoute() === 'reminders' || currentRoute() === '') render(); }
  }

  // ---------- Global click actions ----------
  view.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.dataset.id;
    switch (btn.dataset.act) {
      case 'prev-day': calDay = addDays(calDay, -1); renderCalories(); break;
      case 'next-day': calDay = addDays(calDay, 1); renderCalories(); break;
      case 'quick': addFood(btn.dataset.name, parseInt(btn.dataset.kcal, 10)); break;
      case 'del-food':
        state.foods = state.foods.filter((f) => f.id !== id); save(); renderCalories(); break;
      case 'toggle-habit': {
        const h = state.habits.find((x) => x.id === id);
        const t = dayKey();
        h.done = h.done.includes(t) ? h.done.filter((d) => d !== t) : [...h.done, t];
        save(); renderHabits();
        break;
      }
      case 'del-habit':
        if (confirm('למחוק את ההרגל?')) { state.habits = state.habits.filter((h) => h.id !== id); save(); renderHabits(); }
        break;
      case 'toggle-rem': {
        const r = state.reminders.find((x) => x.id === id);
        r.done = !r.done;
        if (!r.done && r.at > Date.now()) r.notified = false;
        save(); renderReminders();
        break;
      }
      case 'del-rem':
        state.reminders = state.reminders.filter((r) => r.id !== id); save(); renderReminders(); break;
      case 'clear-done':
        state.reminders = state.reminders.filter((r) => !r.done); save(); renderReminders(); break;
      case 'ask-notify':
        try { await Notification.requestPermission(); } catch (err) { /* ignore */ }
        renderReminders();
        break;
    }
  });

  // ---------- Boot ----------
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  render();
  checkReminders();
  setInterval(checkReminders, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkReminders(); render(); } });
})();
