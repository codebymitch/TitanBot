(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const state = { stats: { members: 0, channels: 0, resources: 0, competitions: 0 } };

  addEventListener('load', () => document.body.classList.add('loaded'), { once: true });
  setTimeout(() => document.body.classList.add('loaded'), 850);
  $('#year').textContent = new Date().getFullYear();

  const revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('visible'); revealObserver.unobserve(entry.target); }
  }), { threshold: .12 });
  $$('.reveal').forEach(element => revealObserver.observe(element));

  const format = value => new Intl.NumberFormat('he-IL').format(value);
  const animateCounter = (element, target) => {
    if (reduced || target <= 0) { element.textContent = format(target); return; }
    const start = performance.now(), duration = 1100;
    const tick = now => {
      const progress = Math.min((now - start) / duration, 1);
      element.textContent = format(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1 && !document.hidden) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const counterObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const key = entry.target.dataset.counter;
    animateCounter(entry.target, Number(state.stats[key]) || 0);
    counterObserver.unobserve(entry.target);
  }), { threshold: .6 });
  $$('[data-counter]').forEach(element => counterObserver.observe(element));

  fetch('/api/public-stats', { headers: { Accept: 'application/json' } }).then(response => response.ok ? response.json() : Promise.reject()).then(data => {
    state.stats = { ...state.stats, ...data.community };
    $$('[data-stat="members"]').forEach(element => { element.textContent = `${format(data.community.members)}+`; });
    $('#commandCount').textContent = data.bot.commands;
    $('#latency').textContent = `${data.bot.latency}ms`;
    $('#serverCount').textContent = data.bot.servers;
    $('#botStatus').textContent = data.bot.online ? 'Online' : 'Offline';
    const avatar = $('#botAvatar'); if (data.bot.avatar) avatar.src = data.bot.avatar;
    $$('[data-counter]').forEach(element => { if (element.getBoundingClientRect().top < innerHeight) animateCounter(element, Number(state.stats[element.dataset.counter]) || 0); });
  }).catch(() => { $('#botStatus').textContent = 'Offline'; });

  let ticking = false;
  const updateScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    $('.progress').style.width = `${max > 0 ? scrollY / max * 100 : 0}%`;
    $('.to-top').classList.toggle('show', scrollY > 600);
    ticking = false;
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(updateScroll); } }, { passive: true });
  $('.to-top').addEventListener('click', () => scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }));
  $('.menu').addEventListener('click', event => { const nav = $('.nav'); nav.classList.toggle('open'); event.currentTarget.setAttribute('aria-expanded', nav.classList.contains('open')); });
  $$('.nav nav a').forEach(link => link.addEventListener('click', () => $('.nav').classList.remove('open')));

  if (!reduced && matchMedia('(pointer:fine)').matches) {
    const glow = $('.cursor-glow'); let mouseX = innerWidth / 2, mouseY = innerHeight / 2, glowX = mouseX, glowY = mouseY;
    addEventListener('pointermove', event => { mouseX = event.clientX; mouseY = event.clientY; }, { passive: true });
    const cursorFrame = () => { glowX += (mouseX - glowX) * .12; glowY += (mouseY - glowY) * .12; glow.style.transform = `translate3d(${glowX - 170}px,${glowY - 170}px,0)`; if (!document.hidden) requestAnimationFrame(cursorFrame); };
    requestAnimationFrame(cursorFrame);
    $$('.parallax').forEach(element => addEventListener('pointermove', event => {
      const depth = Number(element.dataset.depth) || 6;
      element.style.transform = `translate3d(${(event.clientX / innerWidth - .5) * depth}px,${(event.clientY / innerHeight - .5) * depth}px,0)`;
    }, { passive: true }));
    $$('.laptop').forEach(card => {
      card.addEventListener('pointermove', event => { const box = card.getBoundingClientRect(); card.style.transform = `rotateX(${(event.clientY - box.top) / box.height * -4 + 2}deg) rotateY(${(event.clientX - box.left) / box.width * 5 - 2.5}deg)`; }, { passive: true });
      card.addEventListener('pointerleave', () => { card.style.transform = ''; }, { passive: true });
    });
  }
})();
