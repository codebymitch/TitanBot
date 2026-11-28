import { EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';

export async function notifySoftWarn(targetUser, {
  guildName,
  moderatorTag,
  reason,
  softCount,
  threshold = 3,
  warningId,
  escalated = false,
  officialTotalCount = null,
}) {
  if (!targetUser) {
    return { delivered: false, reason: 'لم يتم العثور على العضو' };
  }

  const activeThreshold = Number.isInteger(threshold) && threshold > 0 ? threshold : 3;
  const displayCount = escalated ? 0 : (softCount ?? 0);

  try {
    const embed = new EmbedBuilder()
      .setColor(escalated ? 0xed4245 : 0xfee75c)
      .setTitle(escalated ? '⚠️ تحذير خفيف — تم تحويله إلى تحذير رسمي (+1)' : '⚠️ تحذير خفيف')
      .setDescription(
        `لقد تلقيت تحذيرًا خفيفًا في سيرفر **${guildName}**.` +
        (escalated
          ? `\nلقد بلغت حد التحذيرات الخفيفة (**${activeThreshold}/${activeThreshold}**)، وتم تحويلها تلقائيًا إلى **1 تحذير رسمي** وتصفير تحذيراتك الخفيفة.`
          : '')
      )
      .addFields(
        { name: 'السبب', value: reason || 'لم يتم تحديد سبب', inline: false },
        { name: 'التحذيرات الخفيفة', value: `${displayCount} / ${activeThreshold}`, inline: true },
        { name: 'رقم الحالة', value: warningId ? `#${warningId}` : 'غير متوفر', inline: true }
      )
      .setTimestamp();

    if (moderatorTag) {
      embed.setFooter({ text: `بواسطة المشرف: ${moderatorTag}` });
    }

    if (escalated) {
      embed.addFields({
        name: 'التحذير الرسمي',
        value: officialTotalCount !== null && officialTotalCount !== undefined
          ? `+1 (الإجمالي: ${officialTotalCount})`
          : '+1 تحذير رسمي',
        inline: true,
      });
    }

    await targetUser.send({ embeds: [embed] });
    return { delivered: true };
  } catch (error) {
    logger.warn('Failed to deliver softwarn DM to user:', {
      userId: targetUser?.id ?? null,
      guildName: guildName ?? null,
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
