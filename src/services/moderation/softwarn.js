import { EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';

export async function notifySoftWarn(targetUser, {
  guildName,
  moderatorTag,
  reason,
  softCount,
  threshold,
  warningId,
  escalated = false,
  officialTotalCount = null,
}) {
  if (!targetUser) {
    return { delivered: false, reason: 'لم يتم العثور على العضو' };
  }

  try {
    const embed = new EmbedBuilder()
      .setColor(escalated ? 0xed4245 : 0xfee75c)
      .setTitle(escalated ? '⚠️ تحذير خفيف — تم إصدار تحذير رسمي' : '⚠️ تحذير خفيف')
      .setDescription(
        `لقد تلقيت تحذيرًا خفيفًا في سيرفر **${guildName}**.` +
        (escalated
          ? `\nلقد وصلت إلى الحد المحدد للتحذيرات الخفيفة (**${softCount}/${threshold}**) وتم إصدار **تحذير رسمي** بحقك.`
          : '')
      )
      .addFields(
        { name: 'السبب', value: reason || 'لم يتم تحديد سبب', inline: false },
        { name: 'التحذيرات الخفيفة', value: `${softCount} / ${threshold}`, inline: true },
        { name: 'رقم الحالة', value: warningId ? `#${warningId}` : 'غير متوفر', inline: true }
      )
      .setTimestamp();

    if (moderatorTag) {
      embed.setFooter({ text: `بواسطة المشرف: ${moderatorTag}` });
    }

    if (escalated && officialTotalCount !== null) {
      embed.addFields({
        name: 'إجمالي التحذيرات الرسمية',
        value: `${officialTotalCount}`,
        inline: true,
      });
    }

    await targetUser.send({ embeds: [embed] });
    return { delivered: true };
  } catch (error) {
    logger.warn('Failed to deliver softwarn DM to user:', {
      userId: targetUser.id,
      guildId: guildName,
      error: error?.message || String(error),
    });
    return {
      delivered: false,
      reason: error?.code === 50007 ? 'الرسائل الخاصة مغلقة لدى العضو' : 'تعذر إرسال الرسالة الخاصة',
    };
  }
}

export default {
  notifySoftWarn,
};
