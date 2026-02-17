import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { sanitizeInput } from '../../utils/sanitization.js';

export default {
    data: new SlashCommandBuilder()
    .setName("wanted")
    .setDescription("Create a WANTED poster for a user.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user who is wanted.")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("crime")
        .setDescription("The crime they committed.")
        .setRequired(false)
        .setMaxLength(100),
    ),
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      await interaction.deferReply();

      const targetUser = interaction.options.getUser("user");
      const crimeRaw = interaction.options.getString("crime");

      // Validate and sanitize crime input
      let crime = "Too adorable for this server.";
      if (crimeRaw) {
        const sanitizedCrime = sanitizeInput(crimeRaw.trim(), 100);
        if (sanitizedCrime.length > 0) {
          crime = sanitizedCrime;
        }
      }

      // Validate user exists and is accessible
      if (!targetUser) {
        throw new TitanBotError(
          'Target user not found for wanted command',
          ErrorTypes.USER_INPUT,
          'Could not find the specified user.'
        );
      }

      const bountyAmount = Math.floor(
        Math.random() * (100000000 - 1000000) + 1000000,
      );
      const bounty = `$${bountyAmount.toLocaleString()} USD`;

      const embed = createEmbed({
        color: 0x964b00,
        title: `💥 ððˆð† ððŽð”ðð“ð˜: WANTED! 💥`,
        description: `**CRIMINAL:** ${targetUser.tag}\n**CRIME:** ${crime}`,
        fields: [
          {
            name: "DEAD OR ALIVE",
            value: `**BOUNTY:** ${bounty}`,
            inline: false,
          },
        ],
        image: {
          url: targetUser.displayAvatarURL({ size: 1024, extension: 'png' }),
        },
        footer: {
          text: `Last seen in ${interaction.guild.name}`,
        },
      });

      await interaction.editReply({ embeds: [embed] });
      logger.debug(`Wanted command executed by user ${interaction.user.id} for ${targetUser.id} in guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Wanted command error:', error);
      await handleInteractionError(interaction, error, {
        commandName: 'wanted',
        source: 'wanted_command'
      });
    }
  },
};



