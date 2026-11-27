import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    AutoModerationRuleEventType,
    AutoModerationRuleTriggerType,
    AutoModerationActionType,
} from 'discord.js';
import { createEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';

const TIMEOUT_DURATION_SECONDS = 300;
const DEFAULT_MENTION_LIMIT = 5;
const MAX_KEYWORDS = 1000;

const TRIGGER_TYPES = {
    keyword: AutoModerationRuleTriggerType.Keyword,
    spam: AutoModerationRuleTriggerType.Spam,
    mention_spam: AutoModerationRuleTriggerType.MentionSpam,
};

const TRIGGER_LABELS = {
    keyword: 'Custom keywords',
    spam: 'Spam messages',
    mention_spam: 'Mention spam',
};

function parseKeywords(raw) {
    return String(raw || '')
        .split(/[,\n]/)
        .map((keyword) => keyword.trim())
        .filter(Boolean)
        .slice(0, MAX_KEYWORDS);
}

function buildActions(action, alertChannel) {
    switch (action) {
        case 'alert':
            return [
                { type: AutoModerationActionType.BlockMessage },
                {
                    type: AutoModerationActionType.SendAlertMessage,
                    metadata: { channelId: alertChannel.id },
                },
            ];
        case 'timeout':
            return [
                {
                    type: AutoModerationActionType.Timeout,
                    metadata: { durationSeconds: TIMEOUT_DURATION_SECONDS },
                },
                { type: AutoModerationActionType.BlockMessage },
            ];
        case 'block':
        default:
            return [{ type: AutoModerationActionType.BlockMessage }];
    }
}

function buildTriggerMetadata(type, keywords, mentionLimit) {
    if (type === 'keyword') {
        return { keywordFilter: keywords };
    }
    if (type === 'mention_spam') {
        return { mentionTotalLimit: mentionLimit ?? DEFAULT_MENTION_LIMIT };
    }
    return undefined;
}

function describeActions(actions = []) {
    const labels = [];
    for (const action of actions) {
        if (action.type === AutoModerationActionType.BlockMessage) labels.push('block message');
        else if (action.type === AutoModerationActionType.SendAlertMessage) labels.push('send alert');
        else if (action.type === AutoModerationActionType.Timeout) labels.push('timeout member');
    }
    return labels.join(', ') || 'none';
}

function describeTrigger(rule) {
    const key = Object.keys(TRIGGER_TYPES).find((name) => TRIGGER_TYPES[name] === rule.triggerType);
    return TRIGGER_LABELS[key] || `type ${rule.triggerType}`;
}

function findRule(rules, query) {
    const needle = String(query || '').trim().toLowerCase();
    return rules.find((rule) => rule.id === query)
        || rules.find((rule) => rule.name.toLowerCase() === needle);
}

async function checkBotPermission(interaction) {
    const me = interaction.guild.members.me;
    if (!me?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
        await replyUserError(interaction, {
            type: ErrorTypes.PERMISSION,
            message: 'I need the **Manage Server** permission to manage AutoMod rules.',
        });
        return false;
    }
    return true;
}

async function handleCreate(interaction) {
    const type = interaction.options.getString('type');
    const action = interaction.options.getString('action') || 'block';
    const keywordsRaw = interaction.options.getString('keywords');
    const mentionLimit = interaction.options.getInteger('mention_limit');
    const alertChannel = interaction.options.getChannel('alert_channel');
    const customName = interaction.options.getString('name');

    const keywords = type === 'keyword' ? parseKeywords(keywordsRaw) : [];
    if (type === 'keyword' && keywords.length === 0) {
        return await replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message: 'Provide at least one keyword (separate multiple keywords with commas).',
        });
    }

    if (action === 'alert' && !alertChannel) {
        return await replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message: 'Please provide an alert channel when using the **Block + alert** action.',
        });
    }

    const name = (customName || `AutoMod: ${TRIGGER_LABELS[type]}`).slice(0, 100);

    const rule = await interaction.guild.autoModerationRules.create({
        name,
        enabled: true,
        eventType: AutoModerationRuleEventType.MessageSend,
        triggerType: TRIGGER_TYPES[type],
        triggerMetadata: buildTriggerMetadata(type, keywords, mentionLimit),
        actions: buildActions(action, alertChannel),
        exemptRoles: [],
        exemptChannels: [],
        reason: `AutoMod rule created by ${interaction.user.tag}`,
    });

    const details = [
        `**Name:** ${rule.name}`,
        `**Trigger:** ${TRIGGER_LABELS[type]}`,
        `**Action:** ${describeActions(rule.actions)}`,
        `**Rule ID:** ${rule.id}`,
        '',
        'Manage it with `/automod list` and `/automod remove`.',
    ];

    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('AutoMod Rule Created', details.join('\n'))],
    });
}

async function handleList(interaction) {
    const rules = await interaction.guild.autoModerationRules.fetch();

    if (rules.size === 0) {
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [infoEmbed('AutoMod Rules', 'No AutoMod rules are configured on this server yet.\nCreate one with `/automod create`.')],
        });
    }

    const lines = [...rules.values()].map((rule) => {
        const status = rule.enabled ? 'enabled' : 'disabled';
        return `**${rule.name}** · ${status}\n└ ${describeTrigger(rule)} · ${describeActions(rule.actions)} · \`${rule.id}\``;
    });

    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [createEmbed({
            title: `AutoMod Rules (${rules.size})`,
            description: lines.join('\n\n'),
            color: 'primary',
        })],
    });
}

async function handleRemove(interaction) {
    const query = interaction.options.getString('rule');
    const rules = await interaction.guild.autoModerationRules.fetch();
    const rule = findRule(rules, query);

    if (!rule) {
        return await replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message: `No AutoMod rule found matching \`${query}\`. Use \`/automod list\` to see the exact names and IDs.`,
        });
    }

    await interaction.guild.autoModerationRules.delete(rule.id, `AutoMod rule removed by ${interaction.user.tag}`);

    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('AutoMod Rule Removed', `**${rule.name}** has been deleted.`)],
    });
}

export default {
    data: new SlashCommandBuilder()
        .setName('automod')
        .setDescription('Manage Discord AutoMod rules for this server.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('create')
                .setDescription('Create a new AutoMod rule.')
                .addStringOption((option) =>
                    option
                        .setName('type')
                        .setDescription('What the rule should catch.')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Custom keywords', value: 'keyword' },
                            { name: 'Spam messages', value: 'spam' },
                            { name: 'Mention spam', value: 'mention_spam' },
                        ),
                )
                .addStringOption((option) =>
                    option
                        .setName('action')
                        .setDescription('What to do when the rule triggers (default: block message).')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Block message', value: 'block' },
                            { name: 'Block + alert', value: 'alert' },
                            { name: 'Timeout member (5 min)', value: 'timeout' },
                        ),
                )
                .addStringOption((option) =>
                    option
                        .setName('keywords')
                        .setDescription('Keywords to block, separated by commas (required for Custom keywords).')
                        .setRequired(false)
                        .setMaxLength(1000),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('mention_limit')
                        .setDescription('Max mentions before triggering (for Mention spam, default: 5).')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(50),
                )
                .addChannelOption((option) =>
                    option
                        .setName('alert_channel')
                        .setDescription('Where to send alerts (required for Block + alert).')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false),
                )
                .addStringOption((option) =>
                    option
                        .setName('name')
                        .setDescription('Optional custom name for the rule.')
                        .setRequired(false)
                        .setMaxLength(100),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('list')
                .setDescription('List the AutoMod rules configured on this server.'),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('remove')
                .setDescription('Delete an AutoMod rule by name or ID.')
                .addStringOption((option) =>
                    option
                        .setName('rule')
                        .setDescription('The rule name or ID to delete.')
                        .setRequired(true),
                ),
        ),

    async execute(interaction, config, client) {
        try {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.PERMISSION,
                    message: 'You need the **Manage Server** permission to manage AutoMod rules.',
                });
            }

            if (!(await checkBotPermission(interaction))) {
                return;
            }

            const subcommand = interaction.options.getSubcommand();
            const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
            if (!deferSuccess) {
                return;
            }

            if (subcommand === 'create') return await handleCreate(interaction);
            if (subcommand === 'list') return await handleList(interaction);
            if (subcommand === 'remove') return await handleRemove(interaction);

            return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'This subcommand is not recognised.' });
        } catch (error) {
            logger.error('automod command error:', error);
            await replyUserError(interaction, {
                type: ErrorTypes.DISCORD_API,
                message: 'Failed to apply the AutoMod action. Check that I have **Manage Server** and try again.',
            });
        }
    },
};
