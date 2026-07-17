(() => {
  'use strict';
  document.documentElement.classList.add('js');

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const state = { ready: false, stats: {} };
  $('#year').textContent = new Date().getFullYear();

  // Keep the RTL command catalogue anchored to the visual viewport.
  const containCommandLayout = () => {
    const shell = $('.commands-section > .shell');
    if (!shell) return;
    shell.style.insetInline = '0';
    shell.style.marginInline = 'auto';
    shell.style.translate = 'none';
    shell.style.transform = 'none';
  };
  containCommandLayout();
  addEventListener('resize', containCommandLayout, { passive: true });

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
    const value = state.stats[entry.target.dataset.counter];
    if (value === undefined || value === null || !Number.isFinite(Number(value))) {
      entry.target.textContent = '—';
    } else {
      count(entry.target, Number(value));
    }
    counterObserver.unobserve(entry.target);
  }), { threshold: .55 });
  $$('[data-counter]').forEach(element => counterObserver.observe(element));

  // Real bot/community values only; graceful offline state on API failure.
  fetch('/api/status', { headers: { accept: 'application/json' } })
    .then(response => response.ok ? response.json() : Promise.reject())
    .then(data => {
      const hasLiveStatus = Boolean(data.updatedAt);
      state.stats = { ...state.stats, ...(data.community || {}) };
      state.ready = true;
      const hasMembers = Number.isFinite(Number(state.stats.members));
      $$('[data-stat="members"]').forEach(element => { element.textContent = hasMembers ? `${number(state.stats.members)}+` : 'קהילה פעילה'; });
      $$('[data-member-copy]').forEach(element => { element.textContent = hasMembers ? `${number(state.stats.members)} חברים בקהילה` : 'קהילה פעילה'; });
      $('#commandCount').textContent = hasLiveStatus ? (data.bot.commands ?? '—') : '—';
      $('#latency').textContent = hasLiveStatus && data.bot.online ? `${data.bot.latency}ms` : '—';
      $('#serverCount').textContent = hasLiveStatus ? (data.bot.servers ?? '—') : '—';
      $('#botStatus').textContent = hasLiveStatus ? (data.bot.online ? 'מחובר עכשיו' : 'לא מחובר') : 'המצב מתעדכן';
      $('.status-chip').classList.toggle('offline', hasLiveStatus && !data.bot.online);
      $('.status-chip').classList.toggle('pending', !hasLiveStatus);
      $('.status-chip').hidden = !hasLiveStatus;
      $('.bot-stats').hidden = !hasLiveStatus;
      if (data.bot.avatar) $('#botAvatar').src = data.bot.avatar;
      $$('[data-counter]').forEach(element => { counterObserver.unobserve(element); counterObserver.observe(element); });
    })
    .catch(() => {
      $('#botStatus').textContent = 'המצב מתעדכן';
      $('.status-chip').classList.remove('offline');
      $('.status-chip').classList.add('pending');
      $('.status-chip').hidden = true;
      $('.bot-stats').hidden = true;
      state.ready = true;
      $$('[data-counter]').forEach(element => { counterObserver.unobserve(element); counterObserver.observe(element); });
    });

  // The hero editing stage is intentionally click-driven so it stays lightweight.
  const stage = $('.editor-stage');
  const stagePlay = $('.stage-play');
  let stageTimer;
  if (stage && stagePlay) stagePlay.addEventListener('click', () => {
    if (stage.classList.contains('is-playing')) {
      stage.classList.remove('is-playing');
      stage.classList.add('is-paused');
      stagePlay.textContent = '▶';
      stagePlay.setAttribute('aria-label', 'המשך אנימציית האתר');
      clearTimeout(stageTimer);
      return;
    }
    if (!stage.classList.contains('is-paused')) {
      stage.classList.remove('film-active');
      stage.classList.remove('film-finished');
      void stage.offsetWidth;
      stage.classList.add('film-active');
    }
    stage.classList.remove('is-paused');
    stage.classList.add('is-playing');
    stagePlay.textContent = '❚❚';
    stagePlay.setAttribute('aria-label', 'השהיית אנימציית האתר');
    stageTimer = setTimeout(() => {
      stage.classList.remove('is-playing');
      stage.classList.remove('film-active');
      stage.classList.add('film-finished');
      stagePlay.textContent = '↻';
      stagePlay.setAttribute('aria-label', 'ניגון חוזר של אנימציית האתר');
    }, 18000);
  });

  // Channel tabs.
  $$('.channel-tabs button').forEach(button => button.addEventListener('click', () => {
    $$('.channel-tabs button').forEach(item => item.classList.toggle('active', item === button));
    $$('.channel-list').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === button.dataset.tab));
  }));

  // Keep the lengthy staff form out of the page flow until requested.
  const staffDialog = $('#staffApplicationDialog');
  $('#openStaffApplication').addEventListener('click', () => staffDialog.showModal());
  $('#closeStaffApplication').addEventListener('click', () => staffDialog.close());
  staffDialog.addEventListener('click', event => {
    if (event.target === staffDialog) staffDialog.close();
  });

  // Large secondary content opens above the page without changing its height.
  $$('[data-open-dialog]').forEach(button => button.addEventListener('click', () => {
    $$('dialog[open]').forEach(dialog => dialog.close());
    $(`#${button.dataset.openDialog}`).showModal();
  }));
  $$('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  $$('.content-dialog').forEach(dialog => dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  }));

  $$('a[href^="#"]').forEach(link => link.addEventListener('click', () => {
    const target = $(link.hash);
    const dialog = target?.querySelector('.content-dialog');
    if (dialog) {
      $$('dialog[open]').forEach(openDialog => openDialog.close());
      dialog.showModal();
    }
  }));

  // Privacy-enhanced tutorials load YouTube only after an explicit click.
  $$('.tutorial-card').forEach(card => {
    const player = $('.tutorial-player', card);
    player.addEventListener('click', event => {
      event.preventDefault();
      if (player.querySelector('iframe')) return;
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube-nocookie.com/embed/${card.dataset.youtube}?autoplay=1&rel=0`;
      iframe.title = player.getAttribute('aria-label');
      iframe.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.allowFullscreen = true;
      player.replaceChildren(iframe);
    }, { once: true });
  });

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
  const commandExpand = $('#commandExpand');
  let commandCategory = 'all';
  let commandsExpanded = false;
  const filterCommands = () => {
    const query = commandSearch.value.trim().toLocaleLowerCase('he');
    let visible = 0;
    let matches = 0;
    const compact = !commandsExpanded && commandCategory === 'all' && !query;
    commandCards.forEach(card => {
      const categoryMatch = commandCategory === 'all' || card.dataset.category === commandCategory;
      const textMatch = !query || `${card.dataset.command} ${card.textContent}`.toLocaleLowerCase('he').includes(query);
      const matchesFilter = categoryMatch && textMatch;
      if (matchesFilter) matches += 1;
      card.hidden = !matchesFilter || (compact && matches > 6);
      if (!card.hidden) visible += 1;
    });
    $('.command-empty').hidden = visible !== 0;
    commandExpand.hidden = commandCategory !== 'all' || Boolean(query) || commandCards.length <= 6;
    commandExpand.setAttribute('aria-expanded', String(commandsExpanded));
    commandExpand.textContent = commandsExpanded ? 'הצגת פחות פקודות ↑' : 'הצגת כל הפקודות ↓';
  };
  commandSearch.addEventListener('input', filterCommands);
  commandExpand.addEventListener('click', () => {
    commandsExpanded = !commandsExpanded;
    filterCommands();
  });
  $$('.command-filters button').forEach(button => button.addEventListener('click', () => {
    commandCategory = button.dataset.commandFilter;
    $$('.command-filters button').forEach(item => {
      const selected = item === button;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    filterCommands();
  }));
  filterCommands();

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
