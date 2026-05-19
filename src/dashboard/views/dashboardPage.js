import { appShell, esc } from './layout.js';

export function renderDashboard({ user, client, guilds, flash }) {
  const totalUsers = client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0);

  const stats = [
    ['Servidores', client.guilds.cache.size],
    ['Usuarios', totalUsers.toLocaleString('es')],
    ['Ping', `${client.ws.ping}ms`],
    ['Comandos', client.commands.size],
  ];

  const tiles = guilds.length
    ? guilds
        .map((g) => {
          const icon = g.icon
            ? `<img class="icon" src="https://cdn.discordapp.com/icons/${esc(g.id)}/${esc(g.icon)}.png?size=64" alt="">`
            : `<div class="fallback">${esc((g.name || '?').charAt(0).toUpperCase())}</div>`;
          return `<a class="server-tile" href="/server/${esc(g.id)}">
        ${icon}
        <div class="meta"><b>${esc(g.name)}</b><span>Configurar →</span></div>
      </a>`;
        })
        .join('')
    : `<div class="card"><h2>😕 Sin servidores</h2>
       <p class="hint">No eres administrador en ningún servidor donde esté ${esc('Wolf')}.</p>
       <a class="btn" href="/invite">➕ Añadir a un servidor</a></div>`;

  return appShell({
    title: 'Panel',
    user,
    active: 'dashboard',
    flash,
    body: `<div class="page-head">
    <h1>Hola, ${esc(user.global_name || user.username || 'Usuario')} 👋</h1>
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

  <div class="page-head"><h1 style="font-size:20px">🌎 Tus servidores</h1></div>
  <div class="servers">${tiles}</div>`,
  });
}
