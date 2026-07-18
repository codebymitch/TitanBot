import { Events } from 'discord.js';
import { getConfig, levelKey } from '../modules/community/store.js';
import { createEmbed } from '../utils/embeds.js';
import { handleOwnerInboxReply } from '../services/ownerInboxService.js';
import { clampCommunityXp, communityLevelFromXp, MAX_LEVEL } from '../utils/levelLimits.js';
import logger from '../utils/logger.js';

export const LEVEL_UP_CHANNEL_ID = '1527004187093762159';

export default { name: Events.MessageCreate, async execute(message) {
  if (!message.author.bot && await handleOwnerInboxReply(message)) return;
  if (!message.guild || message.author.bot || message.webhookId) return;

  // Normal messages are used for leveling only. The logging handler records
  // message edits and deletions, so the log channel is not flooded by chat.
  const config = await getConfig(message.client, message.guild.id);
  if (!config.leveling.enabled || !message.content.trim()) return;

  const id = levelKey(message.guild.id, message.author.id);
  const user = await message.client.db.get(id, { xp: 0, level: 0, last: 0 });
  if (Date.now() - user.last < config.leveling.cooldownMs) return;
  if (communityLevelFromXp(user.xp) >= MAX_LEVEL) return;

  user.xp = clampCommunityXp(user.xp + config.leveling.xpMin + Math.floor(Math.random() * (config.leveling.xpMax - config.leveling.xpMin + 1)));
  user.last = Date.now();
  const level = communityLevelFromXp(user.xp);
  const changed = level > user.level;
  user.level = level;
  await message.client.db.set(id, user);

  if (changed) {
    const channel = message.guild.channels.cache.get(LEVEL_UP_CHANNEL_ID)
      || await message.guild.channels.fetch(LEVEL_UP_CHANNEL_ID).catch(() => null);

    if (!channel?.isTextBased()) {
      logger.warn('Level-up announcement channel is unavailable', {
        guildId: message.guild.id,
        channelId: LEVEL_UP_CHANNEL_ID,
        userId: message.author.id,
      });
      return;
    }

    await channel.send({
      content: message.author.toString(),
      embeds: [createEmbed({
        title: 'עלית רמה!',
        description: `${message.author}, הגעת לרמה **${level}**.`,
        color: 'success',
      })],
      allowedMentions: { users: [message.author.id], parse: [] },
    });
  }
} };
