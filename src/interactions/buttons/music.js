import { EmbedBuilder, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { buildPanel, buildQueueEmptyPanel, getVoteRequired, fmtDuration, FILTER_CYCLE, applyFilter } from '../../utils/musicPanel.js';
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

function vcCheck(interaction, player) {
    if (!inVC(interaction, player) && !isOwner(interaction)) {
        interaction.reply({ content: 'Join the voice channel first.', ephemeral: true });
        return false;
    }
    return true;
}

function panelArgs(client, player, guildId) {
    const panel = client.musicPanels?.get(guildId);
    const votes = client.musicVotes?.get(guildId)?.size ?? 0;
    const required = getVoteRequired(player, client);
    const isPaused = panel?.isPaused ?? player.paused;
    const activeFilter = panel?.activeFilter ?? null;
    return { panel, votes, required, isPaused, activeFilter };
}

export default [
    {
        name: 'music_pause',
        async execute(interaction) {
            const client = interaction.client;
            const player = getPlayer(interaction);
            if (!player?.queue.current) return interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
            if (!vcCheck(interaction, player)) return;

            const { panel, votes, required, activeFilter } = panelArgs(client, player, interaction.guildId);
            const currentlyPaused = panel?.isPaused ?? player.paused;
            const newPaused = !currentlyPaused;
            try {
                if (newPaused) await player.pause();
                else await player.resume();
            } catch {}
            if (panel) panel.isPaused = newPaused;

            await interaction.update(buildPanel(player, votes, required, newPaused, activeFilter));
        },
    },
    {
        name: 'music_skip',
        async execute(interaction) {
            const client = interaction.client;
            const player = getPlayer(interaction);
            if (!player?.queue.current) return interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
            if (!vcCheck(interaction, player)) return;

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
                } catch {
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
                const { activeFilter } = panelArgs(client, player, interaction.guildId);
                await interaction.update(buildPanel(player, votes.size, required, false, activeFilter));
            }
        },
    },
    {
        name: 'music_stop',
        async execute(interaction) {
            const client = interaction.client;
            const player = getPlayer(interaction);
            if (!player) return interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
            if (!vcCheck(interaction, player)) return;
            const panel = client.musicPanels?.get(interaction.guildId);
            if (panel?.requesterId && interaction.user.id !== panel.requesterId && !isOwner(interaction)) {
                return interaction.reply({ content: '❌ Only the person who started the music can stop it.', ephemeral: true });
            }

            if (panel?.progressInterval) clearInterval(panel.progressInterval);
            if (panel?.emptyVCTimeout) clearTimeout(panel.emptyVCTimeout);
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
    {
        name: 'music_loop',
        async execute(interaction) {
            const client = interaction.client;
            const player = getPlayer(interaction);
            if (!player?.queue.current) return interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
            if (!vcCheck(interaction, player)) return;

            const modes = ['off', 'track', 'queue'];
            const next = modes[(modes.indexOf(player.repeatMode ?? 'off') + 1) % modes.length];
            await player.setRepeatMode(next);

            const { panel, votes, required, isPaused, activeFilter } = panelArgs(client, player, interaction.guildId);
            await interaction.update(buildPanel(player, votes, required, isPaused, activeFilter));
        },
    },
    {
        name: 'music_shuffle',
        async execute(interaction) {
            const player = getPlayer(interaction);
            if (!player?.queue.current) return interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
            if (!vcCheck(interaction, player)) return;
            if (!player.queue.tracks.length) return interaction.reply({ content: '❌ No tracks in queue to shuffle.', ephemeral: true });

            await player.queue.shuffle();
            await interaction.reply({ content: '🔀 Queue shuffled!', ephemeral: true });
        },
    },
    {
        name: 'music_restart',
        async execute(interaction) {
            const client = interaction.client;
            const player = getPlayer(interaction);
            if (!player?.queue.current) return interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
            if (!vcCheck(interaction, player)) return;

            await player.seek(0);
            if (player.paused) await player.resume().catch(() => {});

            const panel = client.musicPanels?.get(interaction.guildId);
            if (panel) panel.isPaused = false;
            const { votes, required, activeFilter } = panelArgs(client, player, interaction.guildId);
            await interaction.update(buildPanel(player, votes, required, false, activeFilter));
        },
    },
    {
        name: 'music_volume',
        async execute(interaction) {
            const player = getPlayer(interaction);
            if (!player?.queue.current) return interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
            if (!vcCheck(interaction, player)) return;

            const modal = new ModalBuilder()
                .setCustomId('music_volume_modal')
                .setTitle('Set Volume')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('music_volume_value')
                            .setLabel(`Volume 0–200  (current: ${player.volume ?? 100}%)`)
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setPlaceholder('e.g. 100')
                    )
                );

            await interaction.showModal(modal);
        },
    },
    {
        name: 'music_filter',
        async execute(interaction) {
            const client = interaction.client;
            const player = getPlayer(interaction);
            if (!player?.queue.current) return interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
            if (!vcCheck(interaction, player)) return;

            const panel = client.musicPanels?.get(interaction.guildId);
            const current = panel?.activeFilter ?? null;
            const next = FILTER_CYCLE[(FILTER_CYCLE.indexOf(current) + 1) % FILTER_CYCLE.length];

            await applyFilter(player, next);
            if (panel) panel.activeFilter = next;

            const { votes, required, isPaused } = panelArgs(client, player, interaction.guildId);
            await interaction.update(buildPanel(player, votes, required, isPaused, next));
        },
    },
];
