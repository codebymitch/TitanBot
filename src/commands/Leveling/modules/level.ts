import { getColor } from '../../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import type { TextChannel } from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import { getLevelingConfig, saveLevelingConfig } from '../../../services/leveling/leveling.js';
import { botHasPermission } from '../../../utils/permissionGuard.js';
import { NexoBotError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';
import levelDashboard from './level_dashboard.js';
import type { Command } from '../../../types/index.js';

export default {
    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('Das Leveling-System verwalten')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('setup')
                .setDescription('Das Leveling-System einrichten – dabei wird es auch aktiviert')
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('Kanal für Level-up-Benachrichtigungen')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_min')
                        .setDescription('Minimale XP pro Nachricht (Standard: 15)')
                        .setMinValue(1)
                        .setMaxValue(500)
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_max')
                        .setDescription('Maximale XP pro Nachricht (Standard: 25)')
                        .setMinValue(1)
                        .setMaxValue(500)
                        .setRequired(false),
                )
                .addStringOption((option) =>
                    option
                        .setName('message')
                        .setDescription(
                            'Level-up-Nachricht. Platzhalter: {user} und {level} (Standard vorhanden)',
                        )
                        .setMaxLength(500)
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_cooldown')
                        .setDescription('Sekunden zwischen XP-Vergaben pro Nutzer (Standard: 60)')
                        .setMinValue(0)
                        .setMaxValue(3600)
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('dashboard')
                .setDescription('Das interaktive Leveling-Dashboard öffnen'),
        ),
    category: 'Leveling',

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });
        if (!deferred) return;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Du brauchst die Berechtigung **Server verwalten**, um diesen Command zu nutzen.' });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'dashboard') {
            return levelDashboard.execute(interaction, config, client);
        }

        if (subcommand === 'setup') {
            const channel = interaction.options.getChannel('channel') as TextChannel;
            const xpMin = interaction.options.getInteger('xp_min') ?? 15;
            const xpMax = interaction.options.getInteger('xp_max') ?? 25;
            const message =
                interaction.options.getString('message') ??
                '{user} ist auf Level {level} aufgestiegen!';
            const xpCooldown = interaction.options.getInteger('xp_cooldown') ?? 60;

            if (xpMin > xpMax) {
                return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: `Die minimalen XP (**${xpMin}**) dürfen nicht größer sein als die maximalen XP (**${xpMax}**).` });
            }

            if (!botHasPermission(channel, ['SendMessages', 'EmbedLinks'])) {
                throw new NexoBotError(
                    'Bot missing permissions in the specified channel',
                    ErrorTypes.PERMISSION,
                    `Ich brauche die Berechtigungen **Nachrichten senden** und **Links einbetten** in ${channel}, um Level-up-Benachrichtigungen zu senden.`,
                );
            }

            const existingConfig = await getLevelingConfig(client, interaction.guildId!);

            if (existingConfig.configured) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Das Leveling-System ist auf diesem Server bereits eingerichtet (Level-up-Benachrichtigungen gehen an <#${existingConfig.levelUpChannel}>).\n\nNutze \`/level dashboard\`, um die Einstellungen anzupassen.` });
            }

            const newConfig = {
                ...existingConfig,
                configured: true,
                enabled: true,
                levelUpChannel: channel.id,
                xpRange: { min: xpMin, max: xpMax },
                xpCooldown: xpCooldown,
                levelUpMessage: message,
                announceLevelUp: true,
            };

            await saveLevelingConfig(client, interaction.guildId!, newConfig);

            logger.info(`Leveling system set up in guild ${interaction.guildId}`, {
                channelId: channel.id,
                xpMin,
                xpMax,
                xpCooldown,
                userId: interaction.user.id,
            });

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    createEmbed({
                        title: 'Leveling-System eingerichtet',
                        description:
                            `Das Leveling-System ist jetzt **aktiviert** und einsatzbereit.\n\n` +
                            `**Level-up-Kanal:** ${channel}\n` +
                            `**XP pro Nachricht:** ${xpMin} – ${xpMax}\n` +
                            `**XP-Cooldown:** ${xpCooldown}s\n` +
                            `**Level-up-Nachricht:** \`${message}\`\n\n` +
                            `Mit \`/level dashboard\` kannst du diese Einstellungen jederzeit anpassen.`,
                        color: 'success',
                    }),
                ],
            });
        }
    },
} satisfies Command;
