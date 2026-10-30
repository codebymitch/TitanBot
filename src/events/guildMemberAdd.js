import { Events, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getColor, botConfig } from '../config/bot.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { getWelcomeConfig } from '../utils/database.js';
import { formatWelcomeMessage } from '../utils/welcome.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { getServerCounters, updateCounter } from '../services/serverstatsService.js';
import { setBirthday as dbSetBirthday } from '../utils/database.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildMemberAdd,
  once: false,
  async execute(member) {
    try {
      const { guild, user } = member;
      const config = await getGuildConfig(member.client, guild.id);
      const welcomeConfig = await getWelcomeConfig(member.client, guild.id);
      const welcomeChannelId = welcomeConfig?.channelId;
      if (welcomeConfig?.enabled && welcomeChannelId) {
        const channel = guild.channels.cache.get(welcomeChannelId);
        const me = guild.members.me;
        const permissions = channel?.isTextBased?.() && me ? channel.permissionsFor(me) : null;
        if (permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
          const formatData = { user, guild, member };
          const welcomeMessage = formatWelcomeMessage(welcomeConfig.welcomeMessage || welcomeConfig.welcomeEmbed?.description || botConfig.welcome?.defaultWelcomeMessage || 'Welcome {user} to {server}!', formatData);
          const messageContent = welcomeConfig.welcomePing ? user.toString() : null;
          if (!permissions.has(PermissionFlagsBits.EmbedLinks)) await channel.send({ content: messageContent || welcomeMessage });
          else await channel.send({ content: messageContent, embeds: [new EmbedBuilder().setColor(welcomeConfig.welcomeEmbed?.color || getColor('success')).setTitle(formatWelcomeMessage(welcomeConfig.welcomeEmbed?.title || '🎉 Welcome!', formatData)).setDescription(welcomeMessage).setThumbnail(user.displayAvatarURL()).setTimestamp().setFooter({ text: welcomeConfig.welcomeEmbed?.footer ? formatWelcomeMessage(welcomeConfig.welcomeEmbed.footer, formatData) : `Welcome to ${guild.name}!` })] });
        }
      }
      if (config?.verification?.enabled || config?.verification?.autoVerify?.enabled) await handleVerification(member, guild, config.verification, member.client);
      await logEvent({ client: member.client, guildId: guild.id, eventType: EVENT_TYPES.MEMBER_JOIN, data: { title: 'User joined', lines: [`**User:** ${user} (${user.id})`, `**Members:** ${guild.memberCount}`], userId: user.id } });
      for (const counter of await getServerCounters(member.client, guild.id)) if (counter?.type && counter.channelId && counter.enabled !== false) await updateCounter(member.client, guild, counter);
      const backupKey = `guild:${guild.id}:birthdays:left`; const backup = (await member.client.db.get(backupKey)) || {};
      if (backup[user.id]) { const { month, day } = backup[user.id]; await dbSetBirthday(member.client, guild.id, user.id, month, day); delete backup[user.id]; await member.client.db.set(backupKey, backup); }
    } catch (error) { logger.error('Error in guildMemberAdd event:', error); }
  },
};
async function handleVerification(member, guild, verificationConfig, client) { const { autoVerifyOnJoin } = await import('../services/verificationService.js'); try { await autoVerifyOnJoin(client, guild, member, verificationConfig); } catch (error) { logger.error('Error in auto-verification:', error); } }
