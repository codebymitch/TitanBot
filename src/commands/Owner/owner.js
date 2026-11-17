import { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ChannelType } from 'discord.js';
import { createEmbed, successEmbed, warningEmbed } from '../../utils/embeds.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { isBotOwner, getBotMessage } from '../../config/bot.js';
import {
    getFishingEvent,
    startFishingEvent,
    stopFishingEvent,
    setAnnouncementChannel,
    clearAnnouncementChannel,
    getAnnouncementChannel,
    broadcastFishingEvent,
    broadcastAnnouncement,
    formatEventRemaining,
} from '../../services/fishingEventService.js';

// Ringkas hasil broadcast (terkirim / dilewati / gagal) buat ditampilkan ke owner.
function buildBroadcastBody(intro, broadcast) {
    let body = `${intro}\n\nAnnouncement sent to **${broadcast.sent}** server(s)`;

    if (broadcast.skipped) {
        body += `, **${broadcast.skipped}** skipped (no channel set)`;
    }
    if (broadcast.failed) {
        body += `, **${broadcast.failed}** failed`;
    }

    return `${body}.`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('owner')
        .setDescription('Owner controls: global fishing events and cross-server announcements')
        .addSubcommandGroup(group =>
            group
                .setName('fishevent')
                .setDescription('Global fishing luck event')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('start')
                        .setDescription('Start a global fishing luck event for every server')
                        .addIntegerOption(option =>
                            option
                                .setName('multiplier')
                                .setDescription('Luck multiplier, e.g. 8 = 8x (applies to /fish and /netting)')
                                .setRequired(true)
                                .setMinValue(2)
                                .setMaxValue(100)
                        )
                        .addIntegerOption(option =>
                            option
                                .setName('minutes')
                                .setDescription('Duration in minutes (0 = until stopped). Default: 60')
                                .setRequired(false)
                                .setMinValue(0)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('stop')
                        .setDescription('Stop the global fishing luck event')
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('status')
                        .setDescription('Show the current global fishing event')
                )
        )
        .addSubcommandGroup(group =>
            group
                .setName('pengumuman')
                .setDescription('Send announcements to every server with the bot')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('send')
                        .setDescription('Owner-only: broadcast an announcement to every server')
                        .addStringOption(option =>
                            option
                                .setName('pesan')
                                .setDescription('Announcement text')
                                .setRequired(true)
                                .setMaxLength(2000)
                        )
                        .addStringOption(option =>
                            option
                                .setName('judul')
                                .setDescription('Optional title. Default: Pengumuman')
                                .setRequired(false)
                                .setMaxLength(256)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('setchannel')
                        .setDescription('Set this server\'s announcement channel (Manage Server)')
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
                        .setDescription('Disable announcements in this server (Manage Server)')
                )
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) return;

        const group = interaction.options.getSubcommandGroup();
        const subcommand = interaction.options.getSubcommand();

        // Setelan channel bersifat per-server, jadi cukup butuh izin Manage Server.
        if (group === 'pengumuman' && (subcommand === 'setchannel' || subcommand === 'clearchannel')) {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                throw createError(
                    'Announcement channel set without permission',
                    ErrorTypes.PERMISSION,
                    getBotMessage('noPermission'),
                    { userId: interaction.user.id, guildId: interaction.guildId }
                );
            }

            if (subcommand === 'setchannel') {
                const channel = interaction.options.getChannel('channel');
                await setAnnouncementChannel(interaction.guildId, channel.id);
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(
                        'Announcement Channel Set',
                        `Announcements for this server will be posted in ${channel}.`
                    )],
                });
                return;
            }

            await clearAnnouncementChannel(interaction.guildId);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed(
                    'Announcement Channel Disabled',
                    'Announcements are no longer posted in this server.'
                )],
            });
            return;
        }

        // Sisa subcommand mengubah event global / kirim pengumuman, jadi khusus owner bot.
        if (!isBotOwner(interaction.user.id)) {
            throw createError(
                'Owner command used by non-owner',
                ErrorTypes.PERMISSION,
                getBotMessage('noPermission'),
                { userId: interaction.user.id }
            );
        }

        if (group === 'fishevent') {
            if (subcommand === 'start') {
                const multiplier = interaction.options.getInteger('multiplier');
                const minutes = interaction.options.getInteger('minutes');

                const event = await startFishingEvent({
                    multiplier,
                    durationMinutes: minutes ?? 60,
                    startedBy: interaction.user.id,
                });
                const broadcast = await broadcastFishingEvent(client, event, { action: 'start' });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(
                        'Fishing Event Started',
                        buildBroadcastBody(
                            `Global luck boost **x${event.multiplier}** is now active for **every server**.\n` +
                            `Duration: **${formatEventRemaining(event.endsAt)}**.`,
                            broadcast
                        )
                    )],
                });
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

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(
                        'Fishing Event Stopped',
                        buildBroadcastBody(
                            `The **x${existing.multiplier}** global luck boost has ended.`,
                            broadcast
                        )
                    )],
                });
                return;
            }

            // status
            const event = await getFishingEvent();
            const channelId = interaction.guildId ? await getAnnouncementChannel(interaction.guildId) : null;

            const embed = event
                ? createEmbed({
                    title: 'Fishing Event Status',
                    description:
                        `**Active:** yes\n` +
                        `**Multiplier:** x${event.multiplier}\n` +
                        `**Remaining:** ${formatEventRemaining(event.endsAt)}\n` +
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
            return;
        }

        // pengumuman send
        const pesan = interaction.options.getString('pesan');
        const judul = interaction.options.getString('judul');

        const embed = createEmbed({
            title: judul || 'Pengumuman',
            description: pesan,
            color: '#5865F2',
        });
        const broadcast = await broadcastAnnouncement(client, embed);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(
                'Pengumuman Terkirim',
                buildBroadcastBody('Announcement broadcast to every server.', broadcast)
            )],
        });
    }, { command: 'owner' })
};
