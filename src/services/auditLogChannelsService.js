import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { updateGuildConfig } from './config/guildConfig.js';
import { logger } from '../utils/logger.js';

export const AUDIT_LOG_CATEGORY_ID = '1547320311626731562';

const LOG_CHANNELS = {
  moderation: 'moderation',
  timeout: 'timeout',
  ban: 'ban',
  message: 'message-deleted',
  voice: 'voice',
  roles: 'roles',
  join: 'join',
  leave: 'leave',
  invites: 'invites',
};

export async function ensureAuditLogChannels(client) {
  for (const guild of client.guilds.cache.values()) {
    try {
      const category = guild.channels.cache.get(AUDIT_LOG_CATEGORY_ID)
        || await guild.channels.fetch(AUDIT_LOG_CATEGORY_ID).catch(() => null);
      if (!category || category.type !== ChannelType.GuildCategory) {
        logger.warn(`Audit log category ${AUDIT_LOG_CATEGORY_ID} was not found in ${guild.name}.`);
        continue;
      }

      const botMember = guild.members.me;
      const channels = {};
      for (const [key, name] of Object.entries(LOG_CHANNELS)) {
        let channel = guild.channels.cache.find(
          candidate => candidate.parentId === category.id && candidate.name === name && candidate.type === ChannelType.GuildText,
        );

        if (!channel) {
          channel = await guild.channels.create({
            name,
            type: ChannelType.GuildText,
            parent: category.id,
            reason: 'Create dedicated log channel',
            permissionOverwrites: [
              {
                id: guild.id,
                deny: [PermissionFlagsBits.ViewChannel],
              },
              ...(botMember ? [{
                id: botMember.id,
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.SendMessages,
                  PermissionFlagsBits.EmbedLinks,
                ],
              }] : []),
            ],
          });
        }
        channels[key] = channel.id;
      }

      await updateGuildConfig(client, guild.id, { auditChannels: channels });
      logger.info(`Dedicated log channels are ready in ${guild.name}.`);
    } catch (error) {
      logger.error(`Failed to prepare log channels in ${guild.name}:`, error);
    }
  }
}

export function getAuditLogChannelId(config, key) {
  return config?.auditChannels?.[key] || null;
}
