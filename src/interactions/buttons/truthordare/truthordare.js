import { logger } from '../../../utils/logger.js';
import {
  pickTruthOrDare,
  buildTruthOrDareEmbed,
  buildTruthOrDareComponents,
} from '../../../services/truthOrDareService.js';

/**
 * Handler tombol re-roll Truth or Dare.
 * customId: `tod:truth`, `tod:dare`, `tod:random`
 */
export default {
  name: 'tod',
  async execute(interaction, client, args = []) {
    try {
      const [type] = args;
      const validType = ['truth', 'dare', 'random'].includes(type) ? type : 'random';

      const { category, prompt } = pickTruthOrDare(validType);
      const embed = buildTruthOrDareEmbed({ category, prompt, requestedBy: interaction.user });
      const components = buildTruthOrDareComponents();

      try {
        await interaction.deferUpdate();
      } catch (error) {
        logger.warn('Failed to defer truthordare button update:', error.message);
        return;
      }

      await interaction.editReply({ embeds: [embed], components });

      logger.debug(
        `Truth or Dare button clicked by user ${interaction.user.id} (type=${validType})`,
      );
    } catch (error) {
      logger.error('Error in truthordare button handler:', error);
    }
  },
};
