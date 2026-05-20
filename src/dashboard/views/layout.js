import { botConfig } from '../../config/bot.js';
import { isOwner } from '../../services/accessService.js';
import { icon } from './icons.js';

export const BRAND = botConfig.brand?.name || 'Wolf';
export const TAGLINE = botConfig.brand?.tagline || '';
export const LOGO = botConfig.brand?.logoPath || '/assets/logo.png';
export const SUPPORT = botConfig.brand?.supportInvite || '';
const DASH_URL = botConfig.brand?.dashboardUrl || '';

/**
 * Escape untrusted text before putting it in HTML. Guild names,
 * usernames and welcome messages are attacker-controlled.
 */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function head(title) {
  const ogTitle = `${BRAND} — ${TAGLINE.slice(0, 60)}`;
  const ogImg = DASH_URL ? `${DASH_URL.replace(/\/$/, '')}${LOGO}` : LOGO;
  return `<!doctype html><html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0a0b10">
<title>${esc(title)} · ${esc(BRAND)}</title>

<meta name="description" content="${esc(TAGLINE)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(BRAND)}">
<meta property="og:title" content="${esc(ogTitle)}">
<meta property="og:description" content="${esc(TAGLINE)}">
<meta property="og:image" content="${esc(ogImg)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(ogTitle)}">
<meta name="twitter:description" content="${esc(TAGLINE)}">
<meta name="twitter:image" content="${esc(ogImg)}">

<link rel="icon" type="image/png" href="${esc(LOGO)}">
<link rel="apple-touch-icon" href="${esc(LOGO)}">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/style.css">
</head><body>`;
}

export function basePage({ title, body, withFooter = true }) {
  return `${head(title)}${body}${withFooter ? siteFooter() : ''}</body></html>`;
}

/**
 * Brand logo. Uses /assets/logo.png as a background image so when the
 * file is missing the gradient + "W" monogram still shows cleanly.
 */
export function brandMark(size = 38) {
  return `<span class="logo" style="width:${size}px;height:${size}px;background-image:url('${esc(LOGO)}');background-size:cover;background-position:center">W</span>`;
}

function flashBlock(flash) {
  if (!flash || !flash.msg) return '';
  const kind = flash.type === 'err' ? 'err' : 'ok';
  return `<div class="flash ${kind}">${esc(flash.msg)}</div>`;
}

export function siteFooter() {
  const supportLink = SUPPORT
    ? `<a href="${esc(SUPPORT)}" target="_blank" rel="noopener">Soporte</a>`
    : '';
  return `<footer class="site-foot">
    <div class="foot-row">
      <div class="foot-brand">${brandMark(26)}<span>${esc(BRAND)}</span></div>
      <div class="foot-links">
        <a href="/">Inicio</a>
        <a href="/commands">Comandos</a>
        <a href="/invite">Añadir a un servidor</a>
        ${supportLink}
        <a href="/terms">Términos</a>
        <a href="/privacy">Privacidad</a>
      </div>
    </div>
    <div class="foot-fine">© ${new Date().getFullYear()} ${esc(BRAND)} · Todos los derechos reservados</div>
  </footer>`;
}

/**
 * Authenticated app shell with the sidebar nav.
 */
export function appShell({ title, user, active = '', flash, body }) {
  const avatar = user?.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${esc(user.avatar)}.png?size=64`
    : null;
  const owner = user && isOwner(user.id);

  const navItem = (href, ic, label, key) =>
    `<a class="nav-link ${active === key ? 'active' : ''}" href="${href}">${icon(ic)}<span>${esc(label)}</span></a>`;

  return basePage({
    title,
    body: `<div class="app">
  <aside class="sidebar">
    <div class="brand">${brandMark()}<span>${esc(BRAND)}</span></div>
    <nav class="nav">
      ${navItem('/dashboard', 'grid', 'Servidores', 'dashboard')}
      ${owner ? navItem('/admin', 'shield', 'Panel del dueño', 'admin') : ''}
      ${navItem('/invite', 'plus', 'Añadir a un servidor', 'invite')}
      ${SUPPORT ? `<a class="nav-link" href="${esc(SUPPORT)}" target="_blank" rel="noopener">${icon('link')}<span>Soporte</span></a>` : ''}
    </nav>
    <div class="nav-spacer"></div>
    ${user ? `<div class="nav-user">
      ${avatar ? `<img src="${avatar}" width="30" height="30" alt="">` : `<span class="av-fallback">${esc((user.username || 'U').charAt(0).toUpperCase())}</span>`}
      <div class="nav-user-meta">
        <b>${esc(user.global_name || user.username || 'Usuario')}</b>
        <span>${owner ? 'Dueño del bot' : 'Administrador'}</span>
      </div>
    </div>` : ''}
    <a class="nav-link subtle" href="/logout">${icon('logout')}<span>Cerrar sesión</span></a>
  </aside>
  <main class="content">
    ${flashBlock(flash)}
    ${body}
  </main>
</div>`,
  });
}
