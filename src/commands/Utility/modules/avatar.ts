import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import type { Command } from '../../../types/index.js';
export default {
    data: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Zeigt den Avatar eines Nutzers an")
    .addUserOption((option) =>
      option
        .setName("target")
        .setDescription(
          "Der Nutzer, dessen Avatar du sehen willst (Standard: du)",
        ),
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("target") || interaction.user;
    const avatarUrl = user.displayAvatarURL({ size: 2048 });

    const embed = createEmbed({ 
      title: `Avatar von ${user.username}`, 
      description: `[Download-Link](${avatarUrl})` 
    })
      .setImage(avatarUrl);

    await InteractionHelper.safeReply(interaction, { embeds: [embed] });
    logger.info(`Avatar command executed`, {
      userId: interaction.user.id,
      targetUserId: user.id,
      guildId: interaction.guildId
    });
  }
} satisfies Command;