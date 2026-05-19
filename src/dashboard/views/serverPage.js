import { appShell, esc } from './layout.js';
import { icon } from './icons.js';
import { csrfField } from '../lib/csrf.js';

const LOG_CATEGORIES = [
  ['moderation', 'Moderación'], ['message', 'Mensajes'], ['member', 'Miembros'],
  ['role', 'Roles'], ['channel', 'Canales'], ['thread', 'Hilos'], ['voice', 'Voz'],
  ['emoji', 'Emojis'], ['sticker', 'Stickers'], ['server', 'Servidor'],
  ['invite', 'Invitaciones'], ['webhook', 'Webhooks'], ['event', 'Eventos'],
  ['integration', 'Integraciones'], ['ticket', 'Tickets'], ['leveling', 'Niveles'],
  ['reactionrole', 'Roles por reacción'], ['giveaway', 'Sorteos'],
];

const SECTIONS = [
  ['general', 'settings', 'General'],
  ['welcome', 'wave', 'Bienvenida'],
  ['logs', 'bell', 'Registros'],
  ['leveling', 'star', 'Niveles'],
  ['birthday', 'gift', 'Cumpleaños'],
  ['moderation', 'gavel', 'Moderación'],
  ['autorole', 'at', 'Auto-rol'],
];

function channelOptions(guild, selectedId, emptyLabel = 'Ninguno') {
  const opts = guild.channels.cache
    .filter((c) => c.type === 0)
    .map((c) => `<option value="${esc(c.id)}" ${c.id === selectedId ? 'selected' : ''}>#${esc(c.name)}</option>`)
    .join('');
  return `<option value="">${esc(emptyLabel)}</option>${opts}`;
}

function roleOptions(guild, selectedId, emptyLabel = 'Ninguno') {
  const opts = guild.roles.cache
    .filter((r) => r.id !== guild.id && !r.managed)
    .sort((a, b) => b.rawPosition - a.rawPosition)
    .map((r) => `<option value="${esc(r.id)}" ${r.id === selectedId ? 'selected' : ''}>@${esc(r.name)}</option>`)
    .join('');
  return `<option value="">${esc(emptyLabel)}</option>${opts}`;
}

function badge(on) {
  return on ? '<span class="badge on">Activado</span>' : '<span class="badge off">Desactivado</span>';
}

function section(key, ic, title, desc, inner) {
  return `<div class="card section" id="${key}">
    <div class="sec-head"><h2>${icon(ic)} ${esc(title)}</h2><p>${esc(desc)}</p></div>
    <div class="divider"></div>
    ${inner}
  </div>`;
}

export function renderServer({ user, guild, config, csrf, flash }) {
  const id = guild.id;
  const f = csrfField(csrf);
  const A = (path) => `/api/server/${esc(id)}/${path}`;

  const lev = config.leveling || {};
  const logsOn = Boolean(config.logs?.enabled);
  const enabledEvents = config.logs?.enabledEvents || {};
  const catChannels = config.logs?.categories || {};
  const welcomeOn = Boolean(config.welcome?.enabled);
  const levOn = lev.enabled !== false;

  const pills = LOG_CATEGORIES.map(([k, label]) => {
    const on = logsOn && enabledEvents[`${k}.*`] !== false;
    return `<div class="pill ${on ? 'on' : 'off'}">
      <form method="POST" action="${A('logs/category')}">${f}
        <input type="hidden" name="category" value="${esc(k)}">
        <input type="hidden" name="enable" value="${on ? '0' : '1'}">
        <button type="submit">${esc(label)} ${on ? '✓' : '✕'}</button>
      </form></div>`;
  }).join('');

  const routingRows = LOG_CATEGORIES.map(
    ([k, label]) => `<div><label class="field">${esc(label)}</label>
      <select name="ch_${esc(k)}">${channelOptions(guild, catChannels[k], 'Usar canal general')}</select></div>`,
  ).join('');

  const general = section('general', 'settings', 'General', 'Idioma y prefijo del bot en este servidor.',
    `<form method="POST" action="${A('general')}">${f}
      <label class="field">Idioma</label>
      <select name="language">
        <option value="es" ${config.language === 'es' ? 'selected' : ''}>Español</option>
        <option value="en" ${config.language === 'en' ? 'selected' : ''}>English</option>
      </select>
      <label class="field">Prefijo (comandos de texto)</label>
      <input type="text" name="prefix" maxlength="5" value="${esc(config.prefix || '!')}">
      <div class="divider"></div>
      <button class="btn-block">Guardar</button>
    </form>`);

  const welcome = section('welcome', 'wave', 'Bienvenida', 'Mensaje cuando entra un miembro nuevo.',
    `<div class="row spread"><span>Estado</span>${badge(welcomeOn)}</div>
    <form method="POST" action="${A('welcome/toggle')}" style="margin-top:10px">${f}
      <button class="btn-block ${welcomeOn ? 'btn-danger' : ''}">${welcomeOn ? 'Desactivar' : 'Activar'}</button>
    </form>
    <form method="POST" action="${A('welcome/save')}">${f}
      <label class="field">Canal</label>
      <select name="channel">${channelOptions(guild, config.welcome?.channel)}</select>
      <label class="field">Mensaje · {user} y {server}</label>
      <input type="text" name="message" maxlength="1500" value="${esc(config.welcome?.message || '')}">
      <div class="divider"></div>
      <button class="btn-block">Guardar bienvenida</button>
    </form>`);

  const logs = section('logs', 'bell', 'Registros (Logs)', 'Audita todo lo que pasa. Canal general + canal por categoría.',
    `<div class="row spread"><span>Estado</span>${badge(logsOn)}</div>
    <div class="row" style="gap:14px;align-items:flex-end;margin-top:10px">
      <form method="POST" action="${A('logs/toggle')}">${f}
        <button class="${logsOn ? 'btn-danger' : ''}">${logsOn ? 'Desactivar' : 'Activar'}</button>
      </form>
      <form method="POST" action="${A('logs/channel')}" style="flex:1;min-width:220px">${f}
        <label class="field">Canal general</label>
        <div class="row"><select name="channel" style="flex:1">${channelOptions(guild, config.logs?.channel)}</select>
        <button>Guardar</button></div>
      </form>
    </div>
    <div class="divider"></div>
    <label class="field">Encender / silenciar categorías</label>
    <div class="pill-grid">${pills}</div>
    <div class="divider"></div>
    <form method="POST" action="${A('logs/category-channels')}">${f}
      <label class="field">Canal por categoría · "Usar canal general" deja la categoría en el canal de arriba</label>
      <div class="grid-2">${routingRows}</div>
      <div class="divider"></div>
      <button class="btn-block">Guardar canales por categoría</button>
    </form>`);

  const leveling = section('leveling', 'star', 'Niveles', 'XP por mensajes y aviso de subida de nivel.',
    `<div class="row spread"><span>Estado</span>${badge(levOn)}</div>
    <form method="POST" action="${A('leveling')}" style="margin-top:10px">${f}
      <label class="field">Sistema de niveles</label>
      <select name="enabled"><option value="1" ${levOn ? 'selected' : ''}>Activado</option><option value="0" ${!levOn ? 'selected' : ''}>Desactivado</option></select>
      <label class="field">Anunciar subida de nivel</label>
      <select name="announce"><option value="1" ${lev.announceLevelUp !== false ? 'selected' : ''}>Sí</option><option value="0" ${lev.announceLevelUp === false ? 'selected' : ''}>No</option></select>
      <label class="field">Canal de anuncios (vacío = mismo canal)</label>
      <select name="channel">${channelOptions(guild, lev.levelUpChannel, 'Mismo canal del mensaje')}</select>
      <div class="grid-2">
        <div><label class="field">XP mín / mensaje</label><input type="number" name="xpmin" min="1" max="500" value="${esc(lev.xpPerMessage?.min ?? 15)}"></div>
        <div><label class="field">XP máx / mensaje</label><input type="number" name="xpmax" min="1" max="500" value="${esc(lev.xpPerMessage?.max ?? 25)}"></div>
        <div><label class="field">Cooldown (seg)</label><input type="number" name="cooldown" min="0" max="3600" value="${esc(lev.xpCooldown ?? 20)}"></div>
        <div><label class="field">Multiplicador</label><input type="number" name="multiplier" min="1" max="10" value="${esc(lev.xpMultiplier ?? 1)}"></div>
      </div>
      <div class="divider"></div>
      <button class="btn-block">Guardar niveles</button>
    </form>`);

  const birthday = section('birthday', 'gift', 'Cumpleaños', 'Canal de anuncios y rol del cumpleañero.',
    `<form method="POST" action="${A('birthday')}">${f}
      <label class="field">Canal de anuncios</label>
      <select name="channel">${channelOptions(guild, config.birthdayChannelId)}</select>
      <label class="field">Rol de cumpleaños</label>
      <select name="role">${roleOptions(guild, config.birthdayRoleId)}</select>
      <div class="divider"></div>
      <button class="btn-block">Guardar cumpleaños</button>
    </form>`);

  const moderation = section('moderation', 'gavel', 'Moderación', 'Roles de staff que pueden usar comandos de moderación.',
    `<form method="POST" action="${A('moderation')}">${f}
      <label class="field">Rol de moderador</label>
      <select name="modRole">${roleOptions(guild, config.modRole)}</select>
      <label class="field">Rol de administrador</label>
      <select name="adminRole">${roleOptions(guild, config.adminRole)}</select>
      <div class="divider"></div>
      <button class="btn-block">Guardar moderación</button>
    </form>`);

  const autorole = section('autorole', 'at', 'Auto-rol', 'Rol que se asigna automáticamente al entrar.',
    `<form method="POST" action="${A('autorole')}">${f}
      <label class="field">Rol al unirse</label>
      <select name="autoRole">${roleOptions(guild, config.autoRole)}</select>
      <div class="divider"></div>
      <button class="btn-block">Guardar auto-rol</button>
    </form>`);

  const navLinks = SECTIONS.map(
    ([k, ic, label]) => `<a href="#${k}">${icon(ic, 16)} ${esc(label)}</a>`,
  ).join('');

  const iconUrl = guild.iconURL ? guild.iconURL({ size: 64 }) : null;

  const body = `<div class="page-head row" style="gap:14px">
    ${iconUrl ? `<img src="${esc(iconUrl)}" width="50" height="50" style="border-radius:14px">` : ''}
    <div><div class="eyebrow">Configuración</div><h1>${esc(guild.name)}</h1></div>
  </div>
  <div class="settings">
    <nav class="module-nav">${navLinks}</nav>
    <div class="settings-main">
      ${general}${welcome}${logs}${leveling}${birthday}${moderation}${autorole}
    </div>
  </div>`;

  return appShell({ title: guild.name, user, active: 'dashboard', flash, body });
}
