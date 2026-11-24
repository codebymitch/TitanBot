# Manay Society AI

Standalone Discord AI bot built with Node.js, Discord.js v14, Pollinations Classic, and MongoDB. This folder is independent from the existing TitanBot project.

## Features

- Free hosted chat in Indonesian or English without an AI API key.
- Per-guild, per-user conversation memory with reset and configurable history size.
- Auto chat in an allowlist of text channels, or in all text channels with exclusions.
- Administrator-only channel, model, personality, memory, and usage settings.
- Interactive ephemeral settings panel using buttons, select menus, channel select menus, and modals.
- Free image generation with Discord file attachments.
- Per-user daily usage limits, cooldowns, bounded context, request timeout, and error handling.
- MongoDB persistence for settings, conversation history, and usage counters.

The anonymous free provider is best-effort and rate-limited by its public egress IP: text requests are spaced by about 31 seconds and image requests by about 46 seconds. Busy servers may see requests queue. The free catalog currently exposes one text model, and generated images can contain provider branding.

## Requirements

- Node.js 20.10 or newer.
- A Discord application and bot token.
- A MongoDB database (MongoDB Atlas or a local MongoDB server).
- Internet access to Pollinations Classic; no AI API key or AI billing setup is required.

## Installation

1. Install Node.js 20 or newer and create a MongoDB database.
2. In the Discord Developer Portal, create an application and bot. Copy the bot token and application ID.
3. Enable **Message Content Intent** under the bot's privileged gateway intents. This is required for Auto Chat.
4. Invite the bot with the OAuth2 scopes `bot` and `applications.commands`. Grant **View Channels**, **Send Messages**, **Read Message History**, **Attach Files**, and **Use Application Commands**.
5. Open a terminal in this folder and install dependencies:

```bash
npm install
```

6. Copy `.env.example` to `.env` and fill in the required values:

```env
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_application_id
GUILD_ID=your_test_server_id
MONGODB_URI=mongodb+srv://db_user:password@cluster.example.mongodb.net/manay_society_ai?retryWrites=true&w=majority
```

`GUILD_ID` is optional. Set it during development to register commands to one server immediately. Leave it empty to register commands globally; Discord may take time to propagate global command updates.

For MongoDB Atlas, create a database user and allow the bot host in Network Access. Keep `.env` private and never commit the Discord token or MongoDB credentials.

7. Start the bot:

```bash
npm start
```

For development with automatic Node.js restart:

```bash
npm run dev
```

## Commands

Discord does not allow one slash command to have both direct options and subcommands. Chat is therefore `/ai chat prompt:<message>`, not a bare `/ai` with a message option.

### Chat and memory

- `/ai chat prompt:<message>`: private AI chat in a configured channel.
- `/ai resetmemory`: delete your own conversation memory for the current server.
- `/ai memory`: view memory status and your daily request count.
- `/ai memory enabled:<true|false>`: administrator-only memory toggle.
- `/ai memory max_messages:<2-60>`: administrator-only conversation history limit.

### Channel settings

- `/ai setchannel`: open a channel select menu and replace the AI channel allowlist with one channel.
- `/ai addchannel`: select and add up to 10 text channels at once; run again to add more.
- `/ai removechannel channel:<channel>`: remove or exclude a channel.
- `/ai listchannel`: view channel mode and exclusions.
- `/ai allchannel`: allow AI in every text channel.
- `/ai disablechannel channel:<channel>`: exclude one channel from AI.
- `/ai resetchannel`: clear the allowlist and exclusions.

When all-channel mode is off, AI only responds in explicitly selected channels. When all-channel mode is on, it responds everywhere except excluded channels. Channel deletion automatically removes that channel from MongoDB settings.

### Personality and server configuration

- `/ai personality type:<friendly|professional|funny|custom>`: set the server personality.
- `/ai prompt text:<instructions>`: set the custom system prompt and select Custom personality.
- `/ai resetpersonality`: restore Friendly personality and clear the custom prompt.
- `/ai setmodel model:<model>`: select the anonymous free model (`openai-fast`). The no-key catalog currently exposes one model.
- `/ai setlimit requests:<1-1000>`: set the daily request limit per user in this server.
- `/ai enable` and `/ai disable`: enable or disable AI for this server.
- `/ai status`: view the current server configuration.
- `/ai reset`: restore server settings to defaults. It does not delete chat memory.
- `/ai settings`: open the interactive administrator settings panel.

All configuration changes require the Discord **Administrator** permission. Chat and image requests count toward the same per-user daily limit.

### Image generation

- `/imagine prompt:<description>`: generate and upload one image in an allowed channel.

Image generation uses Pollinations Classic and needs no AI key. The free endpoint is rate-limited, best-effort, and may add its logo to generated images.

## Environment variables

| Variable | Required | Purpose |
|---|---:|---|
| `DISCORD_TOKEN` | Yes | Discord bot token |
| `CLIENT_ID` | Yes | Discord application ID |
| `GUILD_ID` | No | Test server for instant command registration |
| `MONGODB_URI` | Yes | MongoDB connection string |
| `DEFAULT_DAILY_LIMIT` | No | Initial per-user daily request limit (25) |
| `DEFAULT_MAX_HISTORY` | No | Initial per-user memory length in messages (16) |
| `AI_COOLDOWN_MS` | No | Per-user cooldown in milliseconds (3000) |
| `AI_PROVIDER_TIMEOUT_MS` | No | Free provider request timeout (90000 ms) |
| `FREE_TEXT_INTERVAL_MS` | No | Minimum spacing between text requests (31000 ms) |
| `FREE_IMAGE_INTERVAL_MS` | No | Minimum spacing between image requests (46000 ms) |
| `MAX_PROMPT_LENGTH` | No | Maximum chat prompt size (4000 characters) |
| `MAX_IMAGE_PROMPT_LENGTH` | No | Maximum image prompt size (1000 characters) |

Guild settings are stored separately by Discord server ID. Conversation memory is stored separately by server ID and user ID. Usage counters expire after 90 days.

Chat prompts are sent to a third-party free service. Do not send passwords, API credentials, or other sensitive information to the AI.

## Project structure

```text
commands/   Slash commands
events/     Discord events
handlers/   Command registration, event loading, interaction routing
ai/         Free AI provider integration, prompts, chat and image services
database/   MongoDB connection and persistence operations
models/     Mongoose models
utils/      Permission checks, settings UI, message and log helpers
config/     Environment configuration
```
