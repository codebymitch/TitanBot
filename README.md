# 🤖 TitanBot - Ultimate Discord Bot

**TitanBot** is a powerful, feature-rich Discord bot designed to enhance your server experience with comprehensive moderation tools, engaging economy systems, utility features, and much more. Built with modern Discord.js v14 and PostgreSQL for optimal performance and data persistence.

## 📚 Table of Contents

- [🌟 Features Overview](#-features-overview)
- [🚀 Quick Setup](#-quick-setup)
  - [Installation Steps](#installation-steps)
  - [📹 Video Tutorial](#-video-tutorial)
- [🗄️ Database System](#️-database-system)
- [🌐 Support Server](#-support-server)
- [🏗️ Bot Architecture](#-bot-architecture)
- [🤝 Contributing](#-contributing)

## 🌟 Features Overview

TitanBot offers a complete suite of tools for Discord server management and community engagement:

### 🛡️ **Moderation & Administration**
- Comprehensive moderation commands (ban, kick, mute, timeout, warn)
- Advanced case management and warning system
- Automated moderation with configurable rules
- Server lockdown and purge capabilities
- Mass moderation tools (massban, masskick)
- User notes and reputation system
- Advanced ban management with unban support

### 💰 **Economy System**
- Full-featured economy with coins, banking, and trading
- Work, crime, beg, and gambling activities
- Interactive shop system with customizable items
- Economy leaderboards and statistics
- User transaction tracking and history

### 🎮 **Fun & Entertainment**
- Interactive games and activities
- Ship, fight, roll, and other fun commands
- Mock text, reverse text, and meme generation
- Wanted poster creation
- Adult content commands (18+)

### 📊 **Leveling & XP System**
- Automatic XP gain for active participation
- Customizable leveling rewards and roles
- Server and user statistics tracking
- Leaderboards and achievements

### 🎫 **Advanced Ticket System**
- Advanced ticket management with priorities
- Custom ticket categories and workflows
- Automated ticket archiving and logging
- Support team role management
- **NEW**: Maximum ticket limits per user
- **NEW**: DM notifications on ticket closure
- **NEW**: HTML transcript generation with embed preview

### 🎉 **Giveaways & Events**
- Automated giveaway creation and management
- Customizable duration, winners, and requirements
- Real-time giveaway tracking and notifications
- Winner selection and prize distribution

### 🎂 **Birthday System**
- Automatic birthday celebrations and announcements
- Custom birthday roles and rewards
- Birthday calendar and upcoming celebrations
- Timezone-aware birthday detection

### 🔧 **Utility Tools**
- AFK system with auto-responses and nickname management
- Todo lists and task management
- Weather information and forecasts
- User and server information displays
- Advanced search capabilities

### 👋 **Welcome System**
- Customizable welcome and goodbye messages
- Auto-role assignment for new members
- Member milestone celebrations
- Server growth statistics

### 🔢 **Server Counters**
- Real-time server statistics display
- Custom counter creation and management
- Member, bot, and category-specific counters
- Automatic counter updates

### 🎭 **Reaction Roles**
- Self-assignable role system
- Custom reaction role panels
- Multiple role categories and groups
- Easy role management interface

## 🚀 Quick Setup

### Prerequisites
- Node.js 18.0.0 or higher
- PostgreSQL server (recommended) or memory storage fallback
- Discord bot application with proper intents

### Installation Steps

1. **Clone the Repository**
   ```bash
   git clone https://github.com/your-username/TitanBot-redis.git
   cd TitanBot-redis
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

### 📹 Video Tutorial
For a detailed step-by-step setup guide, watch our comprehensive video tutorial:
[**TitanBot Setup Tutorial**](https://www.youtube.com/watch?v=your-tutorial-link)

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
- **Migration System**: Version-controlled schema updates

### Fallback System
- **Memory Storage**: Automatic fallback when PostgreSQL is unavailable
- **Graceful Degradation**: Bot continues functioning without database
- **Backward Compatibility**: Maintains existing API structure
- **Zero Downtime**: Seamless switching between database and memory

### Database Migration
- **Automatic Migrations**: Built-in schema versioning
- **Rollback Support**: Safe migration with rollback capability
- **Data Integrity**: Comprehensive validation and verification
- **Performance Monitoring**: Migration progress tracking

## 🌐 Support Server

Need help with TitanBot? Join our support community!

[**Join TitanBot Support Server**](https://discord.gg/your-support-server)

- 🆘 Get help with setup and configuration
- 💬 Suggest new features and improvements
- 🐛 Report bugs and issues
- 📢 Stay updated with latest announcements
- 🎉 Participate in community events and giveaways

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

## 📊 Performance & Monitoring

### Built-in Monitoring
- **Health Checks**: Web server endpoint at `/`
- **Performance Metrics**: Command execution times
- **Error Tracking**: Comprehensive error logging
- **Database Monitoring**: PostgreSQL connection status and performance
- **Query Optimization**: Efficient database operations

### Logging System
- **Daily Rotation**: Automatic log file rotation
- **Multiple Levels**: Error, warn, info, debug
- **Structured Logs**: JSON format for easy parsing
- **Performance Tracking**: Command and event timing
- **Database Logs**: Connection and query performance

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
- Ensure database migrations are properly handled

## 🆕 Recent Updates

### Database Migration
- **PostgreSQL Integration**: Complete migration from Redis to PostgreSQL
- **Enhanced Performance**: Better query optimization and indexing
- **Data Integrity**: ACID compliance and proper relationships
- **Backup Support**: Standard database backup and restore tools

### Ticket System Enhancements
- **User Limits**: Configurable maximum tickets per user
- **DM Notifications**: Automatic DM when tickets are closed
- **Transcript Improvements**: HTML transcripts with embed preview
- **Better UX**: Enhanced user feedback and error handling

### New Commands
- **`/ticketlimits`**: Manage ticket limits and settings
- **`/ticketlimits view`**: View current ticket configuration
- **`/ticketlimits set`**: Set maximum tickets per user
- **`/ticketlimits check`**: Check user's ticket count
- **`/ticketlimits toggle_dm`**: Toggle DM notifications

## 📚 Additional Documentation

- **[PostgreSQL Setup Guide](README-POSTGRESQL.md)** - Detailed database configuration
- **[Command Reference](docs/commands.md)** - Complete command documentation
- **[API Documentation](docs/api.md)** - Bot API and integration guide
- **[Troubleshooting](docs/troubleshooting.md)** - Common issues and solutions

## 📜 License

TitanBot is released under the MIT License. See [LICENSE](LICENSE) for details.

## 💌 Thank You

Thank you for choosing TitanBot for your Discord server! We're constantly working to improve and add new features based on community feedback.

**Made with ❤️**

---

*Last updated: January 2026*
