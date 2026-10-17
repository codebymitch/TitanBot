/**
 * Command category metadata for the command access manager.
 */

export const CATEGORY_ICONS: Record<string, string> = {
  Birthday: '🎂',
  Community: '👥',
  Core: 'ℹ️',
  Economy: '💰',
  Fun: '🎮',
  Giveaway: '🎉',
  JoinToCreate: '🔌',
  Leveling: '📊',
  Logging: '📝',
  Moderation: '🛡️',
  Music: '🎵',
  Reaction_roles: '🎭',
  Search: '🔍',
  ServerStats: '📈',
  Ticket: '🎫',
  Tools: '🛠️',
  Utility: '🔧',
  Verification: '✅',
  Welcome: '👋',
};

/** German display labels by command folder name (folder keys stay English: they are stored as disabledCategories keys). */
export const CATEGORY_LABELS: Record<string, string> = {
  Birthday: 'Geburtstag',
  Community: 'Community',
  Core: 'Allgemein',
  Economy: 'Wirtschaft',
  Fun: 'Spaß',
  Giveaway: 'Giveaways',
  JoinToCreate: 'Join-to-Create',
  Leveling: 'Leveling',
  Logging: 'Logging',
  Moderation: 'Moderation',
  Music: 'Musik',
  Reaction_roles: 'Reaktionsrollen',
  Search: 'Suche',
  ServerStats: 'Server-Statistiken',
  Ticket: 'Tickets',
  Tools: 'Tools',
  Utility: 'Nützliches',
  Verification: 'Verifizierung',
  Welcome: 'Willkommen',
};

/** Commands that always stay available so admins can recover access. */
export const PROTECTED_COMMANDS = new Set(['commands', 'configwizard']);

export function normalizeCategoryKey(category: string | null | undefined): string {
  return String(category || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

/** English title-cased folder name (e.g. "Reaction_roles" -> "Reaction Roles"). */
function formatFolderName(rawCategory: string | null | undefined): string {
  return String(rawCategory || '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** German display label for a category folder; falls back to the title-cased folder name. */
export function formatCategoryName(rawCategory: string | null | undefined): string {
  return CATEGORY_LABELS[String(rawCategory || '')] ?? formatFolderName(rawCategory);
}

export function getCategoryIcon(category: string): string {
  return CATEGORY_ICONS[category] || CATEGORY_ICONS[formatFolderName(category)] || '📁';
}
