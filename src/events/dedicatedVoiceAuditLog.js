import { Events } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { getAuditLogChannelId } from '../services/auditLogChannelsService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.VoiceStateUpdate,
  once: false,
  async execute(oldState, newState) {
    try {
      const member = newState.member || oldState.member;
      if (!member || member.user?.bot || !member.guild) return;

      const config = await getGuildConfig(member.client, member.guild.id);
      const channelId = getAuditLogChannelId(config, 'voice');
      const channel = channelId ? member.guild.channels.cache.get(channelId) : null;
      const permissions = channel && member.guild.members.me ? channel.permissionsFor(member.guild.members.me) : null;
      if (!channel || !permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) return;

      let action = 'voice state updated';
      if (!oldState.channel && newState.channel) action = `joined ${newState.channel}`;
      else if (oldState.channel && !newState.channel) action = `left ${oldState.channel}`;
      else if (oldState.channelId !== newState.channelId) action = `moved from ${oldState.channel} to ${newState.channel}`;
      else if (oldState.serverMute !== newState.serverMute) action = newState.serverMute ? 'was server muted' : 'was server unmuted';
      else if (oldState.serverDeaf !== newState.serverDeaf) action = newState.serverDeaf ? 'was server deafened' : 'was server undeafened';

      await channel.send({
        embeds: [{
          title: '🔊 Voice Log',
          description: `**User:** ${member}\n**Action:** ${action}\n**Time:** <t:${Math.floor(Date.now() / 1000)}:F>`,
          color: 0x5865F2,
          timestamp: new Date().toISOString(),
        }],
      });
    } catch (error) {
      logger.error('Error in dedicated voice audit log:', error);
    }
  },
};
