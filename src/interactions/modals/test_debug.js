import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

export default {
  name: 'test_debug_modal',
  async execute(interaction) {
    try {
      // Ensure interaction is usable
      const ready = await InteractionHelper.ensureReady(interaction, { flags: 1 << 6 });
      if (!ready) return;

      const submittedLogs = interaction.fields.getTextInputValue('dev_logs') || 'No logs submitted';

      const safeContent = submittedLogs.length > 1900 ? submittedLogs.slice(0, 1900) + '\n\n[truncated]' : submittedLogs;

      const embed = createEmbed({ title: 'Debug Test - Logs', description: 'Recent dev logs (truncated):' })
        .setDescription(`\n\n\`\`\`\n${safeContent}\n\`\`\``);

      await InteractionHelper.safeReply(interaction, { embeds: [embed], flags: 1 << 6 });
    } catch (error) {
      logger.error('Error handling test_debug_modal submission:', error);
      try {
        await InteractionHelper.safeReply(interaction, { content: 'Failed to retrieve submitted logs.', flags: 1 << 6 });
      } catch (e) {
        logger.error('Failed to send error reply for test_debug_modal:', e);
      }
    }
  }
};
