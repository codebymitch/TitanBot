# TitanBot - Ultimate Discord Bot

**TitanBot** is a powerful, feature-rich Discord bot designed to enhance your server experience with comprehensive moderation tools, engaging economy systems, utility features, and much more. Built with modern Discord.js v14 and PostgreSQL for optimal performance and data persistence.

[![Support Server](https://img.shields.io/badge/-Support%20Server-%235865F2?logo=discord&logoColor=white&style=flat-square&logoWidth=20)](https://discord.gg/8kJBYhTGW9)
[![Discord.js](https://img.shields.io/npm/v/discord.js?style=flat-square&labelColor=%23202225&color=%23202225&logo=npm&logoColor=white&logoWidth=20)](https://www.npmjs.com/package/discord.js)
![PostgreSQL](https://img.shields.io/badge/-PostgreSQL-%23336791?logo=postgresql&logoColor=white&style=flat-square&logoWidth=20)

## Table of Contents

- [Features Overview](#features-overview)
- [Quick Setup](#quick-setup)
- [Manual Installation Steps](#manual-installation-steps)
- [Support Server](https://discord.gg/QnWNz2dKCE)
- [Required Bot Intents](#bot-intents)
- [Contributing](CONTRIBUTING.md)

<a name="features-overview"></a>
## Features Overview

TitanBot offers a complete suite of tools for Discord server management and community engagement:

<table>
<tr>
<td width="50%" valign="top">

### Moderation & Administration
- **Mass Actions** - Bulk ban/kick capabilities
- **User Notes** - Keep detailed moderation records
- **Case Management** - View and track all mod actions

### Economy System
- **Shop & Inventory** - Buy and manage items
- **Gambling** - Risk it for rewards
- **Pay System** - Transfer money between users

### Fun & Entertainment
- **Random Facts** - Learn something new
- **Wanted Poster** - Create fun wanted images
- **Text Reversal** - Reverse any text

### Advanced Ticket System
- **Claim & Priority** - Staff ticket management
- **Ticket Limits** - Prevent spam
- **Transcript System** - Save ticket history

### Server Stats
- **Member Counter** - Live member count channels
- **Voice Counters** - Track voice stats
- **Dynamic Updates** - Real-time channel updates

### Reaction Roles
- **Role Assignment** - Self-assignable roles
- **Emoji Selection** - Reaction-based system
- **Multi-role Support** - Multiple role options

</td>
<td width="50%" valign="top">

### Leveling & XP System
- **XP Tracking** - Automatic message-based XP
- **Level Roles** - Auto-assign roles by level
- **Custom Configuration** - Personalize leveling

### Giveaways & Events
- **Multiple Winners** - Support multi-winner giveaways
- **Auto Picking** - Automatic winner selection
- **Reroll System** - Pick new winners if needed

### Birthday System
- **Birthday Tracking** - Never miss a birthday
- **Auto Announcements** - Celebrate automatically
- **Timezone Support** - Accurate worldwide tracking

### Utility Tools
- **Report System** - Report issues to staff
- **Todo Lists** - Personal task management
- **First Message** - Jump to channel's first message

### Welcome System
- **Welcome Messages** - Greet new members
- **Auto Roles** - Assign roles on join
- **Custom Embeds** - Personalized messages
  
### Music
- **24/7 Mode** - Play music 24/7
- **Interative Button System** - Manage music through buttons
- **Supports EVERY platform** - Supports spotify, deezer, youtube, apple music
  
</td>
</tr>
</table>

<a name="quick-setup"></a>
## Quick Setup (Recommended for non-coders)

### Video Tutorial
For a detailed step-by-step setup guide, watch our comprehensive video tutorial:
[**TitanBot Setup Tutorial**](https://www.youtube.com/@TouchDisc)

## Docker Deployment (Recommended)

TitanBot is fully containerized for easy deployment.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/codebymitch/TitanBot.git
   cd TitanBot
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Set at minimum `DISCORD_TOKEN`, `CLIENT_ID`, and `GUILD_ID`. Docker Compose also reads `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` from `.env` (defaults: `titanbot` / `password` / `titanbot`).

3. **Build and start the containers:**
   ```bash
   docker compose up -d --build
   ```

4. **Check status:**
   ```bash
   docker compose ps
   curl http://localhost:3000/health
   ```

This starts the bot and PostgreSQL. The compose file sets `POSTGRES_SSL=false` and `AUTO_MIGRATE=true` for the bundled database. Music uses public Lavalink v4 nodes from `lavalink/nodes.json` by default.

### Music

Music uses [Lavalink v4](https://github.com/lavalink-devs/Lavalink) via [Riffy](https://github.com/riffy-rb/riffy), similar to [Musicify](https://github.com/codebymitch/Musicify).

1. By default, the bot loads multiple public v4 SSL nodes from [`lavalink/nodes.json`](lavalink/nodes.json) (sourced from [lavalink.darrennathanael.com](https://lavalink.darrennathanael.com/SSL/Lavalink-SSL/)). Edit that file to add or remove nodes.
2. To self-host Lavalink instead, run `docker compose --profile local-lavalink up -d` and set single-node env vars in `.env`:
   ```env
   LAVALINK_HOST=lavalink
   LAVALINK_PORT=2333
   LAVALINK_PASSWORD=youshallnotpass
   LAVALINK_SECURE=false
   ```
   Remove or rename `lavalink/nodes.json` so the bot falls back to those env vars.
3. Override nodes inline with `LAVALINK_NODES` (JSON array) or point at another file with `LAVALINK_NODES_FILE`.
4. Use `/play <song>` from a voice channel, or `/join` to connect without playing. Prefix shortcuts: `join`, `np`, `leave`, `pause`, `resume`, `skip`, `stop`, `volume <0-100>`, or `music <subcommand>`. Use `/nowplaying` and `/queue` for status; `/music` for loop, shuffle, seek, and other controls.

### Using GitHub Container Registry

The bot is automatically published to GitHub Container Registry on every push to main.

```bash
docker pull ghcr.io/codebymitch/titanbot:main
```

<a name="manual-installation-steps"></a>
## Manual Installation Steps

### Prerequisites
- Node.js 20.10.0 or higher
- PostgreSQL server (recommended) or memory storage fallback
- Discord bot application with proper intents

1. **Clone the Repository**
   ```bash
   git clone https://github.com/codebymitch/TitanBot.git
   cd TitanBot
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your configuration (only the following variables require configuration, leave remaining variables as default):
   ```env
   # Discord Bot Configuration
   DISCORD_TOKEN=your_discord_bot_token_here
   CLIENT_ID=your_discord_client_id_here
   GUILD_ID=your_discord_guild_id_here

   # PostgreSQL Configuration (Primary Database)
   POSTGRES_URL=postgresql://postgres:yourpassword@localhost:5432/titanbot
   POSTGRES_HOST=localhost
   POSTGRES_PORT=5432
   POSTGRES_DB=titanbot
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=yourpassword
   ```

   Production note:
   - `NODE_ENV=production`
   - `LOG_LEVEL=warn` for a clean production console (critical issues + startup status)
   - `LOG_LEVEL=info` if you want more detailed operational logs
   - If your chosen `PORT` is already used, TitanBot automatically tries the next port(s)

   Environment options reference:
   - `NODE_ENV`: `development`, `production`, `test` (any non-`production` value is treated as non-production)
   - `LOG_LEVEL`: `error`, `warn`, `info`, `http`, `verbose`, `debug`, `silly`
   - Accepted aliases for `LOG_LEVEL` in this bot: `warns`, `warning`, `warnings` → `warn`

   Recommended production `.env` (easy mode + default mode):
   ```env
   NODE_ENV=production
   LOG_LEVEL=warn
   WEB_HOST=0.0.0.0
   PORT=3000
   PORT_RETRY_ATTEMPTS=5
   ```
   This gives clear startup/online status messages while keeping logs simple for non-technical operators.
   If port `3000` is busy, the bot tries the next available ports automatically (up to `PORT_RETRY_ATTEMPTS`).

### Multiple servers

Slash commands are registered **globally** on startup (via `CLIENT_ID`), so the bot works in every server it is invited to. `GUILD_ID` stays in the tutorial `.env` for setup steps but is not used for command registration.

Notes:
- Global slash commands may take up to about an hour to propagate on first deploy
- Each server has **isolated** data: config, economy, tickets, leveling, dashboards, warnings, etc. (all keys are scoped as `guild:{guildId}:...`)
- In the [Discord Developer Portal](https://discord.com/developers/applications), ensure your bot is not restricted to a single guild if you plan to invite it elsewhere
- Generate an OAuth2 invite URL from the [Discord Developer Portal](https://discord.com/developers/applications) (OAuth2 → URL Generator, scopes: `bot` and `applications.commands`)

4. **Setup PostgreSQL Database** (Optional but recommended)
   ```bash
   # Create database and user
   createdb titanbot
   createuser titanbot
   psql -c "ALTER USER titanbot PASSWORD 'yourpassword';"
   psql -c "GRANT ALL PRIVILEGES ON DATABASE titanbot TO titanbot;"
   ```

5. **Verify Database Setup**
   ```bash
   npm run migrate:check
   ```

6. **Start the Bot**
   ```bash
   npm start
   ```

> **Note on database migrations:** Schema tables and legacy key migrations run
> **automatically on startup**, so` managed hosts like **Railway** need no manual
> migration step — just deploy/restart. To disable auto-migration set
> `AUTO_MIGRATE=false`. You can still run a manual key migration locally with
> `node scripts/migrate-keys.js --dry-run` (preview) or `node scripts/migrate-keys.js`.
<a name="bot-intents"></a>

## Required Bot Intents
TitanBot requires the following Discord intents:
- **Guilds**
- **Guild Messages**
- **Message Content**
- **Guild Members**
- **Guild Message Reactions**
- **Guild Voice States**
- **Direct Messages**
- **Bot**
- **Applications.commands**

### Required Permissions
- **View Channels**
- **Send Messages**
- **Embed Links**
- **Attach Files**
- **Read Message History**
- **Manage Messages**
- **Manage Channels**
- **Manage Roles**
- **Kick Members**
- **Manage Messages**
- **Ban Members**
- **Moderate Members**
- **Connect**

## License

TitanBot is released under the MIT License. See [LICENSE](LICENSE) for details.

## Thank You

Thank you for choosing TitanBot for your Discord server! We're constantly working to improve and add new features based on community feedback.

*Last updated: May 2026*
