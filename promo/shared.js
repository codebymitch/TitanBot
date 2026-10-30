// CHAOS promo videos — timeline driver.
//
// Every animation on the page is a CSS animation that is paused and seeked to an exact time, so a
// frame at time t always looks the same (render.mjs screenshots it frame by frame). Scenes are
// `.scene[data-start][data-end]`; an element inside a scene with `data-at="0.4"` starts its
// animations 0.4s after the scene starts. Anything that needs code (counters, charts) registers a
// hook: `CHAOS.hook(t => ...)`.
//
// Open the HTML file in a browser to preview it in real time. `?invite=discord.gg/xxxx` shows that
// link on the last scene instead of "اللينك في البايو".
(function () {
  const params = new URLSearchParams(location.search);
  const hooks = [];
  const cuts = [];
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const ease = {
    out: x => 1 - Math.pow(1 - clamp(x), 3),
    inOut: x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; },
  };
  const fmt = n => Math.round(n).toLocaleString('en-US');

  function init() {
    document.querySelectorAll('.scene').forEach(sc => {
      const s = +sc.dataset.start, e = +sc.dataset.end;
      cuts.push(s);
      sc.style.setProperty('--len', (e - s) + 's');
      sc.style.animationDelay = s + 's';
      sc.querySelectorAll('[data-at]').forEach(el => {
        const at = s + parseFloat(el.dataset.at);
        const n = getComputedStyle(el).animationName.split(',').length;
        el.style.animationDelay = Array(n).fill(at + 's').join(',');
      });
    });
    const invite = params.get('invite');
    document.querySelectorAll('[data-invite]').forEach(el => {
      if (invite) { el.querySelector('.link').textContent = invite; el.classList.add('has-link'); }
    });
    document.getAnimations().forEach(a => a.pause());
  }

  const flash = () => document.getElementById('flash');
  const stage = () => document.getElementById('stage');

  function renderAt(t) {
    document.getAnimations().forEach(a => { a.currentTime = t * 1000; });
    hooks.forEach(h => h(t));
    // A short flash and camera shake on every cut.
    let f = 0;
    for (const c of cuts) {
      if (c === 0) continue;
      const d = t - c;
      if (d >= -0.05 && d < 0.2) f = Math.max(f, d < 0 ? 1 + d / 0.05 : 1 - d / 0.2);
    }
    flash().style.opacity = (f * 0.5).toFixed(3);
    stage().style.transform = f > 0.02 ? `translate(${(Math.sin(t * 97) * 16 * f).toFixed(1)}px, ${(Math.cos(t * 71) * 12 * f).toFixed(1)}px)` : '';
  }

  // Draws `values` into an <svg> (viewBox 0 0 1000 400) up to progress p (0..1): the line, a soft fill
  // under it and a glowing dot at its head. Returns the value at the head.
  function lineChart(svg, values, p, color) {
    const lo = Math.min(...values), hi = Math.max(...values), pad = (hi - lo) * .15 || 1;
    const x = i => (i / (values.length - 1)) * 1000;
    const y = v => 400 - ((v - lo + pad) / (hi - lo + 2 * pad)) * 400;
    const f = clamp(p) * (values.length - 1), k = Math.floor(f), r = f - k;
    const pts = values.slice(0, k + 1).map((v, i) => [x(i), y(v)]);
    let head = values[k];
    if (k < values.length - 1) { head = values[k] + (values[k + 1] - values[k]) * r; pts.push([x(k + r), y(head)]); }
    const d = pts.map(([a, b], i) => (i ? 'L' : 'M') + a.toFixed(1) + ' ' + b.toFixed(1)).join(' ');
    const [hx, hy] = pts[pts.length - 1];
    svg.innerHTML = `<defs><linearGradient id="g${svg.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".45"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>`
      + [100, 200, 300].map(g => `<line x1="0" x2="1000" y1="${g}" y2="${g}" stroke="rgba(255,255,255,.08)" stroke-width="2"/>`).join('')
      + `<path d="${d} L ${hx.toFixed(1)} 400 L 0 400 Z" fill="url(#g${svg.id})"/>`
      + `<path d="${d}" fill="none" stroke="${color}" stroke-width="9" stroke-linejoin="round" stroke-linecap="round" style="filter:drop-shadow(0 0 14px ${color})"/>`
      + `<circle cx="${hx}" cy="${hy}" r="20" fill="${color}" opacity=".3"/><circle cx="${hx}" cy="${hy}" r="11" fill="#fff"/>`;
    return head;
  }

  window.CHAOS = {
    lineChart,
    hook: fn => hooks.push(fn),
    clamp, ease, fmt,
    // Seconds since `start`, clamped to [0, len] (handy inside hooks).
    local: (t, start, len = Infinity) => clamp(t - start, 0, len),
    renderAt,
    ready: Promise.all([
      document.fonts.load('100px Lalezar', 'ابجد'),
      document.fonts.load('100px Anton', 'CHAOS'),
      document.fonts.load('900 50px Cairo', 'ابجد'),
      document.fonts.load('700 50px Cairo', 'ابجد'),
      document.fonts.load('50px "Noto Color Emoji"', '🔥'),
    ]).catch(() => {}).then(() => document.fonts.ready).then(() => { init(); renderAt(0); }),
  };

  // Live preview when opened by hand (render.mjs passes ?render=1).
  if (!params.has('render')) {
    CHAOS.ready.then(() => {
      const dur = +document.body.dataset.duration;
      const t0 = performance.now();
      const loop = now => { renderAt(((now - t0) / 1000) % dur); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    });
  }
})();
