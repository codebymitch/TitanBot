import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { WarningService } from '../../services/moderation/warningService.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

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
        .setName("warn")
        .setDescription("Warn a user")
        .addUserOption((o) =>
            o
                .setName("target")
                .setRequired(true)
                .setDescription("User to warn"),
        )
        .addStringOption((o) =>
            o
                .setName("reason")
                .setRequired(true)
                .setDescription("Reason for the warning"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Warn interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'warn'
            });
            return;
        }

        const target = interaction.options.getUser("target");
        const member = interaction.options.getMember("target");
        const reason = interaction.options.getString("reason");
        const moderator = interaction.user;
        const executorMember = interaction.member;
        const guildId = interaction.guildId;

        if (!target) {
            throw new TitanBotError(
                'Missing target user',
                ErrorTypes.USER_INPUT,
                'You must specify a user to warn.',
                { subtype: 'invalid_user' },
            );
        }

        if (!reason) {
            throw new TitanBotError(
                'Missing warning reason',
                ErrorTypes.VALIDATION,
                'You must provide a reason for the warning.',
                { subtype: 'missing_required' },
            );
        }

        if (!member) {
            throw new TitanBotError(
                "Target not found",
                ErrorTypes.USER_INPUT,
                "The target user is not currently in this server."
            );
        }

        ModerationService.assertModerationHierarchy(executorMember, member, 'warn');

        const { id, totalCount } = await WarningService.addWarning({
            guildId,
            userId: target.id,
            moderatorId: moderator.id,
            reason,
            timestamp: Date.now()
        });

        // أعلى رول موجود في السيرفر بالكامل
        const topServerRoleObj = getGuildHighestRole(interaction.guild);
        const topServerRole = topServerRoleObj ? `${topServerRoleObj}` : 'لا يوجد';

        // بيانات الرولات للشخص اللي أخذ التحذير والشخص اللي أعطاه
        const targetRoles = getSortedMemberRoles(member);
        const moderatorRoles = getSortedMemberRoles(executorMember);

        const targetHighestRole = member.roles.highest?.id !== interaction.guildId
            ? `${member.roles.highest}`
            : 'لا يوجد';

        const moderatorHighestRole = executorMember?.roles?.highest?.id !== interaction.guildId
            ? `${executorMember.roles.highest}`
            : 'لا يوجد';

        // أعلى رول مشترك بين الاثنين
        const commonRoles = targetRoles.filter((tRole) =>
            moderatorRoles.some((mRole) => mRole.id === tRole.id)
        );
        const commonHighestRole = commonRoles.length > 0 ? `${commonRoles[0]}` : 'لا يوجد رول مشترك';

        // إرسال رسالة في الخاص (DM) للشخص اللي أخذ التحذير
        let dmSent = false;
        try {
            const dmEmbed = warningEmbed(
                `# ⚠️ تحذير في سيرفر ${interaction.guild.name}`,
                [
                    `## السبب: ${reason}`,
                    `## عدد مرات التحذير الإجمالي: ${totalCount}`,
                    `### المشرف: ${moderator.tag} (${moderator})`,
                    '',
                    `**أعلى رول موجود في السيرفر:** ${topServerRole}`,
                    `**أعلى رول معك:** ${targetHighestRole}`,
                    `**أعلى رول مع من أعطاك التحذير:** ${moderatorHighestRole}`,
                    `**أعلى رول مشترك بينكما:** ${commonHighestRole}`,
                ].join('\n')
            );

            await target.send({ embeds: [dmEmbed] });
            dmSent = true;
        } catch (dmError) {
            logger.warn(`Could not send DM to warned user`, {
                userId: target.id,
                guildId,
                error: dmError?.message
            });
        }

        await logModerationAction({
            client,
            guild: interaction.guild,
            event: {
                action: "User Warned",
                target: `${target.tag} (${target.id})`,
                executor: `${moderator.tag} (${moderator.id})`,
                reason,
                metadata: {
                    userId: target.id,
                    moderatorId: moderator.id,
                    totalWarns: totalCount,
                    warningNumber: totalCount,
                    warningId: id,
                    topServerRole,
                    targetHighestRole,
                    moderatorHighestRole,
                    commonHighestRole,
                    dmSent
                }
            }
        });

        const replyDescription = [
            `## الشخص الذي أخذ التحذير: ${target.tag} (${target})`,
            `## الشخص الذي أعطى التحذير: ${moderator.tag} (${moderator})`,
            `## السبب: ${reason}`,
            `## عدد مرات التحذير: ${totalCount}`,
            '',
            `### **أعلى رول موجود في السيرفر:** ${topServerRole}`,
            `### **أعلى رول مع المُحذَّر:** ${targetHighestRole}`,
            `**رولات المُحذَّر:** ${formatRolesList(targetRoles)}`,
            `### **أعلى رول مع المُحذِّرِ (المشرف):** ${moderatorHighestRole}`,
            `**رولات المُحذِّرِ (المشرف):** ${formatRolesList(moderatorRoles)}`,
            `### **أعلى رول مشترك بين الاثنين:** ${commonHighestRole}`,
            `### **إرسال رسالة الخاص (DM):** ${dmSent ? 'تم الإرسال بنجاح ✅' : 'تعذر الإرسال (الخاص مغلق أو غير متاح) ⚠️'}`
        ].join('\n');

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    `# ⚠️ تم إعطاء تحذير لـ ${target.tag}`,
                    replyDescription,
                ),
            ],
        });
    }
};
