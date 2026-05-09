import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { getDmSession } from '../../utils/dmSessions.js';

export default {
    name: 'dm-edit',
    async execute(interaction, client, args) {
        const targetUserId = args[0];
        const session = getDmSession(targetUserId);

        if (!session) {
            return interaction.reply({ content: '❌ This DM session has expired or no longer exists.', ephemeral: true });
        }

        if (session.staffId !== interaction.user.id) {
            return interaction.reply({ content: '❌ Only the person who sent this DM can edit it.', ephemeral: true });
        }

        const modal = new ModalBuilder()
            .setCustomId(`dm-edit-modal:${targetUserId}`)
            .setTitle('Edit DM Message');

        const textInput = new TextInputBuilder()
            .setCustomId('dm-new-text')
            .setLabel('New message')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(session.text)
            .setMaxLength(2000)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(textInput));
        await interaction.showModal(modal);
    }
};
