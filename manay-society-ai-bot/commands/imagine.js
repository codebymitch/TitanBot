import { AttachmentBuilder, SlashCommandBuilder } from 'discord.js';
import { getGuildConfig } from '../database/settings.js';
import { checkCooldown, formatAiError, generateImage, isChannelAllowed } from '../ai/service.js';
import { getEnv } from '../config/env.js';
import { logError } from '../utils/logger.js';

const data = new SlashCommandBuilder()
  .setName('imagine')
  .setDescription('Buat gambar dengan AI')
  .addStringOption((option) => option
    .setName('prompt')
    .setDescription('Deskripsikan gambar yang ingin dibuat')
    .setRequired(true)
    .setMaxLength(1000));

export default {
  data,
  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    if (!guildId) {
      return interaction.reply({ content: 'Command ini hanya bisa dipakai di server.', ephemeral: true });
    }

    try {
      const config = await getGuildConfig(guildId);
      if (!config.imageEnabled || !isChannelAllowed(config, interaction.channelId)) {
        return interaction.reply({
          content: 'AI Image Generator belum aktif atau channel ini belum diizinkan.',
          ephemeral: true,
        });
      }

      const remaining = checkCooldown(guildId, userId);
      if (remaining > 0) {
        return interaction.reply({
          content: `Tunggu ${Math.ceil(remaining / 1000)} detik sebelum request berikutnya.`,
          ephemeral: true,
        });
      }

      await interaction.deferReply();
      await interaction.channel?.sendTyping().catch(() => null);
      const prompt = interaction.options.getString('prompt', true);
      if (prompt.length > getEnv().maxImagePromptLength) {
        return interaction.editReply(`Prompt maksimal ${getEnv().maxImagePromptLength} karakter.`);
      }

      const image = await generateImage(prompt, {
        guildId,
        userId,
        config,
      });
      const attachment = new AttachmentBuilder(image, { name: 'manay-society-ai.jpg' });
      return interaction.editReply({
        content: `Gambar dari prompt: ${prompt}`,
        files: [attachment],
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      logError(`imagine guild=${guildId} user=${userId}`, error);
      const content = formatAiError(error);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({ content }).catch(() => null);
      }
      return interaction.reply({ content, ephemeral: true }).catch(() => null);
    }
  },
};
