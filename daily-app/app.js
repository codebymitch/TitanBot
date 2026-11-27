/* היום שלי — קלוריות, הרגלים, מים ותזכורות. נשמר בדפדפן, ועם חשבון (Firebase) — גם בענן. */
(function () {
  'use strict';

  // ---------- Storage ----------
  // נשמר מקומית בדפדפן, ואם המשתמש מחובר — גם בחשבון שלו (Firebase) ומסונכרן בין מכשירים.
  const BASE_KEY = 'daily-app-v1';
  const defaults = () => ({
    tasks: [], taskLists: [],
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

  // ---------- Account / cloud sync (Firebase) ----------
  // ההגדרות נמצאות ב־firebase-config.js. בלי הגדרות — האתר עובד במצב מקומי (localStorage).
  const FB_VER = '10.14.1';
  const account = { status: 'loading', user: null, fb: null, docRef: null, unsub: null, lastSync: 0, error: '' };
  let cloudTimer = null, cloudWriting = false, cloudDirty = false, lastCloudJson = '';
  let authTab = 'login', authBusy = false, authEmail = '', authName = '';
  // מצב תצוגה: pending (בטעינה) · full (הכל) · tasks (משימות בלבד — לכל מי שאינו בעל/ת האתר)
  const fbConfigured = !!(window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey);
  const OWNER_EMAIL = String(window.SITE_OWNER_EMAIL || '').trim().toLowerCase();
  let gate = window.parent !== window || (fbConfigured && OWNER_EMAIL) ? 'pending' : 'full';
  const RESTRICTED_ROUTES = ['tasks', 'account'];
  function setGate(g) {
    gate = g;
    document.body.classList.toggle('restricted', g === 'tasks');
    if (g === 'tasks' && !RESTRICTED_ROUTES.includes(currentRoute())) history.replaceState(null, '', '#/tasks');
  }
  // באתר העצמאי: רק המייל שמוגדר כבעל/ת האתר מקבל את כל הפונקציות
  const gateForUser = (u) => (!OWNER_EMAIL || (u && (u.email || '').toLowerCase() === OWNER_EMAIL) ? 'full' : 'tasks');

  function queueCloudSave() {
    if (!account.docRef) return;
    cloudDirty = true;
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(flushCloud, 800);
  }
  async function flushCloud() {
    if (!account.docRef || cloudWriting || !cloudDirty) return;
    cloudWriting = true;
    cloudDirty = false;
    const json = JSON.stringify(state);
    const ref = account.docRef;
    try {
      if (json !== lastCloudJson) {
        if (account.provider === 'claude') await ref.set({ json, updatedAt: Date.now() });
        else await account.fb.fs.setDoc(ref, { json, updatedAt: Date.now() });
        lastCloudJson = json;
        account.lastSync = Date.now();
        account.error = '';
      }
    } catch (e) {
      account.error = 'השמירה בחשבון נכשלה — ננסה שוב (הנתונים שמורים בדפדפן)';
      if (account.docRef === ref) { cloudDirty = true; setTimeout(flushCloud, 5000); }
    } finally {
      cloudWriting = false;
      if (cloudDirty) queueCloudSave();
      if (currentRoute() === 'account') render();
    }
  }

  async function initAccount() {
    const cfg = window.FIREBASE_CONFIG;
    if (!cfg || !cfg.apiKey) {
      if (await initClaude()) return;
      account.status = 'unconfigured'; refreshAccountUI(); return;
    }
    try {
      const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
      const [appM, authM, fs] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
      const app = appM.initializeApp(cfg);
      const auth = authM.getAuth(app);
      auth.languageCode = 'he';
      account.fb = { auth, authM, fs, db: fs.getFirestore(app) };
      if (cfg.emulator) { authM.connectAuthEmulator(auth, `http://${cfg.emulator}:9099`, { disableWarnings: true }); fs.connectFirestoreEmulator(account.fb.db, cfg.emulator, 8089); } // לבדיקות מקומיות בלבד
      authM.getRedirectResult(auth).catch((e) => { account.error = authError(e); refreshAccountUI(); });
      authM.onAuthStateChanged(auth, onUser);
    } catch (e) {
      account.status = 'error';
      account.error = 'לא הצלחנו לטעון את מערכת החשבונות — העבודה נשמרת מקומית';
      refreshAccountUI();
    }
  }

  // כשהאתר פתוח בתוך claude.ai (Artifact) — שמירה בחשבון Claude של המשתמש
  async function initClaude() {
    if (window.parent === window) { setGate('full'); return false; }
    let c = window.claude;
    for (let i = 0; i < 40 && !(c && typeof c.use === 'function'); i++) { await new Promise((r) => setTimeout(r, 250)); c = window.claude; }
    if (!c || typeof c.use !== 'function') { setGate('full'); return false; }
    const [user, db] = await Promise.all([c.use('user').catch(() => null), c.use('db').catch(() => null)]);
    const me = user ? await user.me() : null;
    // רק הבעלים של האפליקציה רואה את כל הפונקציות; כל השאר — רק משימות
    setGate(me && me.isOwner ? 'full' : 'tasks');
    if (!db || !me || !me.id) return false;
    let canWrite = user && user.can ? await user.can('data.write') : null;
    if (me.isOwner) canWrite = true; // הבעלים תמיד יכול לכתוב
    if (canWrite == null) canWrite = me.canEdit ? true : null;
    sharedSvc.start({ db, user, me: me.id, canWrite: canWrite !== false });
    if (canWrite === false) { account.status = 'readonly'; refreshAccountUI(); render(); return true; } // צופה: המשימות האישיות נשמרות בדפדפן
    account.provider = 'claude';
    account.user = { claude: true, displayName: me.name || '', email: '', photoURL: me.avatarUrl };
    account.docRef = db.doc('data/users/' + me.id + '/state');
    localKey = BASE_KEY + ':' + me.id;
    try {
      const snap = await account.docRef.get();
      const remote = snap.exists ? snap.data() : null;
      if (remote && remote.json) {
        lastCloudJson = remote.json;
        state = normalize(JSON.parse(remote.json));
        try { localStorage.setItem(localKey, remote.json); } catch (e) { /* ignore */ }
      } else save();
      account.status = 'connected';
      account.lastSync = Date.now();
      const ref = account.docRef;
      ref.onSnapshot((sn) => {
        const d = sn.exists ? sn.data() : null;
        if (!d || !d.json || d.json === lastCloudJson || cloudDirty || cloudWriting) return;
        lastCloudJson = d.json;
        state = normalize(JSON.parse(d.json));
        try { localStorage.setItem(localKey, d.json); } catch (e) { /* ignore */ }
        account.lastSync = Date.now();
        render();
      }, () => {});
    } catch (e) {
      account.status = 'error';
      account.error = 'לא הצלחנו לטעון את הנתונים מהחשבון — העבודה נשמרת בדפדפן';
    }
    render();
    return true;
  }

  async function onUser(u) {
    setGate(gateForUser(u));
    if (u) { fbShared.start({ fs: account.fb.fs, db: account.fb.db, uid: u.uid, name: u.displayName || (u.email || '').split('@')[0] }); modCtx.shared = fbShared; }
    else fbShared.stop();
    if (account.unsub) { account.unsub(); account.unsub = null; }
    if (cloudDirty && account.docRef) { clearTimeout(cloudTimer); await flushCloud(); }
    account.user = u;
    lastCloudJson = '';
    authTab = 'login';
    if (!u) {
      account.docRef = null;
      account.status = 'guest';
      localKey = BASE_KEY;
      state = load();
      render();
      return;
    }
    const { fs, db } = account.fb;
    const browserState = state;
    account.docRef = fs.doc(db, 'users', u.uid);
    localKey = BASE_KEY + ':' + u.uid;
    account.status = 'loading';
    refreshAccountUI();
    try {
      const snap = await fs.getDoc(account.docRef);
      const remote = snap.exists() ? snap.data() : null;
      if (remote && remote.json) {
        lastCloudJson = remote.json;
        state = normalize(JSON.parse(remote.json));
        try { localStorage.setItem(localKey, remote.json); } catch (e) { /* ignore */ }
      } else {
        state = browserState; // חשבון חדש: מעבירים אליו את מה שכבר נשמר בדפדפן
        save();
      }
      account.status = 'connected';
      account.lastSync = Date.now();
      account.error = '';
      const ref = account.docRef;
      account.unsub = fs.onSnapshot(ref, (s) => {
        const d = s.exists() ? s.data() : null;
        if (account.docRef !== ref || !d || !d.json || d.json === lastCloudJson || cloudDirty || cloudWriting) return;
        lastCloudJson = d.json;
        state = normalize(JSON.parse(d.json));
        try { localStorage.setItem(localKey, d.json); } catch (e) { /* ignore */ }
        account.lastSync = Date.now();
        render();
      }, () => {});
    } catch (e) {
      account.status = 'error';
      account.error = 'לא הצלחנו לטעון את הנתונים מהחשבון — העבודה נשמרת בדפדפן';
      state = load();
    }
    render();
  }

  const AUTH_ERRORS = {
    'auth/invalid-email': 'כתובת המייל לא תקינה',
    'auth/missing-email': 'נא להזין מייל',
    'auth/missing-password': 'נא להזין סיסמה',
    'auth/weak-password': 'הסיסמה צריכה להכיל לפחות 6 תווים',
    'auth/email-already-in-use': 'כבר יש חשבון עם המייל הזה — נסו להתחבר',
    'auth/invalid-credential': 'המייל או הסיסמה שגויים',
    'auth/invalid-login-credentials': 'המייל או הסיסמה שגויים',
    'auth/wrong-password': 'המייל או הסיסמה שגויים',
    'auth/user-not-found': 'לא נמצא חשבון עם המייל הזה',
    'auth/too-many-requests': 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות',
    'auth/popup-closed-by-user': 'חלון ההתחברות נסגר',
    'auth/cancelled-popup-request': 'חלון ההתחברות נסגר',
    'auth/network-request-failed': 'אין חיבור לאינטרנט',
    'auth/operation-not-allowed': 'שיטת ההתחברות הזו לא הופעלה ב־Firebase',
    'auth/unauthorized-domain': 'הכתובת של האתר לא מאושרת ב־Firebase (Authentication → Settings → Authorized domains)',
    'auth/requires-recent-login': 'מטעמי אבטחה צריך להתחבר מחדש ואז לנסות שוב',
  };
  const authError = (e) => AUTH_ERRORS[e && e.code] || 'משהו השתבש, נסו שוב';

  function updateChip() {
    const chip = $('#accountChip');
    if (!chip) return;
    chip.textContent = account.status === 'connected' ? '☁️ מסונכרן' : account.status === 'loading' ? '…' : account.status === 'guest' ? '🔑 התחברות' : '📱 מקומי';
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

  // ---------- In-app dialog (confirm()/prompt() are blocked inside claude.ai) ----------
  function ask(message, opts = {}) {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'ask-wrap';
      wrap.innerHTML = `<div class="ask" role="alertdialog" aria-modal="true">
        <p class="ask-msg"></p>
        ${opts.code ? `<input class="ask-code" readonly dir="ltr">` : ''}
        <div class="ask-btns">
          ${opts.code ? '' : `<button class="btn ghost" data-v="0">${opts.cancel || 'ביטול'}</button>`}
          <button class="btn ${opts.danger ? 'danger-solid' : ''}" data-v="1">${opts.ok || 'אישור'}</button>
        </div></div>`;
      wrap.querySelector('.ask-msg').textContent = message;
      const code = wrap.querySelector('.ask-code');
      if (code) code.value = opts.code;
      document.body.appendChild(wrap);
      requestAnimationFrame(() => wrap.classList.add('open'));
      const done = (v) => { wrap.remove(); document.removeEventListener('keydown', key, true); resolve(v); };
      const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } if (e.key === 'Enter') { e.preventDefault(); done(true); } };
      document.addEventListener('keydown', key, true);
      wrap.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) done(b.dataset.v === '1'); else if (e.target === wrap) done(false); });
      if (code) { code.focus(); code.select(); } else wrap.querySelector('[data-v="1"]').focus();
    });
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
    $, esc, uid, dayKey, addDays, parseDay, fmtDay, DAYS, toast, notify, makeSheet, ask, view: $('#view'),
    state: () => state, save: () => save(), render: () => render(),
  };
  const sharedSvc = window.SharedLists(modCtx);
  modCtx.shared = sharedSvc;
  const fbShared = window.SharedListsFirebase(modCtx);
  // מאפשר למודול המשימות להציע התחברות כדי להצטרף לרשימות משותפות
  modCtx.canSignIn = () => !!(account.fb && !account.user);
  const cal = window.CaloriesModule(modCtx);
  const habitsMod = window.HabitsModule(modCtx);
  const remMod = window.RemindersModule(modCtx);
  const tasksMod = window.TasksModule(modCtx);
  Object.assign(modCtx, { rem: remMod, habits: habitsMod, cal, tasks: tasksMod });
  const calendarMod = window.CalendarModule(modCtx);

  // ---------- Router ----------
  const view = $('#view');
  const routes = {
    '': { title: 'היום שלי', render: renderHome },
    calories: { title: '🔥 קלוריות ותזונה', render: () => cal.render(subRoute()) },
    habits: { title: '✅ הרגלים', render: () => habitsMod.render() },
    water: { title: '💧 שתיית מים', render: renderWater },
    reminders: { title: '⏰ תזכורות', render: () => remMod.render() },
    calendar: { title: '📅 לוח שנה', render: () => calendarMod.render() },
    tasks: { title: '📋 משימות', render: () => tasksMod.render() },
    account: { title: '👤 חשבון', render: renderAccount },
  };
  function currentRoute() {
    const r = location.hash.replace(/^#\/?/, '').split('/')[0];
    return routes[r] ? r : '';
  }
  const subRoute = () => location.hash.replace(/^#\/?/, '').split('/')[1] || '';
  function render() {
    if (gate === 'pending') { view.innerHTML = '<p class="empty" style="padding-top:40px">טוען…</p>'; return; }
    const r = gate === 'tasks' && !RESTRICTED_ROUTES.includes(currentRoute()) ? 'tasks' : currentRoute();
    $('#pageTitle').textContent = routes[r].title;
    $('#backBtn').hidden = r === '';
    document.querySelectorAll('#tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.route === r));
    routes[r].render();
    closeDrawer();
    updateChip();
  }
  window.addEventListener('hashchange', () => { cal.close(); habitsMod.close(); remMod.close(); tasksMod.close(); render(); window.scrollTo(0, 0); });
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
        <a class="menu-card c-calnd" href="#/calendar">
          <div class="emoji">📅</div>
          <div><h2>לוח שנה</h2><p>${calendarMod.homeSummary()}</p></div>
          <span class="arrow">‹</span>
        </a>
        <a class="menu-card c-task" href="#/tasks">
          <div class="emoji">📋</div>
          <div><h2>משימות</h2><p>${tasksMod.homeSummary()}</p></div>
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

  // ---------- Account page ----------
  function renderAccount() {
    const u = account.user;
    let body;
    if (account.status === 'loading') {
      body = '<p class="empty">מתחבר לחשבון…</p>';
    } else if (account.status === 'connected' && u) {
      const name = u.displayName || (u.email || '').split('@')[0];
      body = `
        <div class="profile">
          ${u.photoURL ? '<img alt="" class="avatar" id="accAvatar" referrerpolicy="no-referrer">' : `<div class="avatar placeholder">${esc((name || '?').charAt(0).toUpperCase())}</div>`}
          <div>
            <div class="title" id="accName"></div>
            <div class="sub" id="accEmail" dir="ltr" style="text-align:right"></div>
            <div class="sub ok">☁️ מחובר/ת — הכל נשמר בחשבון${u.claude ? ' Claude שלך' : ''}</div>
          </div>
        </div>
        <ul class="facts">
          <li>הקלוריות, ההרגלים, המים והתזכורות נשמרים בחשבון ומסונכרנים בין כל המכשירים.</li>
          <li>הנתונים פרטיים — רק את/ה רואה אותם.</li>
        </ul>
        <div class="sync-line muted">${account.error ? `<span style="color:var(--danger)">${esc(account.error)}</span>` : `סונכרן לאחרונה: ${new Date(account.lastSync).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`}</div>
        <div class="row" style="margin-top:10px">
          <button class="btn ghost" data-act="sync-now">🔄 סנכרון עכשיו</button>
          ${u.claude ? '' : '<button class="btn ghost" data-act="logout">🚪 התנתקות</button>'}
        </div>
        ${u.claude ? '' : `<details class="danger-zone"><summary>מחיקת החשבון</summary>
          <p class="muted tiny">פעולה זו מוחקת את החשבון ואת כל הנתונים השמורים בו לצמיתות.</p>
          <button class="btn ghost danger small" data-act="delete-account">🗑️ מחיקת החשבון לצמיתות</button>
        </details>`}`;
    } else if (account.status === 'guest') {
      const reg = authTab === 'register';
      body = `
        <div class="auth-head">
          <div class="auth-logo">✓</div>
          <h2>${reg ? 'יצירת חשבון חדש' : 'התחברות'}</h2>
          <p class="muted">${reg ? 'חשבון חינמי — כל הנתונים נשמרים ומסונכרנים בין המכשירים' : 'התחברו כדי לגשת לנתונים שלכם מכל מכשיר'}</p>
        </div>
        <div class="seg" style="margin-bottom:12px">
          <button class="${!reg ? 'on' : ''}" data-act="auth-tab" data-t="login">התחברות</button>
          <button class="${reg ? 'on' : ''}" data-act="auth-tab" data-t="register">הרשמה</button>
        </div>
        <form id="authForm" class="auth-form">
          ${reg ? '<label class="field"><span>שם</span><input name="name" autocomplete="name" maxlength="40" placeholder="איך לקרוא לך?" value="${esc(authName)}"></label>' : ''}
          <label class="field"><span>מייל</span><input name="email" type="email" autocomplete="email" required dir="ltr" placeholder="name@example.com" value="${esc(authEmail)}"></label>
          <label class="field"><span>סיסמה</span><input name="password" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required minlength="6" dir="ltr" placeholder="${reg ? 'לפחות 6 תווים' : ''}"></label>
          ${account.error ? `<p class="auth-error">${esc(account.error)}</p>` : ''}
          <button class="btn" ${authBusy ? 'disabled' : ''}>${authBusy ? '…' : reg ? 'יצירת חשבון' : 'התחברות'}</button>
          ${!reg ? '<button type="button" class="link-btn" data-act="reset-pw">שכחתי סיסמה</button>' : ''}
        </form>
        <div class="or"><span>או</span></div>
        <button class="btn google-btn" data-act="google" ${authBusy ? 'disabled' : ''}><svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg> המשך עם Google</button>
        <p class="muted tiny" style="text-align:center">בלי חשבון אפשר להמשיך להשתמש באתר — הנתונים יישמרו רק בדפדפן הזה.</p>`;
    } else {
      body = `
        <div class="profile">
          <div class="avatar placeholder">📱</div>
          <div>
            <div class="title">מצב מקומי</div>
            <div class="sub">הנתונים נשמרים בדפדפן הזה</div>
          </div>
        </div>
        ${account.status === 'unconfigured'
          ? '<p class="muted tiny">מערכת החשבונות עוד לא הוגדרה באתר הזה. למנהל/ת האתר: יש למלא את הקובץ <code>firebase-config.js</code> (ההוראות ב־README).</p>'
          : `<p style="color:var(--danger)">${esc(account.error)}</p>`}`;
    }
    view.innerHTML = `<div class="card">${body}</div>
      <div class="card">
        <h3>הנתונים שלי</h3>
        <div class="stats">
          <div><span class="muted">מאכלים שנרשמו</span><strong>${state.foods.length}</strong></div>
          <div><span class="muted">הרגלים</span><strong>${state.habits.length}</strong></div>
          <div><span class="muted">תזכורות</span><strong>${state.reminders.length}</strong></div>
          <div><span class="muted">משימות</span><strong>${state.tasks.length}</strong></div>
          <div><span class="muted">ימים עם מעקב מים</span><strong>${Object.keys(state.water.log).length}</strong></div>
        </div>
      </div>`;
    if (u) {
      const n = $('#accName'); if (n) n.textContent = u.displayName || (u.email || '').split('@')[0] || 'המשתמש שלי';
      const em = $('#accEmail'); if (em) em.textContent = u.email || '';
      const av = $('#accAvatar'); if (av) av.src = u.photoURL;
    }
    const f = $('#authForm');
    if (f) f.addEventListener('input', () => { authEmail = f.email.value; if (f.name) authName = f.name.value; });
    if (f) f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { auth, authM } = account.fb;
      const email = f.email.value.trim(), pw = f.password.value;
      await authRun(async () => {
        if (authTab === 'register') {
          const cred = await authM.createUserWithEmailAndPassword(auth, email, pw);
          const nm = f.name && f.name.value.trim();
          if (nm) { await authM.updateProfile(cred.user, { displayName: nm }); await cred.user.reload(); account.user = auth.currentUser; fbShared.start({ fs: account.fb.fs, db: account.fb.db, uid: cred.user.uid, name: nm }); }
          toast('החשבון נוצר — ברוכים הבאים! 🎉');
        } else {
          await authM.signInWithEmailAndPassword(auth, email, pw);
          toast('התחברת בהצלחה 👋');
        }
      });
    });
  }
  async function authRun(fn) {
    authBusy = true; account.error = ''; render();
    try { await fn(); } catch (e) { account.error = authError(e); }
    authBusy = false; render();
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
      case 'auth-tab': authTab = btn.dataset.t; account.error = ''; render(); break;
      case 'google': {
        const { auth, authM } = account.fb;
        const provider = new authM.GoogleAuthProvider();
        await authRun(async () => {
          try { await authM.signInWithPopup(auth, provider); }
          catch (err) {
            if (err && (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment')) await authM.signInWithRedirect(auth, provider);
            else throw err;
          }
        });
        break;
      }
      case 'reset-pw': {
        const f = $('#authForm');
        const email = f && f.email.value.trim();
        if (!email) { account.error = 'נא להזין את המייל בשדה למעלה ואז ללחוץ שוב'; render(); break; }
        const { auth, authM } = account.fb;
        await authRun(() => authM.sendPasswordResetEmail(auth, email));
        if (!account.error) toast('שלחנו מייל לאיפוס הסיסמה 📧');
        break;
      }
      case 'logout':
        await account.fb.authM.signOut(account.fb.auth);
        toast('התנתקת. הנתונים נשארו שמורים בחשבון');
        break;
      case 'delete-account': {
        if (!(await ask('למחוק את החשבון ואת כל הנתונים שבו לצמיתות? אי אפשר לבטל את זה.', { ok: 'מחיקה', danger: true }))) break;
        const { auth, authM, fs } = account.fb;
        try {
          const ref = account.docRef;
          if (account.unsub) { account.unsub(); account.unsub = null; }
          account.docRef = null;
          await fs.deleteDoc(ref);
          try { localStorage.removeItem(localKey); } catch (err) { /* ignore */ }
          await authM.deleteUser(auth.currentUser);
          toast('החשבון נמחק');
        } catch (err) {
          // המחיקה לא הושלמה (למשל צריך התחברות מחודשת) — מחזירים את הנתונים לחשבון
          if (auth.currentUser) { account.docRef = fs.doc(account.fb.db, 'users', auth.currentUser.uid); lastCloudJson = ''; save(); }
          account.error = authError(err);
          render();
        }
        break;
      }
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
