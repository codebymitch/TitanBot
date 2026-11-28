import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { SoftWarningService } from '../../services/moderation/softWarningService.js';
import { WarningService } from '../../services/moderation/warningService.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { logModerationAction } from '../../services/moderation/moderationLogger.js';
import { notifySoftWarn } from '../../services/moderation/softwarn.js';

const SOFT_WARN_THRESHOLD = 3;

export default {
  data: new SlashCommandBuilder()
    .setName('softwarn')
    .setDescription('إصدار تحذير خفيف لعضو وتحويله إلى تحذير رسمي عند بلوغ 3 تحذيرات')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('العضو المطلوب تحذيره')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('سبب التحذير الخفيف')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction, guildConfig, client) {
    await InteractionHelper.safeDefer(interaction);

    if (!interaction.guild) {
      return interaction.editReply({
        content: '❌ يمكن استخدام هذا الأمر داخل السيرفر فقط.',
      });
    }

    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason')?.trim() || 'لم يتم تحديد سبب';

    if (targetUser.bot) {
      return interaction.editReply({
        content: '❌ لا يمكنك إعطاء تحذير خفيف لبوت.',
      });
    }

    if (targetUser.id === interaction.user.id) {
      return interaction.editReply({
        content: '❌ لا يمكنك إعطاء تحذير خفيف لنفسك.',
      });
    }

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
      return interaction.editReply({
        content: '❌ هذا العضو غير موجود في السيرفر.',
      });
    }

    if (typeof ModerationService?.assertModerationHierarchy === 'function') {
      try {
        await ModerationService.assertModerationHierarchy({
          guild: interaction.guild,
          moderator: interaction.member,
          targetMember,
          actionName: 'softwarn',
        });
      } catch (err) {
        return interaction.editReply({
          content: `❌ ${err?.message || 'لا يمكنك تنفيذ هذا الإجراء على هذا العضو بسبب الرتب.'}`,
        });
      }
    }

    const softRecord = await SoftWarningService.addSoftWarning({
      client,
      guildId: interaction.guild.id,
      userId: targetUser.id,
      moderatorId: interaction.user.id,
      reason,
      threshold: SOFT_WARN_THRESHOLD,
      resetOnThreshold: true,
      guildConfig,
    });

    const threshold = softRecord?.threshold ?? SOFT_WARN_THRESHOLD;
    const rawCount = softRecord?.softCount ?? 0;
    const reachedThreshold = Boolean(
      softRecord?.reachedThreshold ?? softRecord?.escalated ?? (rawCount >= threshold)
    );

    // إذا تم التحويل لوورن رسمي، نعرض عداد السوفت وورن بعد التصفير (0 افتراضياً)
    const displaySoftCount = reachedThreshold
      ? (softRecord?.resetCount ?? 0)
      : rawCount;

    let officialWarning = null;
    if (reachedThreshold && typeof WarningService?.addWarning === 'function') {
      officialWarning = await WarningService.addWarning({
        client,
        guildId: interaction.guild.id,
        userId: targetUser.id,
        moderatorId: interaction.user.id,
        reason: `تحويل تلقائي بعد بلوغ حد التحذيرات الخفيفة (${threshold}/${threshold}): ${reason}`,
        source: 'softwarn_threshold',
        guildConfig,
      });
    }

    const dmStatus = await notifySoftWarn(targetUser, {
      guildName: interaction.guild.name,
      moderatorTag: interaction.user.tag,
      reason,
      softCount: displaySoftCount,
      threshold,
      warningId: softRecord?.id ?? officialWarning?.id ?? null,
      escalated: reachedThreshold,
      officialTotalCount: officialWarning?.totalCount ?? null,
    }).catch((err) => ({ delivered: false, reason: err?.message || 'تعذر الإرسال' }));

    if (typeof logModerationAction === 'function') {
      await logModerationAction({
        client,
        guild: interaction.guild,
        guildConfig,
        action: 'softwarn',
        moderator: interaction.user,
        target: targetUser,
        reason,
        metadata: {
          softCount: displaySoftCount,
          threshold,
          escalated: reachedThreshold,
          officialWarningId: officialWarning?.id ?? null,
          dmDelivered: Boolean(dmStatus?.delivered),
          dmReason: dmStatus?.reason ?? null,
        },
      }).catch(() => {});
    }

    const replyEmbed = new EmbedBuilder()
      .setColor(reachedThreshold ? 0xed4245 : 0xfee75c)
      .setTitle(reachedThreshold ? '⚠️ تم التحذير الخفيف وتحويله إلى تحذير رسمي (1)' : '⚠️ تم إصدار تحذير خفيف')
      .addFields(
        { name: 'العضو', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
        { name: 'المشرف', value: `${interaction.user.tag}`, inline: true },
        { name: 'التحذيرات الخفيفة', value: `${displaySoftCount} / ${threshold}`, inline: true },
        {
          name: 'حالة الرسالة الخاصة',
          value: dmStatus?.delivered
            ? '✅ تم إرسال التحذير في الخاص'
            : `❌ تعذر الإرسال في الخاص (${dmStatus?.reason || 'الخاص مغلق'})`,
          inline: false,
        },
        { name: 'السبب', value: reason, inline: false }
      )
      .setTimestamp();

    if (reachedThreshold) {
      replyEmbed.addFields({
        name: 'التحذير الرسمي',
        value: officialWarning?.totalCount
          ? `تم إضافة (+1) وورن — إجمالي التحذيرات الرسمية: ${officialWarning.totalCount}`
          : 'تم إضافة (+1) وورن رسمي وتصفير التحذيرات الخفيفة',
        inline: false,
      });
    }

    return interaction.editReply({
      embeds: [replyEmbed],
      flags: MessageFlags.Ephemeral,
    });
  },
};
