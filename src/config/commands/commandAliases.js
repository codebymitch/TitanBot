/**
 * Command Aliases Configuration
 * Maps shortened command names to their full command names
 */

export const commandAliases = {
    'bal': 'balance',
    'money': 'balance',
    'cash': 'balance',

    'dep': 'deposit',
    'with': 'withdraw',
    'work': 'work',
    'daily': 'daily',
    'gamble': 'gamble',
    'bet': 'gamble',
    'rob': 'rob',
    'crime': 'crime',
    'pay': 'pay',
    'send': 'pay',

    'ping': 'ping',
    'help': 'help',
    'h': 'help',
    'info': 'help',

    'ban': 'ban',
    'kick': 'kick',
    'mute': 'timeout',
    'warn': 'warn',
    'am': 'automod',
    'automoderation': 'automod',
    'clear': 'purge',
    'purge': 'purge',
    'untimeout': 'untimeout',
    'unmute': 'untimeout',

    'rank': 'rank',
    'lvl': 'rank',
    'xp': 'rank',
    'leaderboard': 'leaderboard',
    'lb': 'leaderboard',
    'top': 'leaderboard',

    'shop': 'shop',
    'buy': 'buy',
    'inventory': 'inventory',
    'inv': 'inventory',
    'items': 'inventory',

    'user': 'userinfo',

    'bd': 'birthday',
    'bday': 'birthday',
    'b': 'birthday',

    'gcreate': 'gcreate',
    'gstart': 'gcreate',
    'gend': 'gend',
    'gstop': 'gend',
    'gdelete': 'gdelete',
    'greroll': 'greroll',
    'groll': 'greroll',

    'ticket': 'ticket',
    't': 'ticket',
    'new': 'ticket',

    'ver': 'verify',
    'vadmin': 'verification',
    'av': 'autoverify',

    'welcome': 'welcome',
    'autorole': 'autorole',

    'calc': 'calculate',
    'math': 'calculate',
    'weather': 'weather',
    'report': 'report',
    'userinfo': 'userinfo',
    'whois': 'userinfo',
    'ui': 'userinfo',

    'serverstats': 'serverstats',
    'ss': 'serverstats',
    'sstats': 'serverstats',

    'rr': 'reactroles',
    'reactionroles': 'reactroles',

    'jtc': 'jointocreate',
    'jointocreate': 'jointocreate',
};

export const subcommandAliases = {
    'l': 'list',
    'ls': 'list',
    's': 'set',
    'i': 'info',
    'r': 'remove',
    'rm': 'remove',
    'del': 'remove',
    'n': 'next',
    'sc': 'setchannel',

    'a': 'add',
    'c': 'complete',
    'done': 'complete',
    'd': 'complete',

    'pfp': 'avatar',
    'icon': 'avatar',

    'start': 'create',
    'stop': 'end',
    'roll': 'reroll',

    'add': 'add',
    'remove': 'remove',
    'list': 'list',
};

/**
 * Resolve a command alias to its full command name
 * @param {string} commandName - The command name (could be an alias)
 * @returns {string} - The full command name, or the original if not an alias
 */
export function resolveCommandAlias(commandName) {
    const normalized = commandName.toLowerCase();
    return commandAliases[normalized] || commandName;
}

/**
 * Resolve a subcommand alias to its full subcommand name
 * @param {string} subcommandName - The subcommand name (could be an alias)
 * @returns {string} - The full subcommand name, or the original if not an alias
 */
export function resolveSubcommandAlias(subcommandName) {
    const normalized = subcommandName.toLowerCase();
    return subcommandAliases[normalized] || subcommandName;
}
