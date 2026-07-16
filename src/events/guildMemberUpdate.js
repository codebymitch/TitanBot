import { ChannelType, EmbedBuilder, Events, PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';

export const BOOST_GUILD_ID = '1526671786387705907';
export const BOOST_CHANNEL_ID = '1527374407343804566';

const detectionKey = member => `server_boost:${member.guild.id}:${member.id}:${member.premiumSinceTimestamp}`;

export function buildBoostPayload(member, { test = false } = {}) {
  const embed = new EmbedBuilder()
    .setColor(0xF47FFF)
    .setTitle(test ? '🧪 בדיקת מערכת הבוסטים' : '💜 תודה על הבוסט!')
    .setDescription(`**${member.user} בדיוק ביצע Server Boost ל־EditIL!**\n\nתודה ענקית על התמיכה שלך בקהילה ❤️\n\nבזכותך אנחנו יכולים להמשיך לגדול ולהשתפר.${test ? '\n\n*זוהי הודעת בדיקה בלבד.*' : ''}`)
    .addFields(
      { name: '🚀 רמת הבוסטים', value: String(member.guild.premiumTier), inline: true },
      { name: '💎 מספר הבוסטים', value: String(member.guild.premiumSubscriptionCount ?? 0), inline: true }
    )
    .setFooter({ text: 'EditIL • קהילת העורכים בישראל' })
    .setTimestamp();
  return { content: `${member.user}`, embeds: [embed], allowedMentions: { parse: [], users: [member.id] } };
}

export function getBoostChannel(guild) {
  const channel = guild.channels.cache.get(BOOST_CHANNEL_ID);
  return channel?.type === ChannelType.GuildText ? channel : null;
}

export function canSendBoostMessage(channel, guild) {
  return Boolean(channel.permissionsFor(guild.members.me)?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks
  ]));
}

export async function handleBoostStarted(oldMember, newMember, client = newMember.client) {
  if (newMember.guild.id !== BOOST_GUILD_ID) return false;
  if (oldMember.premiumSince || !newMember.premiumSince) return false;

  if (typeof client.db?.isAvailable === 'function' && !client.db.isAvailable()) {
    logger.error('Boost announcement skipped because persistent storage is unavailable', { guildId: newMember.guild.id, userId: newMember.id });
    return false;
  }

  const key = detectionKey(newMember);
  try {
    if (await client.db.get(key, false)) {
      logger.warn('Duplicate boost event ignored', { guildId: newMember.guild.id, userId: newMember.id, premiumSince: newMember.premiumSinceTimestamp });
      return false;
    }

    const channel = getBoostChannel(newMember.guild);
    if (!channel) {
      logger.error('Boost announcement channel not found or is not a text channel', { guildId: newMember.guild.id, channelId: BOOST_CHANNEL_ID });
      return false;
    }

    if (!canSendBoostMessage(channel, newMember.guild)) {
      logger.error('Missing permissions for boost announcement channel', { guildId: newMember.guild.id, channelId: channel.id });
      return false;
    }

    // Persist before sending so a process restart after Discord accepts the
    // message cannot produce a duplicate announcement.
    await client.db.set(key, { detectedAt: new Date().toISOString(), deliveryStatus: 'sending' });
    try {
      await channel.send(buildBoostPayload(newMember));
      await client.db.set(key, { detectedAt: new Date().toISOString(), deliveryStatus: 'delivered' });
    } catch (error) {
      await client.db.delete(key).catch(() => {});
      throw error;
    }
    logger.info('Server boost detected and announced', {
      guildId: newMember.guild.id,
      userId: newMember.id,
      premiumSince: newMember.premiumSinceTimestamp,
      boostCount: newMember.guild.premiumSubscriptionCount,
      boostTier: newMember.guild.premiumTier
    });
    return true;
  } catch (error) {
    logger.error('Failed to process server boost', { guildId: newMember.guild.id, userId: newMember.id, error: error.stack || error.message });
    return false;
  }
}

export default {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember, client) {
    await handleBoostStarted(oldMember, newMember, client);
  }
};
