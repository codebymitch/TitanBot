import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.RoleCreate,
  once: false,

  async execute(role) {
    try {
      if (!role.guild) return;

      const fields = [];

      // Role details
      fields.push({
        name: '🏷️ Role Name',
        value: role.name,
        inline: true
      });

      fields.push({
        name: '🎨 Color',
        value: role.hexColor || '#000000',
        inline: true
      });

      fields.push({
        name: '🆔 Role ID',
        value: role.id,
        inline: true
      });

      // Permissions (top 5 or all if less)
      const perms = role.permissions.toArray();
      if (perms.length > 0) {
        const displayPerms = perms.slice(0, 5).join(', ');
        fields.push({
          name: '🔐 Permissions',
          value: perms.length > 5 ? `${displayPerms}... (+${perms.length - 5} more)` : displayPerms,
          inline: false
        });
      }

      fields.push({
        name: '✅ Hoisted',
        value: role.hoist ? 'Yes' : 'No',
        inline: true
      });

      fields.push({
        name: '🤖 Managed',
        value: role.managed ? 'Yes (Bot role)' : 'No',
        inline: true
      });

      fields.push({
        name: '📍 Position',
        value: role.position.toString(),
        inline: true
      });

      await logEvent({
        client: role.client,
        guildId: role.guild.id,
        eventType: EVENT_TYPES.ROLE_CREATE,
        data: {
          description: `A new role was created: ${role.toString()}`,
          fields
        }
      });

    } catch (error) {
      logger.error('Error in roleCreate event:', error);
    }
  }
};
