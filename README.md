# 🤖 TitanBot - Ultimate Discord Bot

**TitanBot** is a powerful, feature-rich Discord bot designed to enhance your server experience with comprehensive moderation tools, engaging economy systems, utility features, and much more. Built with modern Discord.js v14 and Redis for optimal performance.

## 🌟 Features Overview

TitanBot offers a complete suite of tools for Discord server management and community engagement:

### 🛡️ **Moderation & Administration**
- Comprehensive moderation commands (ban, kick, mute, timeout, warn)
- Advanced case management and warning system
- Automated moderation with configurable rules
- Server lockdown and purge capabilities

### 💰 **Economy System**
- Full-featured economy with coins, banking, and trading
- Work, crime, beg, and gambling activities
- Interactive shop system with customizable items
- Economy leaderboards and statistics

### 🎮 **Fun & Entertainment**
- Interactive games and activities
- Ship, fight, roll, and other fun commands
- Mock text, reverse text, and meme generation
- Wanted poster creation

### 📊 **Leveling & XP System**
- Automatic XP gain for active participation
- Customizable leveling rewards and roles
- Server and user statistics tracking
- Leaderboards and achievements

### 🎫 **Ticket System**
- Advanced ticket management with priorities
- Custom ticket categories and workflows
- Automated ticket archiving and logging
- Support team role management

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
- Redis server (optional, falls back to memory storage)
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
   TOKEN=your_discord_bot_token
   CLIENT_ID=your_bot_client_id
   GUILD_ID=your_server_id (optional for testing)
   REDIS_URL=redis://localhost:6379 (optional)
   OWNER_IDS=your_discord_user_id,other_owner_id
   ```

4. **Start the Bot**
   ```bash
   npm start
   ```

### 📹 Video Tutorial
For a detailed step-by-step setup guide, watch our comprehensive video tutorial:
[**TitanBot Setup Tutorial**](https://www.youtube.com/watch?v=your-tutorial-link)

## 🗄️ Database System

TitanBot uses **Redis** as its primary database with intelligent fallback to memory storage:

### Redis Features
- **High Performance**: Blazing fast data operations
- **Persistence**: Data survives bot restarts
- **Atomic Operations**: Reliable counter increments/decrements
- **TTL Support**: Automatic key expiration
- **Connection Management**: Automatic reconnection with exponential backoff

### Fallback System
- **Memory Storage**: Automatic fallback when Redis is unavailable
- **Graceful Degradation**: Bot continues functioning without Redis
- **Backward Compatibility**: Maintains existing API structure

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
- **Redis** - High-performance database
- **Express.js** - Web server for health checks
- **Winston** - Advanced logging system

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
- **Database Monitoring**: Redis connection status

### Logging System
- **Daily Rotation**: Automatic log file rotation
- **Multiple Levels**: Error, warn, info, debug
- **Structured Logs**: JSON format for easy parsing
- **Performance Tracking**: Command and event timing

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
- Test with Redis and memory storage

## 📜 License

TitanBot is released under the MIT License. See [LICENSE](LICENSE) for details.

## 💌 Thank You

Thank you for choosing TitanBot for your Discord server! We're constantly working to improve and add new features based on community feedback.

**Made with ❤️**

---

*Last updated: January 2026*
