// games.js — on/off switch for this bot's own games.
//
// The games moved to a separate games bot, so they are OFF by default. Nothing was deleted: every
// game file is still in the repo (commands/Games, commands/Fun, services/games, the panel buttons)
// and `GAMES_ENABLED=true` in the environment brings all of it back after a restart.
//
// What stays on either way is the CC system: `cc`, `cctop`, the live Top CC board, Clover wins and
// the CC API the games bot uses to pay players (src/services/cc/ccApi.js).
//
// While the games are off:
//   • the game commands below are not loaded, not registered as slash commands and not in `help`;
//   • the games channel is open again (no "games only" deleting), so the games bot can work there;
//   • old games panel buttons answer that the games moved.

/** Commands that belong to this bot's games (the CC commands `cc` and `cctop` are not here). */
export const GAME_COMMAND_NAMES = new Set(['game', 'solo', 'rps', 'xo', 'fight']);

/** Read on every call so the switch can be flipped in tests without re-importing. */
export function gamesEnabled() {
    return String(process.env.GAMES_ENABLED || '').trim().toLowerCase() === 'true';
}

/** Whether `commandName` is a game command that is switched off right now. */
export function isDisabledGameCommand(commandName) {
    return !gamesEnabled() && GAME_COMMAND_NAMES.has(commandName);
}

export const GAMES_MOVED_NOTICE = '🎮 الألعاب اتنقلت لبوت الألعاب. الـ CC (`رصيد`، `توب cc`) لسه شغال هنا.';

// The games bot: Clover (https://clovers.gg). Its winner messages pay CC here (services/cc/gamesBotWins.js).
// With Clover Premium the server gets its own copy of the bot with another ID: put that ID (or several,
// comma separated) in GAMES_BOT_IDS.
export const CLOVER_BOT_ID = '1006332825571692544';

// Games bots (Clover and the IDs above) play only in this channel (report #121): their messages
// anywhere else are deleted (services/cc/gamesBotChannel.js). The bourse lives here too.
export const GAMES_BOTS_CHANNEL_ID = '1547310695006081075';

export function gamesBotIds() {
    const ids = String(process.env.GAMES_BOT_IDS || '').split(',').map((id) => id.trim()).filter((id) => /^\d{17,20}$/.test(id));
    return new Set(ids.length ? ids : [CLOVER_BOT_ID]);
}
