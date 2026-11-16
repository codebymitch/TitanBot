import { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ChannelType } from 'discord.js';
import { createEmbed, successEmbed, warningEmbed } from '../../utils/embeds.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { isBotOwner, getBotMessage } from '../../config/bot.js';
import {
    getFishingEvent,
    startFishingEvent,
    stopFishingEvent,
    setFishingEventChannel,
    clearFishingEventChannel,
    getFishingEventChannel,
    broadcastFishingEvent,
} from '../../services/fishingEventService.js';

// Ubah sisa waktu jadi teks yang enak dibaca.
function formatRemaining(endsAt) {
    if (!endsAt) {
        return 'sampai dihentikan manual';
    }

    const remainingMs = Math.max(0, endsAt - Date.now());
    const totalMinutes = Math.ceil(remainingMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('fishevent')
        .setDescription('Manage the global fishing luck event')
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Owner-only: start a global fishing luck event for every server')
                .addIntegerOption(option =>
                    option
                        .setName('multiplier')
                        .setDescription('Luck multiplier applied to /fish and /netting (e.g. 8 = 8x luck)')
                        .setRequired(true)
                        .setMinValue(2)
                        .setMaxValue(100)
                )
                .addIntegerOption(option =>
                    option
                        .setName('minutes')
                        .setDescription('How long the event runs in minutes (0 = until stopped). Default: 60')
                        .setRequired(false)
                        .setMinValue(0)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stop')
                .setDescription('Owner-only: stop the global fishing luck event')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Show the current global fishing event')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('setchannel')
                .setDescription('Set this server\'s channel for fishing event announcements (Manage Server)')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Text channel for announcements')
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clearchannel')
                .setDescription('Disable fishing event announcements in this server (Manage Server)')
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) return;

        const subcommand = interaction.options.getSubcommand();

        // Config channel bersifat per-server, jadi cukup butuh izin Manage Server.
        if (subcommand === 'setchannel' || subcommand === 'clearchannel') {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                throw createError(
                    'Fishing event channel set without permission',
                    ErrorTypes.PERMISSION,
                    getBotMessage('noPermission'),
                    { userId: interaction.user.id, guildId: interaction.guildId }
                );
            }

            if (subcommand === 'setchannel') {
                const channel = interaction.options.getChannel('channel');
                await setFishingEventChannel(interaction.guildId, channel.id);
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(
                        'Announcement Channel Set',
                        `Fishing event announcements for this server will be posted in ${channel}.`
                    )],
                });
                return;
            }

            await clearFishingEventChannel(interaction.guildId);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed(
                    'Announcement Channel Disabled',
                    'Fishing event announcements are no longer posted in this server.'
                )],
            });
            return;
        }

        // Sisa subcommand mengubah event global, jadi khusus owner bot.
        if (!isBotOwner(interaction.user.id)) {
            throw createError(
                'Fishing event command used by non-owner',
                ErrorTypes.PERMISSION,
                getBotMessage('noPermission'),
                { userId: interaction.user.id }
            );
        }

        if (subcommand === 'start') {
            const multiplier = interaction.options.getInteger('multiplier');
            const minutes = interaction.options.getInteger('minutes');
            const durationMinutes = minutes ?? 60;

            const event = await startFishingEvent({
                multiplier,
                durationMinutes,
                startedBy: interaction.user.id,
            });
            const broadcast = await broadcastFishingEvent(client, event, { action: 'start' });

            const embed = successEmbed(
                'Fishing Event Started',
                `Global luck boost **x${event.multiplier}** is now active for **every server**.\n` +
                `Duration: **${formatRemaining(event.endsAt)}**.\n\n` +
                `Announcement sent to **${broadcast.sent}** server(s)` +
                (broadcast.skipped ? `, **${broadcast.skipped}** skipped (no channel set)` : '') +
                (broadcast.failed ? `, **${broadcast.failed}** failed` : '') + '.'
            );

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            return;
        }

        if (subcommand === 'stop') {
            const existing = await getFishingEvent();
            await stopFishingEvent();

            if (!existing) {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [warningEmbed('Fishing Event', 'There is no active fishing event to stop.')],
                });
                return;
            }

            const broadcast = await broadcastFishingEvent(client, existing, { action: 'stop' });

            const embed = successEmbed(
                'Fishing Event Stopped',
                `The **x${existing.multiplier}** global luck boost has ended.\n\n` +
                `Announcement sent to **${broadcast.sent}** server(s)` +
                (broadcast.failed ? `, **${broadcast.failed}** failed` : '') + '.'
            );

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            return;
        }

        // status
        const event = await getFishingEvent();
        const channelId = interaction.guildId ? await getFishingEventChannel(interaction.guildId) : null;

        const embed = event
            ? createEmbed({
                title: 'Fishing Event Status',
                description:
                    `**Active:** yes\n` +
                    `**Multiplier:** x${event.multiplier}\n` +
                    `**Remaining:** ${formatRemaining(event.endsAt)}\n` +
                    `**This server's announcement channel:** ${channelId ? `<#${channelId}>` : '`not set`'}`,
                color: '#F1C40F',
            })
            : createEmbed({
                title: 'Fishing Event Status',
                description:
                    'No fishing event is currently active.\n' +
                    `**This server's announcement channel:** ${channelId ? `<#${channelId}>` : '`not set`'}`,
            });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'fishevent' })
};
