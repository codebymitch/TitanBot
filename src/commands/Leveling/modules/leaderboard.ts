import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { NexoBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { getLeaderboard, getLevelingConfig, getXpForLevel } from '../../../services/leveling/leveling.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import type { Command } from '../../../types/index.js';
export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Zeigt die Level-Bestenliste des Servers')
    .setDMPermission(false),
  category: 'Leveling',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const levelingConfig = await getLevelingConfig(client, interaction.guildId!);

    if (!levelingConfig?.enabled) {
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor('#f1c40f')
            .setDescription('Das Leveling-System ist auf diesem Server derzeit deaktiviert.')
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const leaderboard = await getLeaderboard(client, interaction.guildId!, 10);

    if (leaderboard.length === 0) {
      throw new NexoBotError(
        'No leaderboard data found',
        ErrorTypes.DATABASE,
        'Noch keine Level-Daten vorhanden. Schreib Nachrichten, um XP zu sammeln!'
      );
    }

    const embed = new EmbedBuilder()
      .setTitle('Level-Bestenliste')
      .setColor('#2ecc71')
      .setDescription('Die 10 aktivsten Mitglieder auf diesem Server:')
      .setTimestamp();

    const leaderboardText = await Promise.all(
      leaderboard.map(async (user, index) => {
        try {
          const member = await interaction.guild!.members.fetch(user.userId).catch(() => null);
          const userMention = member?.user.toString() || `<@${user.userId}>`;
          const xpForNextLevel = getXpForLevel(user.level + 1);

          let rankPrefix = `${index + 1}.`;
          if (index === 0) rankPrefix = '🥇';
          else if (index === 1) rankPrefix = '🥈';
          else if (index === 2) rankPrefix = '🥉';
          else rankPrefix = `**${index + 1}.**`;

          return `${rankPrefix} ${userMention} – Level ${user.level} (${user.xp}/${xpForNextLevel} XP)`;
        } catch {
          return `**${index + 1}.** Fehler beim Laden von Nutzer ${user.userId}`;
        }
      })
    );

    embed.addFields({
      name: 'Rangliste',
      value: leaderboardText.join('\n')
    });

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    logger.debug(`Leaderboard displayed for guild ${interaction.guildId}`);
  }
} satisfies Command;