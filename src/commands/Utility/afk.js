import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';

export default {
    data: new SlashCommandBuilder()
        .setName('afk')
        .setDescription('Set your AFK status — bot will notify people who ping you')
        .addStringOption(o =>
            o.setName('reason').setDescription('Why you are AFK').setMaxLength(200)
        ),
    category: 'Utility',
    async execute(interaction) {
        const client = interaction.client;
        const reason = interaction.options.getString('reason') ?? 'No reason provided';

        const existing = await client.db.get(`afk:${interaction.user.id}`).catch(() => null);
        if (existing) {
            await client.db.del(`afk:${interaction.user.id}`).catch(() => {});
            const since = existing.since ? `<t:${Math.floor(existing.since / 1000)}:R>` : 'recently';
            return interaction.reply({
                embeds: [successEmbed('Welcome Back', `Your AFK has been removed. You were away ${since}.`)],
                ephemeral: true,
            });
        }

        await client.db.set(`afk:${interaction.user.id}`, { reason, since: Date.now() });

        return interaction.reply({
            embeds: [successEmbed('AFK Set', `You are now AFK: **${reason}**\nI'll let people know when they ping you.`)],
            ephemeral: true,
        });
    },
};
