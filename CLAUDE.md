# Notes for Claude

## Our only server

The bot's only server is **1155236281706627173** (`HOME_GUILD_ID` in `src/config/homeGuild.js`).

The owner's rule, literally: **anything new is for this server only.** Every new feature, every change
to an existing one, every new command, board, role, timer or setting. Other servers the bot is in keep
exactly what they already have and get nothing new unless the owner explicitly asks for it.

- A new feature checks `isHomeGuild(guildId)` (from `src/config/homeGuild.js`) before it does anything:
  startup work, timers and sweeps skip other servers; commands, buttons and forms answer there with
  "not available" or do nothing.
- Changing an existing feature: keep the old behaviour for other servers (see `storeCatalog` in
  `src/services/cc/ccStoreService.js`, which still shows the old samples there).
- Tests use `HOME_GUILD_ID` when they test a new feature, and add a case showing another server is left alone.
