import { basePage, esc, brandMark, BRAND, SUPPORT } from './layout.js';
import { icon } from './icons.js';

const CATEGORY_LABEL = {
  Birthday: 'Cumpleaños',
  Community: 'Comunidad',
  Core: 'Esencial',
  Economy: 'Economía',
  Fun: 'Diversión',
  Giveaway: 'Sorteos',
  JoinToCreate: 'Voz Dinámica',
  Leveling: 'Niveles',
  Logging: 'Registros',
  Moderation: 'Moderación',
  Music: 'Música',
  Reaction_roles: 'Roles por reacción',
  Search: 'Búsqueda',
  ServerStats: 'Estadísticas',
  Ticket: 'Tickets',
  Tools: 'Herramientas',
  Utility: 'Utilidad',
  Verification: 'Verificación',
  Voice: 'Voz',
  Welcome: 'Bienvenida',
};

const CATEGORY_ICON = {
  Birthday: 'gift', Community: 'users', Core: 'bolt', Economy: 'star',
  Fun: 'bolt', Giveaway: 'gift', JoinToCreate: 'bell', Leveling: 'star',
  Logging: 'bell', Moderation: 'gavel', Music: 'star',
  Reaction_roles: 'check', Search: 'globe', ServerStats: 'grid',
  Ticket: 'users', Tools: 'settings', Utility: 'settings',
  Verification: 'shield', Voice: 'bolt', Welcome: 'wave',
};

const PRIORITY = [
  'Music', 'Moderation', 'Logging', 'Welcome', 'Leveling', 'Economy',
  'Birthday', 'Giveaway', 'Ticket', 'Verification', 'Reaction_roles',
  'JoinToCreate', 'ServerStats', 'Community', 'Utility', 'Tools',
  'Fun', 'Search', 'Voice', 'Core',
];

function subList(commandJson) {
  const subs = (commandJson.options || []).filter((o) => o.type === 1);
  if (subs.length === 0) return '';
  return `<ul class="cmd-subs">${subs
    .map((s) => `<li><code>/${esc(commandJson.name)} ${esc(s.name)}</code> — ${esc(s.description || '')}</li>`)
    .join('')}</ul>`;
}

export function renderCommands({ client }) {
  const byCategory = new Map();
  for (const cmd of client.commands.values()) {
    const category = cmd.category || 'Otros';
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(cmd);
  }

  const orderedCategories = [
    ...PRIORITY.filter((c) => byCategory.has(c)),
    ...[...byCategory.keys()].filter((c) => !PRIORITY.includes(c)).sort(),
  ];

  const total = client.commands.size;

  const navLinks = orderedCategories
    .map((c) => `<a href="#cat-${esc(c)}">${icon(CATEGORY_ICON[c] || 'settings', 14)} ${esc(CATEGORY_LABEL[c] || c)}</a>`)
    .join('');

  const sections = orderedCategories
    .map((cat) => {
      const label = CATEGORY_LABEL[cat] || cat;
      const ic = CATEGORY_ICON[cat] || 'settings';
      const cards = byCategory
        .get(cat)
        .sort((a, b) => a.data.name.localeCompare(b.data.name))
        .map((cmd) => {
          const json = cmd.data.toJSON();
          return `<div class="cmd-card">
            <div class="cmd-head"><code>/${esc(json.name)}</code></div>
            <div class="cmd-desc">${esc(json.description || '')}</div>
            ${subList(json)}
          </div>`;
        })
        .join('');
      return `<section class="cmd-section" id="cat-${esc(cat)}">
        <div class="cmd-section-head">${icon(ic, 18)} <h2>${esc(label)}</h2>
          <span class="cmd-count">${byCategory.get(cat).length}</span></div>
        <div class="cmd-grid">${cards}</div>
      </section>`;
    })
    .join('');

  return basePage({
    title: 'Comandos',
    body: `<div class="landing">
  <div class="topbar">
    <a class="brand" href="/">${brandMark(34)}<span>${esc(BRAND)}</span></a>
    <div class="row">
      ${SUPPORT ? `<a class="btn btn-ghost" href="${esc(SUPPORT)}" target="_blank" rel="noopener">Soporte</a>` : ''}
      <a class="btn btn-ghost" href="/invite">Añadir a Discord</a>
      <a class="btn" href="/dashboard">Panel</a>
    </div>
  </div>

  <article class="legal">
    <div class="eyebrow">Comandos</div>
    <h1 class="legal-title">Todos los comandos de ${esc(BRAND)}</h1>
    <p class="legal-intro"><b>${total}</b> comandos agrupados por módulo. Algunos comandos tienen sub-comandos (haz clic en cada uno para ver el detalle).</p>

    <nav class="cmd-nav">${navLinks}</nav>

    ${sections}
  </article>
</div>`,
  });
}
