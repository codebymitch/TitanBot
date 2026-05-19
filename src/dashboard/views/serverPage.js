import { appShell, esc } from './layout.js';
import { csrfField } from '../lib/csrf.js';

const LOG_CATEGORIES = [
  ['moderation', '🔨 Moderación'],
  ['message', '✉️ Mensajes'],
  ['member', '👥 Miembros'],
  ['role', '🏷️ Roles'],
  ['channel', '📁 Canales'],
  ['thread', '🧵 Hilos'],
  ['voice', '🔊 Voz'],
  ['emoji', '😀 Emojis'],
  ['sticker', '🏷️ Stickers'],
  ['server', '⚙️ Servidor'],
  ['invite', '🔗 Invitaciones'],
  ['webhook', '🪝 Webhooks'],
  ['event', '📅 Eventos'],
  ['integration', '🧩 Integraciones'],
  ['ticket', '🎫 Tickets'],
  ['leveling', '📈 Niveles'],
  ['reactionrole', '🎭 Roles por reacción'],
  ['giveaway', '🎁 Sorteos'],
];

function channelOptions(guild, selectedId) {
  const opts = guild.channels.cache
    .filter((c) => c.type === 0)
    .map(
      (c) =>
        `<option value="${esc(c.id)}" ${c.id === selectedId ? 'selected' : ''}>#${esc(c.name)}</option>`,
    )
    .join('');
  return `<option value="">— Ninguno —</option>${opts}`;
}

function badge(on) {
  return on
    ? '<span class="badge on">● Activado</span>'
    : '<span class="badge off">● Desactivado</span>';
}

export function renderServer({ user, guild, config, csrf, flash }) {
  const id = guild.id;
  const f = csrfField(csrf);

  const logsOn = Boolean(config.logs?.enabled);
  const enabledEvents = config.logs?.enabledEvents || {};

  const pills = LOG_CATEGORIES.map(([key, label]) => {
    const on = logsOn && enabledEvents[`${key}.*`] !== false;
    return `<div class="pill ${on ? 'on' : 'off'}">
      <form method="POST" action="/api/server/${esc(id)}/logs/category">
        ${f}
        <input type="hidden" name="category" value="${esc(key)}">
        <input type="hidden" name="enable" value="${on ? '0' : '1'}">
        <button type="submit">${esc(label)} ${on ? '✓' : '✕'}</button>
      </form>
    </div>`;
  }).join('');

  const welcomeOn = Boolean(config.welcome?.enabled);

  const icon = guild.iconURL
    ? guild.iconURL({ size: 64 })
    : null;

  const body = `<div class="page-head row" style="gap:16px">
    ${icon ? `<img src="${esc(icon)}" width="52" height="52" style="border-radius:14px">` : ''}
    <div><h1>${esc(guild.name)}</h1><p>Configuración del servidor</p></div>
  </div>

  <div class="grid">

    <div class="card">
      <h2>🌎 Idioma</h2>
      <p class="hint">Idioma de los mensajes del bot en este servidor.</p>
      <form method="POST" action="/api/server/${esc(id)}/language">
        ${f}
        <select name="language">
          <option value="es" ${config.language === 'es' ? 'selected' : ''}>Español</option>
          <option value="en" ${config.language === 'en' ? 'selected' : ''}>English</option>
        </select>
        <div class="divider"></div>
        <button class="btn-block">Guardar idioma</button>
      </form>
    </div>

    <div class="card">
      <h2>👋 Bienvenida ${badge(welcomeOn)}</h2>
      <p class="hint">Mensaje al entrar un nuevo miembro.</p>
      <form method="POST" action="/api/server/${esc(id)}/welcome/toggle">
        ${f}
        <button class="btn-block ${welcomeOn ? 'btn-danger' : ''}">${welcomeOn ? 'Desactivar' : 'Activar'}</button>
      </form>
      <form method="POST" action="/api/server/${esc(id)}/welcome/channel">
        ${f}
        <label class="field">Canal</label>
        <select name="channel">${channelOptions(guild, config.welcome?.channel)}</select>
        <label class="field">Mensaje · usa {user} y {server}</label>
        <input type="text" name="message" maxlength="1500" value="${esc(config.welcome?.message || '')}">
        <div class="divider"></div>
        <button class="btn-block">Guardar bienvenida</button>
      </form>
    </div>

    <div class="card" style="grid-column:1/-1">
      <h2>📊 Registros (Logs) ${badge(logsOn)}</h2>
      <p class="hint">Audita todo lo que pasa en el servidor. Activa el registro, elige el canal y enciende/apaga categorías.</p>

      <div class="row" style="gap:18px;align-items:flex-end">
        <form method="POST" action="/api/server/${esc(id)}/logs/toggle">
          ${f}
          <button class="${logsOn ? 'btn-danger' : ''}">${logsOn ? 'Desactivar registros' : 'Activar registros'}</button>
        </form>
        <form method="POST" action="/api/server/${esc(id)}/logs/channel" style="flex:1;min-width:240px">
          ${f}
          <label class="field">Canal de registros</label>
          <div class="row">
            <select name="channel" style="flex:1">${channelOptions(guild, config.logs?.channel)}</select>
            <button>Guardar canal</button>
          </div>
        </form>
      </div>

      <div class="divider"></div>
      <label class="field">Categorías ${logsOn ? '' : '· (activa los registros primero)'}</label>
      <div class="pill-grid">${pills}</div>
      <p class="hint" style="margin-top:14px">Verde = se registra · Rojo = silenciado. Cambios al instante.</p>
    </div>

  </div>`;

  return appShell({ title: guild.name, user, active: 'dashboard', flash, body });
}
