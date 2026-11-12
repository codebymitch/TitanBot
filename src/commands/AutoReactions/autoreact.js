import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    MessageFlags,
} from 'discord.js';
import { successEmbed, infoEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import {
    getRules,
    addRule,
    removeRule,
    setRuleEnabled,
    clearRules,
} from '../../services/autoReactionService.js';

const TEXT_CHANNEL_TYPES = [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
];

const REQUIRED_BOT_PERMISSIONS = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AddReactions,
];

function parseEmojis(raw) {
    return String(raw || '')
        .split(/[\s,]+/)
        .map((emoji) => emoji.trim())
        .filter((emoji) => emoji.length > 0);
}

function describeRule(rule) {
    const scope = rule.channelId ? `<#${rule.channelId}>` : 'All channels';
    const keyword = rule.keyword ? `keyword \`${rule.keyword}\`` : 'any message';
    const status = rule.enabled ? 'Enabled' : 'Disabled';
    return `**#${rule.id}** — ${rule.emojis.join(' ')} — ${scope} — ${keyword} — ${status}`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('autoreact')
        .setDescription('Automatically react to messages with emojis')
        .addSubcommand((subcommand) =>
            subcommand
                .setName('add')
                .setDescription('Add an auto reaction rule')
                .addStringOption((option) =>
                    option
                        .setName('emojis')
                        .setDescription('Emojis to react with, separated by spaces or commas (max 5)')
                        .setRequired(true),
                )
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('Only react in this channel (defaults to all channels)')
                        .addChannelTypes(...TEXT_CHANNEL_TYPES)
                        .setRequired(false),
                )
                .addStringOption((option) =>
                    option
                        .setName('keyword')
                        .setDescription('Only react when a message contains this keyword')
                        .setMaxLength(100)
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('remove')
                .setDescription('Remove an auto reaction rule by its ID')
                .addStringOption((option) =>
                    option
                        .setName('id')
                        .setDescription('The rule ID shown in /autoreact list')
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('toggle')
                .setDescription('Enable or disable an auto reaction rule')
                .addStringOption((option) =>
                    option
                        .setName('id')
                        .setDescription('The rule ID shown in /autoreact list')
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('list')
                .setDescription('List all auto reaction rules in this server'),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('clear')
                .setDescription('Remove every auto reaction rule in this server'),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false),
    category: 'AutoReactions',
    abuseProtection: { maxAttempts: 8, windowMs: 60_000 },

    async execute(interaction, _config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });
        if (!deferSuccess) {
            logger.warn('AutoReact interaction defer failed', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'autoreact',
            });
            return;
        }

        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (subcommand === 'list') {
            const rules = await getRules(client, guildId);

            if (rules.length === 0) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [infoEmbed('No Auto Reactions', 'This server has no auto reaction rules yet. Use `/autoreact add` to create one.')],
                    flags: MessageFlags.Ephemeral,
                });
            }

            return InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('Auto Reactions', rules.map(describeRule).join('\n'))],
                flags: MessageFlags.Ephemeral,
            });
        }

        if (subcommand === 'clear') {
            await clearRules(guildId);
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('Auto Reactions Cleared', 'All auto reaction rules have been removed.')],
                flags: MessageFlags.Ephemeral,
            });
        }

        if (subcommand === 'add') {
            const emojis = parseEmojis(interaction.options.getString('emojis'));
            if (emojis.length === 0) {
                return replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Provide at least one emoji.',
                });
            }

            const channel = interaction.options.getChannel('channel');
            if (channel) {
                const botPermissions = channel.permissionsFor(interaction.guild.members.me);
                if (!botPermissions?.has(REQUIRED_BOT_PERMISSIONS)) {
                    return replyUserError(interaction, {
                        type: ErrorTypes.PERMISSION,
                        message: `I need **View Channel**, **Read Message History**, and **Add Reactions** permissions in ${channel}.`,
                    });
                }
            }

            let rule;
            try {
                rule = await addRule(guildId, {
                    emojis,
                    channelId: channel?.id || null,
                    keyword: interaction.options.getString('keyword'),
                });
            } catch (error) {
                return replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: error.message,
                });
            }

            return InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('Auto Reaction Added', describeRule(rule))],
                flags: MessageFlags.Ephemeral,
            });
        }

        const id = interaction.options.getString('id');
        const rules = await getRules(client, guildId);
        const existing = rules.find((rule) => rule.id === id);
        if (!existing) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: `No auto reaction rule with ID **${id}**.`,
            });
        }

        if (subcommand === 'remove') {
            await removeRule(guildId, id);
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('Auto Reaction Removed', `Rule **#${id}** has been removed.`)],
                flags: MessageFlags.Ephemeral,
            });
        }

        if (subcommand === 'toggle') {
            const updated = await setRuleEnabled(guildId, id, !existing.enabled);
            const status = updated.enabled ? 'enabled' : 'disabled';
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('Auto Reaction Updated', `Rule **#${id}** is now ${status}.`)],
                flags: MessageFlags.Ephemeral,
            });
        }

        return replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message: 'Unknown subcommand.',
        });
    },
};
