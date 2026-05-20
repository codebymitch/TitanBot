import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { t, pickLanguage } from '../../services/i18n.js';

export default {
    data: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Get detailed information about the server"),

  async execute(interaction, config) {
    try {
      const lang = pickLanguage(config, interaction.guild);
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

      const embed = createEmbed({
        title: t(lang, 'wolf.cmd.utility.serverinfo.embedTitle', { name: guild.name }),
        description: t(lang, 'wolf.cmd.utility.serverinfo.embedDesc', { id: guild.id })
      })
        .setThumbnail(guild.iconURL({ size: 256 }))
        .addFields(
          { name: t(lang, 'wolf.cmd.utility.serverinfo.fieldOwner'), value: owner.user.tag, inline: true },
          { name: t(lang, 'wolf.cmd.utility.serverinfo.fieldMembers'), value: `${guild.memberCount}`, inline: true },
          {
            name: t(lang, 'wolf.cmd.utility.serverinfo.fieldChannels'),
            value: `${guild.channels.cache.size}`,
            inline: true,
          },
          { name: t(lang, 'wolf.cmd.utility.serverinfo.fieldRoles'), value: `${guild.roles.cache.size}`, inline: true },
          {
            name: t(lang, 'wolf.cmd.utility.serverinfo.fieldBoosts'),
            value: t(lang, 'wolf.cmd.utility.serverinfo.fieldBoostValue', {
              tier: guild.premiumTier,
              count: guild.premiumSubscriptionCount
            }),
            inline: true,
          },
          {
            name: t(lang, 'wolf.cmd.utility.serverinfo.fieldCreationDate'),
            value: `<t:${createdTimestamp}:R>`,
            inline: true,
          },
        );

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
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



