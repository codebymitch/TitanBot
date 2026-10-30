// homeGuild.js — our only server. The owner's rule: every update from now on is for this server only;
// other servers the bot is in keep what they had and get no new features unless the owner asks for it.
// New features check `isHomeGuild(guildId)` before doing anything.
export const HOME_GUILD_ID = '1155236281706627173';

export function isHomeGuild(guildId) {
    return String(guildId) === HOME_GUILD_ID;
}
