import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { NexoBotError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { 
    getJoinToCreateConfig, 
    updateJoinToCreateConfig,
    removeJoinToCreateTrigger,
    addJoinToCreateTrigger
} from '../../../utils/database.js';
import type { JoinToCreateChannelOptions, JoinToCreateConfig } from '../../../utils/database.js';
import type { GuildTextBasedChannel, StringSelectMenuInteraction, VoiceChannel } from 'discord.js';
import type { NexoClient, SubcommandModule } from '../../../types/index.js';

export default {
    async execute(interaction, config, client) {
        try {
            const triggerChannel = interaction.options.getChannel('trigger_channel') as VoiceChannel;
        const guildId = interaction.guild!.id;

        const currentConfig = await getJoinToCreateConfig(client, guildId);

        if (!currentConfig.triggerChannels.includes(triggerChannel.id)) {
            throw new NexoBotError(
                `Channel ${triggerChannel.id} is not a Join to Create trigger`,
                ErrorTypes.VALIDATION,
                `${triggerChannel} ist nicht als Join-to-Create-Trigger-Kanal eingerichtet.`
            );
        }

        const embed = new EmbedBuilder()
            .setTitle('Join-to-Create-Konfiguration')
            .setDescription(`Einstellungen für ${triggerChannel} konfigurieren`)
            .setColor(getColor('info'))
            .addFields(
                {
                    name: 'Aktuelle Kanalnamen-Vorlage',
                    value: `\`${currentConfig.channelOptions?.[triggerChannel.id]?.nameTemplate || currentConfig.channelNameTemplate}\``,
                    inline: false
                },
                {
                    name: 'Aktuelles Nutzerlimit',
                    value: `${currentConfig.channelOptions?.[triggerChannel.id]?.userLimit || currentConfig.userLimit === 0 ? 'Kein Limit' : currentConfig.userLimit + ' Nutzer'}`,
                    inline: true
                },
                {
                    name: 'Aktuelle Bitrate',
                    value: `${(currentConfig.channelOptions?.[triggerChannel.id]?.bitrate || currentConfig.bitrate) / 1000} kbps`,
                    inline: true
                }
            )
            .setFooter({ text: 'Wähle unten eine Option zum Konfigurieren' })
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`jointocreate_config_${triggerChannel.id}`)
            .setPlaceholder('Wähle eine Einstellung')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Kanalnamen-Vorlage ändern')
                    .setDescription('Vorlage für temporäre Kanalnamen ändern')
                    .setValue('name_template'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Nutzerlimit ändern')
                    .setDescription('Maximale Nutzerzahl pro temporärem Kanal festlegen')
                    .setValue('user_limit'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Bitrate ändern')
                    .setDescription('Audioqualität temporärer Kanäle anpassen')
                    .setValue('bitrate'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Diesen Trigger-Kanal entfernen')
                    .setDescription('Diesen Kanal aus dem Join-to-Create-System entfernen')
                    .setValue('remove_trigger'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Aktuelle Einstellungen anzeigen')
                    .setDescription('Alle aktuellen Konfigurationsdetails anzeigen')
                    .setValue('view_settings')
            );

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed],
            components: [row],
        }).catch(error => {
            logger.error('Failed to edit reply in config_setup:', error);
        });

        const collector = (interaction.channel as GuildTextBasedChannel).createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            filter: (i) => i.user.id === interaction.user.id && i.customId === `jointocreate_config_${triggerChannel.id}`,
time: 60000
        });

        collector.on('collect', async (selectInteraction) => {
            await selectInteraction.deferUpdate();

            const selectedOption = selectInteraction.values[0];

            try {
                switch (selectedOption) {
                    case 'name_template':
                        await handleNameTemplateChange(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                    case 'user_limit':
                        await handleUserLimitChange(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                    case 'bitrate':
                        await handleBitrateChange(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                    case 'remove_trigger':
                        await handleRemoveTrigger(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                    case 'view_settings':
                        await handleViewSettings(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                }
            } catch (error) {
                if (error instanceof NexoBotError) {
                    logger.debug(`Configuration validation error: ${error.message}`, error.context || {});
                } else {
                    logger.error('Unexpected configuration menu error:', error);
                }
                
                const errorMessage = error instanceof NexoBotError 
                    ? error.userMessage || 'Bei der Verarbeitung deiner Auswahl ist ein Fehler aufgetreten.'
                    : 'Bei der Verarbeitung deiner Auswahl ist ein Fehler aufgetreten.';
                    
                await replyUserError(selectInteraction, {
                    type: ErrorTypes.CONFIGURATION,
                    message: errorMessage
                }).catch(() => {});
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const disabledRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    selectMenu.setDisabled(true)
                );
                
                await InteractionHelper.safeEditReply(interaction, {
                    components: [disabledRow],
                }).catch(() => {});
            }
        });
            } catch (error) {
            if (error instanceof NexoBotError) {
                throw error;
            }
            logger.error('Unexpected error in config_setup:', error);
            throw new NexoBotError(
                `Config setup failed: ${(error as Error).message}`,
                ErrorTypes.UNKNOWN,
                'Join-to-Create konnte nicht konfiguriert werden.'
            );
        }
    }
} satisfies SubcommandModule;

async function handleNameTemplateChange(interaction: StringSelectMenuInteraction, triggerChannel: VoiceChannel, currentConfig: JoinToCreateConfig, client: NexoClient) {
    const embed = new EmbedBuilder()
        .setTitle('Kanalnamen-Vorlage konfigurieren')
        .setDescription('Bitte gib die neue Kanalnamen-Vorlage ein.')
        .addFields(
            {
                name: 'Verfügbare Variablen',
                value: '• `{username}` - Nutzername\n• `{display_name}` - Anzeigename\n• `{user_tag}` - Tag des Nutzers (User#1234)\n• `{guild_name}` - Servername',
                inline: false
            },
            {
                name: 'Aktuelle Vorlage',
                value: `\`${currentConfig.channelOptions?.[triggerChannel.id]?.nameTemplate || currentConfig.channelNameTemplate}\``,
                inline: false
            }
        )
        .setColor(getColor('info'))
        .setFooter({ text: 'Schreib deine neue Vorlage unten in den Chat' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = (interaction.channel as GuildTextBasedChannel).createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id,
time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newTemplate = message.content.trim();
            
            if (!newTemplate || newTemplate.length > 100) {
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Die Vorlage muss zwischen 1 und 100 Zeichen lang sein.'
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                nameTemplate: newTemplate
            };

            await updateJoinToCreateConfig(client, interaction.guild!.id, {
                channelOptions: channelOptions
            });

            await interaction.followUp({
                embeds: [successEmbed('Vorlage aktualisiert', `Kanalnamen-Vorlage geändert zu \`${newTemplate}\``)],
                flags: MessageFlags.Ephemeral,
            });

            await message.delete().catch(() => {});
        } catch (error) {
            if (error instanceof NexoBotError) {
                logger.debug(`Template validation error: ${error.message}`);
            } else {
                logger.error('Template update error:', error);
            }
            
            const errorMessage = error instanceof NexoBotError
                ? error.userMessage || 'Die Kanalnamen-Vorlage konnte nicht aktualisiert werden.'
                : 'Die Kanalnamen-Vorlage konnte nicht aktualisiert werden.';
                
            await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: errorMessage
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'Keine Antwort erhalten. Aktualisierung der Vorlage abgebrochen.'
            }).catch(() => {});
        }
    });
}

async function handleUserLimitChange(interaction: StringSelectMenuInteraction, triggerChannel: VoiceChannel, currentConfig: JoinToCreateConfig, client: NexoClient) {
    const embed = new EmbedBuilder()
        .setTitle('Nutzerlimit konfigurieren')
        .setDescription('Bitte gib das neue Nutzerlimit ein (0-99, 0 = kein Limit).')
        .addFields(
            {
                name: 'Aktuelles Limit',
                value: `${currentConfig.channelOptions?.[triggerChannel.id]?.userLimit || currentConfig.userLimit === 0 ? 'Kein Limit' : currentConfig.userLimit + ' Nutzer'}`,
                inline: false
            }
        )
        .setColor(getColor('info'))
        .setFooter({ text: 'Schreib das neue Limit unten in den Chat' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = (interaction.channel as GuildTextBasedChannel).createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id && /^\d+$/.test(m.content.trim()),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newLimit = parseInt(message.content.trim());
            
            if (newLimit < 0 || newLimit > 99) {
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Das Nutzerlimit muss zwischen 0 und 99 liegen.'
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                userLimit: newLimit
            };

            await updateJoinToCreateConfig(client, interaction.guild!.id, {
                channelOptions: channelOptions
            });

            await interaction.followUp({
                embeds: [successEmbed('Limit aktualisiert', `Nutzerlimit geändert zu ${newLimit === 0 ? 'Kein Limit' : newLimit + ' Nutzer'}`)],
                flags: MessageFlags.Ephemeral,
            });

            await message.delete().catch(() => {});
        } catch (error) {
            if (error instanceof NexoBotError) {
                logger.debug(`User limit validation error: ${error.message}`);
            } else {
                logger.error('User limit update error:', error);
            }
            
            const errorMessage = error instanceof NexoBotError
                ? error.userMessage || 'Das Nutzerlimit konnte nicht aktualisiert werden.'
                : 'Das Nutzerlimit konnte nicht aktualisiert werden.';
                
            await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: errorMessage
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'Keine gültige Antwort erhalten. Aktualisierung abgebrochen.'
            }).catch(() => {});
        }
    });
}

async function handleBitrateChange(interaction: StringSelectMenuInteraction, triggerChannel: VoiceChannel, currentConfig: JoinToCreateConfig, client: NexoClient) {
    const embed = new EmbedBuilder()
        .setTitle('Bitrate konfigurieren')
        .setDescription('Bitte gib die neue Bitrate in kbps ein (8-384).')
        .addFields(
            {
                name: 'Aktuelle Bitrate',
                value: `${(currentConfig.channelOptions?.[triggerChannel.id]?.bitrate || currentConfig.bitrate) / 1000} kbps`,
                inline: false
            },
            {
                name: 'Übliche Werte',
                value: '• 64 kbps - Normale Qualität\n• 96 kbps - Gute Qualität\n• 128 kbps - Hohe Qualität\n• 256 kbps - Sehr hohe Qualität',
                inline: false
            }
        )
        .setColor(getColor('info'))
        .setFooter({ text: 'Schreib die neue Bitrate unten in den Chat' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = (interaction.channel as GuildTextBasedChannel).createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id && /^\d+$/.test(m.content.trim()),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newBitrate = parseInt(message.content.trim());
            
            if (newBitrate < 8 || newBitrate > 384) {
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Die Bitrate muss zwischen 8 und 384 kbps liegen.'
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                bitrate: newBitrate * 1000
            };

            await updateJoinToCreateConfig(client, interaction.guild!.id, {
                channelOptions: channelOptions
            });

            await interaction.followUp({
                embeds: [successEmbed('Bitrate aktualisiert', `Bitrate geändert zu ${newBitrate} kbps`)],
                flags: MessageFlags.Ephemeral,
            });

            await message.delete().catch(() => {});
        } catch (error) {
            if (error instanceof NexoBotError) {
                logger.debug(`Bitrate validation error: ${error.message}`);
            } else {
                logger.error('Bitrate update error:', error);
            }
            
            const errorMessage = error instanceof NexoBotError
                ? error.userMessage || 'Die Bitrate konnte nicht aktualisiert werden.'
                : 'Die Bitrate konnte nicht aktualisiert werden.';
                
            await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: errorMessage
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'Keine gültige Antwort erhalten. Aktualisierung abgebrochen.'
            }).catch(() => {});
        }
    });
}

async function handleRemoveTrigger(interaction: StringSelectMenuInteraction, triggerChannel: VoiceChannel, currentConfig: JoinToCreateConfig, client: NexoClient) {
    const embed = new EmbedBuilder()
        .setTitle('Trigger-Kanal entfernen')
        .setDescription(`Willst du ${triggerChannel} wirklich aus dem Join-to-Create-System entfernen?`)
        .setColor('#ff6600')
        .setFooter({ text: 'Das kann nicht rückgängig gemacht werden' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`confirm_remove_${triggerChannel.id}`)
            .setLabel('Kanal entfernen')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`cancel_remove_${triggerChannel.id}`)
            .setLabel('Abbrechen')
            .setStyle(ButtonStyle.Secondary)
    );

    await interaction.followUp({ 
        embeds: [embed], 
        components: [row],
        flags: MessageFlags.Ephemeral 
    });

    const collector = (interaction.channel as GuildTextBasedChannel).createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === interaction.user.id && 
                     (i.customId === `confirm_remove_${triggerChannel.id}` || i.customId === `cancel_remove_${triggerChannel.id}`),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (buttonInteraction) => {
        await buttonInteraction.deferUpdate();

        if (buttonInteraction.customId === `confirm_remove_${triggerChannel.id}`) {
            try {
                const success = await removeJoinToCreateTrigger(client, interaction.guild!.id, triggerChannel.id);
                
                if (success) {
                    await buttonInteraction.followUp({
                        embeds: [successEmbed('Kanal entfernt', `${triggerChannel} wurde aus dem Join-to-Create-System entfernt.`)],
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await replyUserError(buttonInteraction, {
                        type: ErrorTypes.CONFIGURATION,
                        message: 'Der Trigger-Kanal konnte nicht entfernt werden.'
                    });
                }
            } catch (error) {
                if (error instanceof NexoBotError) {
                    logger.debug(`Trigger removal validation error: ${error.message}`);
                } else {
                    logger.error('Remove trigger error:', error);
                }
                
                const errorMessage = error instanceof NexoBotError
                    ? error.userMessage || 'Beim Entfernen des Trigger-Kanals ist ein Fehler aufgetreten.'
                    : 'Beim Entfernen des Trigger-Kanals ist ein Fehler aufgetreten.';
                    
                await replyUserError(buttonInteraction, {
                    type: ErrorTypes.CONFIGURATION,
                    message: errorMessage
                }).catch(() => {});
            }
        } else {
            await buttonInteraction.followUp({
                embeds: [successEmbed('Abgebrochen', 'Das Entfernen des Kanals wurde abgebrochen.')],
                flags: MessageFlags.Ephemeral,
            });
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'Keine Antwort erhalten. Entfernen abgebrochen.'
            }).catch(() => {});
        }
    });
}

async function handleViewSettings(interaction: StringSelectMenuInteraction, triggerChannel: VoiceChannel, currentConfig: JoinToCreateConfig, client: NexoClient) {
    const channelConfig: Partial<JoinToCreateChannelOptions> = currentConfig.channelOptions?.[triggerChannel.id] || {};
    
    const embed = new EmbedBuilder()
        .setTitle('Aktuelle Einstellungen')
        .setDescription(`Konfiguration für ${triggerChannel}`)
        .setColor(getColor('info'))
        .addFields(
            {
                name: 'Trigger-Kanal',
                value: `${triggerChannel} (${triggerChannel.id})`,
                inline: false
            },
            {
                name: 'Kanalnamen-Vorlage',
                value: `\`${channelConfig.nameTemplate || currentConfig.channelNameTemplate}\``,
                inline: false
            },
            {
                name: 'Nutzerlimit',
                value: `${channelConfig.userLimit || currentConfig.userLimit === 0 ? 'Kein Limit' : (channelConfig.userLimit || currentConfig.userLimit) + ' Nutzer'}`,
                inline: true
            },
            {
                name: 'Bitrate',
                value: `${(channelConfig.bitrate || currentConfig.bitrate) / 1000} kbps`,
                inline: true
            },
            {
                name: 'Kategorie',
                value: currentConfig.categoryId ? `<#${currentConfig.categoryId}>` : 'Nicht festgelegt',
                inline: true
            },
            {
                name: 'Systemstatus',
                value: currentConfig.enabled ? '✅ Aktiviert' : '❌ Deaktiviert',
                inline: true
            },
            {
                name: 'Aktive temporäre Kanäle',
                value: Object.keys(currentConfig.temporaryChannels || {}).length.toString(),
                inline: true
            }
        )
        .setTimestamp();

    await interaction.followUp({ 
        embeds: [embed], 
        flags: MessageFlags.Ephemeral 
    });
}