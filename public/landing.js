(() => {
  'use strict';
  document.documentElement.classList.add('js');

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const state = { ready: false, stats: { members: 0, channels: 0, resources: 0, competitions: 0 } };
  $('#year').textContent = new Date().getFullYear();

  // One-time section reveals and staggered groups.
  $$('.bento-card, .bot-tools span, .bot-stats div, .public-command-grid article').forEach((item, index) => {
    item.classList.add('stagger-item');
    item.style.setProperty('--stagger', `${(index % 8) * 55}ms`);
  });
  const revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('visible');
    if (entry.target.classList.contains('stagger-item')) entry.target.classList.add('stagger-visible');
    entry.target.querySelectorAll?.('.stagger-item').forEach(item => item.classList.add('stagger-visible'));
    revealObserver.unobserve(entry.target);
  }), { threshold: .12, rootMargin: '0px 0px -30px' });
  $$('.reveal, .bento, .bot-copy, .public-command-grid').forEach(element => revealObserver.observe(element));

  const number = value => new Intl.NumberFormat('he-IL').format(value);
  const count = (element, target) => {
    if (reduced || target < 2) { element.textContent = number(target); return; }
    const started = performance.now();
    const frame = now => {
      const progress = Math.min((now - started) / 900, 1);
      element.textContent = number(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1 && !document.hidden) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };
  const counterObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting || !state.ready) return;
    count(entry.target, Number(state.stats[entry.target.dataset.counter]) || 0);
    counterObserver.unobserve(entry.target);
  }), { threshold: .55 });
  $$('[data-counter]').forEach(element => counterObserver.observe(element));

  // Real bot/community values only; graceful offline state on API failure.
  fetch('/api/status', { headers: { accept: 'application/json' } })
    .then(response => response.ok ? response.json() : Promise.reject())
    .then(data => {
      state.stats = { ...state.stats, ...(data.community || {}) };
      state.ready = true;
      $$('[data-stat="members"]').forEach(element => { element.textContent = `${number(state.stats.members)}+`; });
      $$('[data-member-copy]').forEach(element => { element.textContent = `${number(state.stats.members)} חברים בקהילה`; });
      $('#commandCount').textContent = data.bot.commands ?? '—';
      $('#latency').textContent = data.bot.online ? `${data.bot.latency}ms` : '—';
      $('#serverCount').textContent = data.bot.servers ?? '—';
      $('#botStatus').textContent = data.bot.online ? 'מחובר עכשיו' : 'לא מחובר';
      $('.status-chip').classList.toggle('offline', !data.bot.online);
      if (data.bot.avatar) $('#botAvatar').src = data.bot.avatar;
      $$('[data-counter]').forEach(element => { counterObserver.unobserve(element); counterObserver.observe(element); });
    })
    .catch(() => { $('#botStatus').textContent = 'לא מחובר'; $('.status-chip').classList.add('offline'); });

  // Channel tabs.
  $$('.channel-tabs button').forEach(button => button.addEventListener('click', () => {
    $$('.channel-tabs button').forEach(item => item.classList.toggle('active', item === button));
    $$('.channel-list').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === button.dataset.tab));
  }));

  // Staff application submission; Discord DM confirmation completes identity verification.
  const staffForm = $('#staffApplicationForm');
  const staffSubmit = $('button[type="submit"]', staffForm);
  const staffResult = $('#staffApplicationResult');
  fetch('/api/staff-applications/availability', { headers: { accept: 'application/json' } })
    .then(response => response.ok ? response.json() : Promise.reject())
    .then(settings => {
      staffSubmit.disabled = !settings.open;
      staffSubmit.innerHTML = settings.open ? 'שליחת הבקשה <span>←</span>' : 'ההרשמה לצוות סגורה כרגע';
      if (!settings.open) staffResult.textContent = 'בקשות הצוות אינן פתוחות כרגע. נעדכן באתר כשההרשמה תיפתח מחדש.';
    })
    .catch(() => {
      staffSubmit.disabled = true;
      staffSubmit.textContent = 'ההרשמה אינה זמינה כרגע';
      staffResult.textContent = 'לא ניתן לבדוק את מצב ההרשמה כרגע. נסו שוב מאוחר יותר.';
    });
  staffForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('button[type="submit"]', staffForm);
    const result = $('#staffApplicationResult');
    button.disabled = true; result.className = 'application-result'; result.textContent = 'שולחים את הבקשה...';
    try {
      const payload = Object.fromEntries(new FormData(staffForm));
      const response = await fetch('/api/staff-applications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(response.status === 403 ? 'ההרשמה לצוות סגורה כרגע.' : response.status === 429 ? 'ניתן לשלוח בקשה אחת בשעה. נסו שוב מאוחר יותר.' : 'לא ניתן לשלוח את הבקשה. בדקו את הפרטים ונסו שוב.');
      result.classList.add('success'); result.textContent = `הבקשה ${data.id} התקבלה. בדקו את ההודעות הפרטיות שלכם ב־Discord ואשרו אותה.`;
      staffForm.reset();
    } catch (error) { result.classList.add('error'); result.textContent = error.message; }
    finally { button.disabled = false; }
  });

  // Public command directory: client-side category and text filtering.
  const commandSearch = $('#commandSearch');
  const commandCards = $$('.public-command-grid article');
  let commandCategory = 'all';
  const filterCommands = () => {
    const query = commandSearch.value.trim().toLocaleLowerCase('he');
    let visible = 0;
    commandCards.forEach(card => {
      const categoryMatch = commandCategory === 'all' || card.dataset.category === commandCategory;
      const textMatch = !query || `${card.dataset.command} ${card.textContent}`.toLocaleLowerCase('he').includes(query);
      card.hidden = !(categoryMatch && textMatch);
      if (!card.hidden) visible += 1;
    });
    $('.command-empty').hidden = visible !== 0;
  };
  commandSearch.addEventListener('input', filterCommands);
  $$('.command-filters button').forEach(button => button.addEventListener('click', () => {
    commandCategory = button.dataset.commandFilter;
    $$('.command-filters button').forEach(item => {
      const selected = item === button;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    filterCommands();
  }));

  // Accessible RTL mobile navigation.
  const toggle = $('.nav-toggle');
  const closeMenu = () => {
    document.body.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
  };
  toggle.addEventListener('click', () => {
    const open = document.body.classList.toggle('nav-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  $('.menu-backdrop').addEventListener('click', closeMenu);
  $$('.site-header nav a').forEach(link => link.addEventListener('click', closeMenu));
  addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });

  // FAQ: keep one item open while preserving native keyboard behavior.
  $$('.faq-list details').forEach(item => item.addEventListener('toggle', () => {
    if (!item.open) return;
    $$('.faq-list details').forEach(other => { if (other !== item) other.open = false; });
  }));

  // Desktop-only pointer tilt; no idle animation or touch listeners.
  if (finePointer && !reduced) $$('.tilt-card').forEach(card => {
    let pointerFrame = 0;
    card.addEventListener('pointermove', event => {
      if (pointerFrame || document.hidden) return;
      pointerFrame = requestAnimationFrame(() => {
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - .5;
        const y = (event.clientY - rect.top) / rect.height - .5;
        card.style.setProperty('--tilt-x', `${(-y * 3).toFixed(2)}deg`);
        card.style.setProperty('--tilt-y', `${(x * 4).toFixed(2)}deg`);
        card.style.setProperty('--light-x', `${(x + .5) * 100}%`);
        pointerFrame = 0;
      });
    }, { passive: true });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--tilt-x', '0deg');
      card.style.setProperty('--tilt-y', '0deg');
      card.style.setProperty('--light-x', '50%');
    });
  });

  // One requestAnimationFrame loop handles scroll progress, back-to-top and active nav.
  const sections = $$('main section[id]');
  let scrollFrame = 0;
  const updateScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    $('.scroll-progress').style.transform = `scaleX(${max ? scrollY / max : 0})`;
    $('.back-top').classList.toggle('show', scrollY > 700);
    let active = '';
    sections.forEach(section => { if (section.getBoundingClientRect().top <= 170) active = section.id; });
    $$('.site-header nav a').forEach(link => link.classList.toggle('active', link.hash === `#${active}`));
    scrollFrame = 0;
  };
  addEventListener('scroll', () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
  }, { passive: true });
  updateScroll();
  $('.back-top').addEventListener('click', () => scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }));

  // Single subtle desktop cursor glow, paused while the tab is hidden.
  if (finePointer && !reduced) {
    const glow = $('.cursor-glow');
    let glowFrame = 0, x = -100, y = -100;
    addEventListener('pointermove', event => {
      x = event.clientX; y = event.clientY;
      if (glowFrame || document.hidden) return;
      glowFrame = requestAnimationFrame(() => {
        glow.style.transform = `translate3d(${x}px,${y}px,0)`;
        glowFrame = 0;
      });
    }, { passive: true });
  }
})();
