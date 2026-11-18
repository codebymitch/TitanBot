/* היום שלי — קלוריות, הרגלים ותזכורות. כל הנתונים נשמרים במכשיר (localStorage). */
(function () {
  'use strict';

  // ---------- Storage ----------
  // נשמר מקומית בדפדפן, ואם המשתמש מחובר — גם בחשבון שלו (claude.ai) ומסונכרן בין מכשירים.
  const BASE_KEY = 'daily-app-v1';
  const defaults = () => ({
    calorieGoal: 2000, foods: [], habits: [], reminders: [],
    water: { goal: 8, cupMl: 250, log: {}, remind: { on: false, every: 60, from: '08:00', to: '22:00', last: 0 } },
  });
  let localKey = BASE_KEY;
  let state = load();

  function normalize(s) {
    const d = defaults();
    const out = Object.assign(d, s || {});
    out.water = Object.assign(defaults().water, out.water || {});
    out.water.remind = Object.assign(defaults().water.remind, out.water.remind || {});
    return out;
  }
  function load() {
    try {
      const raw = localStorage.getItem(localKey) || (localKey !== BASE_KEY ? localStorage.getItem(BASE_KEY) : null);
      return normalize(raw ? JSON.parse(raw) : null);
    } catch (e) {
      return normalize(null);
    }
  }
  function save() {
    try { localStorage.setItem(localKey, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
    queueCloudSave();
  }

  // ---------- Account / cloud sync ----------
  const account = { status: 'loading', me: null, db: null, ref: null, lastSync: 0, error: '' };
  let cloudTimer = null, cloudWriting = false, cloudDirty = false, lastCloudJson = '';

  function queueCloudSave() {
    if (!account.ref) return;
    cloudDirty = true;
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(flushCloud, 800);
  }
  async function flushCloud() {
    if (!account.ref || cloudWriting || !cloudDirty) return;
    cloudWriting = true;
    cloudDirty = false;
    const json = JSON.stringify(state);
    try {
      if (json !== lastCloudJson) {
        await account.ref.set({ json, updatedAt: Date.now() });
        lastCloudJson = json;
        account.lastSync = Date.now();
        account.error = '';
      }
    } catch (e) {
      account.error = e && e.code === 'quota_exceeded' ? 'נגמר המקום בחשבון' : 'השמירה בחשבון נכשלה, ננסה שוב';
      cloudDirty = true;
      setTimeout(flushCloud, 5000);
    } finally {
      cloudWriting = false;
      if (cloudDirty) queueCloudSave();
      if (currentRoute() === 'account') render();
    }
  }

  async function initAccount() {
    // window.claude מוזרק ע״י claude.ai אחרי הטעינה — מחכים לו עד 10 שניות
    let c = window.claude;
    for (let i = 0; i < 40 && !(c && typeof c.use === 'function'); i++) {
      await new Promise((r) => setTimeout(r, 250));
      c = window.claude;
    }
    if (!c || typeof c.use !== 'function') { account.status = 'offline'; refreshAccountUI(); return; }
    const [user, db] = await Promise.all([c.use('user').catch(() => null), c.use('db').catch(() => null)]);
    const me = user ? await user.me() : null;
    account.me = me;
    if (!db || !me || !me.id) { account.status = 'guest'; refreshAccountUI(); return; }
    account.db = db;
    account.ref = db.doc('data/users/' + me.id + '/state');
    localKey = BASE_KEY + ':' + me.id;

    let loaded = false;
    const timeout = setTimeout(() => { if (!loaded) { account.status = 'error'; account.error = 'החיבור לחשבון איטי — העבודה נשמרת מקומית'; refreshAccountUI(); } }, 10000);
    try {
      const snap = await account.ref.get();
      loaded = true;
      clearTimeout(timeout);
      const remote = snap.exists ? snap.data() : null;
      if (remote && remote.json) {
        lastCloudJson = remote.json;
        state = normalize(JSON.parse(remote.json));
        try { localStorage.setItem(localKey, remote.json); } catch (e) { /* ignore */ }
      } else {
        save(); // משתמש חדש: מעלים את מה שכבר נשמר בדפדפן
      }
      account.status = 'connected';
      account.lastSync = Date.now();
      account.ref.onSnapshot((s) => {
        const d = s.exists ? s.data() : null;
        if (!d || !d.json || d.json === lastCloudJson || cloudDirty || cloudWriting) return;
        lastCloudJson = d.json;
        state = normalize(JSON.parse(d.json));
        try { localStorage.setItem(localKey, d.json); } catch (e) { /* ignore */ }
        account.lastSync = Date.now();
        render();
      }, () => {});
    } catch (e) {
      loaded = true;
      clearTimeout(timeout);
      account.status = 'error';
      account.error = 'לא הצלחנו להתחבר לחשבון — העבודה נשמרת מקומית';
    }
    render();
  }

  function updateChip() {
    const chip = $('#accountChip');
    if (chip) chip.textContent = account.status === 'connected' ? '☁️ מסונכרן' : account.status === 'loading' ? '…' : '📱 מקומי';
  }
  function refreshAccountUI() {
    updateChip();
    if (currentRoute() === 'account') render();
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
    water: { title: '💧 שתיית מים', render: renderWater },
    reminders: { title: '⏰ תזכורות', render: renderReminders },
    account: { title: '👤 חשבון', render: renderAccount },
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
    closeDrawer();
    updateChip();
  }
  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
  $('#backBtn').addEventListener('click', () => { location.hash = '#/'; });

  // ---------- Side menu (☰) ----------
  function openDrawer() { $('#drawer').classList.add('open'); $('#scrim').hidden = false; $('#menuBtn').setAttribute('aria-expanded', 'true'); }
  function closeDrawer() { $('#drawer').classList.remove('open'); $('#scrim').hidden = true; $('#menuBtn').setAttribute('aria-expanded', 'false'); }
  $('#menuBtn').addEventListener('click', () => ($('#drawer').classList.contains('open') ? closeDrawer() : openDrawer()));
  $('#scrim').addEventListener('click', closeDrawer);
  $('#drawer').addEventListener('click', (e) => { if (e.target.closest('a')) closeDrawer(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

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
        <a class="menu-card c-wat" href="#/water">
          <div class="emoji">💧</div>
          <div><h2>שתיית מים</h2><p>${waterToday()} מתוך ${state.water.goal} כוסות היום${state.water.remind.on ? ' · 🔔 תזכורת פעילה' : ''}</p></div>
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

  // ---------- Water ----------
  const waterToday = () => state.water.log[dayKey()] || 0;
  const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };

  function renderWater() {
    const w = state.water;
    const today = dayKey();
    const n = waterToday();
    const pct = Math.min(n / (w.goal || 1), 1);
    const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
    const max = Math.max(w.goal, ...week.map((d) => w.log[d] || 0), 1);
    const canNotify = 'Notification' in window;

    view.innerHTML = `
      <div class="card water-hero">
        <div class="glass" aria-hidden="true"><div class="fill" style="height:${pct * 100}%"></div><span>${Math.round(pct * 100)}%</span></div>
        <div class="water-info">
          <div class="big">${n} <small>/ ${w.goal} כוסות</small></div>
          <div class="muted">${((n * w.cupMl) / 1000).toFixed(2).replace(/\.?0+$/, '')} ליטר מתוך ${((w.goal * w.cupMl) / 1000).toFixed(2).replace(/\.?0+$/, '')}</div>
          ${n >= w.goal ? '<div class="good">הגעת ליעד היום! 🎉</div>' : `<div class="muted">נשארו ${w.goal - n} כוסות</div>`}
          <div class="row" style="margin-top:12px">
            <button class="btn water-btn" data-act="water-add">+ כוס מים</button>
            <button class="btn ghost" data-act="water-sub" style="flex:0 0 52px" aria-label="הורדת כוס" ${n ? '' : 'disabled'}>−</button>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>🔔 תזכורת לשתות</h3>
        <label class="switch-row">
          <span>תזכורת פעילה</span>
          <input type="checkbox" id="wRemOn" ${w.remind.on ? 'checked' : ''}>
        </label>
        <div class="row" style="margin-top:10px">
          <label class="field"><span>כל</span>
            <select id="wEvery">${[30, 45, 60, 90, 120, 180].map((m) => `<option value="${m}" ${w.remind.every === m ? 'selected' : ''}>${m < 60 ? m + ' דקות' : m === 60 ? 'שעה' : m / 60 + ' שעות'}</option>`).join('')}</select>
          </label>
          <label class="field"><span>משעה</span><input type="time" id="wFrom" value="${w.remind.from}"></label>
          <label class="field"><span>עד שעה</span><input type="time" id="wTo" value="${w.remind.to}"></label>
        </div>
        <p class="muted" style="margin:10px 0 0;font-size:.85rem">התזכורת קופצת כשהאפליקציה פתוחה, ונעצרת כשמגיעים ליעד היומי. כל כוס שמוסיפים מאפסת את הטיימר.</p>
        ${canNotify && Notification.permission === 'default' ? '<button class="btn ghost small" style="margin-top:10px" data-act="ask-notify">🔔 לאפשר התראות</button>' : ''}
      </div>

      <div class="card">
        <h3>השבוע</h3>
        <div class="bars">${week.map((d) => {
          const v = w.log[d] || 0;
          return `<div class="bar-col"><span class="v">${v || ''}</span><div class="bar ${v >= w.goal ? 'hit' : ''}" style="height:${(v / max) * 100}%"></div><span class="d">${DAYS[parseDay(d).getDay()]}</span></div>`;
        }).join('')}</div>
      </div>

      <div class="card">
        <h3>הגדרות</h3>
        <form id="waterForm" class="row">
          <label class="field"><span>יעד יומי (כוסות)</span><input type="number" name="goal" min="1" max="30" value="${w.goal}" inputmode="numeric"></label>
          <label class="field"><span>גודל כוס (מ״ל)</span><input type="number" name="cup" min="50" max="1000" step="50" value="${w.cupMl}" inputmode="numeric"></label>
          <button class="btn ghost" style="align-self:end">שמירה</button>
        </form>
      </div>`;

    const r = w.remind;
    $('#wRemOn').addEventListener('change', async (e) => {
      r.on = e.target.checked;
      r.last = Date.now();
      save();
      if (r.on && 'Notification' in window && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch (err) { /* ignore */ }
      }
      toast(r.on ? `תזכורת מים כל ${$('#wEvery').selectedOptions[0].text}` : 'תזכורת המים כובתה');
      renderWater();
    });
    $('#wEvery').addEventListener('change', (e) => { r.every = parseInt(e.target.value, 10); r.last = Date.now(); save(); });
    $('#wFrom').addEventListener('change', (e) => { if (e.target.value) { r.from = e.target.value; save(); } });
    $('#wTo').addEventListener('change', (e) => { if (e.target.value) { r.to = e.target.value; save(); } });
    $('#waterForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const g = parseInt(e.target.goal.value, 10), c = parseInt(e.target.cup.value, 10);
      if (g > 0) w.goal = g;
      if (c > 0) w.cupMl = c;
      save(); renderWater(); toast('ההגדרות נשמרו');
    });
  }

  function checkWater() {
    const r = state.water.remind;
    if (!r.on) return;
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const from = toMin(r.from), to = toMin(r.to);
    const inWindow = from <= to ? mins >= from && mins <= to : mins >= from || mins <= to;
    if (!inWindow || waterToday() >= state.water.goal) return;
    if (Date.now() - (r.last || 0) < r.every * 60000) return;
    r.last = Date.now();
    save();
    notify('💧 זמן לשתות מים', `שתית ${waterToday()} מתוך ${state.water.goal} כוסות היום`, 'water');
  }

  // ---------- Account ----------
  function renderAccount() {
    const me = account.me;
    const name = (me && me.name) || '';
    let body;
    if (account.status === 'loading') {
      body = '<p class="empty">מתחבר לחשבון…</p>';
    } else if (account.status === 'connected') {
      body = `
        <div class="profile">
          <img alt="" class="avatar" id="accAvatar">
          <div>
            <div class="title" id="accName"></div>
            <div class="sub ok">☁️ מחובר/ת — הכל נשמר בחשבון שלך</div>
          </div>
        </div>
        <ul class="facts">
          <li>הקלוריות, ההרגלים, המים והתזכורות נשמרים בחשבון שלך ומסונכרנים בין כל המכשירים.</li>
          <li>הנתונים פרטיים — רק את/ה רואה אותם.</li>
          <li>כל מי שפותח את האפליקציה מהחשבון שלו מקבל נתונים נפרדים משלו.</li>
        </ul>
        <div class="sync-line muted">${account.error ? `<span style="color:var(--danger)">${esc(account.error)}</span>` : `סונכרן לאחרונה: ${new Date(account.lastSync).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`}</div>
        <button class="btn ghost" data-act="sync-now" style="margin-top:10px;width:100%">🔄 סנכרון עכשיו</button>`;
    } else {
      body = `
        <div class="profile">
          <div class="avatar placeholder">👤</div>
          <div>
            <div class="title">לא מחובר/ת</div>
            <div class="sub">📱 הנתונים נשמרים רק בדפדפן הזה</div>
          </div>
        </div>
        <p>כדי שהכל יישמר בחשבון ויהיה זמין מכל מכשיר — יש להתחבר ל־<strong>claude.ai</strong> ולפתוח את האפליקציה מהקישור שלה. החיבור קורה אוטומטית, בלי סיסמה נוספת.</p>
        <p class="muted" style="font-size:.9rem">אין לך משתמש? אפשר לפתוח חשבון חינמי ב־claude.ai, ואז לפתוח שוב את הקישור.</p>
        ${account.error ? `<p style="color:var(--danger)">${esc(account.error)}</p>` : ''}
        <a class="btn" style="display:block;text-align:center;text-decoration:none" href="https://claude.ai/login" target="_blank" rel="noopener">התחברות / הרשמה ל־claude.ai</a>`;
    }
    view.innerHTML = `<div class="card">${body}</div>
      <div class="card">
        <h3>הנתונים שלי</h3>
        <div class="stats">
          <div><span class="muted">מאכלים שנרשמו</span><strong>${state.foods.length}</strong></div>
          <div><span class="muted">הרגלים</span><strong>${state.habits.length}</strong></div>
          <div><span class="muted">תזכורות</span><strong>${state.reminders.length}</strong></div>
          <div><span class="muted">ימים עם מעקב מים</span><strong>${Object.keys(state.water.log).length}</strong></div>
        </div>
      </div>`;
    const n = $('#accName');
    if (n) n.textContent = name || 'המשתמש שלי';
    const av = $('#accAvatar');
    if (av && me) av.src = me.avatarUrl;
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

  function notify(title, body, tag) {
    let shown = false;
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification(title, { body, icon: 'icon.svg', tag }); shown = true; } catch (e) { /* mobile requires SW */ }
        if (!shown && navigator.serviceWorker) {
          navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, { body, icon: 'icon.svg', tag })).catch(() => {});
        }
      }
    } catch (e) { /* notifications unavailable */ }
    toast(title);
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { /* ignore */ }
  }

  function fireReminder(r) {
    notify('⏰ ' + r.title, fmtDateTime(r.at), r.id);
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
    checkWater();
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
        render();
        break;
      case 'water-add': {
        const t = dayKey();
        state.water.log[t] = (state.water.log[t] || 0) + 1;
        state.water.remind.last = Date.now();
        save(); renderWater();
        toast(state.water.log[t] === state.water.goal ? 'הגעת ליעד המים! 🎉' : '💧 +1 כוס');
        break;
      }
      case 'water-sub': {
        const t = dayKey();
        state.water.log[t] = Math.max(0, (state.water.log[t] || 0) - 1);
        save(); renderWater();
        break;
      }
      case 'sync-now':
        cloudDirty = true; lastCloudJson = ''; await flushCloud(); toast(account.error || 'סונכרן ☁️');
        break;
    }
  });

  // ---------- Boot ----------
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  render();
  initAccount();
  checkReminders();
  setInterval(checkReminders, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkReminders(); render(); } });
})();
