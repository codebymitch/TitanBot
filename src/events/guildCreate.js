import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';

async function setupBotRole(guild) {
  try {
    // Fetch fresh data so cache is populated
    await guild.roles.fetch();
    const me = await guild.members.fetchMe().catch(() => null);
    if (!me) return;

    const botRole = guild.roles.cache.find(r => r.managed && me.roles.cache.has(r.id));
    if (!botRole) return;

    await botRole.setColor(0xFEE75C).catch(() => {});

    // Find the highest non-managed, non-everyone role position
    const topPos = guild.roles.cache
      .filter(r => !r.managed && r.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .first()?.position ?? 0;

    await botRole.setPosition(topPos + 1).catch(() => {});

    logger.info(`Role setup in ${guild.name}: color=yellow, position=${topPos + 1}`);
  } catch (err) {
    logger.error(`guildCreate role setup error in ${guild.name}:`, err);
  }
}

const BLACKLISTED_GUILDS = new Set(
  process.env.BLACKLISTED_GUILDS?.split(',').map(id => id.trim()).filter(Boolean) ?? []
);

export default {
  name: Events.GuildCreate,
  async execute(guild) {
    if (BLACKLISTED_GUILDS.has(guild.id)) {
      logger.warn(`Leaving blacklisted guild: ${guild.name} (${guild.id})`);
      await guild.leave().catch(() => {});
      return;
    }
    // Small delay so Discord finishes setting up the guild
    setTimeout(() => setupBotRole(guild), 3000);
  },
};

export { setupBotRole };
