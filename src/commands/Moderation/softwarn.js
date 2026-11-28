import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { SoftWarningService } from '../../services/moderation/softWarningService.js';
import { WarningService } from '../../services/moderation/warningService.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const SOFT_WARN_THRESHOLD = 3;
const RED_COLOR = 0xdc2626;

/**
 * Helper: يرجع رولات العضو (باستثناء @everyone) مرتبة من الأعلى للأدنى
 */
function getSortedMemberRoles(guildMember) {
    if (!guildMember?.roles?.cache) return [];
    return [...guildMember.roles.cache
        .filter((role) => role.id !== guildMember.guild.id)
        .sort((a, b) => b.position - a.position)
        .values()];
}

/**
 * Helper: يرجع أعلى رول موجود في السيرفر (باستثناء @everyone)
 */
function getGuildHighestRole(guild) {
    if (!guild?.roles?.cache) return null;
    return [...guild.roles.cache
        .filter((role) => role.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .values()][0] || null;
}

/**
 * Helper: يختصر قائمة الرولات حتى لا تتخطى حد أحرف ديسكورد
 */
function formatRolesList(roles, maxChars = 900) {
    if (!roles.length) return 'لا يوجد رولات (بخلاف @everyone)';

    const formatted = [];
    let currentLength = 0;

    for (const role of roles) {
        const entry = `${role}`;
        if (currentLength + entry.length + 2 > maxChars) {
            const remaining = roles.length - formatted.length;
            formatted.push(`+${remaining} رول إضافي`);
            break;
        }
        formatted.push(entry);
        currentLength += entry.length + 2;
    }

    return formatted.join('، ');
}

export default {
    data: new SlashCommandBuilder()
        .setName("softwarn")
        .setDescription("Give a soft warning to a user (3 soft warns = 1 official warning)")
        .addUserOption((o) =>
            o
                .setName("target")
                .setRequired(true)
                .setDescription("User to soft-warn"),
        )
        .addStringOption((o) =>
            o
                .setName("reason")
                .setRequired(false)
                .setDescription("Reason for the soft warning"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`SoftWarn interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'softwarn'
            });
            return;
        }

        const target = interaction.options.getUser("target");
        const member = interaction.options.getMember("target");
        const reason = interaction.options.getString("reason")?.trim() || 'لم يتم تحديد سبب';
        const moderator = interaction.user;
        const executorMember = interaction.member;
        const guildId = interaction.guildId;

        if (!target) {
            throw new TitanBotError(
                'Missing target user',
                ErrorTypes.USER_INPUT,
                'You must specify a user to soft-warn.',
                { subtype: 'invalid_user' },
            );
        }

        if (target.bot) {
            throw new TitanBotError(
                'Cannot soft-warn bot',
                ErrorTypes.USER_INPUT,
                'You cannot give a soft warning to a bot.',
                { subtype: 'bot_target' },
            );
        }

        if (target.id === moderator.id) {
            throw new TitanBotError(
                'Cannot soft-warn self',
                ErrorTypes.USER_INPUT,
                'You cannot give a soft warning to yourself.',
                { subtype: 'self_target' },
            );
        }

        const targetMember = member || await interaction.guild.members.fetch(target.id).catch(() => null);
        if (!targetMember) {
            throw new TitanBotError(
                "Target not found",
                ErrorTypes.USER_INPUT,
                "The target user is not currently in this server."
            );
        }

        ModerationService.assertModerationHierarchy(executorMember, targetMember, 'softwarn');

        const softRecord = await SoftWarningService.addSoftWarning({
            client,
            guildId,
            userId: target.id,
            moderatorId: moderator.id,
            reason,
            threshold: SOFT_WARN_THRESHOLD,
            resetOnThreshold: true,
            guildConfig: config,
        });

        const threshold = softRecord?.threshold ?? SOFT_WARN_THRESHOLD;
        const rawCount = softRecord?.softCount ?? 0;
        const reachedThreshold = Boolean(
            softRecord?.reachedThreshold ?? softRecord?.escalated ?? (rawCount >= threshold)
        );
        const displaySoftCount = reachedThreshold
            ? (softRecord?.resetCount ?? 0)
            : rawCount;

        let officialWarning = null;
        if (reachedThreshold && typeof WarningService?.addWarning === 'function') {
            officialWarning = await WarningService.addWarning({
                guildId,
                userId: target.id,
                moderatorId: moderator.id,
                reason: `تحويل تلقائي بعد بلوغ حد التحذيرات الخفيفة (${threshold}/${threshold}): ${reason}`,
                source: 'softwarn_threshold',
                timestamp: Date.now(),
            });
        }

        // أعلى رول موجود في السيرفر بالكامل
        const topServerRoleObj = getGuildHighestRole(interaction.guild);
        const topServerRole = topServerRoleObj ? `${topServerRoleObj}` : 'لا يوجد';

        // بيانات الرولات للشخص اللي أخذ التحذير الخفيف والشخص اللي أعطاه
        const targetRoles = getSortedMemberRoles(targetMember);
        const moderatorRoles = getSortedMemberRoles(executorMember);

        const targetHighestRole = targetMember.roles.highest?.id !== guildId
            ? `${targetMember.roles.highest}`
            : 'لا يوجد';

        const moderatorHighestRole = executorMember?.roles?.highest?.id !== guildId
            ? `${executorMember.roles.highest}`
            : 'لا يوجد';

        // أعلى رول مشترك بين الاثنين
        const commonRoles = targetRoles.filter((tRole) =>
            moderatorRoles.some((mRole) => mRole.id === tRole.id)
        );
        const commonHighestRole = commonRoles.length > 0 ? `${commonRoles[0]}` : 'لا يوجد رول مشترك';

        // إرسال رسالة في الخاص (DM) للشخص اللي أخذ التحذير الخفيف
        let dmSent = false;
        try {
            const dmLines = [
                `## السبب: ${reason}`,
                `## التحذيرات الخفيفة: ${displaySoftCount} / ${threshold}`,
                reachedThreshold
                    ? `## تم التحويل تلقائيًا إلى: **1 تحذير رسمي**${officialWarning?.totalCount ? ` (الإجمالي: ${officialWarning.totalCount})` : ''}`
                    : `## متبقي للتحويل لوورن رسمي: ${Math.max(threshold - displaySoftCount, 0)}`,
                `### المشرف: ${moderator.tag} (${moderator})`,
                '',
                `**أعلى رول موجود في السيرفر:** ${topServerRole}`,
                `**أعلى رول معك:** ${targetHighestRole}`,
                `**أعلى رول مع من أعطاك التحذير الخفيف:** ${moderatorHighestRole}`,
                `**أعلى رول مشترك بينكما:** ${commonHighestRole}`,
            ];

            const dmEmbed = new EmbedBuilder()
                .setColor(RED_COLOR)
                .setTitle(
                    reachedThreshold
                        ? `# 🚨 تحذير خفيف وتحويل لوورن رسمي في سيرفر ${interaction.guild.name}`
                        : `# ⚠️ تحذير خفيف في سيرفر ${interaction.guild.name}`
                )
                .setDescription(dmLines.join('\n'))
                .setTimestamp();

            await target.send({ embeds: [dmEmbed] });
            dmSent = true;
        } catch (dmError) {
            logger.warn(`Could not send DM to soft-warned user`, {
                userId: target.id,
                guildId,
                error: dmError?.message
            });
        }

        await logModerationAction({
            client,
            guild: interaction.guild,
            event: {
                action: reachedThreshold ? "User Soft-Warned & Escalated to Warning" : "User Soft-Warned",
                target: `${target.tag} (${target.id})`,
                executor: `${moderator.tag} (${moderator.id})`,
                reason,
                metadata: {
                    userId: target.id,
                    moderatorId: moderator.id,
                    softCount: displaySoftCount,
                    threshold,
                    escalated: reachedThreshold,
                    officialWarningId: officialWarning?.id ?? null,
                    officialTotalWarns: officialWarning?.totalCount ?? null,
                    softWarningId: softRecord?.id ?? null,
                    topServerRole,
                    targetHighestRole,
                    moderatorHighestRole,
                    commonHighestRole,
                    dmSent
                }
            }
        });

        const replyLines = [
            `## الشخص الذي أخذ التحذير الخفيف: ${target.tag} (${target})`,
            `## الشخص الذي أعطى التحذير الخفيف: ${moderator.tag} (${moderator})`,
            `## السبب: ${reason}`,
            `## التحذيرات الخفيفة: **${displaySoftCount} / ${threshold}**`,
            reachedThreshold
                ? `## التحويل الرسمي: **تم إضافة (+1) وورن رسمي**${officialWarning?.totalCount ? ` — **الإجمالي: ${officialWarning.totalCount}**` : ''}`
                : `## المتبقي للتحويل إلى 1 وورن رسمي: **${Math.max(threshold - displaySoftCount, 0)}**`,
            '',
            `### **أعلى رول موجود في السيرفر:** ${topServerRole}`,
            `### **أعلى رول مع المُحذَّر:** ${targetHighestRole}`,
            `**رولات المُحذَّر:** ${formatRolesList(targetRoles)}`,
            `### **أعلى رول مع المُحذِّرِ (المشرف):** ${moderatorHighestRole}`,
            `**رولات المُحذِّرِ (المشرف):** ${formatRolesList(moderatorRoles)}`,
            `### **أعلى رول مشترك بين الاثنين:** ${commonHighestRole}`,
            `### **إرسال رسالة الخاص (DM):** ${dmSent ? 'تم الإرسال بنجاح ✅' : 'تعذر الإرسال (الخاص مغلق أو غير متاح) ⚠️'}`
        ];

        const replyEmbed = new EmbedBuilder()
            .setColor(RED_COLOR)
            .setTitle(
                reachedThreshold
                    ? `# 🚨 تم تحذير ${target.tag} وتحويله إلى 1 وورن رسمي`
                    : `# ⚠️ تم إعطاء تحذير خفيف لـ ${target.tag}`
            )
            .setDescription(replyLines.join('\n'))
            .setTimestamp();

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [replyEmbed],
        });
    }
};
