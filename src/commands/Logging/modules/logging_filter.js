import { PermissionsBitField } from 'discord.js';
import { errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/guildConfig.js';
import { logEvent } from '../../../utils/moderation.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';
import { t } from '../../../services/i18n.js';

export default {
    async execute(interaction, config, client, lang) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed(
                    t(lang, 'wolf.cmd.logging.filter.permDeniedTitle'),
                    t(lang, 'wolf.cmd.logging.filter.permDeniedDesc')
                )],
            });
        }

        if (!client.db) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(
                    t(lang, 'wolf.cmd.logging.filter.dbErrorTitle'),
                    t(lang, 'wolf.cmd.logging.filter.dbErrorDesc')
                )],
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const type = interaction.options.getString('type');
        const entityId = interaction.options.getString('id');
        const guildId = interaction.guildId;

        const currentConfig = await getGuildConfig(client, guildId);
        if (!currentConfig.logIgnore) {
            currentConfig.logIgnore = { users: [], channels: [] };
        }

        let targetArray;
        let entityType;
        let entityName;

        if (type === 'user') {
            targetArray = currentConfig.logIgnore.users;
            entityType = t(lang, 'wolf.cmd.logging.filter.typeUser');
            const member = await interaction.guild.members.fetch(entityId).catch(() => null);
            entityName = member ? member.user.tag : `ID: ${entityId}`;
        } else if (type === 'channel') {
            targetArray = currentConfig.logIgnore.channels;
            entityType = t(lang, 'wolf.cmd.logging.filter.typeChannel');
            const channel = interaction.guild.channels.cache.get(entityId);
            entityName = channel ? `#${channel.name}` : `ID: ${entityId}`;
        } else {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(
                    t(lang, 'wolf.cmd.logging.filter.invalidTypeTitle'),
                    t(lang, 'wolf.cmd.logging.filter.invalidTypeDesc')
                )],
            });
        }

        let successMessage;

        if (subcommand === 'add') {
            if (targetArray.includes(entityId)) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(
                        t(lang, 'wolf.cmd.logging.filter.alreadyFilteredTitle'),
                        t(lang, 'wolf.cmd.logging.filter.alreadyFilteredDesc', { type: entityType, name: entityName })
                    )],
                });
            }
            targetArray.push(entityId);
            successMessage = t(lang, 'wolf.cmd.logging.filter.addedDesc', { type: entityType, name: entityName });
        } else if (subcommand === 'remove') {
            const index = targetArray.indexOf(entityId);
            if (index === -1) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(
                        t(lang, 'wolf.cmd.logging.filter.notFilteredTitle'),
                        t(lang, 'wolf.cmd.logging.filter.notFilteredDesc', { type: entityType, name: entityName })
                    )],
                });
            }
            targetArray.splice(index, 1);
            successMessage = t(lang, 'wolf.cmd.logging.filter.removedDesc', { type: entityType, name: entityName });
        } else {
            return;
        }

        try {
            await setGuildConfig(client, guildId, currentConfig);

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: 'Log Filter Updated',
                    target: `Filter ${subcommand}`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    metadata: { entityType, loggingEnabled: currentConfig.enableLogging },
                },
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed(t(lang, 'wolf.cmd.logging.filter.updatedTitle'), successMessage)],
            });
        } catch (error) {
            logger.error('logging filter error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(
                    t(lang, 'wolf.cmd.logging.filter.saveErrorTitle'),
                    t(lang, 'wolf.cmd.logging.filter.saveErrorDesc')
                )],
            });
        }
    },
};
