/**
 * Prefix command aliases (nh!b → nh!ban).
 * MANUAL_ALIASES override auto-generated aliases when they conflict.
 */

/** @type {Record<string, string[]>} Extra short names per primary command */
export const COMMAND_ALIASES_BY_COMMAND = {
    // Core
    help: ['h', '?'],
    ping: ['pn'],
    stats: ['st'],
    uptime: ['up'],
    overview: ['ov', 'info'],
    support: ['sup'],
    bug: ['bg'],

    // Moderation
    ban: ['b'],
    kick: ['k'],
    timeout: ['t', 'to', 'mute'],
    untimeout: ['ut', 'unto', 'unmute'],
    unban: ['ub'],
    warn: ['w'],
    warnings: ['warns', 'wn'],
    purge: ['p', 'clear'],
    lock: ['l'],
    unlock: ['ul'],
    quarantine: ['q', 'qr'],
    unquarantine: ['uq', 'unq'],
    'setup-quarantine': ['squarantine', 'sq', 'qsetup'],
    massban: ['mban', 'mb'],
    masskick: ['mkick', 'mk'],
    dm: ['message', 'msg'],
    cases: ['c', 'modlog'],
    usernotes: ['notes', 'un', 'note'],

    // Welcome
    welcome: ['wel', 'wlc'],
    goodbye: ['bye', 'gbye'],
    greet: ['gr'],
    autorole: ['ar', 'auto'],

    // Verification
    verify: ['v', 'ver'],
    verification: ['vrf', 'verif'],
    autoverify: ['av', 'aver'],

    // Voice
    activity: ['act', 'vc'],

    // Utility
    avatar: ['av', 'pfp'],
    userinfo: ['ui', 'whois', 'uinfo'],
    serverinfo: ['si', 'sinfo', 'guildinfo'],
    weather: ['wth', 'wt'],
    todo: ['td', 'tasks'],
    report: ['rp', 'rep'],
    firstmsg: ['fm', 'first'],
    wipedata: ['wipe', 'wd'],

    // Tools
    poll: ['pl'],
    time: ['tm'],
    shorten: ['sh', 'url'],
    calculate: ['calc', 'cal'],
    countdown: ['cd', 'timer'],
    hexcolor: ['hex', 'color'],
    unixtime: ['unix', 'utime'],
    baseconvert: ['base', 'convert', 'bc'],
    randomuser: ['ru', 'randuser'],
    embedbuilder: ['embed', 'emb', 'eb'],
    generatepassword: ['genpass', 'gpw', 'password', 'pwd'],

    // Ticket
    ticket: ['tk', 'tkt'],
    claim: ['clm'],
    close: ['cls', 'tcl'],
    priority: ['prio', 'pri'],

    // Server stats / logging / reaction roles
    serverstats: ['ss', 'counter', 'cnt'],
    logging: ['log', 'logs'],
    reactroles: ['rr', 'reactionrole', 'rroles'],

    // Leveling
    rank: ['rk', 'rnk', 'xp'],
    leaderboard: ['lb', 'top', 'ld'],
    level: ['lv', 'lvl'],
    leveladd: ['lvadd', 'addlvl'],
    levelremove: ['lvrm', 'remlvl'],
    levelset: ['lvset', 'setlvl'],

    // Search
    google: ['g', 'ggl', 'search'],
    define: ['def', 'dict'],
    urban: ['ud', 'urb'],
    movie: ['mv', 'film'],

    // Giveaway
    gcreate: ['gc', 'gwcreate', 'giveaway'],
    gend: ['ge', 'gwend'],
    gdelete: ['gdel', 'gwdel', 'delgw'],
    greroll: ['gr', 'gwreroll', 'reroll'],

    // Fun
    flip: ['f', 'cf', 'coin'],
    roll: ['r', 'dice'],
    fight: ['ft'],
    ship: ['shp'],
    fact: ['fc', 'facts'],
    mock: ['mk', 'spongebob'],
    reverse: ['rev'],
    wanted: ['want', 'poster'],

    // Community / birthday / join
    apply: ['apl', 'app'],
    'app-admin': ['appadmin', 'appa', 'appadm'],
    birthday: ['bday', 'bd'],
    jointocreate: ['jtc', 'j2c', 'joinvc'],
};

/** Manual global map (legacy + cross-command shortcuts) */
export const MANUAL_ALIASES = Object.fromEntries(
    Object.entries(COMMAND_ALIASES_BY_COMMAND).flatMap(([command, aliases]) =>
        aliases.map((alias) => [alias, command]),
    ),
);

/**
 * @param {string[]} commandNames Primary slash command names
 * @returns {Record<string, string>} alias → command name
 */
export function buildCommandAliasMap(commandNames) {
    const map = {};
    const taken = new Set(commandNames.map((n) => n.toLowerCase()));

    const add = (alias, target) => {
        const key = alias?.toLowerCase?.();
        const targetKey = target?.toLowerCase?.();
        if (!key || !targetKey || key === targetKey) return;
        if (taken.has(key)) return;
        if (map[key] && map[key] !== targetKey) return;
        map[key] = targetKey;
        taken.add(key);
    };

    for (const name of commandNames) {
        const extras = COMMAND_ALIASES_BY_COMMAND[name] ?? [];
        for (const alias of extras) {
            add(alias, name);
        }

        // nh!setupquarantine → setup-quarantine
        if (name.includes('-')) {
            add(name.replace(/-/g, ''), name);
            const acronym = name
                .split('-')
                .filter(Boolean)
                .map((part) => part[0])
                .join('');
            if (acronym.length >= 2) {
                add(acronym, name);
            }
        }
    }

    return map;
}

/**
 * @param {import('discord.js').Collection<string, object>} commands
 * @returns {number}
 */
export function registerPrefixAliases(commands) {
    const primaryCommands = new Map();
    for (const command of commands.values()) {
        const name = command?.data?.name;
        if (name) {
            primaryCommands.set(name, command);
        }
    }

    const aliasMap = buildCommandAliasMap([...primaryCommands.keys()]);
    let count = 0;

    for (const [alias, targetName] of Object.entries(aliasMap)) {
        const targetCommand = primaryCommands.get(targetName);
        if (!targetCommand) continue;
        if (!commands.has(alias)) {
            commands.set(alias, targetCommand);
            count++;
        }
    }

    return count;
}

// Back-compat for messageCreate
export const COMMAND_MAP = MANUAL_ALIASES;
