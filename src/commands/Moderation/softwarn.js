import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { SoftWarningService } from '../../services/moderation/softWarningService.js';
import { WarningService } from '../../services/moderation/warningService.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { logModerationAction } from '../../services/moderation/moderationLogger.js';
import { notifySoftWarn } from '../../services/moderation/softwarn.js';

export default {
  data: new SlashCommandBuilder()
    .setName('softwarn')
    .setDescription('إصدار تحذير خفيف لعضو وترقيته إلى تحذير رسمي عند بلوغ الحد')
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
      await ModerationService.assertModerationHierarchy({
        guild: interaction.guild,
        moderator: interaction.member,
        targetMember,
        actionName: 'softwarn',
      });
    }

    const softRecord = await SoftWarningService.addSoftWarning({
      client,
      guildId: interaction.guild.id,
      userId: targetUser.id,
      moderatorId: interaction.user.id,
      reason,
      guildConfig,
    });

    const softCount = softRecord?.softCount ?? 1;
    const threshold = softRecord?.threshold ?? 3;
    const reachedThreshold = Boolean(softRecord?.reachedThreshold ?? (softCount >= threshold));

    let officialWarning = null;
    if (reachedThreshold && typeof WarningService?.addWarning === 'function') {
      officialWarning = await WarningService.addWarning({
        client,
        guildId: interaction.guild.id,
        userId: targetUser.id,
        moderatorId: interaction.user.id,
        reason: `بلوغ حد التحذيرات الخفيفة (${softCount}/${threshold}): ${reason}`,
        source: 'softwarn_threshold',
        guildConfig,
      });
    }

    const dmStatus = await notifySoftWarn(targetUser, {
      guildName: interaction.guild.name,
      moderatorTag: interaction.user.tag,
      reason,
      softCount,
      threshold,
      warningId: softRecord?.id ?? officialWarning?.id ?? null,
      escalated: reachedThreshold,
      officialTotalCount: officialWarning?.totalCount ?? null,
    });

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
          softCount,
          threshold,
          escalated: reachedThreshold,
          officialWarningId: officialWarning?.id ?? null,
          dmDelivered: dmStatus.delivered,
          dmReason: dmStatus.reason ?? null,
        },
      }).catch(() => {});
    }

    const replyEmbed = new EmbedBuilder()
      .setColor(reachedThreshold ? 0xed4245 : 0xfee75c)
      .setTitle(reachedThreshold ? '⚠️ تم التحذير الخفيف والترقية لتحذير رسمي' : '⚠️ تم إصدار تحذير خفيف')
      .addFields(
        { name: 'العضو', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
        { name: 'المشرف', value: `${interaction.user.tag}`, inline: true },
        {
          name: 'حالة الرسالة الخاصة',
          value: dmStatus.delivered
            ? '✅ تم إرسال التحذير في الخاص'
            : `❌ تعذر الإرسال في الخاص (${dmStatus.reason || 'الخاص مغلق'})`,
          inline: false,
        },
        { name: 'التحذيرات الخفيفة', value: `${softCount} / ${threshold}`, inline: true },
        { name: 'السبب', value: reason, inline: false }
      )
      .setTimestamp();

    if (reachedThreshold) {
      replyEmbed.addFields({
        name: 'التحذير الرسمي',
        value: officialWarning?.totalCount
          ? `تم الإصدار (إجمالي التحذيرات الرسمية: ${officialWarning.totalCount})`
          : 'تم الإصدار',
        inline: true,
      });
    }

    return interaction.editReply({
      embeds: [replyEmbed],
      flags: MessageFlags.Ephemeral,
    });
  },
};
