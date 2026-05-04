import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { AntiNsfwService } from '../../services/antiNsfwService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('antinsfw')
        .setDescription('Configure automatic NSFW content detection and removal')
        .addSubcommand(sub =>
            sub.setName('enable')
                .setDescription('Enable anti-NSFW scanning in this server')
        )
        .addSubcommand(sub =>
            sub.setName('disable')
                .setDescription('Disable anti-NSFW scanning in this server')
        )
        .addSubcommand(sub =>
            sub.setName('config')
                .setDescription('Configure anti-NSFW settings')
                .addStringOption(o =>
                    o.setName('action')
                        .setDescription('What to do when NSFW content is detected')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Delete only', value: 'delete' },
                            { name: 'Delete + DM warn', value: 'warn' },
                            { name: 'Delete + Timeout', value: 'timeout' },
                            { name: 'Delete + Kick', value: 'kick' },
                            { name: 'Delete + Ban', value: 'ban' },
                        )
                )
                .addChannelOption(o =>
                    o.setName('log_channel')
                        .setDescription('Channel to log NSFW violations (leave blank to disable logging)')
                )
                .addIntegerOption(o =>
                    o.setName('timeout_minutes')
                        .setDescription('Timeout duration in minutes when action is "timeout" (default: 5)')
                        .setMinValue(1)
                        .setMaxValue(40320)
                )
                .addBooleanOption(o =>
                    o.setName('image_scanning')
                        .setDescription('Scan images/videos via Sightengine API (requires API keys in .env)')
                )
                .addNumberOption(o =>
                    o.setName('nudity_threshold')
                        .setDescription('Confidence threshold for image flagging 0.0–1.0 (default: 0.75)')
                        .setMinValue(0.1)
                        .setMaxValue(1.0)
                )
        )
        .addSubcommand(sub =>
            sub.setName('status')
                .setDescription('Show current anti-NSFW configuration')
        )
        .addSubcommand(sub =>
            sub.setName('exempt')
                .setDescription('Add or remove an exempt channel or role')
                .addStringOption(o =>
                    o.setName('action')
                        .setDescription('Add or remove an exemption')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Add channel', value: 'add_channel' },
                            { name: 'Remove channel', value: 'remove_channel' },
                            { name: 'Add role', value: 'add_role' },
                            { name: 'Remove role', value: 'remove_role' },
                        )
                )
                .addChannelOption(o =>
                    o.setName('channel')
                        .setDescription('Channel to exempt (for add/remove channel)')
                )
                .addRoleOption(o =>
                    o.setName('role')
                        .setDescription('Role to exempt (for add/remove role)')
                )
        )
        .addSubcommand(sub =>
            sub.setName('words')
                .setDescription('Manage custom NSFW keywords')
                .addStringOption(o =>
                    o.setName('action')
                        .setDescription('Add, remove, or list custom words')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Add word', value: 'add' },
                            { name: 'Remove word', value: 'remove' },
                            { name: 'List words', value: 'list' },
                        )
                )
                .addStringOption(o =>
                    o.setName('word')
                        .setDescription('Word to add or remove')
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    category: 'moderation',

    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction, { ephemeral: true });

        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        try {
            if (sub === 'enable') {
                await AntiNsfwService.setConfig(client, guildId, { enabled: true });
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed('Anti-NSFW Enabled', 'NSFW scanning is now active. Use `/antinsfw config` to set the action and log channel.')],
                });
            }

            if (sub === 'disable') {
                await AntiNsfwService.setConfig(client, guildId, { enabled: false });
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed('Anti-NSFW Disabled', 'NSFW scanning has been turned off.')],
                });
            }

            if (sub === 'config') {
                const action = interaction.options.getString('action');
                const logChannel = interaction.options.getChannel('log_channel');
                const timeoutMinutes = interaction.options.getInteger('timeout_minutes');
                const imageScanning = interaction.options.getBoolean('image_scanning');
                const nudityThreshold = interaction.options.getNumber('nudity_threshold');

                const updates = { action };
                if (logChannel !== null) updates.logChannelId = logChannel.id;
                if (timeoutMinutes !== null) updates.timeoutDuration = timeoutMinutes * 60 * 1000;
                if (imageScanning !== null) updates.imageScanning = imageScanning;
                if (nudityThreshold !== null) updates.nudityThreshold = nudityThreshold;

                const updated = await AntiNsfwService.setConfig(client, guildId, updates);

                const lines = [
                    `**Action:** ${updated.action}`,
                    updated.action === 'timeout'
                        ? `**Timeout duration:** ${Math.round(updated.timeoutDuration / 60000)} minutes`
                        : null,
                    `**Log channel:** ${updated.logChannelId ? `<#${updated.logChannelId}>` : 'none'}`,
                    `**Image scanning:** ${updated.imageScanning ? 'enabled' : 'disabled'}`,
                    updated.imageScanning
                        ? `**Nudity threshold:** ${updated.nudityThreshold}`
                        : null,
                ].filter(Boolean).join('\n');

                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed('Anti-NSFW Configured', lines)],
                });
            }

            if (sub === 'status') {
                const cfg = await AntiNsfwService.getConfig(client, guildId);
                const apiKeysSet = !!(process.env.SIGHTENGINE_API_USER && process.env.SIGHTENGINE_API_SECRET);

                const lines = [
                    `**Status:** ${cfg.enabled ? 'Enabled' : 'Disabled'}`,
                    `**Action:** ${cfg.action}`,
                    cfg.action === 'timeout'
                        ? `**Timeout duration:** ${Math.round(cfg.timeoutDuration / 60000)} minutes`
                        : null,
                    `**Log channel:** ${cfg.logChannelId ? `<#${cfg.logChannelId}>` : 'none'}`,
                    `**Image scanning:** ${cfg.imageScanning ? 'enabled' : 'disabled'} ${!apiKeysSet ? '*(API keys not set)*' : ''}`,
                    cfg.imageScanning ? `**Nudity threshold:** ${cfg.nudityThreshold}` : null,
                    `**Exempt channels:** ${cfg.exemptChannels.length ? cfg.exemptChannels.map(id => `<#${id}>`).join(', ') : 'none'}`,
                    `**Exempt roles:** ${cfg.exemptRoles.length ? cfg.exemptRoles.map(id => `<@&${id}>`).join(', ') : 'none'}`,
                    `**Custom words:** ${cfg.customWords.length} word${cfg.customWords.length !== 1 ? 's' : ''}`,
                ].filter(Boolean).join('\n');

                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [createEmbed({
                        title: 'Anti-NSFW Status',
                        description: lines,
                        color: cfg.enabled ? 'green' : 'gray',
                    })],
                });
            }

            if (sub === 'exempt') {
                const action = interaction.options.getString('action');
                const channel = interaction.options.getChannel('channel');
                const role = interaction.options.getRole('role');
                const cfg = await AntiNsfwService.getConfig(client, guildId);

                if (action === 'add_channel') {
                    if (!channel) {
                        return InteractionHelper.safeEditReply(interaction, {
                            embeds: [errorEmbed('Missing Option', 'Please provide a channel to exempt.')],
                        });
                    }
                    if (cfg.exemptChannels.includes(channel.id)) {
                        return InteractionHelper.safeEditReply(interaction, {
                            embeds: [errorEmbed('Already Exempt', `${channel} is already exempt.`)],
                        });
                    }
                    cfg.exemptChannels.push(channel.id);
                    await AntiNsfwService.setConfig(client, guildId, { exemptChannels: cfg.exemptChannels });
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [successEmbed('Exemption Added', `${channel} will no longer be scanned.`)],
                    });
                }

                if (action === 'remove_channel') {
                    if (!channel) {
                        return InteractionHelper.safeEditReply(interaction, {
                            embeds: [errorEmbed('Missing Option', 'Please provide a channel to remove from exemptions.')],
                        });
                    }
                    const filtered = cfg.exemptChannels.filter(id => id !== channel.id);
                    if (filtered.length === cfg.exemptChannels.length) {
                        return InteractionHelper.safeEditReply(interaction, {
                            embeds: [errorEmbed('Not Found', `${channel} is not in the exempt list.`)],
                        });
                    }
                    await AntiNsfwService.setConfig(client, guildId, { exemptChannels: filtered });
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [successEmbed('Exemption Removed', `${channel} will now be scanned.`)],
                    });
                }

                if (action === 'add_role') {
                    if (!role) {
                        return InteractionHelper.safeEditReply(interaction, {
                            embeds: [errorEmbed('Missing Option', 'Please provide a role to exempt.')],
                        });
                    }
                    if (cfg.exemptRoles.includes(role.id)) {
                        return InteractionHelper.safeEditReply(interaction, {
                            embeds: [errorEmbed('Already Exempt', `${role} is already exempt.`)],
                        });
                    }
                    cfg.exemptRoles.push(role.id);
                    await AntiNsfwService.setConfig(client, guildId, { exemptRoles: cfg.exemptRoles });
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [successEmbed('Exemption Added', `Members with ${role} will not be scanned.`)],
                    });
                }

                if (action === 'remove_role') {
                    if (!role) {
                        return InteractionHelper.safeEditReply(interaction, {
                            embeds: [errorEmbed('Missing Option', 'Please provide a role to remove from exemptions.')],
                        });
                    }
                    const filtered = cfg.exemptRoles.filter(id => id !== role.id);
                    if (filtered.length === cfg.exemptRoles.length) {
                        return InteractionHelper.safeEditReply(interaction, {
                            embeds: [errorEmbed('Not Found', `${role} is not in the exempt list.`)],
                        });
                    }
                    await AntiNsfwService.setConfig(client, guildId, { exemptRoles: filtered });
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [successEmbed('Exemption Removed', `Members with ${role} will now be scanned.`)],
                    });
                }
            }

            if (sub === 'words') {
                const action = interaction.options.getString('action');
                const word = interaction.options.getString('word')?.toLowerCase().trim();
                const cfg = await AntiNsfwService.getConfig(client, guildId);

                if (action === 'add') {
                    if (!word) {
                        return InteractionHelper.safeEditReply(interaction, {
                            embeds: [errorEmbed('Missing Option', 'Please provide a word to add.')],
                        });
                    }
                    if (word.length > 50) {
                        return InteractionHelper.safeEditReply(interaction, {
                            embeds: [errorEmbed('Too Long', 'Word must be 50 characters or fewer.')],
                        });
                    }
                    if (AntiNsfwService.getBaseWords().includes(word)) {
                        return InteractionHelper.safeEditReply(interaction, {
                            embeds: [errorEmbed('Already Blocked', `"${word}" is already in the built-in word list.`)],
                        });
                    }
                    if (cfg.customWords.includes(word)) {
                        return InteractionHelper.safeEditReply(interaction, {
                            embeds: [errorEmbed('Duplicate', `"${word}" is already in your custom list.`)],
                        });
                    }
                    cfg.customWords.push(word);
                    await AntiNsfwService.setConfig(client, guildId, { customWords: cfg.customWords });
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [successEmbed('Word Added', `"${word}" added to the NSFW keyword list.`)],
                    });
                }

                if (action === 'remove') {
                    if (!word) {
                        return InteractionHelper.safeEditReply(interaction, {
                            embeds: [errorEmbed('Missing Option', 'Please provide a word to remove.')],
                        });
                    }
                    const filtered = cfg.customWords.filter(w => w !== word);
                    if (filtered.length === cfg.customWords.length) {
                        return InteractionHelper.safeEditReply(interaction, {
                            embeds: [errorEmbed('Not Found', `"${word}" is not in your custom word list.`)],
                        });
                    }
                    await AntiNsfwService.setConfig(client, guildId, { customWords: filtered });
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [successEmbed('Word Removed', `"${word}" removed from the NSFW keyword list.`)],
                    });
                }

                if (action === 'list') {
                    const baseWords = AntiNsfwService.getBaseWords();
                    const lines = [
                        `**Built-in words (${baseWords.length}):** ${baseWords.join(', ')}`,
                        cfg.customWords.length
                            ? `**Custom words (${cfg.customWords.length}):** ${cfg.customWords.join(', ')}`
                            : `**Custom words:** none`,
                    ].join('\n\n');
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [createEmbed({ title: 'NSFW Keyword Lists', description: lines, color: 'blue' })],
                    });
                }
            }
        } catch (error) {
            logger.error('antinsfw command error:', error);
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Error', 'Something went wrong. Try again later.')],
            });
        }
    },
};
