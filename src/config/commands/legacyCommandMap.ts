/**
 * Legacy command map: pre-consolidation top-level commands -> their new location.
 *
 * Single source of truth for everything that still knows the old names:
 * - command access checks (stored `disabledCommands` keys use old names, no data migration)
 * - prefix routing (`!bal` -> `/eco balance`) and aliases
 * - help menus ("formerly /balance")
 * - docs/COMMAND_MIGRATION.md
 *
 * An entry with `subcommand` maps an old command without subcommands to one subcommand.
 * An entry with only `group` maps an old command with subcommands to a subcommand group;
 * the old subcommand names are kept inside that group.
 */

export interface LegacyCommandTarget {
  command: string;
  group?: string;
  subcommand?: string;
  /** Category folder the old command lived in (for disabledCategories). */
  category: string;
}

export const LEGACY_COMMAND_MAP: Readonly<Record<string, LegacyCommandTarget>> = {
  // Economy
  balance: { command: 'eco', subcommand: 'balance', category: 'Economy' },
  beg: { command: 'eco', subcommand: 'beg', category: 'Economy' },
  buy: { command: 'eco', subcommand: 'buy', category: 'Economy' },
  crime: { command: 'eco', subcommand: 'crime', category: 'Economy' },
  daily: { command: 'eco', subcommand: 'daily', category: 'Economy' },
  deposit: { command: 'eco', subcommand: 'deposit', category: 'Economy' },
  eleaderboard: { command: 'eco', subcommand: 'leaderboard', category: 'Economy' },
  fish: { command: 'eco', subcommand: 'fish', category: 'Economy' },
  gamble: { command: 'eco', subcommand: 'gamble', category: 'Economy' },
  inventory: { command: 'eco', subcommand: 'inventory', category: 'Economy' },
  mine: { command: 'eco', subcommand: 'mine', category: 'Economy' },
  pay: { command: 'eco', subcommand: 'pay', category: 'Economy' },
  rob: { command: 'eco', subcommand: 'rob', category: 'Economy' },
  shop: { command: 'eco', subcommand: 'shop', category: 'Economy' },
  slut: { command: 'eco', subcommand: 'slut', category: 'Economy' },
  withdraw: { command: 'eco', subcommand: 'withdraw', category: 'Economy' },
  work: { command: 'eco', subcommand: 'work', category: 'Economy' },
  'shop-config': { command: 'economy', group: 'shop', category: 'Economy' },

  // Music
  join: { command: 'music', subcommand: 'join', category: 'Music' },
  play: { command: 'music', subcommand: 'play', category: 'Music' },
  queue: { command: 'music', subcommand: 'queue', category: 'Music' },
  nowplaying: { command: 'music', subcommand: 'nowplaying', category: 'Music' },

  // Giveaway
  gcreate: { command: 'giveaway', subcommand: 'create', category: 'Giveaway' },
  gdelete: { command: 'giveaway', subcommand: 'delete', category: 'Giveaway' },
  gend: { command: 'giveaway', subcommand: 'end', category: 'Giveaway' },
  greroll: { command: 'giveaway', subcommand: 'reroll', category: 'Giveaway' },

  // Leveling
  leveladd: { command: 'level', subcommand: 'add', category: 'Leveling' },
  levelremove: { command: 'level', subcommand: 'remove', category: 'Leveling' },
  levelset: { command: 'level', subcommand: 'set', category: 'Leveling' },
  rank: { command: 'rank', subcommand: 'view', category: 'Leveling' },
  leaderboard: { command: 'rank', subcommand: 'leaderboard', category: 'Leveling' },

  // Tools
  baseconvert: { command: 'tools', subcommand: 'baseconvert', category: 'Tools' },
  calculate: { command: 'tools', subcommand: 'calculate', category: 'Tools' },
  countdown: { command: 'tools', subcommand: 'countdown', category: 'Tools' },
  generatepassword: { command: 'tools', subcommand: 'generatepassword', category: 'Tools' },
  hexcolor: { command: 'tools', subcommand: 'hexcolor', category: 'Tools' },
  poll: { command: 'tools', subcommand: 'poll', category: 'Tools' },
  randomuser: { command: 'tools', subcommand: 'randomuser', category: 'Tools' },
  shorten: { command: 'tools', subcommand: 'shorten', category: 'Tools' },
  time: { command: 'tools', subcommand: 'time', category: 'Tools' },
  unixtime: { command: 'tools', subcommand: 'unixtime', category: 'Tools' },
  weather: { command: 'tools', subcommand: 'weather', category: 'Utility' },
  firstmsg: { command: 'tools', subcommand: 'firstmsg', category: 'Utility' },

  // Info
  avatar: { command: 'info', subcommand: 'avatar', category: 'Utility' },
  serverinfo: { command: 'info', subcommand: 'server', category: 'Utility' },
  userinfo: { command: 'info', subcommand: 'user', category: 'Utility' },

  // Bot
  ping: { command: 'bot', subcommand: 'ping', category: 'Core' },
  stats: { command: 'bot', subcommand: 'stats', category: 'Core' },
  support: { command: 'bot', subcommand: 'support', category: 'Core' },
  uptime: { command: 'bot', subcommand: 'uptime', category: 'Core' },

  // Fun
  fight: { command: 'fun', subcommand: 'fight', category: 'Fun' },
  flip: { command: 'fun', subcommand: 'flip', category: 'Fun' },
  roll: { command: 'fun', subcommand: 'roll', category: 'Fun' },

  // Welcome
  autorole: { command: 'welcome', group: 'autorole', category: 'Welcome' },
  goodbye: { command: 'welcome', group: 'goodbye', category: 'Welcome' },
  greet: { command: 'welcome', group: 'greet', category: 'Welcome' },
  welcome: { command: 'welcome', group: 'message', category: 'Welcome' },

  // Verification
  autoverify: { command: 'verification', group: 'autoverify', category: 'Verification' },

  // Tickets
  claim: { command: 'tickets', subcommand: 'claim', category: 'Ticket' },
  close: { command: 'tickets', subcommand: 'close', category: 'Ticket' },
  priority: { command: 'tickets', subcommand: 'priority', category: 'Ticket' },

  // Moderation
  ban: { command: 'ban', subcommand: 'user', category: 'Moderation' },
  unban: { command: 'ban', subcommand: 'remove', category: 'Moderation' },
  massban: { command: 'ban', subcommand: 'mass', category: 'Moderation' },
  kick: { command: 'kick', subcommand: 'user', category: 'Moderation' },
  masskick: { command: 'kick', subcommand: 'mass', category: 'Moderation' },
  timeout: { command: 'mod', subcommand: 'timeout', category: 'Moderation' },
  untimeout: { command: 'mod', subcommand: 'untimeout', category: 'Moderation' },
  warn: { command: 'mod', subcommand: 'warn', category: 'Moderation' },
  warnings: { command: 'mod', subcommand: 'warnings', category: 'Moderation' },
  dm: { command: 'mod', subcommand: 'dm', category: 'Moderation' },
  lock: { command: 'channel', subcommand: 'lock', category: 'Moderation' },
  unlock: { command: 'channel', subcommand: 'unlock', category: 'Moderation' },
  purge: { command: 'msg', subcommand: 'purge', category: 'Moderation' },
  say: { command: 'msg', subcommand: 'say', category: 'Moderation' },
  embedbuilder: { command: 'msg', subcommand: 'embed', category: 'Tools' },
  usernotes: { command: 'msg', group: 'notes', category: 'Moderation' },
};

/** First-level names (subcommands or groups) a legacy entry occupies in its new command. */
function firstLevelName(target: LegacyCommandTarget): string {
  return (target.group ?? target.subcommand)!;
}

const NEW_FIRST_LEVEL_NAMES = new Map<string, Set<string>>();
for (const target of Object.values(LEGACY_COMMAND_MAP)) {
  const names = NEW_FIRST_LEVEL_NAMES.get(target.command) ?? new Set<string>();
  names.add(firstLevelName(target));
  NEW_FIRST_LEVEL_NAMES.set(target.command, names);
}

/** New path tokens for a legacy target, e.g. ['eco', 'balance'] or ['msg', 'notes']. */
export function getLegacyPath(target: LegacyCommandTarget): string[] {
  return [target.command, firstLevelName(target)];
}

/** `/eco balance` style display string for a legacy command name. */

/**
 * Whether `firstArg` is already a valid first-level name of the new command.
 * Used for old names that equal a new top-level name (ban, kick, rank, welcome).
 */
function isNewFirstLevelName(command: string, firstArg: string | undefined): boolean {
  return Boolean(firstArg && NEW_FIRST_LEVEL_NAMES.get(command)?.has(firstArg.toLowerCase()));
}

/** Suffix marking a stored "whole command" disable for names that existed before and after consolidation. */
export const WHOLE_COMMAND_MARKER = '*';

/**
 * Translate a stored access key (old or new naming) to the new naming.
 * `balance` -> `eco balance`, `usernotes add` -> `msg notes add`, `welcome setup` -> `welcome message setup`.
 * A bare old name keeps its old meaning (`ban` -> `ban user`); disabling a whole new command with such a
 * name is stored as `ban *`.
 */
export function translateLegacyAccessKey(key: string): string {
  const tokens = key.toLowerCase().trim().split(/\s+/);
  if (tokens[1] === WHOLE_COMMAND_MARKER) {
    return tokens[0];
  }

  const target = LEGACY_COMMAND_MAP[tokens[0]];
  if (!target || (target.command === tokens[0] && isNewFirstLevelName(target.command, tokens[1]))) {
    return tokens.join(' ');
  }

  return [...getLegacyPath(target), ...tokens.slice(1)].join(' ');
}

/** Key to store when disabling `name` (new naming), so translateLegacyAccessKey reads it back unchanged. */
export function toStoredAccessKey(name: string): string {
  return LEGACY_COMMAND_MAP[name]?.command === name ? `${name} ${WHOLE_COMMAND_MARKER}` : name;
}

/**
 * Rewrite a prefix invocation that uses an old command name.
 * Returns null when the name is not a legacy name or the args already address the new structure.
 */
export function routeLegacyPrefixCommand(
  commandName: string,
  args: string[],
): { commandName: string; args: string[] } | null {
  const target = LEGACY_COMMAND_MAP[commandName.toLowerCase()];
  if (!target) {
    return null;
  }

  if (target.command === commandName.toLowerCase() && isNewFirstLevelName(target.command, args[0])) {
    return null;
  }

  return { commandName: target.command, args: [firstLevelName(target), ...args] };
}

/**
 * Old command name for a new path, e.g. ('mod', null, 'warn') -> 'warn', ('msg', 'notes', 'add') -> 'usernotes'.
 * Returns null when the path is not a moved legacy command.
 */
export function resolveLegacyName(command: string, group: string | null, subcommand: string | null): string | null {
  const firstLevel = group ?? subcommand;
  if (!firstLevel) {
    return null;
  }

  for (const [legacyName, target] of Object.entries(LEGACY_COMMAND_MAP)) {
    if (target.command === command && firstLevelName(target) === firstLevel && Boolean(target.group) === Boolean(group)) {
      return legacyName;
    }
  }

  return null;
}

