import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// Duration parser for prefix commands
function parseDurationFromText(text) {
    const durationMap = {
        'm': 1, 'minute': 1, 'minutes': 1,
        'h': 60, 'hour': 60, 'hours': 60,
        'd': 1440, 'day': 1440, 'days': 1440,
        'w': 10080, 'week': 10080, 'weeks': 10080,
        'M': 43200, 'month': 43200, 'months': 43200,
        'y': 525600, 'year': 525600, 'years': 525600
    };
    
    const match = text.toLowerCase().match(/(\d+)\s*([a-z]+)/i);
    if (!match) return null;
    
    const amount = parseInt(match[1]);
    const unit = match[2];
    const multiplier = durationMap[unit];
    
    return multiplier ? amount * multiplier : null;
}

const durationChoices = [
    { name: "5 minutes (5m)", value: 5 },
    { name: "10 minutes (10m)", value: 10 },
    { name: "30 minutes (30m)", value: 30 },
    { name: "1 hour (1h)", value: 60 },
    { name: "3 hours (3h)", value: 180 },
    { name: "6 hours (6h)", value: 360 },
    { name: "12 hours (12h)", value: 720 },
    { name: "1 day (1d)", value: 1440 },
    { name: "3 days (3d)", value: 4320 },
    { name: "1 week (1w)", value: 10080 },
    { name: "2 weeks (2w)", value: 20160 },
    { name: "1 month (1M)", value: 43200 },
];

export default {
    data: new SlashCommandBuilder()
        .setName("mute")
        .setDescription("Mute a user for a specific duration.")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("User to mute")
                .setRequired(true),
        )
        .addIntegerOption(
            (option) =>
                option
                    .setName("duration")
                    .setDescription("Duration of the mute (select from list)")
                    .setRequired(false)
                    .addChoices(...durationChoices),
        )
        .addStringOption((option) =>
            option
                .setName("custom_duration")
                .setDescription("Custom duration (e.g., 5m, 1h, 2d, 1w)")
                .setRequired(false)
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("Reason for the mute"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Mute interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'mute'
            });
            return;
        }

        try {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
                throw new TitanBotError(
                    "User lacks permission",
                    ErrorTypes.PERMISSION,
                    "You need the `Moderate Members` permission to set a mute."
                );
            }

            const targetUser = interaction.options.getUser("target");
            const member = interaction.options.getMember("target");
            let durationMinutes = interaction.options.getInteger("duration");
            const customDuration = interaction.options.getString("custom_duration");
            let reason = interaction.options.getString("reason") || "No reason";
            
            // Parse custom duration if provided (e.g., "5m", "1h", "2d")
            if (!durationMinutes && customDuration) {
                const parsed = parseDurationFromText(customDuration);
                if (parsed) {
                    durationMinutes = parsed;
                } else {
                    throw new TitanBotError(
                        "Invalid duration format",
                        ErrorTypes.VALIDATION,
                        `Invalid duration format: "${customDuration}". Use format like 5m, 1h, 2d, 1w, 1M, 1y`
                    );
                }
            }
            
            // Handle prefix command: parse duration from text (e.g., "2d", "1h")
            if (interaction._isPrefix && !durationMinutes && reason) {
                const reasonText = reason;
                // Try to parse first word as duration
                const firstWord = reasonText.split(' ')[0];
                const parsed = parseDurationFromText(firstWord);
                if (parsed) {
                    durationMinutes = parsed;
                    // Remove duration from reason
                    const parts = reasonText.split(' ');
                    reason = parts.slice(1).join(' ') || "No reason";
                }
            }
            
            // Validate duration
            if (!durationMinutes) {
                throw new TitanBotError(
                    "Missing duration",
                    ErrorTypes.VALIDATION,
                    "Please specify a duration using dropdown (e.g., 1 day), custom format (e.g., 5m, 1h, 2d), or prefix format."
                );
            }

            if (targetUser.id === interaction.user.id) {
                throw new TitanBotError(
                    "Cannot mute self",
                    ErrorTypes.VALIDATION,
                    "You cannot mute yourself."
                );
            }
            if (targetUser.id === client.user.id) {
                throw new TitanBotError(
                    "Cannot mute bot",
                    ErrorTypes.VALIDATION,
                    "You cannot mute the bot."
                );
            }
            if (!member) {
                throw new TitanBotError(
                    "Target not found",
                    ErrorTypes.USER_INPUT,
                    "The target user is not currently in this server."
                );
            }

            if (!member.moderatable) {
                throw new TitanBotError(
                    "Cannot mute member",
                    ErrorTypes.PERMISSION,
                    "I cannot mute this user. They might have a higher role than me or you."
                );
            }

            const durationMs = durationMinutes * 60 * 1000;
            await member.timeout(durationMs, reason);

            const durationDisplay =
                durationChoices.find((c) => c.value === durationMinutes)
                    ?.name || `${durationMinutes} minutes`;

            const caseId = await logModerationAction({
                client,
                guild: interaction.guild,
                event: {
                    action: "Member Muted",
                    target: `${targetUser.tag} (${targetUser.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason: `${reason}\nDuration: ${durationDisplay}`,
                    duration: durationDisplay,
                    metadata: {
                        userId: targetUser.id,
                        moderatorId: interaction.user.id,
                        durationMinutes,
                        timeoutEnds: new Date(Date.now() + durationMs).toISOString()
                    }
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        `🔇 **Muted** ${targetUser.tag} for ${durationDisplay}.`,
                        `**Reason:** ${reason}\n**Case ID:** #${caseId}`,
                    ),
                ],
            });
        } catch (error) {
            logger.error('Mute command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        error.userMessage || "An unexpected error occurred during the mute action. Please check my role permissions.",
                    ),
                ],
            });
        }
    }
};
