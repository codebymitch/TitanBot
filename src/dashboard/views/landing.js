import { basePage, esc, BRAND, TAGLINE } from './layout.js';

const FEATURES = [
  ['🛡️', 'Moderación', 'Ban, kick, timeout, purge, notas y casos con registro completo.'],
  ['📊', 'Auditoría total', 'Más de 25 eventos: canales, roles, miembros, mensajes y más.'],
  ['💰', 'Economía', 'Tienda, banco, trabajo, apuestas y ranking.'],
  ['📈', 'Niveles', 'XP por actividad con roles automáticos por nivel.'],
  ['🎉', 'Sorteos', 'Sorteos con múltiples ganadores y re-roll.'],
  ['🎫', 'Tickets', 'Soporte con transcripciones, prioridad y claim.'],
];

export function renderLanding({ loggedIn }) {
  const primary = loggedIn
    ? `<a class="btn btn-lg" href="/dashboard">Ir al panel →</a>`
    : `<a class="btn btn-lg" href="/login">Entrar con Discord</a>`;

  return basePage({
    title: 'Inicio',
    body: `<div class="landing">
  <div class="topbar">
    <div class="brand"><span class="logo">🐺</span> ${esc(BRAND)}</div>
    <div class="row">
      <a class="btn btn-ghost" href="/invite">Añadir a Discord</a>
      ${loggedIn
        ? `<a class="btn" href="/dashboard">Panel</a>`
        : `<a class="btn" href="/login">Entrar</a>`}
    </div>
  </div>

  <section class="hero">
    <h1>${esc(BRAND)}</h1>
    <p>${esc(TAGLINE)}</p>
    <div class="cta">
      ${primary}
      <a class="btn btn-ghost btn-lg" href="/invite">➕ Añadir a un servidor</a>
    </div>
  </section>

  <section class="features">
    ${FEATURES.map(
      ([ico, h, p]) => `<div class="feature">
      <div class="ico">${ico}</div>
      <h3>${esc(h)}</h3>
      <p>${esc(p)}</p>
    </div>`,
    ).join('')}
  </section>

  <div class="foot">${esc(BRAND)} · Panel de control · Hecho con ❤️</div>
</div>`,
  });
}
