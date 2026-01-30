import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Utility/serverinfo.js
export default {
    data: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Get detailed information about the server"),

  async execute(interaction) {
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

    await interaction.reply({ embeds: [embed] });
  },
};
