




import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getLeaderboard, getLevelingConfig, getXpForLevel } from '../../services/leveling.js';

export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription("Shows the server's level leaderboard")
    .setDMPermission(false),
  category: 'Leveling',

  





  async execute(interaction, config, client) {
    try {
      await interaction.deferReply();

      const levelingConfig = await getLevelingConfig(client, interaction.guildId);

      if (!levelingConfig?.enabled) {
        throw new TitanBotError(
          'Leveling system is disabled on this server',
          ErrorTypes.CONFIGURATION,
          'The leveling system is currently disabled on this server.'
        );
      }

      const leaderboard = await getLeaderboard(client, interaction.guildId, 10);

      if (leaderboard.length === 0) {
        throw new TitanBotError(
          'No leaderboard data found',
          ErrorTypes.DATABASE,
          'No level data found yet. Start chatting to gain XP!'
        );
      }

      const embed = new EmbedBuilder()
        .setTitle('🏆 Level Leaderboard')
        .setColor('#2ecc71')
        .setDescription("Top 10 most active members in this server:")
        .setTimestamp();

      const leaderboardText = await Promise.all(
        leaderboard.map(async (user, index) => {
          try {
            const member = await interaction.guild.members.fetch(user.userId).catch(() => null);
            const username = member?.user?.tag || `Unknown User (${user.userId})`;
            const xpForNextLevel = getXpForLevel(user.level + 1);

            let rankPrefix = `${index + 1}.`;
            if (index === 0) rankPrefix = '🥇';
            else if (index === 1) rankPrefix = '🥈';
            else if (index === 2) rankPrefix = '🥉';
            else rankPrefix = `**${index + 1}.**`;

            return `${rankPrefix} ${username} - Level ${user.level} (${user.xp}/${xpForNextLevel} XP)`;
          } catch (error) {
            logger.debug(`Error loading member ${user.userId} for leaderboard:`, error);
            return `**${index + 1}.** Error loading user ${user.userId}`;
          }
        })
      );

      embed.addFields({
        name: 'Rankings',
        value: leaderboardText.join('\n')
      });

      await interaction.editReply({ embeds: [embed] });
      logger.debug(`Leaderboard displayed for guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Leaderboard command error:', error);
      await handleInteractionError(interaction, error, {
        type: 'command',
        commandName: 'leaderboard'
      });
    }
  }
};



