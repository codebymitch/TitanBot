import { botConfig } from '../../config/botConfig.js';

export default {
    name: 'nuke-cancel',
    async execute(interaction) {
        if (!botConfig.commands.owners.includes(interaction.user.id)) {
            return interaction.reply({ content: '❌ Only the bot owner can cancel this.', ephemeral: true });
        }
        await interaction.update({ content: '✖ Nuke cancelled.', embeds: [], components: [] });
    },
};
