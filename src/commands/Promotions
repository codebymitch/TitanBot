import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('promote')
        .setDescription('Create a promotion record')
        .addUserOption(option =>
            option
                .setName('target')
                .setDescription('User being promoted')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('old_rank')
                .setDescription('Current rank')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('new_rank')
                .setDescription('New rank')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for promotion')
                .setRequired(true)
        ),

    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    category: 'promotions',

    async execute(interaction) {
        const user = interaction.options.getUser('target');
        const oldRank = interaction.options.getString('old_rank');
        const newRank = interaction.options.getString('new_rank');
        const reason = interaction.options.getString('reason');

        const promotionEmbed = {
            title: '📈 Promotion Record',
            color: 0x00ff00,
            fields: [
                {
                    name: 'Promoted User',
                    value: `<@${user.id}>`,
                    inline: true,
                },
                {
                    name: 'Previous Rank',
                    value: oldRank,
                    inline: true,
                },
                {
                    name: 'New Rank',
                    value: newRank,
                    inline: true,
                },
                {
                    name: 'Promoted By',
                    value: `<@${interaction.user.id}>`,
                    inline: true,
                },
                {
                    name: 'Reason',
                    value: reason,
                    inline: false,
                },
            ],
            timestamp: new Date(),
        };

        await interaction.reply({
            embeds: [promotionEmbed],
        });
    },
};
