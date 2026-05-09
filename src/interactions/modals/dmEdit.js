import { getDmSession, updateDmSession } from '../../utils/dmSessions.js';

export default {
    name: 'dm-edit-modal',
    async execute(interaction, client, args) {
        const targetUserId = args[0];
        const session = getDmSession(targetUserId);

        if (!session) {
            return interaction.reply({ content: '❌ This DM session has expired.', ephemeral: true });
        }

        const newText = interaction.fields.getTextInputValue('dm-new-text');

        try {
            const dmChannel = await client.channels.fetch(session.dmChannelId);
            const dmMsg = await dmChannel.messages.fetch(session.dmMessageId);
            await dmMsg.edit(newText);
            updateDmSession(targetUserId, { text: newText });
            return interaction.reply({ content: '✅ DM message updated successfully.', ephemeral: true });
        } catch (err) {
            return interaction.reply({ content: `❌ Could not edit the DM: ${err.message}`, ephemeral: true });
        }
    }
};
