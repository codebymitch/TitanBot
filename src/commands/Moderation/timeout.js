import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { moderationCard, cardReason, formatDurationMs } from '../../utils/moderationCard.js';
import { fetchRepliedMessage, sendModerationActionLog } from '../../services/moderation/moderationActionLogService.js';

const durationChoices = [
    { name: "5 minutes", value: 5 },
    { name: "10 minutes", value: 10 },
    { name: "30 minutes", value: 30 },
    { name: "1 hour", value: 60 },
    { name: "6 hours", value: 360 },
    { name: "1 day", value: 1440 },
    { name: "1 week", value: 10080 },
];

const MAX_TIMEOUT_MINUTES = 28 * 24 * 60;
const DEFAULT_DURATION_MINUTES = 15;
const DURATION_PATTERN = /^\d+\s*[smhdwثدسي]?$/iu;
const UNIT_MINUTES = { s: 1 / 60, m: 1, h: 60, d: 1440, w: 10080, 'ث': 1 / 60, 'د': 1, 'س': 60, 'ي': 1440 };

// Prefix usage accepts units (`10m`, `2h`, `1d`, `1w`, `10د`, `2س`, `1ي`); a bare number means minutes.
// Without a duration the timeout lasts 15m: `تايم @member سبام` = `تايم @member 15m سبام`.
function resolveDurationMinutes(interaction) {
    if (!interaction._isPrefixCommand) return interaction.options.getInteger("duration") ?? DEFAULT_DURATION_MINUTES;
    const raw = String(interaction.options.getString("duration") || DEFAULT_DURATION_MINUTES).trim().toLowerCase();
    const match = raw.match(/^(\d+)\s*([smhdwثدسي])?$/u);
    return match ? Math.ceil(Number(match[1]) * UNIT_MINUTES[match[2] || "m"]) : null;
}

export default {
    data: new SlashCommandBuilder()
        .setName("timeout")
        .setDescription("Timeout a user for a specific duration.")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("User to timeout")
                .setRequired(true),
        )
        .addIntegerOption(
            (option) =>
                option
                    .setName("duration")
                    .setDescription("Duration of the timeout (default 15 minutes)")
                    .setRequired(false)
                    .addChoices(...durationChoices),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("Reason for the timeout"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "moderation",

    // Prefix usage: insert the default duration when the word after the member is not a duration.
    normalizePrefixArgs(args) {
        if (!/^(?:<@!?\d{17,20}>|\d{17,20})$/u.test(args[0] || "") || DURATION_PATTERN.test(args[1] || "")) return args;
        return [args[0], `${DEFAULT_DURATION_MINUTES}m`, ...args.slice(1)];
    },

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Timeout interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'timeout',
            });
            return;
        }

        const targetUser = interaction.options.getUser("target");
        const member = interaction.options.getMember("target");
        const durationMinutes = resolveDurationMinutes(interaction);
        const reason = cardReason(interaction.options.getString("reason"));

        if (!targetUser) {
            throw new TitanBotError(
                'Missing target user',
                ErrorTypes.USER_INPUT,
                'You must specify a user to timeout.',
                { subtype: 'invalid_user' },
            );
        }

        if (targetUser.id === interaction.user.id) {
            throw new TitanBotError(
                "Cannot timeout self",
                ErrorTypes.VALIDATION,
                "You cannot timeout yourself.",
            );
        }
        if (targetUser.id === client.user.id) {
            throw new TitanBotError(
                "Cannot timeout bot",
                ErrorTypes.VALIDATION,
                "You cannot timeout the bot.",
            );
        }
        if (!member) {
            throw new TitanBotError(
                "Target not found",
                ErrorTypes.USER_INPUT,
                "The target user is not currently in this server.",
            );
        }

        if (!durationMinutes || durationMinutes < 1 || durationMinutes > MAX_TIMEOUT_MINUTES) {
            throw new TitanBotError(
                "Invalid duration",
                ErrorTypes.USER_INPUT,
                "❌ Duration: `10m` `2h` `1d` (Max 28d)",
            );
        }

        const durationMs = durationMinutes * 60 * 1000;
        const repliedMessage = await fetchRepliedMessage(interaction);
        await ModerationService.timeoutUser({
            guild: interaction.guild,
            member,
            moderator: interaction.member,
            durationMs,
            reason,
        });
        await sendModerationActionLog(interaction.guild, {
            action: 'timeout',
            targetUser,
            moderatorUser: interaction.user,
            reason,
            durationMs,
            channel: interaction.channel,
            repliedMessage,
        });

        await InteractionHelper.safeEditReply(interaction, moderationCard({
            emoji: '⏳',
            title: 'TIMEOUT ISSUED',
            fields: [
                ['User', `<@${targetUser.id}>`],
                ['Reason', reason],
                ['Duration', `${formatDurationMs(durationMs)} (ends <t:${Math.floor((Date.now() + durationMs) / 1000)}:R>)`],
            ],
            moderatorId: interaction.user.id,
        }));
    },
};
