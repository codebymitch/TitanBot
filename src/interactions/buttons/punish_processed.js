import { EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';

const BUTTON_LABELS = {
  punish_reviewed: '✅ Reviewed Management',
};

async function execute(interaction, client) {
  try {
    const customId = interaction.customId;
    const buttonType = Object.keys(BUTTON_LABELS).find(key => customId.startsWith(key));
    if (!buttonType) return;

    const caseCode = customId.slice(buttonType.length + 1);
    const label = BUTTON_LABELS[buttonType];

    const originalEmbed = interaction.message.embeds[0];
    if (!originalEmbed) return;

    const updatedEmbed = EmbedBuilder.from(originalEmbed);

    const alreadySet = (updatedEmbed.data.fields || []).some(f => f.name === label);
    if (alreadySet) {
      await interaction.reply({ content: 'This status has already been marked.', flags: 64 });
      return;
    }

    const timestamp = new Date().toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    updatedEmbed.addFields({
      name: label,
      value: `By <@${interaction.user.id}> • ${timestamp}`,
      inline: false,
    });

    await interaction.message.edit({ embeds: [updatedEmbed] });
    await interaction.reply({
      content: `✅ Marked **${label}** for case \`${caseCode}\`.`,
      flags: 64,
    });
  } catch (error) {
    logger.error('Error handling punishment button:', error);
    await interaction.reply({ content: 'An error occurred.', flags: 64 }).catch(() => {});
  }
}

export default { name: 'punish_processed', execute };
