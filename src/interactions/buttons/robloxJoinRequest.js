import { robloxHandler } from '../../services/robloxJoinRequestService.js';
import { logger } from '../../utils/logger.js';

export default {
  customId: /^roblox_(accept|deny)_\d+_\d+$/,
  async execute(interaction) {
    try {
      const [action, groupId, userId] = interaction.customId.split('_').slice(1);
      const isAccept = action === 'accept';

      await interaction.deferReply({ ephemeral: true });

      let success;
      if (isAccept) {
        success = await robloxHandler.acceptJoinRequest(groupId, userId);
      } else {
        success = await robloxHandler.denyJoinRequest(groupId, userId);
      }

      if (success) {
        const actionText = isAccept ? 'accepted' : 'denied';
        await interaction.editReply({
          content: `✅ Join request ${actionText} for user ${userId}`,
          ephemeral: true
        });

        // Edit the original message to show it was processed
        try {
          const originalMessage = interaction.message;
          const embed = originalMessage.embeds[0];
          const updatedEmbed = {
            ...embed.toJSON(),
            footer: {
              text: `${isAccept ? '✅ Accepted' : '❌ Denied'} by ${interaction.user.tag}`
            },
            color: isAccept ? 0x00ff00 : 0xff0000
          };

          await originalMessage.edit({
            embeds: [updatedEmbed],
            components: [] // Remove buttons
          });
        } catch (error) {
          logger.warn('Could not update original message:', error.message);
        }

        logger.info(`User ${interaction.user.tag} ${isAccept ? 'accepted' : 'denied'} join request for user ${userId}`);
      } else {
        await interaction.editReply({
          content: `❌ Failed to ${isAccept ? 'accept' : 'deny'} join request. Please try again.`,
          ephemeral: true
        });
      }
    } catch (error) {
      logger.error('Error in robloxJoinRequest button handler:', error);
      await interaction.editReply({
        content: '❌ An error occurred while processing your request.',
        ephemeral: true
      }).catch(() => {});
    }
  }
};

