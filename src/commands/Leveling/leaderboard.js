import { SlashCommandBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { getLeaderboard, getLevelingConfig } from '../../services/leveling/leveling.js';
import { getChatCounts, rankChatCounts } from '../../services/leveling/chatCounter.js';
import { getVoiceMinutes, rankVoiceMinutes } from '../../services/leveling/voiceXp.js';
import { buildTopEmbed, buildTopChatEmbed, buildTopVoiceEmbed } from '../../services/leveling/levelUi.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

// `top level` / `توب لفل` (also plain `top` / `توب`): the 10 members with the most XP.
// `top chat` / `توب شات`: the 10 members with the most messages.
// `top voice` / `توب فويس`: the 10 members with the most voice time. All add the caller's own place.
export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription("Shows the server's level, chat or voice leaderboard")
    .addStringOption((option) => option
      .setName('type')
      .setDescription('Level (XP), chat (messages) or voice (time in voice)')
      .addChoices({ name: 'Level', value: 'level' }, { name: 'Chat', value: 'chat' }, { name: 'Voice', value: 'voice' })
      .setRequired(false))
    .setDMPermission(false),
  category: 'Leveling',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);
    const type = ['chat', 'voice'].includes(interaction.options.getString('type')) ? interaction.options.getString('type') : 'level';

    if (type === 'chat' || type === 'voice') {
      const members = await interaction.guild.members.fetch().catch(() => null);
      const isMember = (userId) => !members || (members.has(userId) && !members.get(userId).user.bot);
      const ranked = type === 'chat'
        ? rankChatCounts(await getChatCounts(client, interaction.guildId), isMember)
        : rankVoiceMinutes(await getVoiceMinutes(client, interaction.guildId), isMember);
      const callerEntry = ranked.find((entry) => entry.userId === interaction.user.id) || null;
      const buildEmbed = type === 'chat' ? buildTopChatEmbed : buildTopVoiceEmbed;
      const embed = buildEmbed(interaction.guild, ranked.slice(0, 10), { callerId: interaction.user.id, callerEntry });
      await InteractionHelper.safeEditReply(interaction, { embeds: [embed], allowedMentions: { parse: [] } });
      return;
    }

    const levelingConfig = await getLevelingConfig(client, interaction.guildId);
    if (!levelingConfig?.enabled) {
      await InteractionHelper.safeEditReply(interaction, { content: '⚠️ نظام اللفلات مقفول في السيرفر ده.' });
      return;
    }

    const everyone = await getLeaderboard(client, interaction.guildId, 100);
    const callerEntry = everyone.find((entry) => entry.userId === interaction.user.id) || null;
    const embed = buildTopEmbed(interaction.guild, everyone.slice(0, 10), { callerId: interaction.user.id, callerEntry });

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed], allowedMentions: { parse: [] } });
    logger.debug(`Leaderboard displayed for guild ${interaction.guildId}`);
  }
};
