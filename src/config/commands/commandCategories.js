/**
 * Command category metadata for the command access manager.
 */

export const CATEGORY_ICONS = {
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
  Reaction_roles: '🎭',
  Search: '🔍',
  ServerStats: '📈',
  Ticket: '🎫',
  Tools: '🛠️',
  Utility: '🔧',
  Verification: '✅',
  Welcome: '👋',
};

/** Commands that always stay available so admins can recover access. */
export const PROTECTED_COMMANDS = new Set(['commands', 'configwizard']);

export function normalizeCategoryKey(category) {
  return String(category || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function formatCategoryName(rawCategory) {
  return String(rawCategory || '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getCategoryIcon(category) {
  return CATEGORY_ICONS[category] || CATEGORY_ICONS[formatCategoryName(category)] || '📁';
}
