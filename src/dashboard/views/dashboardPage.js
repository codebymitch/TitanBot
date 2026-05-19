import { appShell, esc } from './layout.js';
import { icon } from './icons.js';

export function renderDashboard({ user, client, guilds, flash }) {
  const totalUsers = client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0);

  const stats = [
    ['Servidores', client.guilds.cache.size],
    ['Usuarios', totalUsers.toLocaleString('es')],
    ['Latencia', `${client.ws.ping} ms`],
    ['Comandos', client.commands.size],
  ];

  const tiles = guilds.length
    ? guilds
        .map((g) => {
          const ic = g.icon
            ? `<img class="icon" src="https://cdn.discordapp.com/icons/${esc(g.id)}/${esc(g.icon)}.png?size=64" alt="">`
            : `<div class="fallback">${esc((g.name || '?').charAt(0).toUpperCase())}</div>`;
          return `<a class="server-tile" href="/server/${esc(g.id)}">
        ${ic}
        <div class="meta">
          <b>${esc(g.name)}</b>
          <span>${icon('settings', 13)} Configurar</span>
        </div>
      </a>`;
        })
        .join('')
    : `<div class="card">
        <h2>${icon('server')} Sin servidores</h2>
        <p class="hint">No eres administrador en ningún servidor donde esté ${esc('Wolf')}.</p>
        <a class="btn" href="/invite">${icon('plus', 16)} Añadir a un servidor</a>
      </div>`;

  const body = `<div class="page-head">
    <div class="eyebrow">Panel</div>
    <h1>Hola, ${esc(user.global_name || user.username || 'Usuario')}</h1>
    <p>Elige un servidor para configurarlo.</p>
  </div>

  <div class="stat-grid">
    ${stats
      .map(
        ([label, value]) => `<div class="stat">
      <div class="label">${esc(label)}</div>
      <div class="value">${esc(value)}</div>
    </div>`,
      )
      .join('')}
  </div>

  <div class="page-head" style="margin-bottom:16px">
    <h1 style="font-size:18px">Tus servidores</h1>
  </div>
  <div class="servers">${tiles}</div>`;

  return appShell({ title: 'Panel', user, active: 'dashboard', flash, body });
}
