import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    MessageFlags,
} from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { sanitizeInput } from '../../utils/validation.js';
import { isChannelArg } from '../../utils/prefixArgs.js';

// Who used `say` is only shown in the audit log and this channel, never in the target channel.
const SAY_LOG_CHANNEL_ID = '1550596180940034079';
const CHANNEL_ID_ARG = /^\d{17,20}$/u;
const PREFIX_ERROR_DELETE_MS = 5_000;

const TEXT_CHANNEL_TYPES = [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
];

function resolveTargetChannel(interaction) {
    const selected = interaction.options.getChannel('channel');
    if (selected) {
        return TEXT_CHANNEL_TYPES.includes(selected.type) ? selected : null;
    }

    // Prefix form: a #channel/ID that doesn't resolve must not fall back to the current channel.
    if (interaction._isPrefixCommand && interaction.options.getString('channel')) {
        return null;
    }

    if (!interaction.channel || !TEXT_CHANNEL_TYPES.includes(interaction.channel.type)) {
        return null;
    }

    return interaction.channel;
}

async function sendSayLog(client, { guild, user, channel, sentMessage, content }) {
    try {
        const logChannel = guild.channels.cache.get(SAY_LOG_CHANNEL_ID)
            || await client.channels.fetch(SAY_LOG_CHANNEL_ID).catch(() => null);
        if (!logChannel?.isTextBased?.()) {
            logger.warn(`Say log channel ${SAY_LOG_CHANNEL_ID} was not found.`);
            return;
        }

        await logChannel.send({
            embeds: [{
                title: '🗣️ Say Command',
                description: [
                    `**By:** ${user} (${user.tag} - ${user.id})`,
                    `**Channel:** ${channel} (${channel.id})`,
                    `**Message:** [Jump](${sentMessage.url})`,
                    `**Time:** <t:${Math.floor(Date.now() / 1000)}:F>`,
                ].join('\n'),
                fields: [{
                    name: 'Content',
                    value: content.length > 1024 ? `${content.slice(0, 1021)}...` : content,
                }],
                color: 0x5865F2,
                timestamp: new Date().toISOString(),
            }],
            allowedMentions: { parse: [] },
        });
    } catch (error) {
        logger.error('Error sending say log:', error);
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Send a plain message as the bot')
        .addStringOption((option) =>
            option
                .setName('message')
                .setDescription('The message the bot should send')
                .setRequired(true)
                .setMaxLength(2000),
        )
        .addChannelOption((option) =>
            option
                .setName('channel')
                .setDescription('Channel to send in (defaults to the current channel)')
                .addChannelTypes(...TEXT_CHANNEL_TYPES)
                .setRequired(false),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false),
    category: 'moderation',

    // Prefix usage: `قول النص #channel` / `قول النص CHANNEL_ID` — the whole text is the message,
    // except a trailing #channel or channel ID which picks the channel.
    normalizePrefixArgs(args) {
        if (args.length < 2) return args;
        const last = args.at(-1);
        const channel = isChannelArg(last) || CHANNEL_ID_ARG.test(last) ? last : null;
        const text = (channel ? args.slice(0, -1) : args).join(' ');
        return channel ? [text, channel] : [text];
    },
    abuseProtection: { maxAttempts: 8, windowMs: 60_000 },

    async execute(interaction, _config, client) {
        // Prefix form: remove the command message right away so nobody sees who sent it.
        const sourceMessage = interaction._sourceMessage;
        if (sourceMessage?.deletable) {
            await sourceMessage.delete().catch(() => {});
        }

        const deferSuccess = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });
        if (!deferSuccess) {
            logger.warn('Say interaction defer failed', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'say',
            });
            return;
        }

        const replyError = async (options) => {
            const result = await replyUserError(interaction, options);
            if (sourceMessage) {
                const errorReply = interaction._responseCoordinator?.getReplyMessage();
                if (errorReply) {
                    setTimeout(() => errorReply.delete().catch(() => {}), PREFIX_ERROR_DELETE_MS);
                }
            }
            return result;
        };

        const rawMessage = interaction.options.getString('message');
        const message = sanitizeInput(rawMessage, 2000);

        if (!message) {
            return replyError({
                type: ErrorTypes.VALIDATION,
                message: 'Message cannot be empty.',
            });
        }

        const channel = resolveTargetChannel(interaction);
        if (!channel) {
            return replyError({
                type: ErrorTypes.VALIDATION,
                message: 'Channel not found. Use `قول الرسالة #channel` or `قول الرسالة CHANNEL_ID`.',
            });
        }

        const memberPermissions = channel.permissionsFor(interaction.member);
        const botPermissions = channel.permissionsFor(interaction.guild.members.me);

        if (!memberPermissions?.has(PermissionFlagsBits.SendMessages)) {
            return replyError({
                type: ErrorTypes.PERMISSION,
                message: `You do not have permission to send messages in ${channel}.`,
            });
        }

        if (!botPermissions?.has(PermissionFlagsBits.SendMessages)) {
            return replyError({
                type: ErrorTypes.PERMISSION,
                message: `I do not have permission to send messages in ${channel}.`,
            });
        }

        const sentMessage = await channel.send({ content: message });

        await logEvent({
            client,
            guild: interaction.guild,
            event: {
                action: 'Bot Message Sent',
                target: `${channel} (${channel.id})`,
                executor: `${interaction.user.tag} (${interaction.user.id})`,
                reason: message.length > 200
                    ? `${message.slice(0, 197)}...`
                    : message,
                metadata: {
                    channelId: channel.id,
                    messageId: sentMessage.id,
                    moderatorId: interaction.user.id,
                    messageLength: message.length,
                },
            },
        });

        await sendSayLog(client, {
            guild: interaction.guild,
            user: interaction.user,
            channel,
            sentMessage,
            content: message,
        });

        // Prefix form stays silent in chat; the slash reply is ephemeral so only the sender sees it.
        if (sourceMessage) {
            return;
        }

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    'Message Sent',
                    `Posted in ${channel}. [Jump to message](${sentMessage.url})`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};
