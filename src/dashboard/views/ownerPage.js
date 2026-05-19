import { appShell, esc } from './layout.js';
import { csrfField } from '../lib/csrf.js';

export function renderOwner({ user, client, approved, csrf, flash }) {
  const f = csrfField(csrf);

  const guilds = [...client.guilds.cache.values()].sort(
    (a, b) => (b.memberCount || 0) - (a.memberCount || 0),
  );

  const rows = guilds.length
    ? guilds
        .map((g) => {
          const on = approved.has(g.id);
          const icon = g.icon
            ? `<img class="icon" src="https://cdn.discordapp.com/icons/${esc(g.id)}/${esc(g.icon)}.png?size=64" alt="">`
            : `<div class="fallback">${esc((g.name || '?').charAt(0).toUpperCase())}</div>`;
          const action = on ? 'revoke' : 'grant';
          const btnLabel = on ? 'Revocar' : 'Aprobar';
          const btnClass = on ? 'btn-danger' : '';
          return `<div class="server-tile" style="justify-content:space-between">
            <div class="row" style="gap:14px;min-width:0">
              ${icon}
              <div class="meta">
                <b>${esc(g.name)}</b>
                <span>${esc(g.id)} · ${g.memberCount || 0} miembros</span>
              </div>
            </div>
            <div class="row" style="gap:10px">
              <span class="badge ${on ? 'on' : 'off'}">${on ? '● Activo' : '● Bloqueado'}</span>
              <form method="POST" action="/api/admin/access">
                ${f}
                <input type="hidden" name="guild_id" value="${esc(g.id)}">
                <input type="hidden" name="action" value="${action}">
                <button class="${btnClass}">${btnLabel}</button>
              </form>
            </div>
          </div>`;
        })
        .join('')
    : `<div class="card"><h2>Sin servidores</h2><p class="hint">El bot no está en ningún servidor todavía.</p></div>`;

  const approvedCount = guilds.filter((g) => approved.has(g.id)).length;

  const body = `<div class="page-head">
    <h1>🛡️ Panel del dueño</h1>
    <p>Controla qué servidores pueden usar el bot (acceso permanente hasta que lo revoques).</p>
  </div>

  <div class="stat-grid">
    <div class="stat"><div class="label">Servidores</div><div class="value">${guilds.length}</div></div>
    <div class="stat"><div class="label">Aprobados</div><div class="value">${approvedCount}</div></div>
    <div class="stat"><div class="label">Bloqueados</div><div class="value">${guilds.length - approvedCount}</div></div>
  </div>

  <div class="servers" style="grid-template-columns:1fr">${rows}</div>`;

  return appShell({ title: 'Panel del dueño', user, active: 'admin', flash, body });
}
