import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { NexoBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { getUserLevelData, getLevelingConfig, getXpForLevel } from '../../../services/leveling/leveling.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import type { Command } from '../../../types/index.js';
export default {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Zeigt deinen Rang und dein Level oder die eines anderen Nutzers')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Der Nutzer, dessen Rang du sehen willst')
        .setRequired(false)
    )
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

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild!.members
      .fetch(targetUser.id)
      .catch(() => null);

    if (!member) {
      throw new NexoBotError(
        `User ${targetUser.id} not found in guild`,
        ErrorTypes.USER_INPUT,
        'Der angegebene Nutzer wurde auf diesem Server nicht gefunden.'
      );
    }

    const userData = await getUserLevelData(client, interaction.guildId!, targetUser.id);

    const safeUserData = {
      level: userData?.level ?? 0,
      xp: userData?.xp ?? 0,
      totalXp: userData?.totalXp ?? 0
    };

    const xpNeeded = getXpForLevel(safeUserData.level + 1);
    const progress = xpNeeded > 0 ? Math.floor((safeUserData.xp / xpNeeded) * 100) : 0;
    const progressBar = createProgressBar(progress, 20);

    const embed = new EmbedBuilder()
      .setTitle(`Rang von ${member.displayName}`)
      .setThumbnail(member.displayAvatarURL())
      .addFields(
        {
          name: 'Level',
          value: safeUserData.level.toString(),
          inline: true
        },
        {
          name: 'XP',
          value: `${safeUserData.xp}/${xpNeeded}`,
          inline: true
        },
        {
          name: 'Gesamt-XP',
          value: safeUserData.totalXp.toString(),
          inline: true
        },
        {
          name: `Fortschritt bis Level ${safeUserData.level + 1}`,
          value: `${progressBar} ${progress}%`
        }
      )
      .setColor('#2ecc71')
      .setTimestamp();

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    logger.debug(`Rank checked for user ${targetUser.id} in guild ${interaction.guildId}`);
  }
} satisfies Command;

function createProgressBar(percentage: number, length = 10): string {
  if (percentage < 0 || percentage > 100) {
    percentage = Math.max(0, Math.min(100, percentage));
  }
  const filled = Math.round((percentage / 100) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}