import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildCreate,

  async execute(guild) {
    try {
      // Find the bot's own managed integration role
      const botRole = guild.roles.cache.find(
        r => r.managed && r.members.has(guild.members.me?.id)
      );
      if (!botRole) return;

      // Set role color to yellow
      await botRole.setColor(0xFEE75C, 'Auto-setup on join').catch(() => {});

      // Move to the highest allowed position (top of the stack)
      const highest = guild.roles.cache
        .filter(r => !r.managed && r.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .first();

      const targetPosition = highest ? highest.position + 1 : 1;
      await botRole.setPosition(targetPosition).catch(() => {});

      logger.info(`Auto-setup role in ${guild.name}: color=yellow, position=${botRole.position}`);
    } catch (err) {
      logger.error(`guildCreate role setup error in ${guild.name}:`, err);
    }
  },
};
