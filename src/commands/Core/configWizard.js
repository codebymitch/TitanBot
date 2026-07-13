import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    LabelBuilder,
    ChannelType,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed, buildUserErrorEmbed } from '../../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { getGuildConfig, setConfigValue } from '../../services/config/guildConfig.js';
import ConfigService from '../../services/config/configService.js';
import { logger } from '../../utils/logger.js';
import { botConfig, getCommandPrefix } from '../../config/bot.js';

const DASHBOARD_CUSTOM_ID = 'config_select';
const WIZARD_BUTTON_ID = 'config_wizard';
const activeWizardSessions = new Set();

const DM_DISABLED_HELP = [
    '1. Right-click this server\'s name (mobile: tap the server name at the top).',
    '2. Open **Privacy Settings**.',
    '3. Turn on **Allow direct messages from server members**.',
    '4. Click **Start Setup Wizard** again.',
].join('\n');

async function notifyWizardStarted(buttonInteraction) {
    await buttonInteraction.followUp({
        embeds: [infoEmbed(
            'Setup Wizard Started',
            'Check your DMs — I sent you the first setup question there.\n\nAnswer each question in that DM. Type `skip` to keep the current value.',
        )],
        flags: MessageFlags.Ephemeral,
    }).catch(() => {});
}

async function notifyWizardDmBlocked(buttonInteraction) {
    await replyUserError(buttonInteraction, {
        type: ErrorTypes.USER_INPUT,
        message: `I couldn't send you a DM. Enable DMs from this server, then try again.\n\n${DM_DISABLED_HELP}`,
    }).catch(() => {});
}

function formatChannelMention(guild, channelId) {
    if (!channelId) {
        return '`Not set`';
    }
    const channel = guild.channels.cache.get(channelId);
    return channel ? `<#${channelId}>` : `#${channelId}`;
}

function formatRoleMention(guild, roleId) {
    if (!roleId) {
        return '`Not set`';
    }
    const role = guild.roles.cache.get(roleId);
    return role ? `<@&${roleId}>` : `@${roleId}`;
}

function getBotPresenceText() {
    const activity = botConfig.presence?.activities?.[0];
    if (!activity?.name) {
        return '`Not configured`';
    }

    const typeLabels = ['Playing', 'Streaming', 'Listening to', 'Watching', '', 'Competing in'];
    const typeLabel = typeLabels[activity.type];
    if (!typeLabel) {
        return activity.name;
    }

    return `${typeLabel} **${activity.name}**`;
}

function getThemeColorLines() {
    const colors = botConfig.embeds.colors;
    return [
        `🎨 Primary \`${colors.primary}\` · Success \`${colors.success}\``,
        `⚠️ Warning \`${colors.warning}\` · Error \`${colors.error}\``,
    ].join('\n');
}

function buildDashboardEmbed(config, guild) {
    const setupDone = config.setupWizardCompleted;

    return createEmbed({
        title: '⚙️ Server Configuration',
        description: `Core settings for **${guild.name}**. Pick an option below or run the setup wizard.`,
        color: 'info',
        fields: [
            {
                name: '⌨️ Server Prefix',
                value: `\`${config.prefix || getCommandPrefix()}\``,
                inline: true,
            },
            {
                name: '🛡️ Moderator Role',
                value: formatRoleMention(guild, config.modRole),
                inline: true,
            },
            {
                name: '📋 Log Channel',
                value: formatChannelMention(guild, config.logging?.channels?.audit),
                inline: true,
            },
            {
                name: '💚 Bot Status',
                value: getBotPresenceText(),
                inline: false,
            },
            {
                name: '🎨 Embed Theme',
                value: `${getThemeColorLines()}\n-# Colors are set in bot config and apply globally.`,
                inline: false,
            },
            {
                name: '⚡ Command Access',
                value: 'Use `/commands dashboard` to enable or disable commands and subcommands.',
                inline: false,
            },
            {
                name: `${setupDone ? '✅' : '📝'} Setup`,
                value: setupDone
                    ? 'Setup wizard completed — re-run anytime to update settings.'
                    : 'Run the setup wizard to configure your server quickly.',
                inline: false,
            },
        ],
        footer: 'Dashboard closes after 10 minutes of inactivity',
    });
}

function buildSettingsSelect(guildId) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`${DASHBOARD_CUSTOM_ID}:${guildId}`)
            .setPlaceholder('⚙️ Select a setting to edit...')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Server Prefix')
                    .setDescription('Change the text command prefix')
                    .setValue('prefix')
                    .setEmoji('⌨️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Moderator Role')
                    .setDescription('Role used for moderation commands')
                    .setValue('modRole')
                    .setEmoji('🛡️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Log Channel')
                    .setDescription('Channel for system log messages')
                    .setValue('logChannelId')
                    .setEmoji('📋'),
            ),
    );
}

function buildButtonRow(config, guildId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${WIZARD_BUTTON_ID}:${guildId}`)
            .setLabel(config.setupWizardCompleted ? 'Re-run Setup Wizard' : 'Start Setup Wizard')
            .setEmoji('📝')
            .setStyle(config.setupWizardCompleted ? ButtonStyle.Secondary : ButtonStyle.Success),
    );
}

function extractId(value) {
    if (!value || typeof value !== 'string') return null;

    const channelMention = value.match(/<#!?(\d{17,19})>/);
    if (channelMention) return channelMention[1];

    const roleMention = value.match(/<@&(\d{17,19})>/);
    if (roleMention) return roleMention[1];

    const digits = value.match(/^(\d{17,19})$/);
    if (digits) return digits[1];

    return null;
}

async function askQuestion(dmChannel, userId, prompt, stepNumber, totalSteps) {
    await dmChannel.send({
        embeds: [createEmbed({
            title: `Setup Question ${stepNumber}/${totalSteps}`,
            description: prompt,
            color: 'primary',
        })],
    });

    const collected = await dmChannel.awaitMessages({
        filter: (message) => message.author.id === userId && !message.author.bot,
        max: 1,
        time: 180_000,
    }).catch(() => null);

    if (!collected || !collected.size) {
        await dmChannel.send({
            embeds: [buildUserErrorEmbed(ErrorTypes.RATE_LIMIT, 'You did not answer in time. Run the setup wizard again when ready.')],
        });
        return null;
    }

    const answer = collected.first().content.trim();
    if (answer.toLowerCase() === 'cancel') {
        await dmChannel.send({
            embeds: [infoEmbed('Setup Cancelled', 'Setup wizard stopped. Your saved answers are still applied.')],
        });
        return { cancelled: true };
    }

    return { answer };
}

function formatSavedAck(key, value, guild) {
    if (key === 'prefix') {
        return `Server prefix saved as \`${value}\`.`;
    }

    if (key === 'logChannelId') {
        if (value === null) {
            return 'Log channel cleared.';
        }
        const channel = guild.channels.cache.get(value);
        return `Log channel saved as ${channel ?? `<#${value}>`}.`;
    }

    if (key === 'modRole') {
        if (value === null) {
            return 'Moderator role cleared.';
        }
        const role = guild.roles.cache.get(value);
        return `Moderator role saved as ${role ?? `<@&${value}>`}.`;
    }

    return 'Setting saved.';
}

async function validateGuildChannelId(guild, channelId) {
    const channel = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        throw new Error('That channel was not found in this server or is not a text channel.');
    }
    return channel.id;
}

async function validateGuildRoleId(guild, roleId) {
    const role = guild.roles.cache.get(roleId) ?? await guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
        throw new Error('That role was not found in this server.');
    }
    return role.id;
}

async function refreshDashboard(rootInteraction, config, guild) {
    const embed = buildDashboardEmbed(config, guild);
    const components = [buildButtonRow(config, guild.id), buildSettingsSelect(guild.id)];
    await InteractionHelper.safeEditReply(rootInteraction, { embeds: [embed], components }).catch(() => {});
}

async function runSetupWizard(buttonInteraction, config, guild, client, rootInteraction) {
    const user = buttonInteraction.user;

    if (activeWizardSessions.has(user.id)) {
        await buttonInteraction.followUp({
            embeds: [warningEmbed('Setup Already Running', 'You already have a setup wizard open in your DMs. Reply there to continue, or type `cancel` to stop it.')],
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        return;
    }

    activeWizardSessions.add(user.id);

    let dmChannel;

    try {
        dmChannel = await user.createDM();
    } catch (error) {
        logger.warn('Failed to create DM channel for setup wizard', { userId: user.id, error: error.message });
        await notifyWizardDmBlocked(buttonInteraction);
        return;
    } finally {
        if (!dmChannel) {
            activeWizardSessions.delete(user.id);
        }
    }

    const prompts = [
        {
            key: 'prefix',
            skipMessage: 'Keeping the current server prefix.',
            question: 'What command prefix should this server use?\nCurrent: `' + (config.prefix || getCommandPrefix()) + '`\nReply `skip` to keep it, or `cancel` to stop.',
            parse: async (answer) => {
                const normalized = answer.trim();
                if (normalized.toLowerCase() === 'skip') return undefined;
                if (/\s/.test(normalized) || normalized.length < 1 || normalized.length > 10) {
                    throw new Error('Prefix must be 1-10 characters with no spaces.');
                }
                return normalized;
            },
        },
        {
            key: 'logChannelId',
            skipMessage: 'Keeping the current log channel.',
            question: 'Which channel should receive bot logs?\nSend a channel mention, channel ID, `none` to clear, `skip` to keep the current value, or `cancel` to stop.',
            parse: async (answer) => {
                const normalized = answer.trim();
                if (normalized.toLowerCase() === 'skip') return undefined;
                if (normalized.toLowerCase() === 'none') return null;
                const id = extractId(normalized);
                if (!id) throw new Error('Provide a valid channel mention or ID from this server.');
                return validateGuildChannelId(guild, id);
            },
        },
        {
            key: 'modRole',
            skipMessage: 'Keeping the current moderator role.',
            question: 'What role should moderators have?\nSend a role mention, role ID, `none` to clear, `skip` to keep the current value, or `cancel` to stop.',
            parse: async (answer) => {
                const normalized = answer.trim();
                if (normalized.toLowerCase() === 'skip') return undefined;
                if (normalized.toLowerCase() === 'none') return null;
                const id = extractId(normalized);
                if (!id) throw new Error('Provide a valid role mention or ID from this server.');
                return validateGuildRoleId(guild, id);
            },
        },
    ];

    const changes = {};
    const errors = [];
    let wizardCancelled = false;

    try {
        try {
            await dmChannel.send({
                embeds: [createEmbed({
                    title: '📝 Setup Wizard',
                    description: 'Answer each question in this DM.\n\n• Type `skip` to keep the current value\n• Type `cancel` to stop the wizard',
                    color: 'info',
                })],
            });
        } catch (error) {
            logger.warn('Failed to send setup wizard DM', { userId: user.id, error: error.message });
            await notifyWizardDmBlocked(buttonInteraction);
            return;
        }

        await notifyWizardStarted(buttonInteraction);

        for (let index = 0; index < prompts.length; index++) {
            const prompt = prompts[index];
            let answered = false;

            while (!answered) {
                const result = await askQuestion(
                    dmChannel,
                    user.id,
                    prompt.question,
                    index + 1,
                    prompts.length,
                );

                if (result === null) {
                    wizardCancelled = true;
                    answered = true;
                    break;
                }

                if (result.cancelled) {
                    wizardCancelled = true;
                    answered = true;
                    break;
                }

                try {
                    const value = await prompt.parse(result.answer);

                    if (value === undefined) {
                        await dmChannel.send({
                            embeds: [infoEmbed('Skipped', prompt.skipMessage)],
                        });
                    } else {
                        await ConfigService.updateSetting(client, guild.id, prompt.key, value, user.id);
                        changes[prompt.key] = value;
                        await dmChannel.send({
                            embeds: [successEmbed('Saved', formatSavedAck(prompt.key, value, guild))],
                        });

                        try {
                            const updatedConfig = await getGuildConfig(client, guild.id);
                            await refreshDashboard(rootInteraction, updatedConfig, guild);
                        } catch (refreshError) {
                            logger.debug('Failed to refresh dashboard during setup wizard', { error: refreshError.message });
                        }
                    }

                    answered = true;
                } catch (error) {
                    errors.push(`• ${prompt.key}: ${error.message}`);
                    await dmChannel.send({
                        embeds: [buildUserErrorEmbed(ErrorTypes.VALIDATION, `${error.message}\n\nPlease reply again with a valid answer, \`skip\`, or \`cancel\`.`)],
                    });
                }
            }

            if (wizardCancelled) {
                break;
            }
        }

        if (!wizardCancelled) {
            try {
                await setConfigValue(client, guild.id, 'setupWizardCompleted', true);
            } catch (error) {
                logger.warn('Failed to persist setupWizardCompleted flag', { guildId: guild.id, error: error.message });
            }
        }

        const summaryTitle = wizardCancelled
            ? (Object.keys(changes).length > 0 ? 'Setup Stopped' : 'Setup Cancelled')
            : (errors.length > 0 ? 'Setup Complete' : 'Setup Complete');

        const summaryBody = wizardCancelled
            ? (Object.keys(changes).length > 0
                ? `Setup stopped early. Saved **${Object.keys(changes).length}** setting(s) before stopping.`
                : 'Setup wizard stopped before any changes were saved.')
            : (Object.keys(changes).length > 0
                ? `Updated **${Object.keys(changes).length}** setting(s).${errors.length > 0 ? ' Some answers needed retries.' : ''}`
                : 'No changes were applied.');

        const summaryEmbed = createEmbed({
            title: wizardCancelled ? `⚠️ ${summaryTitle}` : `✅ ${summaryTitle}`,
            description: summaryBody,
            color: wizardCancelled ? 'warning' : (errors.length > 0 ? 'warning' : 'success'),
        });

        if (errors.length > 0) {
            const uniqueErrors = [...new Set(errors)];
            summaryEmbed.addFields({ name: 'Issues', value: uniqueErrors.join('\n').slice(0, 1024) });
        }

        await dmChannel.send({ embeds: [summaryEmbed] });

        try {
            const updatedConfig = await getGuildConfig(client, guild.id);
            await refreshDashboard(rootInteraction, updatedConfig, guild);
        } catch (error) {
            logger.debug('Failed to refresh dashboard after wizard completion', { error: error.message });
        }
    } finally {
        activeWizardSessions.delete(user.id);
    }
}

async function showSettingModal(selectInteraction, guildId, setting) {
    const modalCustomId = `config_wizard_modal:${setting}:${guildId}`;

    if (setting === 'logChannelId') {
        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle('📋 Update Log Channel');

        const channelSelect = new ChannelSelectMenuBuilder()
            .setCustomId('log_channel')
            .setPlaceholder('Select a text channel...')
            .setMinValues(1)
            .setMaxValues(1)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true);

        const channelLabel = new LabelBuilder()
            .setLabel('Log Channel')
            .setDescription('Channel where system log messages will be sent')
            .setChannelSelectMenuComponent(channelSelect);

        modal.addLabelComponents(channelLabel);
        await selectInteraction.showModal(modal);
        return;
    }

    if (setting === 'modRole') {
        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle('🛡️ Update Moderator Role');

        const roleSelect = new RoleSelectMenuBuilder()
            .setCustomId('mod_role')
            .setPlaceholder('Select a moderator role...')
            .setMinValues(1)
            .setMaxValues(1)
            .setRequired(true);

        const roleLabel = new LabelBuilder()
            .setLabel('Moderator Role')
            .setDescription('Role used for moderation commands')
            .setRoleSelectMenuComponent(roleSelect);

        modal.addLabelComponents(roleLabel);
        await selectInteraction.showModal(modal);
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(modalCustomId)
        .setTitle('Update Server Prefix');

    const textInput = new TextInputBuilder()
        .setCustomId('value')
        .setLabel('New prefix (1-10 characters, no spaces)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10);

    modal.addComponents(new ActionRowBuilder().addComponents(textInput));
    await selectInteraction.showModal(modal);
}

function resolveSettingModalValue(setting, submitted) {
    if (setting === 'logChannelId') {
        const channelId = submitted.fields.getField('log_channel')?.values?.[0];
        if (!channelId) {
            throw new Error('Please select a log channel.');
        }
        return channelId;
    }

    if (setting === 'modRole') {
        const roleId = submitted.fields.getField('mod_role')?.values?.[0];
        if (!roleId) {
            throw new Error('Please select a moderator role.');
        }
        return roleId;
    }

    const prefix = submitted.fields.getTextInputValue('value')?.trim();
    if (!prefix || prefix.length < 1 || prefix.length > 10 || /\s/.test(prefix)) {
        throw new Error('Prefix must be 1-10 characters with no spaces.');
    }
    return prefix;
}

function buildSettingSuccessMessage(setting, value, guild) {
    if (setting === 'logChannelId') {
        const channel = guild.channels.cache.get(value);
        return `Log channel set to ${channel ?? `<#${value}>`}.`;
    }

    if (setting === 'modRole') {
        const role = guild.roles.cache.get(value);
        return `Moderator role set to ${role ?? `<@&${value}>`}.`;
    }

    return `Server prefix set to \`${value}\`.`;
}

async function handleSettingModalSubmit(selectInteraction, rootInteraction, setting, guildId, client) {
    const modalCustomId = `config_wizard_modal:${setting}:${guildId}`;

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: (modalInteraction) =>
                modalInteraction.customId === modalCustomId &&
                modalInteraction.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) {
        return;
    }

    try {
        const value = resolveSettingModalValue(setting, submitted);
        await ConfigService.updateSetting(client, guildId, setting, value, submitted.user.id);

        await submitted.reply({
            embeds: [successEmbed('Configuration Updated', buildSettingSuccessMessage(setting, value, submitted.guild))],
            flags: MessageFlags.Ephemeral,
        });

        const updatedConfig = await getGuildConfig(client, guildId);
        await refreshDashboard(rootInteraction, updatedConfig, submitted.guild);
    } catch (error) {
        logger.error('Config wizard modal submit error:', error);
        await replyUserError(submitted, {
            type: ErrorTypes.CONFIGURATION,
            message: error.message || 'Please try again.',
        }).catch(() => {});
    }
}

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('configwizard')
        .setDescription('Open the server configuration dashboard and setup wizard')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),
    category: 'Core',

    async execute(interaction) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferSuccess) {
                return;
            }

            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return replyUserError(interaction, {
                    type: ErrorTypes.PERMISSION,
                    message: 'You need the **Manage Server** permission to use this command.',
                });
            }

            const guildConfig = await getGuildConfig(interaction.client, interaction.guildId);
            const embed = buildDashboardEmbed(guildConfig, interaction.guild);
            const components = [buildButtonRow(guildConfig, interaction.guildId), buildSettingsSelect(interaction.guildId)];

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components });

            const replyMessage = await interaction.fetchReply().catch(() => null);
            if (!replyMessage) {
                return;
            }

            const collectorFilter = (componentInteraction) =>
                componentInteraction.user.id === interaction.user.id &&
                componentInteraction.customId.includes(`:${interaction.guildId}`);

            const componentCollector = replyMessage.createMessageComponentCollector({
                filter: collectorFilter,
                time: 600_000,
            });

            componentCollector.on('collect', async (componentInteraction) => {
                try {
                    if (componentInteraction.isButton()) {
                        await componentInteraction.deferUpdate();

                        if (componentInteraction.customId.startsWith(`${WIZARD_BUTTON_ID}:`)) {
                            const latestConfig = await getGuildConfig(interaction.client, interaction.guildId);
                            await runSetupWizard(componentInteraction, latestConfig, interaction.guild, interaction.client, interaction);
                        }
                        return;
                    }

                    if (componentInteraction.isStringSelectMenu()) {
                        const selected = componentInteraction.values[0];
                        await showSettingModal(componentInteraction, interaction.guildId, selected);
                        await handleSettingModalSubmit(
                            componentInteraction,
                            interaction,
                            selected,
                            interaction.guildId,
                            interaction.client,
                        );
                    }
                } catch (error) {
                    logger.error('Config dashboard interaction error:', error);
                    await replyUserError(componentInteraction, {
                        type: ErrorTypes.UNKNOWN,
                        message: 'Failed to process your selection. Please try again.',
                    }).catch(() => {});
                }
            });
        } catch (error) {
            logger.error('Config command error:', error);
            await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: 'Failed to open configuration dashboard. Please try again.',
            });
        }
    },
};
