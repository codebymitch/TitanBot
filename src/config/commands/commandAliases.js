export const commandAliases = {
  ping: 'ping', help: 'help', h: 'help', info: 'help',
  ban: 'ban', kick: 'kick', mute: 'timeout', warn: 'warn', clear: 'purge', purge: 'purge',
  untimeout: 'untimeout', unmute: 'untimeout', rank: 'rank', lvl: 'rank', xp: 'rank',
  leaderboard: 'leaderboard', lb: 'leaderboard', top: 'leaderboard',
  user: 'userinfo', avatar: 'avatar', pfp: 'avatar', icon: 'avatar',
  bd: 'birthday', bday: 'birthday', b: 'birthday',
  gcreate: 'gcreate', gstart: 'gcreate', gend: 'gend', gstop: 'gend', gdelete: 'gdelete', greroll: 'greroll', groll: 'greroll',
  ticket: 'ticket', t: 'ticket', new: 'ticket', ver: 'verify', vadmin: 'verification', av: 'autoverify',
  welcome: 'welcome', greet: 'greet', goodbye: 'goodbye', autorole: 'autorole',
  calc: 'calculate', math: 'calculate', weather: 'weather', todo: 'todo', report: 'report',
  userinfo: 'userinfo', whois: 'userinfo', ui: 'userinfo', serverstats: 'serverstats', ss: 'serverstats', sstats: 'serverstats',
  rr: 'reactroles', reactionroles: 'reactroles',
};
export const subcommandAliases = {
  l: 'list', ls: 'list', s: 'set', i: 'info', r: 'remove', rm: 'remove', del: 'remove', n: 'next', sc: 'setchannel',
  a: 'add', c: 'complete', done: 'complete', d: 'complete', start: 'create', stop: 'end', roll: 'reroll',
  add: 'add', remove: 'remove', list: 'list',
};
export function resolveCommandAlias(name) { return commandAliases[name.toLowerCase()] || name; }
export function resolveSubcommandAlias(name) { return subcommandAliases[name.toLowerCase()] || name; }
