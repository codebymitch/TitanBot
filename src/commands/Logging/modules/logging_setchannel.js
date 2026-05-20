import { PermissionsBitField, ChannelType } from 'discord.js';
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
                    t(lang, 'wolf.cmd.logging.setchannel.permDeniedTitle'),
                    t(lang, 'wolf.cmd.logging.setchannel.permDeniedDesc')
                )],
            });
        }

        if (!client.db) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(
                    t(lang, 'wolf.cmd.logging.setchannel.dbErrorTitle'),
                    t(lang, 'wolf.cmd.logging.setchannel.dbErrorDesc')
                )],
            });
        }

        const guildId = interaction.guildId;
        const currentConfig = await getGuildConfig(client, guildId);

        const logChannel = interaction.options.getChannel('channel');
        const disableLogging = interaction.options.getBoolean('disable');

        try {
            if (disableLogging) {
                currentConfig.logChannelId = null;
                currentConfig.enableLogging = false;
                currentConfig.logging = {
                    ...(currentConfig.logging || {}),
                    enabled: false,
                    channelId: null,
                };
                // canonical schema read by the event handlers
                currentConfig.logs = {
                    ...(currentConfig.logs || {}),
                    enabled: false,
                };
                await setGuildConfig(client, guildId, currentConfig);
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(
                        t(lang, 'wolf.cmd.logging.setchannel.disabledTitle'),
                        t(lang, 'wolf.cmd.logging.setchannel.disabledDesc')
                    )],
                });
            }

            if (logChannel) {
                const perms = logChannel.permissionsFor(interaction.guild.members.me);
                if (!perms.has(PermissionsBitField.Flags.SendMessages) || !perms.has(PermissionsBitField.Flags.EmbedLinks)) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed(
                            t(lang, 'wolf.cmd.logging.setchannel.botPermErrorTitle'),
                            t(lang, 'wolf.cmd.logging.setchannel.botPermErrorDesc', { channel: logChannel.toString() })
                        )],
                    });
                }

                currentConfig.logChannelId = logChannel.id;
                currentConfig.enableLogging = true;
                currentConfig.logging = {
                    ...(currentConfig.logging || {}),
                    enabled: true,
                    channelId: logChannel.id,
                };
                // canonical schema read by the event handlers
                currentConfig.logs = {
                    ...(currentConfig.logs || {}),
                    enabled: true,
                    channel: logChannel.id,
                };
                await setGuildConfig(client, guildId, currentConfig);

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(
                        t(lang, 'wolf.cmd.logging.setchannel.setTitle'),
                        t(lang, 'wolf.cmd.logging.setchannel.setDesc', { channel: logChannel.toString() })
                    )],
                });

                await logEvent({
                    client,
                    guild: interaction.guild,
                    event: {
                        action: 'Log Channel Activated',
                        target: logChannel.toString(),
                        executor: `${interaction.user.tag} (${interaction.user.id})`,
                        reason: `Logging channel set by ${interaction.user}`,
                        metadata: { channelId: logChannel.id, moderatorId: interaction.user.id, loggingEnabled: true },
                    },
                });
                return;
            }

            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(
                    t(lang, 'wolf.cmd.logging.setchannel.noOptionTitle'),
                    t(lang, 'wolf.cmd.logging.setchannel.noOptionDesc')
                )],
            });
        } catch (error) {
            logger.error('logging setchannel error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(
                    t(lang, 'wolf.cmd.logging.setchannel.configErrorTitle'),
                    t(lang, 'wolf.cmd.logging.setchannel.configErrorDesc')
                )],
            });
        }
    },
};
