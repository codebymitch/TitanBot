import { getGuildConfig, getUsageCount, updateGuildConfig } from '../database/settings.js';
import {
  checkCooldown,
  clearUserMemory,
  formatAiError,
  generateChatResponse,
  isChannelAllowed,
} from '../ai/service.js';
import { getEnv } from '../config/env.js';
import { requireAdministrator } from '../utils/permissions.js';
import { clampInteger, splitDiscordMessage } from '../utils/text.js';
import { buildChannelPicker, buildSettingsPanel } from '../utils/settingsPanel.js';
import { logError } from '../utils/logger.js';

const ADMIN_SUBCOMMANDS = new Set([
  'setchannel',
  'addchannel',
  'removechannel',
  'allchannel',
  'disablechannel',
  'resetchannel',
  'personality',
  'prompt',
  'resetpersonality',
  'enable',
  'disable',
  'setmodel',
  'setlimit',
  'reset',
  'settings',
]);

export async function executeAiCommand(interaction) {
  const guildId = interaction.guildId;
  if (!guildId) {
    return interaction.reply({ content: 'Command AI hanya bisa dipakai di server.', ephemeral: true });
  }

  const subcommand = interaction.options.getSubcommand();
  if (ADMIN_SUBCOMMANDS.has(subcommand) && !(await requireAdministrator(interaction))) {
    return null;
  }

  try {
    switch (subcommand) {
      case 'chat':
        return chat(interaction);
      case 'setchannel':
      case 'addchannel':
        return showChannelPicker(interaction, subcommand);
      case 'removechannel':
        return removeChannel(interaction);
      case 'listchannel':
        return listChannels(interaction);
      case 'allchannel':
        return updateAndReply(interaction, { allChannels: true }, 'AI sekarang diizinkan di semua channel teks.');
      case 'disablechannel':
        return disableChannel(interaction);
      case 'resetchannel':
        return updateAndReply(interaction, {
          allChannels: false,
          channelIds: [],
          disabledChannelIds: [],
        }, 'Semua pengaturan channel AI sudah di-reset.');
      case 'personality':
        return setPersonality(interaction);
      case 'prompt':
        return setPrompt(interaction);
      case 'resetpersonality':
        return updateAndReply(interaction, {
          personality: 'friendly',
          customSystemPrompt: '',
        }, 'Personality kembali ke Friendly.');
      case 'memory':
        return memorySettings(interaction);
      case 'resetmemory':
        await clearUserMemory(guildId, interaction.user.id);
        return interaction.reply({ content: 'Memory percakapan kamu sudah dihapus.', ephemeral: true });
      case 'enable':
        return updateAndReply(interaction, { enabled: true }, 'AI server berhasil diaktifkan.');
      case 'disable':
        return updateAndReply(interaction, { enabled: false }, 'AI server berhasil dinonaktifkan.');
      case 'setmodel':
        return updateAndReply(
          interaction,
          { model: interaction.options.getString('model', true) },
          'Model AI server sudah diperbarui.',
        );
      case 'setlimit':
        return updateAndReply(
          interaction,
          { dailyLimit: interaction.options.getInteger('requests', true) },
          'Batas penggunaan harian per pengguna sudah diperbarui.',
        );
      case 'status':
        return showStatus(interaction);
      case 'reset':
        return resetConfig(interaction);
      case 'settings':
        return showPanel(interaction);
      default:
        return interaction.reply({ content: 'Subcommand AI tidak dikenal.', ephemeral: true });
    }
  } catch (error) {
    logError(`ai command=${subcommand} guild=${guildId} user=${interaction.user.id}`, error);
    const content = formatAiError(error);
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply({ content }).catch(() => null);
    }
    return interaction.reply({ content, ephemeral: true }).catch(() => null);
  }
}

async function chat(interaction) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const config = await getGuildConfig(guildId);
  if (!isChannelAllowed(config, interaction.channelId)) {
    return interaction.reply({
      content: 'AI sedang nonaktif atau channel ini belum diizinkan oleh admin.',
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

  await interaction.deferReply({ ephemeral: true });
  await interaction.channel?.sendTyping().catch(() => null);
  const prompt = interaction.options.getString('prompt', true);
  const response = await generateChatResponse({ guildId, userId, prompt, config });
  const chunks = splitDiscordMessage(response);
  await interaction.editReply({ content: chunks[0], allowedMentions: { parse: [] } });
  for (const chunk of chunks.slice(1)) {
    await interaction.followUp({ content: chunk, ephemeral: true, allowedMentions: { parse: [] } });
  }
}

async function showChannelPicker(interaction, mode) {
  return interaction.reply({
    content: mode === 'set'
      ? 'Pilih satu channel. Pilihan ini menggantikan daftar channel AI sebelumnya.'
      : 'Pilih satu atau beberapa channel untuk ditambahkan.',
    components: buildChannelPicker(mode),
    ephemeral: true,
  });
}

async function removeChannel(interaction) {
  const config = await getGuildConfig(interaction.guildId);
  const channelId = interaction.options.getChannel('channel', true).id;
  if (config.allChannels) {
    const disabledChannelIds = new Set(config.disabledChannelIds);
    disabledChannelIds.add(channelId);
    await updateGuildConfig(interaction.guildId, { disabledChannelIds: [...disabledChannelIds] });
  } else {
    await updateGuildConfig(interaction.guildId, {
      channelIds: config.channelIds.filter((id) => id !== channelId),
    });
  }
  return interaction.reply({ content: `Channel <#${channelId}> dihapus dari channel AI.`, ephemeral: true });
}

async function disableChannel(interaction) {
  const config = await getGuildConfig(interaction.guildId);
  const channelId = interaction.options.getChannel('channel', true).id;
  if (config.allChannels) {
    const disabledChannelIds = new Set(config.disabledChannelIds);
    disabledChannelIds.add(channelId);
    await updateGuildConfig(interaction.guildId, { disabledChannelIds: [...disabledChannelIds] });
  } else {
    await updateGuildConfig(interaction.guildId, {
      channelIds: config.channelIds.filter((id) => id !== channelId),
    });
  }
  return interaction.reply({ content: `AI dinonaktifkan di <#${channelId}>.`, ephemeral: true });
}

async function listChannels(interaction) {
  const config = await getGuildConfig(interaction.guildId);
  let content;
  if (config.allChannels) {
    const excluded = config.disabledChannelIds.length
      ? config.disabledChannelIds.map((id) => `<#${id}>`).join(', ')
      : 'tidak ada';
    content = `AI aktif di semua channel teks${config.enabled ? '' : ', tetapi AI server sedang nonaktif'}. Pengecualian: ${excluded}.`;
  } else if (config.channelIds.length) {
    content = `Channel AI: ${config.channelIds.map((id) => `<#${id}>`).join(', ')}${config.enabled ? '' : '\nAI server sedang nonaktif.'}`;
  } else {
    content = 'Belum ada channel AI yang diatur.';
  }
  return interaction.reply({ content, ephemeral: true });
}

async function setPersonality(interaction) {
  const personality = interaction.options.getString('type', true);
  await updateGuildConfig(interaction.guildId, { personality });
  const extra = personality === 'custom' ? ' Atur instruksinya lewat `/ai prompt`.' : '';
  return interaction.reply({ content: `Personality AI diatur ke **${personality}**.${extra}`, ephemeral: true });
}

async function setPrompt(interaction) {
  const prompt = interaction.options.getString('text', true).trim();
  if (prompt.length < 3) {
    return interaction.reply({ content: 'Custom prompt minimal 3 karakter.', ephemeral: true });
  }
  await updateGuildConfig(interaction.guildId, {
    personality: 'custom',
    customSystemPrompt: prompt,
  });
  return interaction.reply({ content: 'Custom system prompt tersimpan.', ephemeral: true });
}

async function memorySettings(interaction) {
  const enabled = interaction.options.getBoolean('enabled');
  const maxMessages = interaction.options.getInteger('max_messages');
  if (enabled !== null || maxMessages !== null) {
    if (!(await requireAdministrator(interaction))) return null;
    const updates = {};
    if (enabled !== null) updates.memoryEnabled = enabled;
    if (maxMessages !== null) updates.maxHistory = clampInteger(maxMessages, 2, 60);
    await updateGuildConfig(interaction.guildId, updates);
  }

  const config = await getGuildConfig(interaction.guildId);
  const usage = await getUsageCount(interaction.guildId, interaction.user.id);
  const state = config.memoryEnabled
    ? `Memory aktif, menyimpan hingga ${config.maxHistory} pesan terakhir per pengguna.`
    : 'Memory nonaktif; isi percakapan tidak disimpan.';
  return interaction.reply({
    content: `${state}\nPemakaian AI kamu hari ini: ${usage}/${config.dailyLimit}.`,
    ephemeral: true,
  });
}

async function updateAndReply(interaction, updates, message) {
  await updateGuildConfig(interaction.guildId, updates);
  return interaction.reply({ content: message, ephemeral: true });
}

async function showStatus(interaction) {
  const config = await getGuildConfig(interaction.guildId);
  const channels = config.allChannels
    ? `Semua channel (${config.disabledChannelIds.length} dikecualikan)`
    : `${config.channelIds.length} channel diizinkan`;
  return interaction.reply({
    content: [
      `**AI:** ${config.enabled ? 'Aktif' : 'Nonaktif'}`,
      `**Channel:** ${channels}`,
      `**Personality:** ${config.personality}`,
      `**Model:** ${config.model}`,
      `**Memory:** ${config.memoryEnabled ? `Aktif, ${config.maxHistory} pesan` : 'Nonaktif'}`,
      `**Batas harian:** ${config.dailyLimit} request per pengguna`,
      `**Image generator:** ${config.imageEnabled ? 'Aktif' : 'Nonaktif'}`,
    ].join('\n'),
    ephemeral: true,
  });
}

async function resetConfig(interaction) {
  const env = getEnv();
  await updateGuildConfig(interaction.guildId, {
    enabled: true,
    allChannels: false,
    channelIds: [],
    disabledChannelIds: [],
    personality: 'friendly',
    customSystemPrompt: '',
    model: env.defaultChatModel,
    memoryEnabled: true,
    maxHistory: env.defaultMaxHistory,
    dailyLimit: env.defaultDailyLimit,
    imageEnabled: true,
  });
  return interaction.reply({
    content: 'Pengaturan server di-reset. Memory percakapan tidak ikut dihapus; gunakan `/ai resetmemory` untuk memory akunmu.',
    ephemeral: true,
  });
}

async function showPanel(interaction) {
  const config = await getGuildConfig(interaction.guildId);
  return interaction.reply({
    ...buildSettingsPanel(config),
    ephemeral: true,
  });
}
