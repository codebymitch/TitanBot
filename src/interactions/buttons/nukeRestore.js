import { ChannelType, EmbedBuilder } from 'discord.js';
import { getNukeSnapshot } from '../../utils/nukeSnapshots.js';
import { botConfig } from '../../config/botConfig.js';

const TYPE_MAP = {
    0: ChannelType.GuildText,
    2: ChannelType.GuildVoice,
    5: ChannelType.GuildAnnouncement,
    13: ChannelType.GuildStageVoice,
    15: ChannelType.GuildForum,
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

export default {
    name: 'nuke-restore',
    async execute(interaction, client, args) {
        if (!botConfig.commands.owners.includes(interaction.user.id)) {
            return interaction.reply({ content: '❌ Only the bot owner can restore the server.', ephemeral: true });
        }

        const guildId = args[0];
        const snapshot = getNukeSnapshot(guildId);
        if (!snapshot) {
            return interaction.reply({ content: '❌ No snapshot found. The bot may have restarted since the nuke.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const guild = client.guilds.cache.get(guildId);
        if (!guild) return interaction.editReply({ content: '❌ Could not find the server.' });

        const errors = [];
        let rolesRestored = 0, channelsRestored = 0;
        const channelMap = new Map(); // old id -> new channel

        // Restore roles (lowest position first)
        for (const r of snapshot.roles) {
            try {
                await guild.roles.create({
                    name: r.name,
                    color: r.color === '#000000' ? null : r.color,
                    permissions: r.permissions,
                    hoist: r.hoist,
                    mentionable: r.mentionable,
                    reason: 'Nuke restore',
                });
                rolesRestored++;
            } catch (e) {
                errors.push(`Role "${r.name}": ${e.message}`);
            }
            await sleep(300);
        }

        // Restore categories first
        for (const ch of snapshot.channels.filter(c => c.type === 4)) {
            try {
                const created = await guild.channels.create({
                    name: ch.name,
                    type: ChannelType.GuildCategory,
                    position: ch.position,
                    reason: 'Nuke restore',
                });
                channelMap.set(ch.id, created);
                channelsRestored++;
            } catch (e) {
                errors.push(`Category "${ch.name}": ${e.message}`);
            }
            await sleep(300);
        }

        // Restore text/voice/forum channels
        for (const ch of snapshot.channels.filter(c => c.type !== 4)) {
            const type = TYPE_MAP[ch.type];
            if (type === undefined) {
                errors.push(`Channel "${ch.name}" skipped — unknown type ${ch.type}`);
                continue;
            }
            try {
                const parent = ch.parentId ? channelMap.get(ch.parentId) : null;
                const options = {
                    name: ch.name,
                    type,
                    parent: parent?.id ?? null,
                    position: ch.position,
                    reason: 'Nuke restore',
                };
                if (ch.topic) options.topic = ch.topic;
                if (ch.nsfw) options.nsfw = ch.nsfw;
                if (ch.slowmode) options.rateLimitPerUser = ch.slowmode;

                const created = await guild.channels.create(options);
                channelMap.set(ch.id, created);
                channelsRestored++;
            } catch (e) {
                errors.push(`Channel "${ch.name}": ${e.message}`);
            }
            await sleep(300);
        }

        const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('✅ Server Restored')
            .setDescription(`Restored from snapshot taken at <t:${Math.floor(new Date(snapshot.savedAt).getTime() / 1000)}:R>`)
            .addFields(
                { name: '🎭 Roles', value: String(rolesRestored), inline: true },
                { name: '📁 Channels', value: String(channelsRestored), inline: true },
            )
            .setTimestamp();

        if (errors.length) {
            const errorText = errors.join('\n');
            // Discord field value limit is 1024 chars
            embed.addFields({ name: `⚠️ Errors (${errors.length})`, value: errorText.slice(0, 1020) + (errorText.length > 1020 ? '…' : '') });
        }

        await interaction.editReply({ embeds: [embed] });
    },
};
