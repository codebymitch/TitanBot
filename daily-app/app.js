/* היום שלי — קלוריות, הרגלים, מים ותזכורות. כל הנתונים נשמרים במכשיר (localStorage). */
(function () {
  'use strict';

  // ---------- Storage ----------
  // נשמר מקומית בדפדפן, ואם המשתמש מחובר — גם בחשבון שלו (claude.ai) ומסונכרן בין מכשירים.
  const BASE_KEY = 'daily-app-v1';
  const defaults = () => ({
    foods: [], habits: [], reminders: [], customFoods: [], favorites: [], weights: {},
    goals: { kcal: 2000, pPct: 25, cPct: 45, fPct: 30, fib: 28, sug: 50, na: 2300, profile: null },
    water: { goal: 8, cupMl: 250, log: {}, remind: { on: false, every: 60, from: '08:00', to: '22:00', last: 0 } },
  });
  let localKey = BASE_KEY;
  let state = load();

  function normalize(s) {
    const d = defaults();
    const out = Object.assign(d, s || {});
    out.goals = Object.assign(defaults().goals, out.goals || {});
    if (s && s.calorieGoal && !(s.goals && s.goals.kcal)) out.goals.kcal = s.calorieGoal; // מעבר מגרסה קודמת
    delete out.calorieGoal;
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

  // ---------- Notifications ----------
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
    try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate([200, 100, 200]); } catch (e) { /* ignore */ }
  }

  // ---------- Bottom sheet helper ----------
  function makeSheet(id, onAction, onClose) {
    let el = null;
    const api = {
      box() {
        if (!el) {
          el = document.createElement('div');
          el.id = id;
          el.className = 'sheet-wrap';
          el.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"></div>';
          document.body.appendChild(el);
          el.addEventListener('click', (e) => { if (e.target === el) api.close(); else onAction(e); });
          document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && api.isOpen()) api.close(); });
        }
        return el.firstChild;
      },
      open() { api.box(); el.classList.add('open'); document.body.classList.add('no-scroll'); return el.firstChild; },
      close() { if (!el || !api.isOpen()) return; el.classList.remove('open'); document.body.classList.remove('no-scroll'); if (onClose) onClose(); },
      isOpen() { return !!el && el.classList.contains('open'); },
    };
    return api;
  }

  // ---------- Modules (calories.js, habits.js, reminders.js) ----------
  const modCtx = {
    $, esc, uid, dayKey, addDays, parseDay, fmtDay, DAYS, toast, notify, makeSheet, view: $('#view'),
    state: () => state, save: () => save(), render: () => render(),
  };
  const cal = window.CaloriesModule(modCtx);
  const habitsMod = window.HabitsModule(modCtx);
  const remMod = window.RemindersModule(modCtx);

  // ---------- Router ----------
  const view = $('#view');
  const routes = {
    '': { title: 'היום שלי', render: renderHome },
    calories: { title: '🔥 קלוריות ותזונה', render: () => cal.render(subRoute()) },
    habits: { title: '✅ הרגלים', render: () => habitsMod.render() },
    water: { title: '💧 שתיית מים', render: renderWater },
    reminders: { title: '⏰ תזכורות', render: () => remMod.render() },
    account: { title: '👤 חשבון', render: renderAccount },
  };
  function currentRoute() {
    const r = location.hash.replace(/^#\/?/, '').split('/')[0];
    return routes[r] ? r : '';
  }
  const subRoute = () => location.hash.replace(/^#\/?/, '').split('/')[1] || '';
  function render() {
    const r = currentRoute();
    $('#pageTitle').textContent = routes[r].title;
    $('#backBtn').hidden = r === '';
    document.querySelectorAll('#tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.route === r));
    routes[r].render();
    closeDrawer();
    updateChip();
  }
  window.addEventListener('hashchange', () => { cal.close(); habitsMod.close(); remMod.close(); render(); window.scrollTo(0, 0); });
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
    const hour = new Date().getHours();
    const hello = hour < 12 ? 'בוקר טוב ☀️' : hour < 18 ? 'צהריים טובים 🌤️' : 'ערב טוב 🌙';

    view.innerHTML = `
      <p class="greeting">${hello} · ${new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <div class="menu">
        <a class="menu-card c-cal" href="#/calories">
          <div class="emoji">🔥</div>
          <div><h2>קלוריות</h2><p>${cal.homeSummary()}</p></div>
          <span class="arrow">‹</span>
        </a>
        <a class="menu-card c-hab" href="#/habits">
          <div class="emoji">✅</div>
          <div><h2>הרגלים</h2><p>${habitsMod.homeSummary()}</p></div>
          <span class="arrow">‹</span>
        </a>
        <a class="menu-card c-wat" href="#/water">
          <div class="emoji">💧</div>
          <div><h2>שתיית מים</h2><p>${waterToday()} מתוך ${state.water.goal} כוסות היום${state.water.remind.on ? ' · 🔔 תזכורת פעילה' : ''}</p></div>
          <span class="arrow">‹</span>
        </a>
        <a class="menu-card c-rem" href="#/reminders">
          <div class="emoji">⏰</div>
          <div><h2>תזכורות</h2><p>${remMod.homeSummary()}</p></div>
          <span class="arrow">‹</span>
        </a>
      </div>`;
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

  function checkAll() {
    habitsMod.check();
    remMod.check();
    checkWater();
  }

  // ---------- Global click actions ----------
  view.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.dataset.id;
    switch (btn.dataset.act) {
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
  checkAll();
  setInterval(checkAll, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkAll(); render(); } });
})();
