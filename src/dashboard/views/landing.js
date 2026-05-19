import { basePage, esc, brandMark, BRAND, TAGLINE } from './layout.js';
import { icon } from './icons.js';

const FEATURES = [
  ['gavel', 'Moderación', 'Ban, kick, timeout, purge, notas y casos con registro completo.'],
  ['bell', 'Auditoría total', 'Más de 25 eventos: canales, roles, miembros, mensajes y más.'],
  ['bolt', 'Economía', 'Tienda, banco, trabajo, apuestas y ranking.'],
  ['star', 'Niveles', 'XP por actividad con roles automáticos por nivel.'],
  ['gift', 'Sorteos', 'Sorteos con múltiples ganadores y re-roll.'],
  ['users', 'Tickets', 'Soporte con transcripciones, prioridad y claim.'],
];

export function renderLanding({ loggedIn }) {
  const primary = loggedIn
    ? `<a class="btn btn-lg" href="/dashboard">Ir al panel</a>`
    : `<a class="btn btn-lg" href="/login">Entrar con Discord</a>`;

  return basePage({
    title: 'Inicio',
    body: `<div class="landing">
  <div class="topbar">
    <div class="brand">${brandMark(34)}<span>${esc(BRAND)}</span></div>
    <div class="row">
      <a class="btn btn-ghost" href="/invite">Añadir a Discord</a>
      ${loggedIn ? `<a class="btn" href="/dashboard">Panel</a>` : `<a class="btn" href="/login">Entrar</a>`}
    </div>
  </div>

  <section class="hero">
    <h1>${esc(BRAND)}</h1>
    <p>${esc(TAGLINE)}</p>
    <div class="cta">
      ${primary}
      <a class="btn btn-ghost btn-lg" href="/invite">Añadir a un servidor</a>
    </div>
  </section>

  <section class="features">
    ${FEATURES.map(
      ([ic, h, p]) => `<div class="feature">
      ${icon(ic, 24)}
      <h3>${esc(h)}</h3>
      <p>${esc(p)}</p>
    </div>`,
    ).join('')}
  </section>

  <div class="foot">${esc(BRAND)} · Panel de control</div>
</div>`,
  });
}
