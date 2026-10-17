import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, LabelBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { NexoBotError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
    initializeJoinToCreate,
    getChannelConfiguration,
    updateChannelConfig,
    removeTriggerChannel,
    hasManageGuildPermission,
    logConfigurationChange,
    getConfiguration
} from '../../services/joinToCreateService.js';
import type { ButtonInteraction, CategoryChannel, GuildBasedChannel, ChatInputCommandInteraction, GuildMember, VoiceChannel } from 'discord.js';
import type { Command, NexoClient } from '../../types/index.js';
import type { JoinToCreateChannelOptions } from '../../utils/database.js';

// getChannelConfiguration infers `channelConfig` as `StoredChannelOptions | {}`; widen it to the stored option shape.
type ChannelConfiguration = Omit<Awaited<ReturnType<typeof getChannelConfiguration>>, 'channelConfig'> & {
    channelConfig: Partial<JoinToCreateChannelOptions>;
};

export default {
    data: new SlashCommandBuilder()
        .setName("jointocreate")
        .setDescription("Join-to-Create-Sprachkanäle verwalten.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("setup")
                .setDescription("Neuen Join-to-Create-Sprachkanal einrichten.")
                .addChannelOption((option) =>
                    option
                        .setName("category")
                        .setDescription("Kategorie, in der der Kanal erstellt wird.")
                        .addChannelTypes(ChannelType.GuildCategory)
                )
                .addStringOption((option) =>
                    option
                        .setName("channel_name")
                        .setDescription("Vorlage für die Namen temporärer Sprachkanäle.")
                        .addChoices(
                            { name: "Raum von {username}", value: "Raum von {username}" },
                            { name: "Kanal von {username}", value: "Kanal von {username}" },
                            { name: "Lounge von {username}", value: "Lounge von {username}" },
                            { name: "Bereich von {username}", value: "Bereich von {username}" },
                            { name: "Raum von {displayName}", value: "Raum von {displayName}" },
                            { name: "VC von {username}", value: "VC von {username}" },
                            { name: "Musikraum von {username}", value: "Musikraum von {username}" },
                            { name: "Gaming-Raum von {username}", value: "Gaming-Raum von {username}" },
                            { name: "Chatraum von {username}", value: "Chatraum von {username}" },
                            { name: "Privater Raum von {username}", value: "Privater Raum von {username}" }
                        )
                )
                .addIntegerOption((option) =>
                    option
                        .setName("user_limit")
                        .setDescription("Maximale Nutzerzahl in temporären Kanälen (0 = unbegrenzt).")
                )
                .addIntegerOption((option) =>
                    option
                        .setName("bitrate")
                        .setDescription("Bitrate temporärer Kanäle in kbps (8-96).")
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("dashboard")
                .setDescription("Bestehendes Join-to-Create-System konfigurieren.")
                .addChannelOption((option) =>
                    option
                        .setName("trigger_channel")
                        .setDescription("Der Join-to-Create-Trigger-Kanal, der konfiguriert werden soll.")
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildVoice)
                )
        ),
    category: "utility",

    async execute(interaction, config, client) {
        try {
            
            if (!hasManageGuildPermission(interaction.member as GuildMember)) {
                throw new NexoBotError(
                    'User lacks ManageGuild permission',
                    ErrorTypes.PERMISSION,
                    'Du brauchst die Berechtigung **Server verwalten**, um diesen Command zu nutzen.'
                );
            }

            const subcommand = interaction.options.getSubcommand();
            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

            let responseEmbed: unknown;

            if (subcommand === "setup") {
                await handleSetupSubcommand(interaction, client);
                return;
            } else if (subcommand === "dashboard") {
                await handleConfigSubcommand(interaction, client);
                return;
            }

        } catch (error) {
            try {
                let errorMessage = 'Beim Ausführen dieses Commands ist ein Fehler aufgetreten.';
                
                if (error instanceof NexoBotError) {
                    errorMessage = error.userMessage || 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.';
                    logger.debug(`NexoBotError [${error.type}]: ${(error as Error).message}`, error.context || {});
                } else {
                    logger.error('Unexpected error in jointocreate command:', error);
                    errorMessage = 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut oder wende dich an den Support.';
                }

                return replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: errorMessage });
            } catch (replyError) {
                logger.error('Failed to send error message:', replyError);
            }
        }
    }
} satisfies Command;

async function handleSetupSubcommand(interaction: ChatInputCommandInteraction, client: NexoClient) {
    try {
        const category = interaction.options.getChannel('category') as CategoryChannel | null;
        const nameTemplate = interaction.options.getString('channel_name') || "Raum von {username}";
        const userLimit = interaction.options.getInteger('user_limit') || 0;
        const bitrate = interaction.options.getInteger('bitrate') || 64;
        const guildId = interaction.guild!.id;

        logger.debug(`Setting up Join to Create in guild ${guildId} with template: ${nameTemplate}`);

        const existingConfig = await getConfiguration(client, guildId);
        
        if (Array.isArray(existingConfig.triggerChannels) && existingConfig.triggerChannels.length > 0) {
            const activeTriggerChannels: GuildBasedChannel[] = [];
            const staleTriggerChannelIds: string[] = [];

            for (const existingChannelId of existingConfig.triggerChannels) {
                const existingChannel = await interaction.guild!.channels.fetch(existingChannelId).catch(() => null);
                if (existingChannel) {
                    activeTriggerChannels.push(existingChannel);
                } else {
                    staleTriggerChannelIds.push(existingChannelId);
                }
            }

            if (staleTriggerChannelIds.length > 0) {
                for (const staleChannelId of staleTriggerChannelIds) {
                    logger.info(`Cleaning up stale JTC trigger ${staleChannelId} from guild ${guildId}`);
                    await removeTriggerChannel(client, guildId, staleChannelId);
                }
            }

            if (activeTriggerChannels.length > 0) {
                const primaryTrigger = activeTriggerChannels[0];
                const errorMessage = `Dieser Server hat bereits einen Join-to-Create-Kanal: ${primaryTrigger}\n\nNutze \`/jointocreate dashboard\`, um ihn zu bearbeiten, oder entferne ihn zuerst, bevor du einen neuen erstellst.`;

                throw new NexoBotError(
                    'Guild already has a Join to Create channel',
                    ErrorTypes.VALIDATION,
                    errorMessage,
                    {
                        guildId,
                        activeTriggerCount: activeTriggerChannels.length,
                        expected: true,
                        suppressErrorLog: true
                    }
                );
            }
        }

        logger.debug('Creating Join to Create trigger channel...');
        let triggerChannel = await interaction.guild!.channels.create({
            name: 'Join-to-Create',
            type: ChannelType.GuildVoice,
            parent: category?.id,
            userLimit: 0,
            bitrate: 64000,
            permissionOverwrites: [
                {
                    id: interaction.guild!.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
                },
            ],
        });

        logger.debug(`Created trigger channel ${triggerChannel.id}, initializing config...`);

        const config = await initializeJoinToCreate(client, guildId, triggerChannel.id, {
            nameTemplate: nameTemplate,
            userLimit: userLimit,
            bitrate: bitrate * 1000,
            categoryId: category?.id
        });

        await logConfigurationChange(client, guildId, interaction.user.id, 'Join-to-Create eingerichtet', {
            channelId: triggerChannel.id,
            nameTemplate,
            userLimit,
            bitrate
        });

        logger.info(`Successfully created Join to Create system in guild ${guildId}`);

        const responseEmbed = successEmbed(
            '✅ Einrichtung abgeschlossen',
            `Join-to-Create-Kanal erstellt: ${triggerChannel}\n\n` +
            `**Einstellungen:**\n` +
            `• Vorlage: \`${nameTemplate}\`\n` +
            `• Nutzerlimit: ${userLimit === 0 ? 'Unbegrenzt' : userLimit + ' Nutzer'}\n` +
            `• Bitrate: ${bitrate} kbps\n` +
            `${category ?`• Kategorie: ${category.name}`: '• Kategorie: Oberste Ebene'}`
        );

        return await InteractionHelper.safeEditReply(interaction, { embeds: [responseEmbed] });

    } catch (error) {
        logger.error('Error in handleSetupSubcommand:', error);
        if (error instanceof NexoBotError) {
            throw error;
        }
        throw new NexoBotError(
            `Setup failed: ${(error as Error).message}`,
            ErrorTypes.DISCORD_API,
            'Join-to-Create konnte nicht eingerichtet werden. Bitte prüfe die Berechtigungen des Bots.'
        );
    }
}

async function handleConfigSubcommand(interaction: ChatInputCommandInteraction, client: NexoClient) {
    try {
        const triggerChannel = interaction.options.getChannel('trigger_channel') as VoiceChannel;
        const guildId = interaction.guild!.id;

        const currentConfig: ChannelConfiguration = await getChannelConfiguration(client, guildId, triggerChannel.id);
        const channelConfig = currentConfig.channelConfig || {};

        const configEmbed = new EmbedBuilder()
            .setTitle('Join-to-Create-Konfiguration')
            .setDescription(`Konfiguration für ${triggerChannel}`)
            .setColor(getColor('info'))
            .addFields(
                {
                    name: 'Kanalnamen-Vorlage',
                    value: `\`${channelConfig.nameTemplate || currentConfig.channelNameTemplate || "Raum von {username}"}\``,
                    inline: false
                },
                {
                    name: 'Nutzerlimit',
                    value: `${(channelConfig.userLimit ?? currentConfig.userLimit ?? 0) === 0 ? 'Unbegrenzt' : (channelConfig.userLimit ?? currentConfig.userLimit ?? 0) + ' Nutzer'}`,
                    inline: true
                },
                {
                    name: 'Bitrate',
                    value: `${(channelConfig.bitrate ?? currentConfig.bitrate ?? 64000) / 1000} kbps`,
                    inline: true
                }
            )
            .setFooter({ text: 'Nutze die Buttons unten, um Einstellungen zu ändern • Nur ein Trigger-Kanal pro Server möglich' })
            .setTimestamp();

        const nameButton = new ButtonBuilder()
            .setCustomId(`jtc_config_name_${triggerChannel.id}`)
            .setLabel('📝 Namensvorlage')
            .setStyle(ButtonStyle.Primary);

        const limitButton = new ButtonBuilder()
            .setCustomId(`jtc_config_limit_${triggerChannel.id}`)
            .setLabel('👥 Nutzerlimit')
            .setStyle(ButtonStyle.Primary);

        const bitrateButton = new ButtonBuilder()
            .setCustomId(`jtc_config_bitrate_${triggerChannel.id}`)
            .setLabel('🎵 Bitrate')
            .setStyle(ButtonStyle.Primary);

        const deleteButton = new ButtonBuilder()
            .setCustomId(`jtc_config_delete_${triggerChannel.id}`)
            .setLabel('🗑️ Kanal entfernen')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(nameButton, limitButton, bitrateButton, deleteButton);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [configEmbed],
            components: [row]
        });

        const message = await interaction.fetchReply();

        if (!message || typeof message.createMessageComponentCollector !== 'function') {
            throw new NexoBotError(
                'Failed to fetch interaction reply for collector setup',
                ErrorTypes.DISCORD_API,
                'Die Einstellungen konnten nicht geöffnet werden. Bitte führe `/jointocreate dashboard` erneut aus.'
            );
        }

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000
        });

        collector.on('collect', async (buttonInteraction) => {
            try {
                
                if (!hasManageGuildPermission(buttonInteraction.member as GuildMember)) {
                    await buttonInteraction.reply({
                        content: '❌ Du brauchst die Berechtigung **Server verwalten**, um diese Steuerung zu nutzen.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const customId = buttonInteraction.customId;

                if (customId.includes('jtc_config_name_')) {
                    await handleNameTemplateModal(buttonInteraction, triggerChannel, currentConfig, client);
                } else if (customId.includes('jtc_config_limit_')) {
                    await handleUserLimitModal(buttonInteraction, triggerChannel, currentConfig, client);
                } else if (customId.includes('jtc_config_bitrate_')) {
                    await handleBitrateModal(buttonInteraction, triggerChannel, currentConfig, client);
                } else if (customId.includes('jtc_config_delete_')) {
                    await handleChannelDeletion(buttonInteraction, triggerChannel, currentConfig, client);
                }
            } catch (error) {
                const userMessage = error instanceof NexoBotError
                    ? error.userMessage || 'Ein Fehler ist aufgetreten.'
                    : 'Bei der Verarbeitung deiner Anfrage ist ein Fehler aufgetreten.';

                if (error instanceof NexoBotError) {
                    logger.debug(`Button interaction validation error: ${(error as Error).message}`, error.context || {});
                } else {
                    logger.error('Unexpected error in config button interaction:', error);
                }

                await buttonInteraction.reply({
                    content: `❌ ${userMessage}`,
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
        });

        collector.on('end', () => {
            const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                nameButton.setDisabled(true),
                limitButton.setDisabled(true),
                bitrateButton.setDisabled(true),
                deleteButton.setDisabled(true)
            );

            message.edit({
                components: [disabledRow],
                embeds: [configEmbed.setFooter({ text: 'Sitzung abgelaufen. Führe den Command erneut aus, um Änderungen vorzunehmen.' })]
            }).catch(() => {});
        });

    } catch (error) {
        if (error instanceof NexoBotError) {
            throw error;
        }
        throw new NexoBotError(
            `Config failed: ${(error as Error).message}`,
            ErrorTypes.DATABASE,
            'Konfiguration konnte nicht geladen werden.'
        );
    }
}

async function handleNameTemplateModal(interaction: ButtonInteraction, triggerChannel: VoiceChannel, currentConfig: ChannelConfiguration, client: NexoClient) {
    try {
        const TEMPLATE_OPTIONS = [
            { label: "Raum von {username}", value: "Raum von {username}" },
            { label: "Kanal von {username}", value: "Kanal von {username}" },
            { label: "Lounge von {username}", value: "Lounge von {username}" },
            { label: "Bereich von {username}", value: "Bereich von {username}" },
            { label: "Raum von {displayName}", value: "Raum von {displayName}" },
            { label: "VC von {username}", value: "VC von {username}" },
            { label: "Musikraum von {username}", value: "Musikraum von {username}" },
            { label: "Gaming-Raum von {username}", value: "Gaming-Raum von {username}" },
            { label: "Chatraum von {username}", value: "Chatraum von {username}" },
            { label: "Privater Raum von {username}", value: "Privater Raum von {username}" },
        ];

        const currentTemplate = currentConfig.channelConfig?.nameTemplate
            || currentConfig.channelNameTemplate
            || "Raum von {username}";

        // Keep a stored template that is not in the list (e.g. older English ones) selectable and preselected.
        const templateOptions = TEMPLATE_OPTIONS.some(o => o.value === currentTemplate)
            ? TEMPLATE_OPTIONS
            : [{ label: currentTemplate.slice(0, 100), value: currentTemplate.slice(0, 100) }, ...TEMPLATE_OPTIONS];

        const templateSelect = new StringSelectMenuBuilder()
            .setCustomId('template')
            .setPlaceholder('Wähle eine Namensvorlage...')
            .setOptions(
                templateOptions.map(o => ({
                    label: o.label,
                    value: o.value,
                    default: o.value === currentTemplate,
                })),
            );

        const templateLabel = new LabelBuilder()
            .setLabel('Kanalnamen-Vorlage')
            .setStringSelectMenuComponent(templateSelect);

        const modal = new ModalBuilder()
            .setCustomId(`jtc_name_modal_${triggerChannel.id}`)
            .setTitle('Kanalnamen-Vorlage')
            .addLabelComponents(templateLabel);

        await interaction.showModal(modal);

        const modalSubmission = await interaction.awaitModalSubmit({
            filter: (i) => i.customId === `jtc_name_modal_${triggerChannel.id}` && i.user.id === interaction.user.id,
            time: 60000
        });

        if (!hasManageGuildPermission(modalSubmission.member as GuildMember)) {
            await modalSubmission.reply({
                content: '❌ Du brauchst die Berechtigung **Server verwalten**, um diese Einstellungen zu ändern.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const [newTemplate] = modalSubmission.fields.getStringSelectValues('template');

        await updateChannelConfig(client, interaction.guild!.id, triggerChannel.id, {
            nameTemplate: newTemplate
        });

        await logConfigurationChange(client, interaction.guild!.id, interaction.user.id, 'Kanalnamen-Vorlage aktualisiert', {
            channelId: triggerChannel.id,
            newTemplate
        });

        await modalSubmission.reply({
            embeds: [successEmbed('Aktualisiert', `Kanalnamen-Vorlage geändert zu \`${newTemplate}\``)],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        if ((error as { code?: unknown }).code === 'INTERACTION_COLLECTOR_ERROR') {
            return;
        }
        if (error instanceof NexoBotError) {
            throw error;
        }
        logger.error('Unexpected error in name template modal:', error);
        throw new NexoBotError(
            `Modal error: ${(error as Error).message}`,
            ErrorTypes.UNKNOWN,
            'Beim Aktualisieren der Vorlage ist ein Fehler aufgetreten.'
        );
    }
}

async function handleUserLimitModal(interaction: ButtonInteraction, triggerChannel: VoiceChannel, currentConfig: ChannelConfiguration, client: NexoClient) {
    try {
        const currentLimit = currentConfig.channelConfig?.userLimit ?? currentConfig.userLimit ?? 0;

        const modal = new ModalBuilder()
            .setCustomId(`jtc_limit_modal_${triggerChannel.id}`)
            .setTitle('Nutzerlimit festlegen')
            .addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId('user_limit')
                        .setLabel('Nutzerlimit (0-99, 0 = unbegrenzt)')
                        .setPlaceholder('Gib eine Zahl zwischen 0 und 99 ein')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMinLength(1)
                        .setMaxLength(2)
                        .setValue(currentLimit.toString())
                )
            );

        await interaction.showModal(modal);

        const modalSubmission = await interaction.awaitModalSubmit({
            filter: (i) => i.customId === `jtc_limit_modal_${triggerChannel.id}` && i.user.id === interaction.user.id,
            time: 60000
        });

        if (!hasManageGuildPermission(modalSubmission.member as GuildMember)) {
            await modalSubmission.reply({
                content: '❌ Du brauchst die Berechtigung **Server verwalten**, um diese Einstellungen zu ändern.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const userInput = modalSubmission.fields.getTextInputValue('user_limit').trim();

        await updateChannelConfig(client, interaction.guild!.id, triggerChannel.id, {
            userLimit: parseInt(userInput)
        });

        await logConfigurationChange(client, interaction.guild!.id, interaction.user.id, 'Nutzerlimit aktualisiert', {
            channelId: triggerChannel.id,
            userLimit: parseInt(userInput)
        });

        await modalSubmission.reply({
            embeds: [successEmbed('Aktualisiert', `Nutzerlimit geändert zu ${parseInt(userInput) === 0 ? 'Unbegrenzt' : parseInt(userInput) + ' Nutzer'}`)],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        if ((error as { code?: unknown }).code === 'INTERACTION_COLLECTOR_ERROR') {
            return;
        }
        if (error instanceof NexoBotError) {
            throw error;
        }
        logger.error('Unexpected error in user limit modal:', error);
        throw new NexoBotError(
            `Modal error: ${(error as Error).message}`,
            ErrorTypes.UNKNOWN,
            'Beim Aktualisieren des Nutzerlimits ist ein Fehler aufgetreten.'
        );
    }
}

async function handleBitrateModal(interaction: ButtonInteraction, triggerChannel: VoiceChannel, currentConfig: ChannelConfiguration, client: NexoClient) {
    try {
        const currentBitrate = ((currentConfig.channelConfig.bitrate ?? currentConfig.bitrate ?? 64000) / 1000);

        const modal = new ModalBuilder()
            .setCustomId(`jtc_bitrate_modal_${triggerChannel.id}`)
            .setTitle('Bitrate festlegen')
            .addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId('bitrate')
                        .setLabel('Bitrate in kbps (8-384)')
                        .setPlaceholder('Gib eine Zahl zwischen 8 und 384 ein')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMinLength(1)
                        .setMaxLength(3)
                        .setValue(currentBitrate.toString())
                )
            );

        await interaction.showModal(modal);

        const modalSubmission = await interaction.awaitModalSubmit({
            filter: (i) => i.customId === `jtc_bitrate_modal_${triggerChannel.id}` && i.user.id === interaction.user.id,
            time: 60000
        });

        if (!hasManageGuildPermission(modalSubmission.member as GuildMember)) {
            await modalSubmission.reply({
                content: '❌ Du brauchst die Berechtigung **Server verwalten**, um diese Einstellungen zu ändern.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const userInput = modalSubmission.fields.getTextInputValue('bitrate').trim();

        await updateChannelConfig(client, interaction.guild!.id, triggerChannel.id, {
            bitrate: parseInt(userInput) * 1000
        });

        await logConfigurationChange(client, interaction.guild!.id, interaction.user.id, 'Bitrate aktualisiert', {
            channelId: triggerChannel.id,
            bitrate: parseInt(userInput)
        });

        await modalSubmission.reply({
            embeds: [successEmbed('Aktualisiert', `Bitrate geändert zu ${parseInt(userInput)} kbps`)],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        if ((error as { code?: unknown }).code === 'INTERACTION_COLLECTOR_ERROR') {
            return;
        }
        if (error instanceof NexoBotError) {
            throw error;
        }
        logger.error('Unexpected error in bitrate modal:', error);
        throw new NexoBotError(
            `Modal error: ${(error as Error).message}`,
            ErrorTypes.UNKNOWN,
            'Beim Aktualisieren der Bitrate ist ein Fehler aufgetreten.'
        );
    }
}

async function handleChannelDeletion(interaction: ButtonInteraction, triggerChannel: VoiceChannel, currentConfig: ChannelConfiguration, client: NexoClient) {
    try {
        const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`jtc_delete_confirm_${triggerChannel.id}`)
                .setLabel('🗑️ Ja, löschen')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`jtc_delete_cancel_${triggerChannel.id}`)
                .setLabel('❌ Abbrechen')
                .setStyle(ButtonStyle.Secondary)
        );

        await InteractionHelper.safeReply(interaction, {
            embeds: [warningEmbed('Löschen bestätigen', `Willst du **${triggerChannel.name}** wirklich aus dem Join-to-Create-System entfernen?\n\nDas kann nicht rückgängig gemacht werden.`)],
            components: [confirmRow],
            flags: MessageFlags.Ephemeral
        });

        const message = await interaction.fetchReply();
        const deleteCollector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: (i) => i.user.id === interaction.user.id && 
                          (i.customId === `jtc_delete_confirm_${triggerChannel.id}` || 
                           i.customId === `jtc_delete_cancel_${triggerChannel.id}`),
            time: 600_000,
            max: 1
        });

        deleteCollector.on('collect', async (buttonInteraction) => {
            try {
                
                if (!hasManageGuildPermission(buttonInteraction.member as GuildMember)) {
                    await buttonInteraction.reply({
                        content: '❌ Du brauchst die Berechtigung **Server verwalten**, um Kanäle zu entfernen.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                if (buttonInteraction.customId === `jtc_delete_confirm_${triggerChannel.id}`) {
                    
                    await removeTriggerChannel(client, interaction.guild!.id, triggerChannel.id);

                    await logConfigurationChange(client, interaction.guild!.id, interaction.user.id, 'Join-to-Create-Trigger entfernt', {
                        channelId: triggerChannel.id,
                        channelName: triggerChannel.name
                    });

                    try {
                        if (triggerChannel.members.size === 0) {
                            await triggerChannel.delete('Join-to-Create-Trigger von einem Administrator entfernt');
                        }
                    } catch (deleteError) {
                        logger.warn(`Could not delete channel ${triggerChannel.id}: ${(deleteError as Error).message}`);
                        
                    }

                    await buttonInteraction.update({
                        embeds: [successEmbed('Entfernt', `**${triggerChannel.name}** wurde aus dem Join-to-Create-System entfernt.`)],
                        components: []
                    });

                } else {
                    await buttonInteraction.update({
                        embeds: [successEmbed('Abgebrochen', 'Das Entfernen des Kanals wurde abgebrochen.')],
                        components: []
                    });
                }
            } catch (collectError) {
                logger.error('Error handling delete confirmation:', collectError);
                await buttonInteraction.reply({
                    content: '❌ Bei der Verarbeitung deiner Anfrage ist ein Fehler aufgetreten.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
        });

        deleteCollector.on('end', (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
                message.edit({ components: [] }).catch(() => {});
            }
        });

    } catch (error) {
        if (error instanceof NexoBotError) {
            throw error;
        }
        logger.error('Unexpected error in handleChannelDeletion:', error);
        throw new NexoBotError(
            `Deletion error: ${(error as Error).message}`,
            ErrorTypes.UNKNOWN,
            'Beim Entfernen des Kanals ist ein Fehler aufgetreten.'
        );
    }
}