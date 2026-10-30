import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

// `av @member` / `/avatar`: the member's profile picture, their server avatar (when different) and their banner.
export default {
    data: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Display a user's avatar and banner")
    .addUserOption((option) =>
      option
        .setName("target")
        .setDescription(
          "The user whose avatar you want to see (defaults to you)",
        ),
    ),

  async execute(interaction, config, client) {
    const target = interaction.options.getUser("target") || interaction.user;
    // The banner is only sent when the user is fetched with force.
    const user = await (client || interaction.client).users.fetch(target.id, { force: true }).catch(() => target);
    const member = interaction.guild?.members.cache.get(user.id)
      || await interaction.guild?.members.fetch(user.id).catch(() => null);

    const avatarUrl = user.displayAvatarURL({ size: 2048 });
    const embeds = [
      createEmbed({ title: `${user.username} — Avatar`, description: `[Download](${avatarUrl})` }).setImage(avatarUrl),
    ];

    const serverAvatarUrl = member?.avatar ? member.displayAvatarURL({ size: 2048 }) : null;
    if (serverAvatarUrl && serverAvatarUrl !== avatarUrl) {
      embeds.push(createEmbed({ title: `${user.username} — Server Avatar`, description: `[Download](${serverAvatarUrl})` }).setImage(serverAvatarUrl));
    }

    const bannerUrl = user.bannerURL?.({ size: 2048 });
    if (bannerUrl) {
      embeds.push(createEmbed({ title: `${user.username} — Banner`, description: `[Download](${bannerUrl})` }).setImage(bannerUrl));
    } else {
      const color = user.hexAccentColor ? ` (banner color ${user.hexAccentColor})` : '';
      embeds.push(createEmbed({ title: `${user.username} — Banner`, description: `No banner${color}.` }));
    }

    await InteractionHelper.safeReply(interaction, { embeds });
    logger.info(`Avatar command executed`, {
      userId: interaction.user.id,
      targetUserId: user.id,
      guildId: interaction.guildId
    });
  }
};
