import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getLevelingConfig, getUserLevelData, saveUserLevelData } from '../utils/database.js';
import { addXp } from '../services/xpSystem.js';

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      if (message.author.bot || !message.guild) return;

      await handleLeveling(message, client);

    } catch (error) {
      logger.error('Error in messageCreate event:', error);
    }
  },
};

async function handleLeveling(message, client) {
  const levelingConfig = await getLevelingConfig(client, message.guild.id);
  
  if (!levelingConfig?.enabled) return;

  if (levelingConfig.ignoredChannels?.includes(message.channel.id)) return;

  if (levelingConfig.ignoredRoles?.length > 0) {
    const member = await message.guild.members.fetch(message.author.id).catch(() => null);
    if (member && member.roles.cache.some(role => levelingConfig.ignoredRoles.includes(role.id))) return;
  }

  if (levelingConfig.blacklistedUsers?.includes(message.author.id)) return;

  const userData = await getUserLevelData(client, message.guild.id, message.author.id);
  
  const cooldownTime = levelingConfig.xpCooldown || 60;
  const now = Date.now();
  const timeSinceLastMessage = now - (userData.lastMessage || 0);
  
  if (timeSinceLastMessage < cooldownTime * 1000) return;

  const minXP = levelingConfig.xpPerMessage?.min || 15;
  const maxXP = levelingConfig.xpPerMessage?.max || 25;
  const xpToGive = Math.floor(Math.random() * (maxXP - minXP + 1)) + minXP;

  let finalXP = xpToGive;
  if (levelingConfig.xpMultiplier && levelingConfig.xpMultiplier > 1) {
    finalXP = Math.floor(finalXP * levelingConfig.xpMultiplier);
  }

  const result = await addXp(client, message.guild, message.member, finalXP);
  
  if (result.success && result.leveledUp) {
    logger.info(`${message.author.tag} leveled up to ${result.level} in ${message.guild.name}`);
  }
}

