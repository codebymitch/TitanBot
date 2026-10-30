import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { createLinkButton } from '../../utils/components.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { sanitizeMarkdown } from '../../utils/validation.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { isUserArg } from '../../utils/prefixArgs.js';
import { MAIN_INVITE_CODE, MAIN_INVITE_URL } from '../../config/security.js';

/**
 * A permanent link to the server: the vanity URL when there is one, otherwise a never-expiring invite
 * (unique: false, so Discord hands back the same invite every time instead of making a new one).
 * Returns null when the bot cannot make one.
 */
export async function getServerInviteUrl(guild) {
    if (guild.vanityURLCode) return `https://discord.gg/${guild.vanityURLCode}`;
    // The server keeps one invite link (config/security.js); use it while it exists.
    const main = await guild.client?.fetchInvite?.(MAIN_INVITE_CODE).catch(() => null);
    if (main?.guild?.id === guild.id) return MAIN_INVITE_URL;

    const me = guild.members.me;
    const canInvite = (channel) => channel
        && (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
        && channel.permissionsFor(me)?.has(PermissionFlagsBits.CreateInstantInvite);
    const channel = [guild.rulesChannel, guild.systemChannel].find(canInvite)
        || guild.channels.cache.filter(canInvite).sort((a, b) => a.rawPosition - b.rawPosition).first();
    if (!channel) return null;

    try {
        const invite = await guild.invites.create(channel, { maxAge: 0, maxUses: 0, unique: false, reason: 'Server link for /dm' });
        return invite.url;
    } catch (error) {
        logger.warn('DM command: could not create a server invite', { guildId: guild.id, error: error.message });
        return null;
    }
}

/** The DM itself: from the server's staff, never from the member who sent it. */
export function buildStaffDm(guild, message, inviteUrl) {
    const embed = createEmbed({
        title: 'رسالة من الإدارة',
        description: message,
        color: 'primary',
        author: { name: guild.name, ...(guild.iconURL() ? { iconURL: guild.iconURL() } : {}) },
    });
    const components = inviteUrl
        ? [new ActionRowBuilder().addComponents(createLinkButton('رابط السيرفر', inviteUrl, '🔗'))]
        : [];
    return { embeds: [embed], components };
}

export default {
    data: new SlashCommandBuilder()
        .setName("dm")
        .setDescription("Send a direct message to a user from the staff team (Staff only)")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("The user to send a DM to")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("message")
                .setDescription("The message to send")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false),
    category: "moderation",

    // Prefix usage: `خاص @member النص` — everything after the member is the message.
    normalizePrefixArgs(args) {
        if (!isUserArg(args[0]) || args.length < 3) return args;
        return [args[0], args.slice(1).join(' ')];
    },

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`DM interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'dm'
            });
            return;
        }

        const targetUser = interaction.options.getUser("user");
        const message = interaction.options.getString("message");

        try {
            if (message.length > 2000) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Messages must be under 2000 characters.' });
            }

            if (targetUser.bot) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'You cannot send DMs to bot accounts.' });
            }

            const sanitized = sanitizeMarkdown(message);
            const inviteUrl = await getServerInviteUrl(interaction.guild);

            const dmChannel = await targetUser.createDM();
            await dmChannel.send(buildStaffDm(interaction.guild, sanitized, inviteUrl));

            // The member never sees who sent it; the staff log still does.
            await logEvent({
                client: interaction.client,
                guild: interaction.guild,
                event: {
                    action: "DM Sent",
                    target: `${targetUser.tag} (${targetUser.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    metadata: {
                        userId: targetUser.id,
                        moderatorId: interaction.user.id,
                        messageLength: sanitized.length
                    }
                }
            });

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        "DM Sent",
                        `Successfully sent a message to ${targetUser.tag}`
                    ),
                ],
            });
        } catch (error) {
            logger.error('DM command error:', error);

            if (error.code === 50007) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Could not send a DM to ${targetUser.tag}. They may have DMs disabled.` });
            }

            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Failed to send DM: ${error.message}` });
        }
    }
};
