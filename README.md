# 🤖 TitanBot - Ultimate Discord Bot

**TitanBot** is a powerful, feature-rich Discord bot designed to enhance your server experience with comprehensive moderation tools, engaging economy systems, utility features, and much more. Built with modern Discord.js v14 and PostgreSQL for optimal performance and data persistence.

[![Support Server](https://img.shields.io/badge/-Support%20Server-%235865F2?logo=discord&logoColor=white&style=flat-square&logoWidth=20)](https://discord.gg/YOUR_INVITE)
[![Discord.js](https://img.shields.io/npm/v/discord.js?style=flat-square&labelColor=%23202225&color=%23202225&logo=npm&logoColor=white&logoWidth=20)](https://www.npmjs.com/package/discord.js)
![PostgreSQL](https://img.shields.io/badge/-PostgreSQL-%23336791?logo=postgresql&logoColor=white&style=flat-square&logoWidth=20)

## 📚 Table of Contents

- [🌟 Features Overview](#-features-overview)
- [🚀 Quick Setup](#-video-tutorial)
- [💡 Manual Installation Steps](#installation-steps)
- [🗄️ Database System](#️-database-system)
- [🌐 Support Server](#-support-server)
- [🏗️ Bot Architecture](#-bot-architecture)
- [🤝 Contributing](#-contributing)

## 🌟 Features Overview

TitanBot offers a complete suite of tools for Discord server management and community engagement:

<table>
<tr>
<td width="50%" valign="top">

### 🛡️ Moderation & Administration
- **Mass Actions** - Bulk ban/kick capabilities
- **User Notes** - Keep detailed moderation records
- **Case Management** - View and track all mod actions

### 💰 Economy System
- **Shop & Inventory** - Buy and manage items
- **Gambling** - Risk it for rewards
- **Pay System** - Transfer money between users

### 🎮 Fun & Entertainment
- **Random Facts** - Learn something new
- **Wanted Poster** - Create fun wanted images
- **Text Reversal** - Reverse any text

### 🎫 Advanced Ticket System
- **Claim & Priority** - Staff ticket management
- **Ticket Limits** - Prevent spam
- **Transcript System** - Save ticket history

### 🔢 Server Counters
- **Member Counter** - Live member count channels
- **Voice Counters** - Track voice stats
- **Dynamic Updates** - Real-time channel updates

### 🎭 Reaction Roles
- **Role Assignment** - Self-assignable roles
- **Emoji Selection** - Reaction-based system
- **Multi-role Support** - Multiple role options

</td>
<td width="50%" valign="top">

### 📊 Leveling & XP System
- **XP Tracking** - Automatic message-based XP
- **Level Roles** - Auto-assign roles by level
- **Custom Configuration** - Personalize leveling

### 🎉 Giveaways & Events
- **Multiple Winners** - Support multi-winner giveaways
- **Auto Picking** - Automatic winner selection
- **Reroll System** - Pick new winners if needed

### 🎂 Birthday System
- **Birthday Tracking** - Never miss a birthday
- **Auto Announcements** - Celebrate automatically
- **Timezone Support** - Accurate worldwide tracking

### 🔧 Utility Tools
- **Report System** - Report issues to staff
- **Todo Lists** - Personal task management
- **First Message** - Jump to channel's first message

### 👋 Welcome System
- **Welcome Messages** - Greet new members
- **Auto Roles** - Assign roles on join
- **Custom Embeds** - Personalized messages

</td>
</tr>
</table>

## 🚀 Quick Setup (recommend)

### 📹 Video Tutorial
For a detailed step-by-step setup guide, watch our comprehensive video tutorial:
[**TitanBot Setup Tutorial**](https://www.youtube.com/watch?v=YOUR_TUTORIAL_ID)

### Prerequisites
- Node.js 18.0.0 or higher
- PostgreSQL server (recommended) or memory storage fallback
- Discord bot application with proper intents

### Installation Steps

1. **Clone the Repository**
   ```bash
   git clone https://github.com/yourusername/TitanBot.git
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
   Edit `.env` with your configuration:
   ```env
   # Discord Bot Configuration
   DISCORD_TOKEN=your_discord_bot_token_here
   CLIENT_ID=your_discord_client_id_here
   GUILD_ID=your_discord_guild_id_here

   # PostgreSQL Configuration (Recommended)
   POSTGRES_URL=postgresql://titanbot:yourpassword@localhost:5432/titanbot
   POSTGRES_HOST=localhost
   POSTGRES_PORT=5432
   POSTGRES_DB=titanbot
   POSTGRES_USER=titanbot
   POSTGRES_PASSWORD=yourpassword
   POSTGRES_SSL=false

   # Migration Settings
   AUTO_MIGRATE=false

   # Bot Configuration
   NODE_ENV=development
   LOG_LEVEL=info
   ```

4. **Setup PostgreSQL Database** (Optional but recommended)
   ```bash
   # Create database and user
   createdb titanbot
   createuser titanbot
   psql -c "ALTER USER titanbot PASSWORD 'yourpassword';"
   psql -c "GRANT ALL PRIVILEGES ON DATABASE titanbot TO titanbot;"
   ```

5. **Test Database Connection**
   ```bash
   npm run test-postgres
   ```

6. **Start the Bot**
   ```bash
   npm start
   ```

## 🗄️ Database System

TitanBot uses **PostgreSQL** as its primary database with intelligent fallback to memory storage:

### PostgreSQL Features
- **ACID Compliance**: Reliable transactions and data integrity
- **High Performance**: Optimized queries and connection pooling
- **Persistence**: Data survives bot restarts and crashes
- **Complex Queries**: Advanced data analysis capabilities
- **Scalability**: Better performance for large datasets
- **TTL Support**: Automatic key expiration for temporary data
- **Connection Management**: Automatic reconnection with exponential backoff
- **Automatic Schema Creation**: Tables and indexes created on connection

### Fallback System
- **Memory Storage**: Automatic fallback when PostgreSQL is unavailable
- **Graceful Degradation**: Bot continues functioning without database
- **Backward Compatibility**: Maintains existing API structure
- **Zero Downtime**: Seamless switching between database and memory

## 🏗️ Bot Architecture

### Technology Stack
- **Discord.js v14** - Modern Discord API wrapper
- **Node.js 18+** - JavaScript runtime environment
- **PostgreSQL** - High-performance relational database
- **Express.js** - Web server for health checks
- **Winston** - Advanced logging system
- **Node-cron** - Scheduled task management

### Bot Intents
TitanBot requires the following Discord intents:
- Guilds
- Guild Messages
- Message Content
- Guild Members
- Guild Message Reactions
- Guild Voice States
- Direct Messages
- And more...

### Required Permissions
- **Send Messages**
- **Embed Links**
- **Attach Files**
- **Read Message History**
- **Manage Channels**
- **Manage Roles**
- **Manage Nicknames**
- **Ban Members**
- **Kick Members**
- **Manage Messages**

## 🤝 Contributing

We welcome contributions to TitanBot! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch**
3. **Make your changes**
4. **Test thoroughly**
5. **Submit a pull request**

### Development Guidelines
- Follow existing code style
- Add proper error handling
- Include documentation for new features
- Test with PostgreSQL and memory storage

## 📜 License

TitanBot is released under the MIT License. See [LICENSE](LICENSE) for details.

## 💌 Thank You

Thank you for choosing TitanBot for your Discord server! We're constantly working to improve and add new features based on community feedback.

**Made with ❤️**

---

*Last updated: January 2026*
