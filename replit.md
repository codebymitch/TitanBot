# TitanBot - Discord Community Management Bot

## Overview

TitanBot is a comprehensive, modular Discord bot built with Discord.js v14. It provides essential community management features including moderation tools, economy system, ticketing support, fun commands, birthday tracking, and giveaway management. The bot uses Replit's Database for data persistence and includes a keep-alive web server for hosting on Replit.

The architecture is designed to be extensible, with commands organized by category (Core, Moderation, Economy, Utility, Tickets, Fun, Birthday, Giveaway, Config) in a clear folder structure that supports dynamic command loading.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Application Structure

**Command Handler Pattern**: The bot implements a dynamic command loading system where slash commands are organized in category folders (`commands/Core/`, `commands/Moderation/`, etc.). Each command file exports a default object containing `data` (SlashCommandBuilder) and an `execute` function. Commands are automatically discovered and registered at startup.

**Database Layer**: The application uses Replit Database as the primary data store, wrapped in a custom `ReplitDb` class (in `utils.js`) that provides a simplified interface with methods for `get`, `set`, `delete`, and `list` operations. This abstraction ensures consistent data access patterns across the application.

**Configuration Management**: Guild-specific configurations are stored with keys in the format `guild:{guildId}:config`. Each guild's config object contains settings like log channels, ticket categories, support roles, birthday channels/roles, premium roles, and report channels. The `getGuildConfig` utility function ensures configs always return with default values.

**Centralized Bot Config** (`bot_config.js`): A single configuration file for easy customization of the bot's appearance and behavior. This file contains:
- **Bot Status**: Activity type (Playing/Watching/Listening/Competing) and status text
- **Embed Colors**: Primary, success, error, warning, info colors plus specific colors for giveaways, tickets, economy, etc.
- **Footer Text**: Consistent branding footer for all embeds
- **Economy Settings**: Currency name, symbol, starting balance, bank capacity
- **Ticket Priorities**: Color and emoji mappings for priority levels
- **Messages**: Default error messages and permission notices
- **Branding**: Bot name, support server link, invite URL

### Key Architectural Decisions

**Modular Command System**: Commands are self-contained modules with no interdependencies. This allows for easy addition/removal of features without affecting other parts of the system. Each command receives `interaction`, `config`, and `client` parameters for consistent execution context.

**Embed-Based UI**: The bot standardizes user interactions through Discord embeds created via utility functions (`createEmbed`, `successEmbed`, `errorEmbed`). This provides a consistent visual experience and simplifies UI management.

**Cooldown Management**: Economy and game commands store cooldown timestamps within user data objects (e.g., `userData.cooldowns.daily`, `userData.cooldowns.work`). This approach keeps related data together and simplifies cooldown checks.

**Event-Driven Birthday System**: Birthdays are checked daily using node-cron (scheduled at UTC midnight). The system grants birthday roles automatically and removes them from previous recipients, ensuring only current birthday celebrants have the role.

**Inventory and Upgrade System**: The economy features a flexible item system with three types: consumables (used once), upgrades (permanent bonuses), and roles (Discord role grants). Items are defined centrally in `shop_config.js` and tracked in user inventory/upgrade objects.

**Ticket Management**: Tickets are implemented as private channels with metadata stored in the channel topic (format: `Ticket Owner: {userId}`). This approach allows ticket validation without database queries and simplifies permission management through Discord's native channel permissions.

**Giveaway State Machine**: Giveaways store state (active/ended), entries, and metadata in the database with keys like `giveaway:{guildId}:{messageId}`. The system supports multiple simultaneous giveaways per guild and tracks participant entries for winner selection.

**Logging System**: Moderation actions are logged to a configured channel using the `logEvent` utility. Logs can be filtered to ignore specific users/channels, reducing noise from automated processes.

**Permission Layering**: Commands use `setDefaultMemberPermissions()` for Discord-side permission hints, with additional runtime checks in execute functions for security. This provides both user guidance and enforcement.

**Keep-Alive Strategy**: An Express server runs on port 3000 serving a simple status endpoint, ensuring the Replit environment stays active and the bot remains online.

### Data Models

**User Economy Data** (`economy:{guildId}:{userId}`):
- `cash`: Liquid currency
- `bank`: Stored currency with capacity limits
- `inventory`: Object mapping item keys to quantities
- `upgrades`: Object tracking permanent upgrade purchases
- `cooldowns`: Object with command cooldown timestamps

**Guild Configuration** (`guild:{guildId}:config`):
- Channel IDs for logging, tickets, birthdays, reports
- Role IDs for support staff, birthday celebrants, premium members
- Feature toggles (disabled commands)
- Ignore lists for log filtering

**Ticket Data** (`{guildId}:ticket:{channelId}`):
- Creator/claimer user IDs
- Priority level
- Timestamps for creation/claim/closure
- Message ID for the ticket control panel

**Birthday Data** (`birthday:{guildId}:{userId}`):
- Month and day stored as integers
- No year stored (privacy consideration)

**Warning Data** (`warnings-{guildId}-{userId}`):
- Array of warning objects with reason, moderator ID, and timestamp

**Giveaway Data** (`giveaway:{guildId}:{messageId}`):
- Prize description, winner count, end timestamp
- Array of participant user IDs
- Status flag (active/ended)
- Winner IDs after completion

## External Dependencies

**Discord.js v14**: Primary framework for Discord API interactions. Provides gateway intents, slash command builders, embeds, buttons, and permission management. The bot requires specific intents: `Guilds`, `GuildMembers`, `GuildMessages`, and `MessageContent`.

**Replit Database (@replit/database)**: NoSQL key-value store used for all persistent data. Accessed through a custom wrapper class that provides async get/set/delete/list methods. No external database service required.

**Express v5**: Minimal HTTP server implementation for the keep-alive endpoint. Listens on port 3000 and responds to GET requests at the root path.

**node-cron**: Task scheduler used for daily birthday checks. Configured to run at midnight UTC (`0 0 * * *`) to ensure consistent timing across time zones.

**Discord Voice (@discordjs/voice)**: Listed dependency but not currently implemented in active commands. Likely intended for future music/audio features.

**play-dl**: YouTube/audio streaming library. Listed in dependencies but not actively used in current command implementations.

**ffmpeg-static**: Static FFmpeg binary for audio processing. Required for voice features (currently unused).

**libsodium-wrappers**: Encryption library for voice connections. Listed as dependency for future voice feature support.

**Firebase v12**: Listed in dependencies but not currently integrated into any commands or utilities. May be planned for future data migration or additional features.

**Mongoose v9**: MongoDB ODM listed in dependencies but not actively used. The application currently uses Replit Database exclusively.

### Integration Points

- **Discord API**: All command interactions, event handling, and message management
- **Replit Database**: Persistent storage for user data, guild configs, warnings, tickets, giveaways, and birthdays
- **Express HTTP Server**: Keep-alive endpoint for Replit hosting environment
- **Cron Scheduler**: Automated daily birthday role management

### Configuration Requirements

- `DISCORD_TOKEN`: Bot authentication token (stored in Replit Secrets or environment variables)
- Guild-specific settings configured via `/config` commands and `/ticket setup`
- Shop items defined in `shop_config.js` for economy system customization