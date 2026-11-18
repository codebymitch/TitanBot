/* מודול קלוריות ותזונה: יומן לפי ארוחות, מאגר מזון, ערכים תזונתיים, סטטיסטיקה, משקל ויעדים. */
window.CaloriesModule = function (ctx) {
  'use strict';
  const { $, esc, uid, dayKey, addDays, parseDay, fmtDay, DAYS, toast, view } = ctx;
  const S = () => ctx.state();
  const save = () => ctx.save();
  const DB = window.FOOD_DB || [];
  const CATS = window.FOOD_CATS || {};

  const MEALS = [
    { k: 'בוקר', e: '🌅' }, { k: 'צהריים', e: '☀️' }, { k: 'ערב', e: '🌙' }, { k: 'נשנוש', e: '🍪' },
  ];
  const MEAL_EMOJI = Object.fromEntries(MEALS.map((m) => [m.k, m.e]));
  const ZERO = () => ({ kcal: 0, p: 0, c: 0, f: 0, fib: 0, sug: 0, na: 0 });
  const KEYS = ['kcal', 'p', 'c', 'f', 'fib', 'sug', 'na'];
  const ACTIVITY = [
    [1.2, 'יושבני (כמעט בלי פעילות)'], [1.375, 'קל (1–3 אימונים בשבוע)'],
    [1.55, 'בינוני (3–5 אימונים בשבוע)'], [1.725, 'גבוה (6–7 אימונים בשבוע)'], [1.9, 'גבוה מאוד (עבודה פיזית + אימונים)'],
  ];
  const TARGETS = [
    [-500, 'ירידה של ~0.5 ק״ג בשבוע'], [-250, 'ירידה של ~0.25 ק״ג בשבוע'], [0, 'שמירה על המשקל'],
    [250, 'עלייה של ~0.25 ק״ג בשבוע'], [500, 'עלייה של ~0.5 ק״ג בשבוע'],
  ];
  const PRESETS = [['מאוזן', 25, 45, 30], ['עתיר חלבון', 35, 35, 30], ['דל פחמימה', 30, 25, 45], ['ספורטיבי', 30, 50, 20]];

  let day = dayKey();
  let sheet = null; // מצב החלון הקופץ

  // ---------- helpers ----------
  const P = (n) => `<span dir="ltr">${n}%</span>`;
  const r1 = (x) => Math.round((x || 0) * 10) / 10;
  const fmt = (k, x) => (k === 'kcal' || k === 'na' ? Math.round(x || 0) : r1(x)).toLocaleString('he-IL');
  const nutr = (e) => e.n || Object.assign(ZERO(), { kcal: e.kcal || 0 });
  const sum = (list) => list.reduce((t, e) => { const n = nutr(e); KEYS.forEach((k) => { t[k] += n[k] || 0; }); return t; }, ZERO());
  const entriesOf = (d) => S().foods.filter((f) => f.day === d);
  const allFoods = () => S().customFoods.concat(DB);
  const findFood = (id) => allFoods().find((f) => f.id === id);
  const norm = (s) => String(s).toLowerCase().replace(/["'׳״`\-()]/g, '').replace(/\s+/g, ' ').trim();
  const calc = (food, grams) => { const o = {}; KEYS.forEach((k) => { o[k] = ((food.n[k] || 0) * grams) / 100; }); return o; };
  const round = (n) => { const o = {}; KEYS.forEach((k) => { o[k] = k === 'kcal' || k === 'na' ? Math.round(n[k] || 0) : r1(n[k]); }); return o; };
  const guessMeal = () => { const h = new Date().getHours(); return h < 11 ? 'בוקר' : h < 16 ? 'צהריים' : h < 21 ? 'ערב' : 'נשנוש'; };

  function goals() {
    const g = S().goals;
    return {
      kcal: g.kcal, fib: g.fib, sug: g.sug, na: g.na,
      p: Math.round((g.kcal * g.pPct) / 100 / 4), c: Math.round((g.kcal * g.cPct) / 100 / 4), f: Math.round((g.kcal * g.fPct) / 100 / 9),
    };
  }
  function unitText(e) {
    if (!e.unit || e.unit === 'גרם') return `${fmt('p', e.grams)} ג׳`;
    return `${e.qty === 1 ? '' : fmt('p', e.qty) + ' × '}${esc(e.unit)} (${fmt('p', e.grams)} ג׳)`;
  }

  // ---------- public: summary for home ----------
  function homeSummary() {
    const t = sum(entriesOf(dayKey()));
    const g = goals();
    return `${Math.round(t.kcal)} מתוך ${g.kcal} קק״ל · חלבון ${Math.round(t.p)}/${g.p} ג׳`;
  }

  // ---------- render entry ----------
  function render(sub) {
    const tabs = [['', '📒 יומן'], ['foods', '🥗 מאגר'], ['stats', '📊 מעקב']];
    const nav = `<nav class="subtabs">${tabs.map(([k, l]) => `<a href="#/calories${k ? '/' + k : ''}" class="${(sub || '') === k ? 'active' : ''}">${l}</a>`).join('')}</nav>`;
    const body = sub === 'foods' ? renderFoods() : sub === 'stats' ? renderStats() : renderDiary();
    view.innerHTML = nav + body;
    if (sub === 'foods') bindFoods();
    if (sub === 'stats') bindStats();
    if (sub === 'goals') { history.replaceState(null, '', '#/calories'); openSheet({ mode: 'settings' }); }
  }
  const rerender = () => ctx.render();
  // מרענן גם את המסך וגם את חלון ההגדרות אם הוא פתוח
  const refresh = () => { rerender(); if (sheet && sheet.mode === 'settings') drawSheet(); };

  // ---------- Diary ----------
  function bar(label, val, goal, cls, unit = 'ג׳', limit = false) {
    const pct = goal ? Math.min((val / goal) * 100, 100) : 0;
    const over = limit && val > goal;
    return `<div class="nbar ${cls} ${over ? 'over' : ''}">
      <div class="nbar-top"><span>${label}</span><span><strong>${fmt(cls === 'na' ? 'na' : 'p', val)}</strong> / ${goal.toLocaleString('he-IL')} ${unit}${limit ? ' מקס׳' : ''}</span></div>
      <div class="nbar-track"><div style="width:${pct}%"></div></div>
    </div>`;
  }

  function renderDiary() {
    const items = entriesOf(day);
    const t = sum(items);
    const g = goals();
    const left = g.kcal - t.kcal;
    const C = 2 * Math.PI * 50;
    const pct = Math.min(t.kcal / (g.kcal || 1), 1);
    const yItems = entriesOf(addDays(day, -1));
    const macroKcal = t.p * 4 + t.c * 4 + t.f * 9 || 1;

    const meals = MEALS.map(({ k, e }) => {
      const list = items.filter((x) => x.meal === k);
      const mt = sum(list);
      const hasYesterday = !list.length && yItems.some((x) => x.meal === k);
      return `<div class="card meal">
        <div class="meal-head">
          <h3>${e} ${k}</h3>
          <span class="meal-kcal">${list.length ? `${Math.round(mt.kcal)} קק״ל` : ''}</span>
        </div>
        ${list.length ? `<div class="meal-macros">ח׳ ${fmt('p', mt.p)} · פ׳ ${fmt('c', mt.c)} · ש׳ ${fmt('f', mt.f)} ג׳</div>
        <ul class="list entries">${list.map((x) => {
          const n = nutr(x);
          return `<li>
            <button class="entry" data-cact="edit-entry" data-id="${x.id}">
              <span class="grow"><span class="title">${esc(x.name)}</span>
              <span class="sub">${x.grams ? unitText(x) + ' · ' : ''}ח׳ ${fmt('p', n.p)} · פ׳ ${fmt('c', n.c)} · ש׳ ${fmt('f', n.f)}</span></span>
              <span class="kcal">${Math.round(n.kcal)}</span>
            </button>
            <button class="del" data-cact="del-entry" data-id="${x.id}" aria-label="מחיקה">✕</button>
          </li>`;
        }).join('')}</ul>` : ''}
        <div class="meal-actions">
          <button class="btn ghost small" data-cact="open-add" data-meal="${k}">+ הוספה ל${k}</button>
          ${hasYesterday ? `<button class="btn ghost small" data-cact="copy-yesterday" data-meal="${k}">↺ כמו אתמול</button>` : ''}
        </div>
      </div>`;
    }).join('');

    return `
      <div class="date-nav">
        <button class="icon-btn" data-cact="day" data-d="1" aria-label="יום הבא">›</button>
        <button class="date-label" data-cact="today">${fmtDay(day)}${day !== dayKey() ? ' <small>(חזרה להיום)</small>' : ''}</button>
        <button class="icon-btn" data-cact="day" data-d="-1" aria-label="יום קודם">‹</button>
      </div>

      <div class="card">
        <div class="summary">
          <button class="ring-btn" data-cact="open-settings" aria-label="הגדרות קלוריות — ${Math.round(t.kcal)} מתוך ${g.kcal} קלוריות">
          <svg class="ring ${left < 0 ? 'over' : ''}" viewBox="0 0 120 120" aria-hidden="true">
            <circle class="track" cx="60" cy="60" r="50"/>
            <circle class="bar" cx="60" cy="60" r="50" transform="rotate(-90 60 60)" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/>
            <text x="60" y="58">${Math.abs(Math.round(left)).toLocaleString('he-IL')}</text>
            <text class="lbl" x="60" y="76">${left >= 0 ? 'נשארו' : 'חריגה'}</text>
          </svg>
          <span class="ring-hint">⚙️ הגדרות</span>
          </button>
          <div class="stats">
            <div><span class="muted">🎯 יעד</span><strong>${g.kcal.toLocaleString('he-IL')}</strong></div>
            <div><span class="muted">🍽️ נאכל</span><strong>${Math.round(t.kcal).toLocaleString('he-IL')}</strong></div>
            <div><span class="muted">${left >= 0 ? '✅ נשאר' : '⚠️ חריגה'}</span><strong style="color:${left >= 0 ? 'var(--hab)' : 'var(--danger)'}">${Math.abs(Math.round(left)).toLocaleString('he-IL')}</strong></div>
            <div class="split" title="התפלגות הקלוריות">
              <span class="sp p" style="width:${((t.p * 4) / macroKcal) * 100}%"></span><span class="sp c" style="width:${((t.c * 4) / macroKcal) * 100}%"></span><span class="sp f" style="width:${((t.f * 9) / macroKcal) * 100}%"></span>
            </div>
          </div>
        </div>
        <div class="nbars">
          ${bar('🥩 חלבון', t.p, g.p, 'p')}
          ${bar('🍞 פחמימות', t.c, g.c, 'c')}
          ${bar('🥑 שומן', t.f, g.f, 'f')}
        </div>
        <div class="mini-grid">
          <div class="${t.fib >= g.fib ? 'ok' : ''}"><span>סיבים</span><strong>${fmt('fib', t.fib)}</strong><small>/ ${g.fib} ג׳</small></div>
          <div class="${t.sug > g.sug ? 'bad' : ''}"><span>סוכר</span><strong>${fmt('sug', t.sug)}</strong><small>/ ${g.sug} ג׳ מקס׳</small></div>
          <div class="${t.na > g.na ? 'bad' : ''}"><span>נתרן</span><strong>${fmt('na', t.na)}</strong><small>/ ${g.na.toLocaleString('he-IL')} מ״ג</small></div>
        </div>
      </div>

      ${meals}
      ${items.length ? '' : '<p class="empty">היומן ריק ליום הזה — לחצו על "+ הוספה" באחת הארוחות 🍽️</p>'}`;
  }

  // ---------- Food rows (search results) ----------
  function foodRow(f, act = 'pick-food') {
    const u = f.units && f.units[0];
    const k = Math.round(f.n.kcal);
    const ku = u ? Math.round((f.n.kcal * u[1]) / 100) : null;
    return `<li><button class="food-row" data-cact="${act}" data-id="${f.id}">
      <span class="grow">
        <span class="title">${esc(f.name)}${f.custom ? ' <span class="badge-mine">שלי</span>' : ''}${S().favorites.includes(f.id) ? ' ⭐' : ''}</span>
        <span class="sub">${u ? `${esc(u[0])} (${u[1]} ג׳) · ${ku} קק״ל · ` : ''}100 ג׳ · ${k} קק״ל</span>
      </span>
      <span class="pcf">ח׳ ${fmt('p', f.n.p)}<br>פ׳ ${fmt('c', f.n.c)}<br>ש׳ ${fmt('f', f.n.f)}</span>
    </button></li>`;
  }

  function searchFoods(q, cat) {
    const nq = norm(q);
    let list = allFoods();
    if (cat) list = list.filter((f) => f.cat === cat);
    if (!nq) return list;
    const words = nq.split(' ');
    return list
      .map((f) => { const n = norm(f.name); if (!words.every((w) => n.includes(w))) return null; return [n.startsWith(nq) ? 0 : n.split(' ').some((w) => w.startsWith(words[0])) ? 1 : 2, f]; })
      .filter(Boolean).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  }
  function recentFoods() {
    const seen = new Set(); const out = [];
    for (let i = S().foods.length - 1; i >= 0 && out.length < 8; i--) {
      const id = S().foods[i].foodId;
      if (id && !seen.has(id)) { seen.add(id); const f = findFood(id); if (f) out.push(f); }
    }
    return out;
  }
  const catChips = (active, act) => `<div class="chips-scroll">
    <button class="chip ${!active ? 'on' : ''}" data-cact="${act}" data-cat="">הכל</button>
    ${Object.entries(CATS).map(([k, l]) => `<button class="chip ${active === k ? 'on' : ''}" data-cact="${act}" data-cat="${k}">${l}</button>`).join('')}
    ${S().customFoods.length ? `<button class="chip ${active === 'mine' ? 'on' : ''}" data-cact="${act}" data-cat="mine">✏️ שלי</button>` : ''}
  </div>`;
  const filterCat = (list, cat) => (cat === 'mine' ? list.filter((f) => f.custom) : list);

  // ---------- Foods tab ----------
  let foodsQ = '', foodsCat = '';
  function foodsResults() {
    const list = filterCat(searchFoods(foodsQ, foodsCat === 'mine' ? '' : foodsCat), foodsCat);
    return list.length ? `<ul class="list">${list.slice(0, 120).map((f) => foodRow(f, 'view-food')).join('')}</ul>` : '<p class="empty">לא נמצא מאכל — אפשר להוסיף אותו למאגר ✏️</p>';
  }
  function renderFoods() {
    return `
      <div class="card">
        <input type="search" id="foodsSearch" placeholder="🔍 חיפוש במאגר (${allFoods().length} מאכלים)" value="${esc(foodsQ)}" autocomplete="off">
        ${catChips(foodsCat, 'foods-cat')}
        <button class="btn" style="width:100%;margin-top:10px" data-cact="new-custom">✏️ הוספת מאכל חדש למאגר</button>
      </div>
      <div class="card"><div id="foodsList">${foodsResults()}</div>
      <p class="muted tiny">הערכים ל־100 גרם (משקאות ל־100 מ״ל) ומשוערים לפי טבלאות תזונה מקובלות. ח׳ = חלבון, פ׳ = פחמימות, ש׳ = שומן.</p></div>`;
  }
  function bindFoods() {
    $('#foodsSearch').addEventListener('input', (e) => { foodsQ = e.target.value; $('#foodsList').innerHTML = foodsResults(); });
  }

  // ---------- Stats tab ----------
  function streakDays() {
    const days = new Set(S().foods.map((f) => f.day));
    let k = dayKey(); if (!days.has(k)) k = addDays(k, -1);
    let n = 0; while (days.has(k)) { n++; k = addDays(k, -1); }
    return n;
  }
  function renderStats() {
    const g = goals();
    const today = dayKey();
    const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
    const totals = week.map((d) => sum(entriesOf(d)));
    const logged = totals.filter((t) => t.kcal > 0);
    const avg = logged.length ? KEYS.reduce((o, k) => { o[k] = logged.reduce((s, t) => s + t[k], 0) / logged.length; return o; }, {}) : ZERO();
    const max = Math.max(g.kcal * 1.25, ...totals.map((t) => t.kcal));
    const mk = avg.p * 4 + avg.c * 4 + avg.f * 9 || 1;
    const onTarget = logged.filter((t) => Math.abs(t.kcal - g.kcal) <= g.kcal * 0.1).length;

    const top = {};
    week.forEach((d) => entriesOf(d).forEach((e) => { top[e.name] = (top[e.name] || 0) + nutr(e).kcal; }));
    const topList = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const w = S().weights;
    const wDays = Object.keys(w).sort();
    const last = wDays.slice(-30);
    const prof = S().goals.profile;
    const curW = wDays.length ? w[wDays[wDays.length - 1]] : null;
    const bmi = curW && prof && prof.height ? curW / Math.pow(prof.height / 100, 2) : null;
    let spark = '';
    if (last.length >= 2) {
      const vals = last.map((d) => w[d]);
      const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
      const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * 300},${70 - ((v - lo) / span) * 60}`).join(' ');
      spark = `<svg class="spark" viewBox="-6 0 312 80" preserveAspectRatio="none"><polyline points="${pts}"/></svg>
        <div class="row spark-lbl"><span>${fmtDay(last[0])}</span><span>${fmtDay(last[last.length - 1])}</span></div>`;
    }

    return `
      <div class="card">
        <h3>קלוריות ב־7 הימים האחרונים</h3>
        <div class="kbars">
          <div class="goal-line" style="bottom:${17 + (g.kcal / max) * 118}px"><span>יעד ${g.kcal.toLocaleString('he-IL')}</span></div>
          ${week.map((d, i) => { const v = totals[i].kcal; return `<div class="kcol">
            <span class="v">${v ? Math.round(v) : ''}</span>
            <div class="kbar ${v > g.kcal * 1.1 ? 'over' : v ? 'ok' : ''}" style="height:${(v / max) * 118}px"></div>
            <span class="d">${DAYS[parseDay(d).getDay()]}</span></div>`; }).join('')}
        </div>
      </div>

      <div class="card">
        <h3>ממוצע יומי (בימים עם רישום)</h3>
        <div class="stat-tiles">
          <div><strong>${Math.round(avg.kcal).toLocaleString('he-IL')}</strong><span>קק״ל</span></div>
          <div><strong>${Math.round(avg.p)}</strong><span>ג׳ חלבון</span></div>
          <div><strong>${Math.round(avg.c)}</strong><span>ג׳ פחמימות</span></div>
          <div><strong>${Math.round(avg.f)}</strong><span>ג׳ שומן</span></div>
        </div>
        <div class="split big"><span class="sp p" style="width:${((avg.p * 4) / mk) * 100}%"></span><span class="sp c" style="width:${((avg.c * 4) / mk) * 100}%"></span><span class="sp f" style="width:${((avg.f * 9) / mk) * 100}%"></span></div>
        <div class="legend"><span class="p">חלבון ${P(Math.round(((avg.p * 4) / mk) * 100))}</span><span class="c">פחמימות ${P(Math.round(((avg.c * 4) / mk) * 100))}</span><span class="f">שומן ${P(Math.round(((avg.f * 9) / mk) * 100))}</span></div>
        <div class="stat-tiles" style="margin-top:12px">
          <div><strong>${logged.length}/7</strong><span>ימים עם רישום</span></div>
          <div><strong>${onTarget}</strong><span>ימים ביעד (±<span dir="ltr">10%</span>)</span></div>
          <div><strong>🔥 ${streakDays()}</strong><span>ימי רישום ברצף</span></div>
        </div>
      </div>

      ${topList.length ? `<div class="card"><h3>המאכלים שתרמו הכי הרבה קלוריות השבוע</h3>
        <ul class="list">${topList.map(([n, k]) => `<li><span class="grow title">${esc(n)}</span><span class="kcal">${Math.round(k).toLocaleString('he-IL')} קק״ל</span></li>`).join('')}</ul></div>` : ''}

      <div class="card">
        <h3>⚖️ משקל</h3>
        <form id="weightForm" class="row">
          <input type="number" name="kg" step="0.1" min="20" max="400" placeholder="משקל היום (ק״ג)" value="${w[today] || ''}" inputmode="decimal" required>
          <button class="btn" style="flex:0 0 auto">שמירה</button>
        </form>
        ${wDays.length ? `<div class="stat-tiles" style="margin-top:12px">
          <div><strong>${fmt('p', curW)}</strong><span>ק״ג נוכחי</span></div>
          <div><strong>${wDays.length > 1 ? (curW - w[wDays[0]] > 0 ? '+' : '') + fmt('p', curW - w[wDays[0]]) : '—'}</strong><span>שינוי מההתחלה</span></div>
          ${bmi ? `<div><strong>${r1(bmi)}</strong><span>BMI</span></div>` : ''}
        </div>${spark}
        <ul class="list">${wDays.slice(-6).reverse().map((d) => `<li><span class="grow">${fmtDay(d)}</span><strong>${fmt('p', w[d])} ק״ג</strong><button class="del" data-cact="del-weight" data-d="${d}" aria-label="מחיקה">✕</button></li>`).join('')}</ul>`
        : '<p class="muted tiny">שקילה קבועה (למשל פעם בשבוע בבוקר) עוזרת לראות אם היעד הקלורי מתאים.</p>'}
      </div>`;
  }
  function bindStats() {
    $('#weightForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = parseFloat(e.target.kg.value);
      if (!(v > 0)) return;
      S().weights[dayKey()] = r1(v);
      save(); rerender(); toast('המשקל נשמר ⚖️');
    });
  }

  // ---------- Goals tab ----------
  function tdee(p) {
    if (!p || !p.age || !p.height || !p.weight) return null;
    const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'f' ? -161 : 5);
    const t = bmr * p.activity;
    const floor = p.sex === 'f' ? 1200 : 1500;
    const rec = Math.max(floor, Math.round((t + p.target) / 10) * 10);
    return { bmr: Math.round(bmr), tdee: Math.round(t), rec, floored: t + p.target < floor };
  }
  function renderGoals() {
    const G = S().goals;
    const g = goals();
    const wDays = Object.keys(S().weights).sort();
    const p = Object.assign({ sex: 'm', age: '', height: '', weight: wDays.length ? S().weights[wDays[wDays.length - 1]] : '', activity: 1.375, target: 0 }, G.profile || {});
    const res = tdee(p);
    return `
      <div class="card">
        <h3>🎯 היעדים היומיים שלי</h3>
        <form id="goalsForm">
          <label class="field"><span>קלוריות ליום</span><input name="kcal" type="number" min="800" max="6000" step="10" value="${G.kcal}" inputmode="numeric" required></label>
          <div class="section-label">חלוקת אבות מזון (% מהקלוריות)</div>
          <div class="chips-scroll">${PRESETS.map(([n, a, b, c]) => `<button type="button" class="chip ${G.pPct === a && G.cPct === b && G.fPct === c ? 'on' : ''}" data-cact="preset" data-p="${a}" data-c="${b}" data-f="${c}">${n} ${a}/${b}/${c}</button>`).join('')}</div>
          <div class="grid3">
            <label class="field p"><span>חלבון %</span><input name="pPct" type="number" min="5" max="70" value="${G.pPct}" inputmode="numeric"></label>
            <label class="field c"><span>פחמימות %</span><input name="cPct" type="number" min="0" max="80" value="${G.cPct}" inputmode="numeric"></label>
            <label class="field f"><span>שומן %</span><input name="fPct" type="number" min="5" max="80" value="${G.fPct}" inputmode="numeric"></label>
          </div>
          <div id="pctInfo" class="muted tiny"></div>
          <div class="section-label">מגבלות ויעדים נוספים</div>
          <div class="grid3">
            <label class="field"><span>סיבים (ג׳)</span><input name="fib" type="number" min="0" max="100" value="${G.fib}" inputmode="numeric"></label>
            <label class="field"><span>סוכר מקס׳ (ג׳)</span><input name="sug" type="number" min="0" max="300" value="${G.sug}" inputmode="numeric"></label>
            <label class="field"><span>נתרן מקס׳ (מ״ג)</span><input name="na" type="number" min="0" max="10000" step="100" value="${G.na}" inputmode="numeric"></label>
          </div>
          <button class="btn" style="width:100%;margin-top:12px">שמירת יעדים</button>
        </form>
        <p class="muted tiny">כרגע: חלבון ${g.p} ג׳ · פחמימות ${g.c} ג׳ · שומן ${g.f} ג׳ ביום.</p>
      </div>

      <div class="card">
        <h3>🧮 מחשבון יעד אישי</h3>
        <form id="profileForm" class="grid2">
          <label class="field"><span>מין</span><select name="sex"><option value="m" ${p.sex === 'm' ? 'selected' : ''}>זכר</option><option value="f" ${p.sex === 'f' ? 'selected' : ''}>נקבה</option></select></label>
          <label class="field"><span>גיל</span><input name="age" type="number" min="12" max="100" value="${p.age}" inputmode="numeric" required></label>
          <label class="field"><span>גובה (ס״מ)</span><input name="height" type="number" min="100" max="250" value="${p.height}" inputmode="numeric" required></label>
          <label class="field"><span>משקל (ק״ג)</span><input name="weight" type="number" step="0.1" min="30" max="400" value="${p.weight}" inputmode="decimal" required></label>
          <label class="field span2"><span>רמת פעילות</span><select name="activity">${ACTIVITY.map(([v, l]) => `<option value="${v}" ${+p.activity === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field span2"><span>מטרה</span><select name="target">${TARGETS.map(([v, l]) => `<option value="${v}" ${+p.target === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <button class="btn ghost span2">חישוב</button>
        </form>
        ${res ? `<div class="calc-out">
          <div><span>חילוף חומרים במנוחה (BMR)</span><strong>${res.bmr.toLocaleString('he-IL')}</strong></div>
          <div><span>הוצאה יומית משוערת (TDEE)</span><strong>${res.tdee.toLocaleString('he-IL')}</strong></div>
          <div class="rec"><span>יעד מומלץ</span><strong>${res.rec.toLocaleString('he-IL')} קק״ל</strong></div>
          ${res.floored ? '<p class="muted tiny">היעד הועלה למינימום בטוח. לירידה מהירה יותר כדאי להתייעץ עם דיאטנ/ית.</p>' : ''}
          <button class="btn" data-cact="apply-rec" data-v="${res.rec}" style="width:100%;margin-top:8px">הגדרה כיעד היומי</button>
        </div>` : '<p class="muted tiny">מלאו את הפרטים כדי לקבל המלצה לפי נוסחת Mifflin-St Jeor.</p>'}
      </div>`;
  }
  function bindGoals() {
    const pf = $('#profileForm');
    pf.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      S().goals.profile = { sex: f.sex.value, age: +f.age.value, height: +f.height.value, weight: +f.weight.value, activity: +f.activity.value, target: +f.target.value };
      save(); refresh();
    });
    const gf = $('#goalsForm');
    const info = () => {
      const k = +gf.kcal.value || 0, a = +gf.pPct.value || 0, b = +gf.cPct.value || 0, c = +gf.fPct.value || 0;
      const s = a + b + c;
      $('#pctInfo').innerHTML = `${s === 100 ? '✅' : '⚠️'} סה״כ ${P(s)} · חלבון ${Math.round((k * a) / 400)} ג׳ · פחמימות ${Math.round((k * b) / 400)} ג׳ · שומן ${Math.round((k * c) / 900)} ג׳`;
      $('#pctInfo').style.color = s === 100 ? '' : 'var(--danger)';
    };
    gf.addEventListener('input', info);
    info();
    gf.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      const a = +f.pPct.value, b = +f.cPct.value, c = +f.fPct.value;
      if (a + b + c !== 100) { toast('סכום האחוזים צריך להיות 100%'); return; }
      Object.assign(S().goals, { kcal: +f.kcal.value, pPct: a, cPct: b, fPct: c, fib: +f.fib.value, sug: +f.sug.value, na: +f.na.value });
      save(); refresh(); toast('היעדים נשמרו 🎯');
    });
  }

  // ---------- Sheet (add / edit / custom food) ----------
  function ensureSheet() {
    let el = $('#calSheet');
    if (!el) {
      el = document.createElement('div');
      el.id = 'calSheet';
      el.className = 'sheet-wrap';
      el.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"></div>';
      document.body.appendChild(el);
      el.addEventListener('click', (e) => { if (e.target === el) closeSheet(); else onAction(e); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheet) closeSheet(); });
    }
    return el;
  }
  function openSheet(s) {
    sheet = s;
    const el = ensureSheet();
    el.classList.add('open');
    document.body.classList.add('no-scroll');
    drawSheet();
  }
  function closeSheet() {
    sheet = null;
    const el = $('#calSheet');
    if (el) el.classList.remove('open');
    document.body.classList.remove('no-scroll');
  }
  const mealChips = (cur) => `<div class="chips-scroll">${MEALS.map(({ k, e }) => `<button type="button" class="chip ${cur === k ? 'on' : ''}" data-cact="sheet-meal" data-meal="${k}">${e} ${k}</button>`).join('')}</div>`;

  function drawSheet() {
    const box = $('#calSheet .sheet');
    if (!sheet) return;
    if (sheet.mode === 'search') {
      box.innerHTML = `
        <div class="sheet-head"><strong>הוספה ל${esc(sheet.meal)} · ${fmtDay(day)}</strong><button class="icon-btn" data-cact="close-sheet" aria-label="סגירה">✕</button></div>
        ${mealChips(sheet.meal)}
        <input type="search" id="sheetSearch" placeholder="🔍 מה אכלת?" value="${esc(sheet.q || '')}" autocomplete="off">
        ${catChips(sheet.cat, 'sheet-cat')}
        <div id="sheetResults" class="sheet-body">${sheetResults()}</div>
        <div class="sheet-foot row">
          <button class="btn ghost small" data-cact="new-custom">✏️ מאכל חדש</button>
          <button class="btn ghost small" data-cact="quick-add">⚡ הוספה מהירה</button>
        </div>`;
      const inp = $('#sheetSearch');
      inp.addEventListener('input', (e) => { sheet.q = e.target.value; $('#sheetResults').innerHTML = sheetResults(); });
      if (!sheet.noFocus && window.matchMedia('(pointer:fine)').matches) inp.focus();
    } else if (sheet.mode === 'settings') {
      const body = box.querySelector('.sheet-body');
      const top = body ? body.scrollTop : 0;
      box.innerHTML = `
        <div class="sheet-head"><strong>⚙️ הגדרות קלוריות</strong><button class="icon-btn" data-cact="close-sheet" aria-label="סגירה">✕</button></div>
        <div class="sheet-body settings">${renderGoals()}</div>`;
      bindGoals();
      box.querySelector('.sheet-body').scrollTop = top;
    } else if (sheet.mode === 'food') {
      drawFood(box);
    } else if (sheet.mode === 'custom') {
      drawCustom(box);
    } else if (sheet.mode === 'quick') {
      box.innerHTML = `
        <div class="sheet-head"><button class="icon-btn" data-cact="back-search" aria-label="חזרה">→</button><strong>⚡ הוספה מהירה</strong><button class="icon-btn" data-cact="close-sheet" aria-label="סגירה">✕</button></div>
        ${mealChips(sheet.meal)}
        <form id="quickForm" class="sheet-body">
          <label class="field"><span>שם (לא חובה)</span><input name="name" maxlength="60" placeholder="למשל: ארוחה במסעדה"></label>
          <div class="grid2" style="margin-top:8px">
            <label class="field"><span>קלוריות *</span><input name="kcal" type="number" min="0" max="10000" required inputmode="numeric"></label>
            <label class="field"><span>חלבון (ג׳)</span><input name="p" type="number" min="0" step="0.1" inputmode="decimal"></label>
            <label class="field"><span>פחמימות (ג׳)</span><input name="c" type="number" min="0" step="0.1" inputmode="decimal"></label>
            <label class="field"><span>שומן (ג׳)</span><input name="f" type="number" min="0" step="0.1" inputmode="decimal"></label>
          </div>
          <button class="btn" style="width:100%;margin-top:12px">הוספה ליומן</button>
        </form>`;
      $('#quickForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const f = e.target;
        const n = Object.assign(ZERO(), { kcal: +f.kcal.value || 0, p: +f.p.value || 0, c: +f.c.value || 0, f: +f.f.value || 0 });
        S().foods.push({ id: uid(), day, meal: sheet.meal, name: f.name.value.trim() || 'הוספה מהירה', n });
        save(); closeSheet(); rerender(); toast(`נוסף: ${n.kcal} קק״ל`);
      });
    }
  }
  function sheetResults() {
    const q = sheet.q || '', cat = sheet.cat || '';
    if (!q && !cat) {
      const fav = S().favorites.map(findFood).filter(Boolean);
      const rec = recentFoods();
      let html = '';
      if (fav.length) html += `<div class="section-label">⭐ מועדפים</div><ul class="list">${fav.map((f) => foodRow(f)).join('')}</ul>`;
      if (rec.length) html += `<div class="section-label">🕘 נוספו לאחרונה</div><ul class="list">${rec.map((f) => foodRow(f)).join('')}</ul>`;
      if (!html) html = '<p class="empty">התחילו להקליד שם של מאכל, או בחרו קטגוריה 👆</p>';
      return html;
    }
    const list = filterCat(searchFoods(q, cat === 'mine' ? '' : cat), cat);
    return list.length ? `<ul class="list">${list.slice(0, 80).map((f) => foodRow(f)).join('')}</ul>`
      : `<p class="empty">לא נמצא "${esc(q)}".<br><button class="btn ghost small" style="margin-top:8px" data-cact="new-custom">✏️ להוסיף אותו למאגר</button></p>`;
  }

  function foodGrams() {
    const f = findFood(sheet.foodId);
    const u = sheet.unit === 'גרם' ? null : (f.units || []).find((x) => x[0] === sheet.unit);
    return u ? u[1] * sheet.qty : sheet.qty;
  }
  function nutritionPanel(n) {
    const mk = n.p * 4 + n.c * 4 + n.f * 9 || 1;
    const pct = (x) => Math.round((x / mk) * 100);
    const g = goals();
    return `
      <div class="np-kcal"><strong>${Math.round(n.kcal).toLocaleString('he-IL')}</strong> קק״ל <span class="muted">· ${P(Math.round((n.kcal / g.kcal) * 100))} מהיעד היומי</span></div>
      <div class="split big"><span class="sp p" style="width:${pct(n.p * 4)}%"></span><span class="sp c" style="width:${pct(n.c * 4)}%"></span><span class="sp f" style="width:${pct(n.f * 9)}%"></span></div>
      <div class="np-grid">
        <div class="p"><strong>${fmt('p', n.p)} ג׳</strong><span>חלבון</span></div>
        <div class="c"><strong>${fmt('c', n.c)} ג׳</strong><span>פחמימות</span></div>
        <div class="f"><strong>${fmt('f', n.f)} ג׳</strong><span>שומן</span></div>
      </div>
      <table class="np-table">
        <tr><td>סיבים תזונתיים</td><td>${fmt('fib', n.fib)} ג׳</td></tr>
        <tr><td>מתוכן סוכרים</td><td>${fmt('sug', n.sug)} ג׳</td></tr>
        <tr><td>נתרן</td><td>${fmt('na', n.na)} מ״ג</td></tr>
      </table>`;
  }
  function drawFood(box) {
    const f = findFood(sheet.foodId);
    if (!f) { closeSheet(); return; }
    const units = [['גרם', 1]].concat(f.units || []);
    const isG = sheet.unit === 'גרם';
    const fav = S().favorites.includes(f.id);
    const quick = isG ? [50, 100, 150, 200] : [0.5, 1, 1.5, 2];
    box.innerHTML = `
      <div class="sheet-head">
        ${sheet.entryId || sheet.fromFoods ? '' : '<button class="icon-btn" data-cact="back-search" aria-label="חזרה">→</button>'}
        <strong class="grow">${esc(f.name)}</strong>
        <button class="icon-btn star ${fav ? 'on' : ''}" data-cact="fav" aria-label="מועדף">${fav ? '★' : '☆'}</button>
        <button class="icon-btn" data-cact="close-sheet" aria-label="סגירה">✕</button>
      </div>
      <div class="sheet-body">
        <div class="muted tiny">${esc(CATS[f.cat] || '')}${f.custom ? ' · מאכל שלי' : ''}</div>
        <div class="amount row">
          <label class="field"><span>כמות</span><input id="fQty" type="number" min="0" step="${isG ? 1 : 0.25}" value="${sheet.qty}" inputmode="decimal"></label>
          <label class="field"><span>יחידה</span><select id="fUnit">${units.map(([l, gr]) => `<option value="${esc(l)}" ${l === sheet.unit ? 'selected' : ''}>${esc(l)}${l === 'גרם' ? '' : ` (${gr} ג׳)`}</option>`).join('')}</select></label>
        </div>
        <div class="chips-scroll">${quick.map((q) => `<button type="button" class="chip ${+sheet.qty === q ? 'on' : ''}" data-cact="qty" data-q="${q}">${isG ? q + ' ג׳' : q}</button>`).join('')}</div>
        <div id="fPanel" class="np">${nutritionPanel(calc(f, foodGrams()))}</div>
        <div class="section-label">לאיזו ארוחה?</div>
        ${mealChips(sheet.meal)}
        <details class="per100"><summary>ערכים ל־100 ג׳</summary>
          <div class="muted tiny">${Math.round(f.n.kcal)} קק״ל · חלבון ${fmt('p', f.n.p)} · פחמימות ${fmt('c', f.n.c)} · שומן ${fmt('f', f.n.f)} · סיבים ${fmt('fib', f.n.fib)} · סוכר ${fmt('sug', f.n.sug)} ג׳ · נתרן ${fmt('na', f.n.na)} מ״ג</div>
          ${f.custom ? `<div class="row" style="margin-top:8px"><button class="btn ghost small" data-cact="edit-custom" data-id="${f.id}">✏️ עריכת המאכל</button><button class="btn ghost small danger" data-cact="del-custom" data-id="${f.id}">🗑️ מחיקה מהמאגר</button></div>` : ''}
        </details>
      </div>
      <div class="sheet-foot row">
        ${sheet.entryId ? '<button class="btn ghost danger" data-cact="sheet-del-entry" style="flex:0 0 auto">מחיקה</button>' : ''}
        <button class="btn" data-cact="save-food">${sheet.entryId ? 'שמירת שינויים' : `הוספה ל${esc(sheet.meal)}`}</button>
      </div>`;
    const upd = () => { $('#fPanel').innerHTML = nutritionPanel(calc(f, foodGrams())); };
    $('#fQty').addEventListener('input', (e) => { sheet.qty = Math.max(0, parseFloat(e.target.value) || 0); upd(); });
    $('#fUnit').addEventListener('change', (e) => {
      const was = sheet.unit; sheet.unit = e.target.value;
      if (was === 'גרם' && sheet.unit !== 'גרם') sheet.qty = 1;
      else if (sheet.unit === 'גרם' && was !== 'גרם') sheet.qty = Math.round(foodGramsFor(f, was, sheet.qty));
      drawSheet();
    });
  }
  const foodGramsFor = (f, unit, qty) => { const u = (f.units || []).find((x) => x[0] === unit); return u ? u[1] * qty : qty; };

  function drawCustom(box) {
    const ed = sheet.editId ? findFood(sheet.editId) : null;
    const n = ed ? ed.n : {};
    const u = ed && ed.units && ed.units[0];
    const v = (k) => (ed ? r1(n[k]) : '');
    box.innerHTML = `
      <div class="sheet-head">${sheet.back ? '<button class="icon-btn" data-cact="back-search" aria-label="חזרה">→</button>' : ''}<strong class="grow">${ed ? 'עריכת מאכל' : '✏️ מאכל חדש למאגר'}</strong><button class="icon-btn" data-cact="close-sheet" aria-label="סגירה">✕</button></div>
      <form id="customForm" class="sheet-body">
        <label class="field"><span>שם המאכל *</span><input name="name" required maxlength="60" value="${ed ? esc(ed.name) : esc(sheet.q || '')}"></label>
        <label class="field" style="margin-top:8px"><span>קטגוריה</span><select name="cat">${Object.entries(CATS).map(([k, l]) => `<option value="${k}" ${ed && ed.cat === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <div class="section-label">הערכים התזונתיים (מהתווית) הם ל־</div>
        <div class="row">
          <label class="field"><span>כמות בגרם</span><input name="basis" type="number" min="1" max="2000" value="100" inputmode="numeric" required></label>
        </div>
        <div class="grid2" style="margin-top:8px">
          <label class="field"><span>קלוריות *</span><input name="kcal" type="number" min="0" step="0.1" required value="${v('kcal')}" inputmode="decimal"></label>
          <label class="field p"><span>חלבון (ג׳)</span><input name="p" type="number" min="0" step="0.1" value="${v('p')}" inputmode="decimal"></label>
          <label class="field c"><span>פחמימות (ג׳)</span><input name="c" type="number" min="0" step="0.1" value="${v('c')}" inputmode="decimal"></label>
          <label class="field f"><span>שומן (ג׳)</span><input name="f" type="number" min="0" step="0.1" value="${v('f')}" inputmode="decimal"></label>
          <label class="field"><span>סיבים (ג׳)</span><input name="fib" type="number" min="0" step="0.1" value="${v('fib')}" inputmode="decimal"></label>
          <label class="field"><span>סוכרים (ג׳)</span><input name="sug" type="number" min="0" step="0.1" value="${v('sug')}" inputmode="decimal"></label>
          <label class="field"><span>נתרן (מ״ג)</span><input name="na" type="number" min="0" step="1" value="${ed ? Math.round(n.na) : ''}" inputmode="numeric"></label>
        </div>
        <div class="section-label">מנה רגילה (לא חובה)</div>
        <div class="row">
          <label class="field"><span>שם המנה</span><input name="uname" maxlength="20" placeholder="למשל: יחידה, כוס, פרוסה" value="${u ? esc(u[0]) : ''}"></label>
          <label class="field"><span>משקל בגרם</span><input name="ugrams" type="number" min="1" max="2000" value="${u ? u[1] : ''}" inputmode="numeric"></label>
        </div>
        <button class="btn" style="width:100%;margin-top:14px">${ed ? 'שמירה' : 'שמירה במאגר'}</button>
      </form>`;
    $('#customForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      const basis = +f.basis.value || 100;
      const per = (x) => ((+x || 0) * 100) / basis;
      const food = {
        id: ed ? ed.id : 'c_' + uid(), name: f.name.value.trim(), cat: f.cat.value, custom: true,
        n: { kcal: per(f.kcal.value), p: per(f.p.value), c: per(f.c.value), f: per(f.f.value), fib: per(f.fib.value), sug: per(f.sug.value), na: per(f.na.value) },
        units: f.uname.value.trim() && +f.ugrams.value ? [[f.uname.value.trim(), +f.ugrams.value]] : [],
      };
      if (!food.name) return;
      const list = S().customFoods;
      const i = list.findIndex((x) => x.id === food.id);
      if (i >= 0) list[i] = food; else list.unshift(food);
      save();
      toast(ed ? 'המאכל עודכן' : 'המאכל נשמר במאגר ✏️');
      if (sheet.fromFoods && !sheet.back) { closeSheet(); rerender(); return; }
      openFood(food.id, { meal: sheet.meal, fromFoods: sheet.fromFoods });
      rerender();
    });
  }

  function openFood(foodId, opts = {}) {
    const f = findFood(foodId);
    if (!f) return;
    const u = f.units && f.units[0];
    openSheet(Object.assign({ mode: 'food', foodId, meal: opts.meal || guessMeal(), unit: u ? u[0] : 'גרם', qty: u ? 1 : 100, q: sheet && sheet.q, cat: sheet && sheet.cat }, opts));
  }

  // ---------- actions ----------
  function onAction(e) {
    const b = e.target.closest('[data-cact]');
    if (!b) return;
    const id = b.dataset.id;
    const st = S();
    switch (b.dataset.cact) {
      case 'day': day = addDays(day, +b.dataset.d); rerender(); break;
      case 'today': day = dayKey(); rerender(); break;
      case 'open-add': openSheet({ mode: 'search', meal: b.dataset.meal, q: '', cat: '' }); break;
      case 'copy-yesterday': {
        const y = entriesOf(addDays(day, -1)).filter((x) => x.meal === b.dataset.meal);
        y.forEach((x) => st.foods.push(Object.assign({}, x, { id: uid(), day })));
        save(); rerender(); toast(`הועתקו ${y.length} פריטים מאתמול`);
        break;
      }
      case 'del-entry': st.foods = st.foods.filter((x) => x.id !== id); save(); rerender(); break;
      case 'edit-entry': {
        const en = st.foods.find((x) => x.id === id);
        if (en && en.foodId && findFood(en.foodId)) openSheet({ mode: 'food', foodId: en.foodId, entryId: en.id, meal: en.meal, unit: en.unit || 'גרם', qty: en.qty || en.grams });
        else toast('אפשר רק למחוק פריט שנוסף בהוספה מהירה');
        break;
      }
      case 'close-sheet': closeSheet(); break;
      case 'sheet-meal': sheet.meal = b.dataset.meal; sheet.noFocus = true; drawSheet(); break;
      case 'sheet-cat': sheet.cat = b.dataset.cat; sheet.noFocus = true; drawSheet(); break;
      case 'foods-cat': foodsCat = b.dataset.cat; rerender(); break;
      case 'pick-food': openFood(id, { meal: sheet ? sheet.meal : guessMeal() }); break;
      case 'view-food': openFood(id, { meal: guessMeal(), fromFoods: true }); break;
      case 'back-search': openSheet({ mode: 'search', meal: sheet.meal, q: sheet.q || '', cat: sheet.cat || '', noFocus: true }); break;
      case 'qty': sheet.qty = +b.dataset.q; drawSheet(); break;
      case 'fav': {
        const i = st.favorites.indexOf(sheet.foodId);
        if (i >= 0) st.favorites.splice(i, 1); else st.favorites.unshift(sheet.foodId);
        save(); drawSheet();
        break;
      }
      case 'save-food': {
        const f = findFood(sheet.foodId);
        const grams = foodGrams();
        if (!(grams > 0)) { toast('נא להזין כמות'); return; }
        const entry = { foodId: f.id, name: f.name, unit: sheet.unit, qty: sheet.qty, grams: r1(grams), meal: sheet.meal, n: round(calc(f, grams)) };
        if (sheet.entryId) {
          const en = st.foods.find((x) => x.id === sheet.entryId);
          Object.assign(en, entry);
          toast('עודכן');
        } else {
          st.foods.push(Object.assign({ id: uid(), day }, entry));
          toast(`נוסף ל${sheet.meal}: ${f.name} (${entry.n.kcal} קק״ל)`);
        }
        save(); closeSheet(); rerender();
        break;
      }
      case 'sheet-del-entry':
        st.foods = st.foods.filter((x) => x.id !== sheet.entryId); save(); closeSheet(); rerender(); break;
      case 'new-custom': openSheet({ mode: 'custom', meal: sheet ? sheet.meal : guessMeal(), q: sheet ? sheet.q : foodsQ, back: !!sheet, fromFoods: !sheet }); break;
      case 'edit-custom': openSheet({ mode: 'custom', editId: id, meal: sheet.meal, fromFoods: sheet.fromFoods }); break;
      case 'del-custom':
        if (confirm('למחוק את המאכל מהמאגר? (פריטים שכבר ביומן יישארו)')) {
          st.customFoods = st.customFoods.filter((x) => x.id !== id);
          st.favorites = st.favorites.filter((x) => x !== id);
          save(); closeSheet(); rerender();
        }
        break;
      case 'quick-add': openSheet({ mode: 'quick', meal: sheet.meal, q: sheet.q, cat: sheet.cat }); break;
      case 'del-weight': delete st.weights[b.dataset.d]; save(); rerender(); break;
      case 'open-settings': openSheet({ mode: 'settings' }); break;
      case 'apply-rec': st.goals.kcal = +b.dataset.v; save(); refresh(); toast(`היעד היומי עודכן ל־${(+b.dataset.v).toLocaleString('he-IL')} קק״ל`); break;
      case 'preset': {
        const f = $('#goalsForm');
        f.pPct.value = b.dataset.p; f.cPct.value = b.dataset.c; f.fPct.value = b.dataset.f;
        f.querySelectorAll('[data-cact=preset]').forEach((x) => x.classList.toggle('on', x === b));
        f.dispatchEvent(new Event('input'));
        break;
      }
      default: return;
    }
  }
  view.addEventListener('click', onAction);

  const dayTotal = (d) => sum(entriesOf(d)).kcal;
  return { render, homeSummary, close: closeSheet, dayTotal, goal: () => goals().kcal };
};
