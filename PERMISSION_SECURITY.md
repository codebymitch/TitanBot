
# Command Permission Security Guide

This guide explains best practices for securing commands with proper permission checks to prevent privilege escalation.

## Overview

Permission checks should happen at THREE levels:
1. **Discord API Level** - `.setDefaultMemberPermissions()` on command builder
2. **Runtime Check** - Validate user has required permissions in code
3. **Audit Logging** - Log all permission-sensitive actions

## Using Permission Guards

### Import the Guard Module
```javascript
import { 
  checkUserPermissions, 
  checkBotPermissions,
  isAdmin,
  isModerator 
} from '../../utils/permissionGuard.js';
```

### Example: Admin-Only Command

```javascript
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { checkUserPermissions } from '../../utils/permissionGuard.js';

export default {
  data: new SlashCommandBuilder()
    .setName('example')
    .setDescription('Admin only command')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Discord API level
  
  async execute(interaction) {
    // Runtime permission check (defensive programming)
    if (!await checkUserPermissions(
      interaction, 
      PermissionFlagsBits.Administrator,
      'You must be an administrator to use this command.'
    )) {
      return; // Response already sent by guard
    }
    
    // Command logic here
    await interaction.reply('Admin action executed!');
  }
};
```

### Example: Command Requiring Bot Permissions

```javascript
async execute(interaction) {
  // Check user has permission
  if (!await checkUserPermissions(
    interaction,
    PermissionFlagsBits.ModerateMembers
  )) {
    return;
  }
  
  // Check bot has required channel permissions
  if (!await checkBotPermissions(
    interaction,
    [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]
  )) {
    return;
  }
  
  // Safe to proceed - both user and bot have required permissions
  // Perform action...
}
```

## Permission Levels

### User Permission Checks
- **Admin**: `isAdmin(member)` - Has Administrator permission
- **Moderator**: `isModerator(member)` - Has Administrator or ManageGuild
- **Specific**: `hasPermission(member, 'PermissionName')` - Any permission

### Bot Permission Checks
- `botHasPermission(channel, 'PermissionName')` - Check if bot has permission in channel
- `checkBotPermissions(interaction, requiredPerms)` - Guard with automatic error response

## Best Practices

### ✅ DO:
- Always set `.setDefaultMemberPermissions()` on the command builder
- Perform runtime checks even if Discord API level is set (defense in depth)
- Check bot permissions BEFORE performing actions that need them
- Log all permission-denied attempts via `auditPermissionCheck()`
- Use meaningful error messages that explain what permission is needed

### ❌ DON'T:
- Rely ONLY on Discord API level permission checks
- Skip runtime validation (user roles could change between slash command registration and execution)
- Assume bot has required permissions without checking
- Log sensitive data in permission audit trails
- Create custom permission checking logic; use the guard module

## Audit Logging

All permission checks are automatically logged:
```
[PERMISSION_DENIED] User 123456789 attempted command ban_user in guild 987654321
[BOT_PERMISSION_DENIED] Bot missing permissions [ManageRoles, ModerateMembers] in channel 555555555
```

## Security Checklist

For each command, verify:
- [ ] `.setDefaultMemberPermissions()` set correctly on builder
- [ ] Runtime `checkUserPermissions()` guard added in execute()
- [ ] Bot permissions verified with `checkBotPermissions()` where needed
- [ ] Error messages are user-friendly and explain what's needed
- [ ] Sensitive actions are logged
- [ ] Role hierarchy is respected (can't kick/ban members with higher roles)
- [ ] No hardcoded role/user IDs (use config or guild settings)

## Related Files

- [Permission Guard Module](./permissionGuard.js)
- [Error Handling](./errorHandler.js)
- [Command Template](../commands/TEMPLATE.md)

