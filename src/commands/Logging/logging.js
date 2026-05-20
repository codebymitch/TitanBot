import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { t, pickLanguage } from '../../services/i18n.js';

import dashboard from './modules/logging_dashboard.js';
import setchannel from './modules/logging_setchannel.js';
import filter from './modules/logging_filter.js';

export default {
    data: new SlashCommandBuilder()
        .setName('logging')
        .setDescription('Manage audit logging for this server.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('dashboard')
                .setDescription('Open the interactive logging dashboard — view status and toggle event categories.'),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('setchannel')
                .setDescription('Set the audit log channel for this server.')
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('The text channel for audit logs.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName('disable')
                        .setDescription('Set to True to disable audit logging entirely.')
                        .setRequired(false),
                ),
        )
        .addSubcommandGroup((group) =>
            group
                .setName('filter')
                .setDescription('Manage the log ignore list (users and channels to skip).')
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('add')
                        .setDescription('Add a user or channel to the log ignore list.')
                        .addStringOption((option) =>
                            option
                                .setName('type')
                                .setDescription('Whether to ignore a user or channel.')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'User', value: 'user' },
                                    { name: 'Channel', value: 'channel' },
                                ),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('id')
                                .setDescription('The ID of the user or channel to ignore.')
                                .setRequired(true),
                        ),
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('remove')
                        .setDescription('Remove a user or channel from the log ignore list.')
                        .addStringOption((option) =>
                            option
                                .setName('type')
                                .setDescription('Whether this is a user or channel.')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'User', value: 'user' },
                                    { name: 'Channel', value: 'channel' },
                                ),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('id')
                                .setDescription('The ID of the user or channel to remove from the ignore list.')
                                .setRequired(true),
                        ),
                ),
        ),

    async execute(interaction, config, client) {
        try {
            const lang = pickLanguage(config, interaction.guild);
            const subcommandGroup = interaction.options.getSubcommandGroup(false);
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'dashboard') {
                return await dashboard.execute(interaction, config, client, lang);
            }

            await InteractionHelper.safeDefer(interaction);

            if (subcommand === 'setchannel') {
                return await setchannel.execute(interaction, config, client, lang);
            }

            if (subcommandGroup === 'filter') {
                return await filter.execute(interaction, config, client, lang);
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(t(lang, 'wolf.cmd.logging.unknownSubcmd'), '')],
            });
        } catch (error) {
            logger.error('logging command error:', error);
            await InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed(t('es', 'wolf.cmd.logging.errGenericTitle'), t('es', 'wolf.cmd.logging.errGenericDesc'))],
                ephemeral: true,
            }).catch(() => {});
        }
    },
};
