# AFK System Documentation

## Overview
The TitanBot AFK (Away From Keyboard) system allows users to set their status as AFK with custom reasons, automatically responds to mentions, and provides comprehensive AFK management features.

## 🌙 Features

### Core Features
- **Set AFK Status**: `/afk [reason]` - Mark yourself as AFK with a custom reason
- **Remove AFK Status**: `/afk remove:true` - Manually remove your AFK status
- **Auto-Return**: Automatically removes AFK when you speak again
- **Nickname Management**: Automatically adds `[AFK]` prefix to nicknames
- **Mention Responses**: Automatic replies when AFK users are mentioned

### Management Features
- **AFK List**: `/afklist` - View all currently AFK users
- **AFK Statistics**: `/afkstats` - View server AFK analytics
- **Time Tracking**: Shows how long users have been AFK
- **Reason Analytics**: Most common AFK reasons

## 📋 Commands

### `/afk`
Set or remove your AFK status.

**Options:**
- `reason` (optional): The reason for being AFK (default: "AFK")
- `remove` (optional): Set to `true` to remove AFK status

**Examples:**
```
/afk reason:"Taking a nap"
/afk reason:"Working on homework"
/afk remove:true
```

**Features:**
- Automatically adds `[AFK]` prefix to nickname
- Prevents duplicate AFK status
- Provides clear feedback messages

### `/afklist`
List all users currently AFK in the server.

**Options:**
- `limit` (optional): Maximum users to show (1-50, default: 20)

**Output:**
- User display names and mentions
- AFK reasons
- How long they've been AFK
- Pagination for large servers

### `/afkstats`
View comprehensive AFK statistics for the server.

**Options:**
- `type` (optional): Type of statistics
  - `overview` (default): General AFK statistics
  - `reasons`: Most common AFK reasons
  - `recent`: Most recent AFK activity

**Statistics Provided:**
- Total members vs AFK users
- Average AFK duration
- Longest AFK user
- Top AFK reasons
- Recent activity timeline

## 🔄 Automatic Features

### Mention Responses
When someone mentions an AFK user:
- Bot automatically replies with AFK status
- Shows the AFK reason and duration
- Mentions are handled silently (no pings)

### Auto-Return System
When an AFK user sends a message:
- Automatically removes AFK status
- Removes `[AFK]` prefix from nickname
- Sends welcome back message
- Prevents AFK responses for that message

### Nickname Management
- **Setting AFK**: Adds `[AFK] ` prefix to current nickname
- **Removing AFK**: Restores original nickname
- **Permission Safe**: Gracefully handles nickname permission errors

## 🗄️ Data Storage

### Database Structure
AFK data is stored using the existing Redis/database system:

```
Key: afk:{guildId}:{userId}
Value: {
  reason: string,
  timestamp: number,
  guildId: string,
  userId: string
}
```

### Data Retention
- AFK status persists until manually removed or user speaks
- No automatic expiration (user-controlled)
- Clean removal when status is cleared

## ⚙️ Configuration

### Required Permissions
- **Manage Nicknames**: For adding/removing `[AFK]` prefix
- **Send Messages**: For AFK responses
- **Embed Links**: For formatted responses

### Integration Points
- **Message Events**: Handles mention detection and auto-return
- **Command System**: Uses existing slash command framework
- **Database**: Integrates with existing AFK utility functions

## 🛠️ Technical Details

### File Structure
```
src/
├── commands/Utility/
│   ├── afk.js          # Main AFK command
│   ├── afklist.js      # List AFK users
│   └── afkstats.js     # AFK statistics
├── handlers/
│   └── afkHandler.js   # Mention handling logic
├── utils/
│   └── afk.js          # Database utility functions
└── events/
    └── messageCreate.js # Event integration
```

### Error Handling
- Graceful nickname permission failures
- Database error recovery
- Missing user handling
- Rate limiting protection

### Performance Considerations
- Efficient database queries
- Batch member fetching
- Cached AFK status checks
- Limited response sizes

## 🎯 Use Cases

### For Server Members
- **Study Breaks**: Set AFK while taking breaks
- **Gaming Sessions**: AFK during gaming sessions
- **Work Hours**: Mark as unavailable during work
- **Vacations**: Extended AFK status

### For Server Moderation
- **Activity Monitoring**: Track user engagement
- **Server Health**: Monitor AFK patterns
- **Community Insights**: Understand user behavior

## 🔧 Troubleshooting

### Common Issues

**AFK not removing when I speak:**
- Check if you have message permissions
- Verify bot has necessary permissions
- Try manual removal with `/afk remove:true`

**Nickname not changing:**
- Bot needs "Manage Nicknames" permission
- Check if role hierarchy allows nickname changes
- Manual nickname changes override AFK prefix

**AFK responses not working:**
- Verify bot has "Send Messages" permission
- Check if channel allows bot messages
- Ensure mentions are enabled

### Debug Commands
```
/afkstats type:overview    # Check system status
/afklist limit:5          # Test AFK detection
```

## 🚀 Future Enhancements

Potential improvements:
- **AFK Categories**: Pre-defined AFK reasons
- **Scheduled AFK**: Set AFK for specific time periods
- **AFK Roles**: Assign special roles to AFK users
- **AFK History**: Track AFK patterns over time
- **Custom Responses**: Personalized AFK messages
- **Integration**: Connect with other bot systems

## 📊 Analytics

The AFK system provides valuable insights:
- User engagement patterns
- Peak activity times
- Community behavior trends
- Server health metrics

Use `/afkstats` to explore these analytics and make informed server management decisions.

---

**Note**: This AFK system integrates seamlessly with existing TitanBot features and maintains the same high standards of performance and user experience.
