import { AuditLogEvent, Events, PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';

// Server mute / deafen in voice (and lifting them) is logged here, with who did it.
const VOICE_MUTE_LOG_CHANNEL_ID = '1550596187533615207';
// The audit log entry can land a moment after the voice state event.
const AUDIT_LOG_DELAY_MS = 1_500;
const AUDIT_LOG_MAX_AGE_MS = 15_000;

const ACTIONS = {
  mute: { on: { title: '🔇 سيرفر ميوت', color: 0xed4245 }, off: { title: '🔊 فك سيرفر ميوت', color: 0x57f287 } },
  deaf: { on: { title: '🔕 سيرفر ديفن', color: 0xed4245 }, off: { title: '🔔 فك سيرفر ديفن', color: 0x57f287 } },
};

const changed = (before, after) => typeof before === 'boolean' && typeof after === 'boolean' && before !== after;

async function findExecutor(guild, targetId, key, value) {
  if (!guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) return null;
  await new Promise((resolve) => setTimeout(resolve, AUDIT_LOG_DELAY_MS));
  const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: 10 }).catch(() => null);
  const entry = logs?.entries.find((item) => item.target?.id === targetId
    && Date.now() - item.createdTimestamp < AUDIT_LOG_MAX_AGE_MS
    && item.changes?.some((change) => change.key === key && change.new === value));
  return entry?.executor || null;
}

async function logChange(member, voiceChannel, key, value) {
  const channel = member.guild.channels.cache.get(VOICE_MUTE_LOG_CHANNEL_ID)
    || await member.guild.channels.fetch(VOICE_MUTE_LOG_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) {
    logger.warn(`Voice mute log channel ${VOICE_MUTE_LOG_CHANNEL_ID} was not found in ${member.guild.name}.`);
    return;
  }

  const executor = await findExecutor(member.guild, member.id, key, value);
  const { title, color } = ACTIONS[key][value ? 'on' : 'off'];
  const lines = [
    `**العضو:** ${member} (${member.user.tag} - ${member.id})`,
    `**بواسطة:** ${executor ? `${executor} (${executor.tag})` : 'غير معروف'}`,
    voiceChannel ? `**الروم:** ${voiceChannel}` : null,
    `**الوقت:** <t:${Math.floor(Date.now() / 1000)}:F>`,
  ].filter(Boolean);

  await channel.send({
    embeds: [{ title, description: lines.join('\n'), color, timestamp: new Date().toISOString() }],
    allowedMentions: { parse: [] },
  });
}

export default {
  name: Events.VoiceStateUpdate,
  once: false,
  async execute(oldState, newState) {
    try {
      const member = newState.member || oldState.member;
      if (!member?.guild || member.user?.bot) return;
      const voiceChannel = newState.channel || oldState.channel;

      // Joining or leaving voice has no previous/next state, so only real toggles are logged.
      if (changed(oldState.serverMute, newState.serverMute)) {
        await logChange(member, voiceChannel, 'mute', newState.serverMute);
      }
      if (changed(oldState.serverDeaf, newState.serverDeaf)) {
        await logChange(member, voiceChannel, 'deaf', newState.serverDeaf);
      }
    } catch (error) {
      logger.error('Error in voice mute log:', error);
    }
  },
};
