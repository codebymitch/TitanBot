import { EmbedBuilder, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { buildPanel, buildEndedPanel, buildQueueEmptyPanel, getVoteRequired, fmtDuration } from '../../utils/musicPanel.js';
import { botConfig } from '../../config/botConfig.js';

function getPlayer(interaction) {
    return interaction.client.lavalink?.getPlayer(interaction.guildId);
}

function inVC(interaction, player) {
    return interaction.member?.voice?.channelId === player.voiceChannelId;
}

function isOwner(interaction) {
    return botConfig.commands.owners.includes(interaction.user.id);
}

export default [
    {
        name: 'music_pause',
        async execute(interaction) {
            const client = interaction.client;
            const player = getPlayer(interaction);
            console.log(`[music_pause] player=${!!player} current=${!!player?.queue.current} voiceChannelId=${player?.voiceChannelId} userVC=${interaction.member?.voice?.channelId}`);
            if (!player?.queue.current) return interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
            if (!inVC(interaction, player) && !isOwner(interaction)) return interaction.reply({ content: 'Join the voice channel first.', ephemeral: true });

            const panel = client.musicPanels?.get(interaction.guildId);
            const currentlyPaused = panel?.isPaused ?? player.paused;
            const newPaused = !currentlyPaused;
            console.log(`[music_pause] player.paused=${player.paused} panel.isPaused=${panel?.isPaused} currentlyPaused=${currentlyPaused} newPaused=${newPaused}`);
            try {
                if (newPaused) {
                    await player.pause();
                    console.log('[music_pause] called player.pause()');
                } else {
                    await player.resume();
                    console.log('[music_pause] called player.resume()');
                }
            } catch (e) {
                console.log('[music_pause] caught error:', e.message);
            }
            if (panel) panel.isPaused = newPaused;

            const votes = client.musicVotes?.get(interaction.guildId)?.size ?? 0;
            const required = getVoteRequired(player, client);
            await interaction.update(buildPanel(player, votes, required, newPaused));
        },
    },
    {
        name: 'music_skip',
        async execute(interaction) {
            const client = interaction.client;
            const player = getPlayer(interaction);
            if (!player?.queue.current) return interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
            if (!inVC(interaction, player) && !isOwner(interaction)) return interaction.reply({ content: 'Join the voice channel first.', ephemeral: true });

            if (!client.musicVotes.has(interaction.guildId)) client.musicVotes.set(interaction.guildId, new Set());
            const votes = client.musicVotes.get(interaction.guildId);

            if (votes.has(interaction.user.id)) {
                return interaction.reply({ content: 'You already voted to skip.', ephemeral: true });
            }

            votes.add(interaction.user.id);
            if (isOwner(interaction)) votes.add(`${interaction.user.id}_owner_weight`);
            const required = getVoteRequired(player, client);

            if (votes.size >= required) {
                client.musicVotes.delete(interaction.guildId);
                await interaction.deferUpdate();
                try {
                    await player.skip();
                    // trackStart or queueEnd event will update the panel
                } catch {
                    // Nothing left to skip to — show empty panel so user can add more
                    const panel = client.musicPanels?.get(interaction.guildId);
                    if (panel) panel.isPaused = false;
                    await interaction.editReply(buildQueueEmptyPanel());
                    setTimeout(() => {
                        if (!player.playing) {
                            client.musicPanels?.delete(interaction.guildId);
                            player.destroy().catch(() => {});
                        }
                    }, 3 * 60_000);
                }
            } else {
                await interaction.update(buildPanel(player, votes.size, required));
            }
        },
    },
    {
        name: 'music_stop',
        async execute(interaction) {
            const client = interaction.client;
            const player = getPlayer(interaction);
            if (!player) return interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
            if (!inVC(interaction, player) && !isOwner(interaction)) return interaction.reply({ content: 'Join the voice channel first.', ephemeral: true });
            const panel = client.musicPanels?.get(interaction.guildId);
            if (panel?.requesterId && interaction.user.id !== panel.requesterId) {
                return interaction.reply({ content: '❌ Only the person who started the music can stop it.', ephemeral: true });
            }

            client.musicVotes?.delete(interaction.guildId);
            client.musicPanels?.delete(interaction.guildId);
            await player.destroy();

            await interaction.update({
                embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('⏹️ Stopped and queue cleared.')],
                components: [],
            });
        },
    },
    {
        name: 'music_addtrack',
        async execute(interaction) {
            const player = getPlayer(interaction);
            if (!player) return interaction.reply({ content: 'No active music session.', ephemeral: true });

            const modal = new ModalBuilder()
                .setCustomId('music_addtrack_modal')
                .setTitle('Add Track to Queue')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('music_track_query')
                            .setLabel('Song name or URL')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setPlaceholder('e.g. zombie the cranberries')
                    )
                );

            await interaction.showModal(modal);
        },
    },
    {
        name: 'music_queue',
        async execute(interaction) {
            const player = getPlayer(interaction);
            if (!player?.queue.current) return interaction.reply({ content: 'Nothing is playing.', ephemeral: true });

            const current = player.queue.current;
            const upcoming = player.queue.tracks.slice(0, 10);

            let desc = `**Now Playing:**\n**[${current.info.title}](${current.info.uri})**\n┗ 🕒 \`${fmtDuration(current.info.duration)}\` • 📺 ${current.info.author}`;

            if (upcoming.length) {
                desc += '\n\n**Up Next:**\n' + upcoming.map((t, i) =>
                    `**${i + 1}.** [${t.info.title}](${t.info.uri}) — \`${fmtDuration(t.info.duration)}\``
                ).join('\n');
                const rem = player.queue.tracks.length - upcoming.length;
                if (rem > 0) desc += `\n*...and ${rem} more*`;
            } else {
                desc += '\n\n*Queue is empty — use Add Track to queue more songs*';
            }

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle(`🎵 Queue — ${player.queue.tracks.length + 1} track${player.queue.tracks.length !== 0 ? 's' : ''}`)
                    .setDescription(desc)],
                ephemeral: true,
            });
        },
    },
];
