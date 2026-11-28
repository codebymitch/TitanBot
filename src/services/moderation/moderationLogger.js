import { EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';

const RED_COLOR = 0xdc2626;

export async function logModerationAction({
  client,
  guild,
  guildConfig,
  action = 'moderation',
  moderator,
  target,
  reason = 'لم يتم تحديد سبب',
  metadata = {},
} = {}) {
  try {
    logger.info(`[Moderation Log] ${action} in ${guild?.id || 'unknown'} by ${moderator?.id || 'unknown'} on ${target?.id || 'unknown'}`, {
      reason,
      ...metadata,
    });

    const logChannelId =
      guildConfig?.modLogChannelId ||
      guildConfig?.moderationLogChannelId ||
      guildConfig?.logChannelId ||
      null;

    if (!logChannelId || !guild) {
      return { logged: false, reason: 'No mod log channel configured' };
    }

    const channel =
      guild.channels?.cache?.get(logChannelId) ||
      (await guild.channels?.fetch(logChannelId).catch(() => null));

    if (!channel || !channel.isTextBased?.()) {
      return { logged: false, reason: 'Mod log channel not found or not text-based' };
    }

    const embed = new EmbedBuilder()
      .setColor(RED_COLOR)
      .setTitle(`## 📋 سجل إشرافي — ${action}`)
      .addFields(
        {
          name: '**العضو**',
          value: target
            ? `**${target.tag || target.username || target.id}**\n\`${target.id}\``
            : '**غير معروف**',
          inline: true,
        },
        {
          name: '**المشرف**',
          value: moderator
            ? `**${moderator.tag || moderator.username || moderator.id}**\n\`${moderator.id}\``
            : '**غير معروف**',
          inline: true,
        },
        {
          name: '**السبب**',
          value: `**${reason}**`,
          inline: false,
        }
      )
      .setTimestamp();

    if (typeof metadata.softCount === 'number' && typeof metadata.threshold === 'number') {
      embed.addFields({
        name: '**التحذيرات الخفيفة**',
        value: `**${metadata.softCount} / ${metadata.threshold}**`,
        inline: true,
      });
    }

    if (metadata.escalated) {
      embed.addFields({
        name: '**التحويل الرسمي**',
        value: metadata.officialTotalWarns
          ? `**+1 (الإجمالي: ${metadata.officialTotalWarns})**`
          : '**+1 تحذير رسمي**',
        inline: true,
      });
    }

    if (typeof metadata.dmDelivered === 'boolean') {
      embed.addFields({
        name: '**حالة الرسالة الخاصة**',
        value: metadata.dmDelivered ? '**✅ تم الإرسال**' : '**❌ لم يتم الإرسال**',
        inline: true,
      });
    }

    await channel.send({ embeds: [embed] });
    return { logged: true };
  } catch (error) {
    logger.warn('Failed to send moderation log:', {
      error: error?.message || String(error),
    });
    return { logged: false, reason: error?.message || 'Failed to log moderation action' };
  }
}

export default {
  logModerationAction,
};
