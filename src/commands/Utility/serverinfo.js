import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Get detailed information about the server"),

  async execute(interaction) {
    try {
      const deferSuccess = await InteractionHelper.safeDefer(interaction);
      if (!deferSuccess) {
        logger.warn(`ServerInfo interaction defer failed`, {
          userId: interaction.user.id,
          guildId: interaction.guildId,
          commandName: 'serverinfo'
        });
        return;
      }

      const guild = interaction.guild;
      const owner = await guild.fetchOwner();

      const createdTimestamp = Math.floor(guild.createdAt.getTime() / 1000);

      const embed = createEmbed({ title: `🏰 Server Info: ${guild.name}`, description: `Server ID: ${guild.id}` })
        .setThumbnail(guild.iconURL({ size: 256 }))
        .addFields(
          { name: "Owner", value: owner.user.tag, inline: true },
          { name: "Members", value: `${guild.memberCount}`, inline: true },
          {
            name: "Channels",
            value: `${guild.channels.cache.size}`,
            inline: true,
          },
          { name: "Roles", value: `${guild.roles.cache.size}`, inline: true },
          {
            name: "Boosts",
            value: `Level ${guild.premiumTier} (${guild.premiumSubscriptionCount})`,
            inline: true,
          },
          {
            name: "Creation Date",
            value: `<t:${createdTimestamp}:R>`,
            inline: true,
          },
        );

      await interaction.editReply({ embeds: [embed] });
      logger.info(`ServerInfo command executed`, {
        userId: interaction.user.id,
        guildId: guild.id,
        guildName: guild.name,
        memberCount: guild.memberCount
      });
    } catch (error) {
      logger.error(`ServerInfo command execution failed`, {
        error: error.message,
        stack: error.stack,
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: 'serverinfo'
      });
      await handleInteractionError(interaction, error, {
        commandName: 'serverinfo',
        source: 'serverinfo_command'
      });
    }
  },
};



