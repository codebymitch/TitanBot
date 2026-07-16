(() => {
  'use strict';
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = { stats: { members: 0, channels: 0, resources: 0, competitions: 0 } };
  $('#year').textContent = new Date().getFullYear();

  const reveal = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('visible'); reveal.unobserve(entry.target); }
  }), { threshold: .12 });
  $$('.reveal').forEach(element => reveal.observe(element));

  const number = value => new Intl.NumberFormat('he-IL').format(value);
  const count = (element, target) => {
    if (reduced || target < 2) { element.textContent = number(target); return; }
    const started = performance.now(), duration = 900;
    const frame = now => { const progress = Math.min((now - started) / duration, 1); element.textContent = number(Math.round(target * (1 - Math.pow(1 - progress, 3)))); if (progress < 1) requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  };
  const counters = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    count(entry.target, Number(state.stats[entry.target.dataset.counter]) || 0);
    counters.unobserve(entry.target);
  }), { threshold: .55 });
  $$('[data-counter]').forEach(element => counters.observe(element));

  fetch('/api/status', { headers: { accept: 'application/json' } }).then(response => response.ok ? response.json() : Promise.reject()).then(data => {
    state.stats = { ...state.stats, ...(data.community || {}) };
    $$('[data-stat="members"]').forEach(element => { element.textContent = `${number(state.stats.members)}+`; });
    $$('[data-member-copy]').forEach(element => { element.textContent = `${number(state.stats.members)} חברים בקהילה`; });
    $('#commandCount').textContent = data.bot.commands ?? '—';
    $('#latency').textContent = data.bot.online ? `${data.bot.latency}ms` : '—';
    $('#serverCount').textContent = data.bot.servers ?? '—';
    $('#botStatus').textContent = data.bot.online ? 'מחובר עכשיו' : 'לא מחובר';
    $('.status-chip').classList.toggle('offline', !data.bot.online);
    if (data.bot.avatar) $('#botAvatar').src = data.bot.avatar;
    $$('[data-counter]').forEach(element => { if (element.getBoundingClientRect().top < innerHeight) count(element, Number(state.stats[element.dataset.counter]) || 0); });
  }).catch(() => { $('#botStatus').textContent = 'לא מחובר'; $('.status-chip').classList.add('offline'); });

  $$('.channel-tabs button').forEach(button => button.addEventListener('click', () => {
    $$('.channel-tabs button').forEach(item => item.classList.toggle('active', item === button));
    $$('.channel-list').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === button.dataset.tab));
  }));

  const toggle = $('.nav-toggle');
  toggle.addEventListener('click', () => { const open = document.body.classList.toggle('nav-open'); toggle.setAttribute('aria-expanded', open); });
  $$('.site-header nav a').forEach(link => link.addEventListener('click', () => document.body.classList.remove('nav-open')));

  let scrollFrame = 0;
  addEventListener('scroll', () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      const max = document.documentElement.scrollHeight - innerHeight;
      $('.scroll-progress').style.transform = `scaleX(${max ? scrollY / max : 0})`;
      $('.back-top').classList.toggle('show', scrollY > 700);
      scrollFrame = 0;
    });
  }, { passive: true });
  $('.back-top').addEventListener('click', () => scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }));
})();
