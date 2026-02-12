import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName("bug")
        .setDescription("Report a bug or issue with the bot"),

    async execute(interaction) {
        const githubButton = new ButtonBuilder()
            .setLabel('ðŸ› Report Bug on GitHub')
            .setStyle(ButtonStyle.Link)
            .setURL('https://github.com/codebymitch/TitanBot/issues');

        const row = new ActionRowBuilder().addComponents(githubButton);

        const bugReportEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('ðŸ› Bug Report')
            .setDescription('Found a bug? Please report it on our GitHub Issues page!\n\n' +
            '**When reporting a bug, please include:**\n' +
            'â€¢ ðŸ“ Detailed description of the issue\n' +
            'â€¢ ðŸ”„ Steps to reproduce the problem\n' +
            'â€¢ ðŸ“¸ Screenshots if applicable\n' +
            'â€¢ ðŸ’» Your bot version and environment\n\n' +
            'This helps us fix issues faster and more effectively!')
            .setFooter({ 
                text: 'TitanBot Bug Reporting System', 
                iconURL: interaction.client.user.displayAvatarURL() 
            })
            .setTimestamp();

        await interaction.reply({
            embeds: [bugReportEmbed],
            components: [row],
            flags: MessageFlags.Ephemeral
        });
    },
};

