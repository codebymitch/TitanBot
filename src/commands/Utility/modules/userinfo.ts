import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import type { Command } from '../../../types/index.js';
export default {
    data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Zeigt ausführliche Infos über einen Nutzer")
    .addUserOption((option) =>
      option
        .setName("target")
        .setDescription("Der Nutzer, den du ansehen willst (Standard: du)"),
    ),

  async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) {
      logger.warn(`UserInfo interaction defer failed`, {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: 'userinfo'
      });
      return;
    }

    const user = interaction.options.getUser("target") || interaction.user;
    const member = interaction.guild!.members.cache.get(user.id);

    const createdTimestamp = Math.floor(user.createdAt.getTime() / 1000);
    const joinedTimestamp = member?.joinedAt ? Math.floor(member.joinedAt.getTime() / 1000) : null;

    const embed = createEmbed({ title: `Nutzer-Info: ${user.username}` })
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "ID", value: user.id, inline: true },
        { name: "Bot", value: user.bot ? "Ja" : "Nein", inline: true },
        {
          name: "Rollen",
          value:
            member && member.roles.cache.size > 1
              ? member.roles.cache
                  .map((r) => r.name)
                  .slice(0, 5)
                  .join(",")
              : "Keine",
          inline: true,
        },
        {
          name: "Account erstellt",
          value: `<t:${createdTimestamp}:R>`,
          inline: false,
        },
        {
          name: "Server beigetreten",
          value: joinedTimestamp ? `<t:${joinedTimestamp}:R>` : "Nicht auf dem Server",
          inline: false,
        },
        {
          name: "Höchste Rolle",
          value: member?.roles?.highest?.name || "Keine",
          inline: true,
        },
      );

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    logger.info(`UserInfo command executed`, {
      userId: interaction.user.id,
      targetUserId: user.id,
      guildId: interaction.guildId
    });
  },
} satisfies Command;