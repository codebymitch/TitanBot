import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { t, pickLanguage } from '../../services/i18n.js';
export default {
    data: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Display a user's avatar image")
    .addUserOption((option) =>
      option
        .setName("target")
        .setDescription(
          "The user whose avatar you want to see (defaults to you)",
        ),
    ),

  async execute(interaction, config) {
    const lang = pickLanguage(config, interaction.guild);
    try {
      const user = interaction.options.getUser("target") || interaction.user;
      const avatarUrl = user.displayAvatarURL({ size: 2048, dynamic: true });

      const embed = createEmbed({
        title: t(lang, 'wolf.cmd.avatar.title', { user: user.username }),
        description: t(lang, 'wolf.cmd.avatar.download', { url: avatarUrl }),
      }).setImage(avatarUrl);

      await InteractionHelper.safeReply(interaction, { embeds: [embed] });
      logger.info(`Avatar command executed`, {
        userId: interaction.user.id,
        targetUserId: user.id,
        guildId: interaction.guildId
      });
    } catch (error) {
      logger.error(`Avatar command execution failed`, {
        error: error.message,
        stack: error.stack,
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: 'avatar'
      });
      await handleInteractionError(interaction, error, {
        commandName: 'avatar',
        source: 'avatar_command'
      });
    }
  }
};


