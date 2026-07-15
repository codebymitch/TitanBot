# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
npm start                 # Run the bot
npm test                  # Run all tests (Node built-in test runner)
node --test tests/path/to/file.test.js  # Run a single test file
npm run migrate           # Apply pending migrations
npm run migrate:check     # Validate migration state
npm run migrate:status    # Show migration history
```

Docker (preferred for full-stack):
```bash
docker compose up -d --build   # Build and start bot + PostgreSQL
docker compose down            # Stop everything
docker compose logs -f bot     # Stream bot logs
```

## Architecture

### Entry Point & Bot Class
`src/app.js` defines `TitanBot extends Client`. On startup it:
1. Initializes the database (PostgreSQL with in-memory fallback)
2. Loads commands, events, and interactions via handlers
3. Starts an Express web server (`GET /health`, `GET /ready`)
4. Schedules cron jobs (birthdays at 6 AM, giveaways every minute, counters every 15 min)

### Command Loading
`src/handlers/commandLoader.js` recursively scans `src/commands/**/*.js` (skipping `modules/` subdirs) and registers guild-level slash commands. Each command exports:
```js
export default {
    data: new SlashCommandBuilder()...,
    async execute(interaction, guildConfig, client) { ... }
}
```
Commands are organized into category subdirectories under `src/commands/`.

### Interaction Routing
`src/events/interactionCreate.js` routes all Discord interactions:
- Slash commands → `client.commands`
- Button presses → `client.buttons`
- Select menus → `client.selectMenus`
- Modals → `client.modals`

Each category has its handlers in `src/interactions/buttons/`, `src/interactions/selectMenus/`, and `src/interactions/modals/`. These are loaded by `src/handlers/interactions.js`.

### Database Layer
`src/utils/database.js` exports a `DatabaseWrapper` singleton (`db`) that wraps either:
- **PostgreSQL** (`src/utils/postgresDatabase.js`) — when `POSTGRES_URL`/`POSTGRES_HOST` is reachable
- **MemoryStorage** (`src/utils/memoryStorage.js`) — degraded fallback when Postgres is unavailable

`db.isAvailable()` returns `true` only when PostgreSQL is connected. Functions that require SQL (e.g. `getEndedGiveaways`) check this and return empty results in degraded mode. The bot attaches the wrapper to `client.db` at startup.

In Docker Compose the bot service must set `POSTGRES_HOST=db` and `POSTGRES_URL=postgresql://...@db:5432/...` — the `.env` file defaults to `localhost` which only works for local dev outside Docker.

### Services
`src/services/` contains domain-specific business logic (giveawayService, ticketService, leveling, economy, etc.). Commands call services; services interact with the database directly via `pgDb` or the wrapper.

### Configuration
`src/config/postgres.js` reads individual `POSTGRES_*` env vars (not `DATABASE_URL`). `src/config/bot.js` has feature flags — 18 features are toggleable; music is disabled. `src/config/schemaVersion.js` holds `EXPECTED_SCHEMA_VERSION` which must match the applied migration.

### Migrations
`scripts/migrate.js` manages schema versions tracked in the `schema_migrations` table. The bot will refuse to start if the schema version mismatches (`SCHEMA_VERSION_MISMATCH` error code). `AUTO_MIGRATE=true` in `.env` applies pending migrations automatically on startup.

### Error & Interaction Helpers
- `src/utils/interactionHelper.js` — use `InteractionHelper.safeReply/safeDeferReply/safeEdit` instead of raw Discord.js methods to handle already-acknowledged interaction errors gracefully.
- `src/utils/abuseProtection.js` — rate limiting applied per command before `execute()` is called.
- `src/utils/embeds.js` — `createEmbed({ title, description, color })` for consistent embed styling.

## Completion Workflow

After every completed coding task, unless the user explicitly says otherwise:

1. Update the bot version and add accurate Hebrew release notes for the completed work.
2. Run the full test suite and any focused validation appropriate to the change.
3. Commit only the task's intended files and push the current branch.
4. Rebuild and restart the bot with Docker Compose.
5. If the pushed commit contains a user-facing bot update or bug fix, publish exactly one Hebrew bot-update announcement through the persistent update system. Do not announce documentation-only, tests-only, formatting, refactoring-without-behavior-change, or routine maintenance commits.
6. Verify PostgreSQL recorded the announced version and message ID, inspect the Discord message for correct Hebrew/UTF-8 content, and check the readiness endpoint.
7. Report the commit, branch, test results, deployment health, announced version, and Discord message ID.

Never publish an automatic update while PostgreSQL is unavailable or the bot is using in-memory degraded storage. Never start a second local bot process when the Docker bot service is already running. Do not stage, commit, or overwrite unrelated user changes.
