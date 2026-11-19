import { SlashCommandBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
  pickTruthOrDare,
  buildTruthOrDareEmbed,
  buildTruthOrDareComponents,
} from '../../services/truthOrDareService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('truthordare')
    .setDescription('Play Truth or Dare — get a random Truth question or a Dare challenge.')
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('Pick the question type (default: random)')
        .setRequired(false)
        .addChoices(
          { name: 'Truth', value: 'truth' },
          { name: 'Dare', value: 'dare' },
          { name: 'Random', value: 'random' },
        ),
    ),
  category: 'Fun',
  abuseProtection: { maxAttempts: 20, windowMs: 60_000 },

  async execute(interaction) {
    try {
      const type = (interaction.options.getString('type') || 'random').toLowerCase();

      const { category, prompt } = pickTruthOrDare(type);

      const embed = buildTruthOrDareEmbed({ category, prompt, requestedBy: interaction.user });
      const components = buildTruthOrDareComponents();

      await InteractionHelper.safeDefer(interaction);
      await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components });

      logger.debug(
        `Truth or Dare executed by user ${interaction.user.id} in guild ${interaction.guildId} (type=${type})`,
      );
    } catch (error) {
      logger.error('Truth or Dare command error:', error);
      throw error;
    }
  },
};
