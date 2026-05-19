import { botConfig } from '../../config/bot.js';

export const BRAND = botConfig.brand?.name || 'Wolf';
export const TAGLINE = botConfig.brand?.tagline || '';

/**
 * Escape untrusted text before putting it in HTML. Guild names,
 * usernames and welcome messages are attacker-controlled — the old
 * dashboard injected them raw (stored XSS). Everything dynamic must
 * pass through here.
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
  return `<!doctype html><html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0b0d13">
<title>${esc(title)} · ${esc(BRAND)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/style.css">
</head><body>`;
}

export function basePage({ title, body }) {
  return `${head(title)}${body}</body></html>`;
}

function flashBlock(flash) {
  if (!flash || !flash.msg) return '';
  const kind = flash.type === 'err' ? 'err' : 'ok';
  return `<div class="flash ${kind}">${esc(flash.msg)}</div>`;
}

/**
 * Authenticated app shell with the sidebar nav.
 */
export function appShell({ title, user, active = '', flash, body }) {
  const avatar = user?.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${esc(user.avatar)}.png?size=64`
    : null;

  return basePage({
    title,
    body: `<div class="app">
  <aside class="sidebar">
    <div class="brand"><span class="logo">🐺</span> ${esc(BRAND)}</div>
    <a class="nav-link ${active === 'dashboard' ? 'active' : ''}" href="/dashboard">🏠 <span>Panel</span></a>
    <a class="nav-link" href="/invite">➕ <span>Añadir a un servidor</span></a>
    <div class="nav-spacer"></div>
    ${user ? `<div class="nav-link" style="cursor:default">
      ${avatar ? `<img src="${avatar}" width="26" height="26" style="border-radius:50%">` : '👤'}
      <span>${esc(user.global_name || user.username || 'Usuario')}</span>
    </div>` : ''}
    <a class="nav-link" href="/logout">🚪 <span>Cerrar sesión</span></a>
  </aside>
  <main class="content">
    ${flashBlock(flash)}
    ${body}
  </main>
</div>`,
  });
}
