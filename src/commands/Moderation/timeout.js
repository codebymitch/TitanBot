import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { PunishmentService } from '../../services/punishmentService.js';

// Discord maximum timeout is 28 days
const MAX_TIMEOUT_MINUTES = 28 * 24 * 60; // 40320

const DURATION_CHOICES = [
    { name: "5m  — 5 minutes",        value: "5m"  },
    { name: "10m — 10 minutes",       value: "10m" },
    { name: "30m — 30 minutes",       value: "30m" },
    { name: "1h  — 1 hour",           value: "1h"  },
    { name: "2h  — 2 hours",          value: "2h"  },
    { name: "6h  — 6 hours",          value: "6h"  },
    { name: "12h — 12 hours",         value: "12h" },
    { name: "1d  — 1 day",            value: "1d"  },
    { name: "2d  — 2 days",           value: "2d"  },
    { name: "3d  — 3 days",           value: "3d"  },
    { name: "5d  — 5 days",           value: "5d"  },
    { name: "7d  — 1 week",           value: "7d"  },
    { name: "14d — 2 weeks",          value: "14d" },
    { name: "21d — 3 weeks",          value: "21d" },
    { name: "28d — 4 weeks (max)",    value: "28d" },
];

/**
 * Parses a duration string and returns { minutes, rest }.
 * Handles compact ("2d", "30m", "1h") and spaced ("2 days", "1 hour") forms.
 * Examples:
 *   "2d ban evade"      → { minutes: 2880, rest: "ban evade" }
 *   "2 days ban evade"  → { minutes: 2880, rest: "ban evade" }
 *   "60"                → { minutes: 60,   rest: "" }
 *   "1w"                → { minutes: 10080, rest: "" }
 */
function parseDurationFromStr(str) {
    if (!str || !str.trim()) return { minutes: null, rest: '' };
    str = str.trim();

    const UNIT_MINUTES = { m: 1, h: 60, d: 1440, w: 10080, y: 525600 };

    // Pattern: number (optional space) unit keyword (then rest)
    const match = str.match(
        /^(\d+)\s*(m(?:in(?:utes?)?)?|h(?:(?:ou)?rs?)?|d(?:ays?)?|w(?:(?:ee)?ks?)?|y(?:(?:ea)?rs?)?)(?:\s+|$)(.*)/i
    );
    if (match) {
        const num = parseInt(match[1], 10);
        const unitChar = match[2][0].toLowerCase();
        const rest = match[3].trim();
        const multiplier = UNIT_MINUTES[unitChar] ?? 1;
        return { minutes: Math.min(num * multiplier, MAX_TIMEOUT_MINUTES), rest };
    }

    // Pure integer fallback → treat as minutes
    const numMatch = str.match(/^(\d+)(?:\s+|$)(.*)/);
    if (numMatch) {
        return { minutes: Math.min(parseInt(numMatch[1], 10), MAX_TIMEOUT_MINUTES), rest: numMatch[2].trim() };
    }

    return { minutes: null, rest: str };
}

function formatDuration(minutes) {
    if (minutes % 10080 === 0) return `${minutes / 10080}w`;
    if (minutes % 1440  === 0) return `${minutes / 1440}d`;
    if (minutes % 60    === 0) return `${minutes / 60}h`;
    return `${minutes}m`;
}

export default {
    data: new SlashCommandBuilder()
        .setName("timeout")
        .setDescription("Timeout a user for a specific duration.")
        .addUserOption(option =>
            option.setName("target")
                .setDescription("User to timeout")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("duration")
                .setDescription("Duration (e.g. 5m, 1h, 2d, 1w). Prefix: nh!timeout @user 2d reason")
                .setRequired(true)
                .addChoices(...DURATION_CHOICES)
        )
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("Reason for the timeout")
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn('Timeout defer failed', { userId: interaction.user.id });
            return;
        }

        try {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
                throw new TitanBotError(
                    "User lacks permission",
                    ErrorTypes.PERMISSION,
                    "You need the `Moderate Members` permission to set a timeout."
                );
            }

            const targetUser = interaction.options.getUser("target");

            // Missing args guard
            if (!targetUser) {
                throw new TitanBotError(
                    "Missing target",
                    ErrorTypes.USER_INPUT,
                    "Please mention the user to timeout.\nUsage: `nh!timeout @user <duration> [reason]`\nExamples: `nh!timeout @user 2d`, `nh!timeout @user 1h spam`"
                );
            }

            // Duration + reason parsing
            // For prefix: getString returns "2d reason text" merged → split at first duration token
            // For slash:  getString("duration") = "2d", getString("reason") = reason separately
            let durationMinutes, reason;
            if (interaction._isPrefix) {
                const rawStr = interaction.options.getString("duration") || "";
                const { minutes, rest } = parseDurationFromStr(rawStr);
                durationMinutes = minutes;
                reason = rest || "No reason provided";
            } else {
                const rawDuration = interaction.options.getString("duration");
                const { minutes } = parseDurationFromStr(rawDuration || "");
                durationMinutes = minutes;
                reason = interaction.options.getString("reason") || "No reason provided";
            }

            if (!durationMinutes || durationMinutes < 1) {
                throw new TitanBotError(
                    "Invalid duration",
                    ErrorTypes.USER_INPUT,
                    "Invalid duration. Use formats like `5m`, `1h`, `2d`, `1w`.\nMax duration: 28 days."
                );
            }

            const member = interaction.options.getMember("target");

            if (targetUser.id === interaction.user.id) {
                throw new TitanBotError("Cannot timeout self", ErrorTypes.VALIDATION, "You cannot timeout yourself.");
            }
            if (targetUser.id === client.user.id) {
                throw new TitanBotError("Cannot timeout bot", ErrorTypes.VALIDATION, "You cannot timeout the bot.");
            }
            if (!member) {
                throw new TitanBotError("Target not found", ErrorTypes.USER_INPUT, "That user is not in this server.");
            }
            if (!member.moderatable) {
                throw new TitanBotError(
                    "Cannot timeout member",
                    ErrorTypes.PERMISSION,
                    "I cannot timeout this user — they may have a higher role than me."
                );
            }

            const durationMs = durationMinutes * 60 * 1000;
            await member.timeout(durationMs, reason);

            const display = formatDuration(durationMinutes);

            const caseId = await logModerationAction({
                client,
                guild: interaction.guild,
                event: {
                    action: "Member Timed Out",
                    target: `${targetUser.tag} (${targetUser.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason: `${reason}\nDuration: ${display}`,
                    duration: display,
                    metadata: {
                        userId: targetUser.id,
                        moderatorId: interaction.user.id,
                        durationMinutes,
                        timeoutEnds: new Date(Date.now() + durationMs).toISOString()
                    }
                }
            });

            PunishmentService.record({
                guildId: interaction.guildId,
                userId: targetUser.id,
                moderatorId: interaction.user.id,
                action: 'TIMEOUT',
                reason,
                durationMinutes,
                caseId
            }).catch(e => logger.warn('Failed to record timeout punishment:', e.message));

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        `⏳ **Timed out** ${targetUser.tag} for **${display}**`,
                        `**Reason:** ${reason}\n**Case ID:** #${caseId}`
                    )
                ]
            });

        } catch (error) {
            logger.error('Timeout command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(error.userMessage || "An unexpected error occurred. Please check my role permissions.")]
            });
        }
    }
};
