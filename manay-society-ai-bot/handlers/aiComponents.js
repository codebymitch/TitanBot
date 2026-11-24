import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { getGuildConfig, updateGuildConfig } from '../database/settings.js';
import { MODEL_CHOICES, PERSONALITY_CHOICES } from '../ai/prompts.js';
import {
  buildChannelPicker,
  buildModelMenu,
  buildPanelChannelMenu,
  buildPersonalityMenu,
  buildSettingsPanel,
} from '../utils/settingsPanel.js';
import { clampInteger } from '../utils/text.js';
import { requireAdministrator } from '../utils/permissions.js';
import { logError } from '../utils/logger.js';

export async function handleAiComponent(interaction) {
  if (!interaction.customId?.startsWith('nexa:')) return false;
  if (!interaction.guildId) {
    await interaction.reply({ content: 'Panel ini hanya bisa dipakai di server.', ephemeral: true });
    return true;
  }

  if (!(await requireAdministrator(interaction))) return true;

  try {
    if (interaction.isModalSubmit()) {
      await handleModal(interaction);
      return true;
    }
    if (interaction.isChannelSelectMenu()) {
      await handleChannelSelect(interaction);
      return true;
    }
    if (interaction.isStringSelectMenu()) {
      await handleStringSelect(interaction);
      return true;
    }
    if (interaction.isButton()) {
      await handleButton(interaction);
      return true;
    }
  } catch (error) {
    logError(`AI settings component guild=${interaction.guildId}`, error);
    const content = 'Pengaturan gagal disimpan. Coba lagi sebentar.';
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content, ephemeral: true }).catch(() => null);
    } else {
      await interaction.reply({ content, ephemeral: true }).catch(() => null);
    }
  }

  return true;
}

async function handleChannelSelect(interaction) {
  const config = await getGuildConfig(interaction.guildId);
  const selected = interaction.values;

  if (interaction.customId === 'nexa:channel:set') {
    await updateGuildConfig(interaction.guildId, {
      enabled: true,
      allChannels: false,
      channelIds: selected.slice(0, 1),
      disabledChannelIds: [],
    });
    return interaction.update({
      content: `Channel AI berhasil diatur ke <#${selected[0]}>.`,
      components: [],
    });
  }

  if (interaction.customId === 'nexa:channel:add') {
    if (config.allChannels) {
      await updateGuildConfig(interaction.guildId, {
        disabledChannelIds: config.disabledChannelIds.filter((id) => !selected.includes(id)),
      });
    } else {
      await updateGuildConfig(interaction.guildId, {
        channelIds: [...new Set([...config.channelIds, ...selected])],
      });
    }
    return interaction.update({
      content: `Channel AI ditambahkan: ${selected.map((id) => `<#${id}>`).join(', ')}.`,
      components: [],
    });
  }

  if (interaction.customId === 'nexa:panel:select-channels') {
    if (config.allChannels) {
      await updateGuildConfig(interaction.guildId, {
        disabledChannelIds: config.disabledChannelIds.filter((id) => !selected.includes(id)),
      });
    } else {
      await updateGuildConfig(interaction.guildId, {
        channelIds: [...new Set([...config.channelIds, ...selected])],
      });
    }
    return updatePanel(interaction);
  }

  return false;
}

async function handleStringSelect(interaction) {
  const value = interaction.values[0];
  if (interaction.customId === 'nexa:panel:select-personality') {
    if (!PERSONALITY_CHOICES.some((choice) => choice.value === value)) return;
    await updateGuildConfig(interaction.guildId, { personality: value });
    await updatePanel(interaction);
    if (value === 'custom') {
      await interaction.followUp({
        content: 'Personality Custom dipilih. Isi instruksinya lewat tombol **Custom prompt** atau `/ai prompt`.',
        ephemeral: true,
      });
    }
    return;
  }

  if (interaction.customId === 'nexa:panel:select-model') {
    if (!MODEL_CHOICES.some((choice) => choice.value === value)) return;
    await updateGuildConfig(interaction.guildId, { model: value });
    return updatePanel(interaction);
  }
}

async function handleButton(interaction) {
  const config = await getGuildConfig(interaction.guildId);
  switch (interaction.customId) {
    case 'nexa:panel:back':
      return updatePanel(interaction);
    case 'nexa:panel:close':
      return interaction.update({ content: 'Panel ditutup.', embeds: [], components: [] });
    case 'nexa:panel:channels':
      return interaction.update({
        content: 'Pilih channel yang ingin ditambahkan ke AI.',
        embeds: [],
        components: [
          buildPanelChannelMenu(),
          new ActionRowBuilder().addComponents(backButton()),
        ],
      });
    case 'nexa:panel:personality':
      return interaction.update({
        content: 'Pilih personality AI.',
        embeds: [],
        components: [buildPersonalityMenu(), new ActionRowBuilder().addComponents(backButton())],
      });
    case 'nexa:panel:model':
      return interaction.update({
        content: 'Pilih model AI gratis.',
        embeds: [],
        components: [buildModelMenu(), new ActionRowBuilder().addComponents(backButton())],
      });
    case 'nexa:panel:memory':
      await updateGuildConfig(interaction.guildId, { memoryEnabled: !config.memoryEnabled });
      return updatePanel(interaction);
    case 'nexa:panel:image':
      await updateGuildConfig(interaction.guildId, { imageEnabled: !config.imageEnabled });
      return updatePanel(interaction);
    case 'nexa:panel:history':
      return interaction.showModal(numberModal(
        'nexa:modal:history',
        'Batas memory',
        'max_messages',
        'Jumlah pesan konteks (2-60)',
        String(config.maxHistory),
        2,
        60,
      ));
    case 'nexa:panel:limit':
      return interaction.showModal(numberModal(
        'nexa:modal:limit',
        'Usage limit harian',
        'daily_limit',
        'Request per pengguna (1-1000)',
        String(config.dailyLimit),
        1,
        1000,
      ));
    case 'nexa:panel:prompt':
      return interaction.showModal(promptModal(config.customSystemPrompt));
    default:
      return false;
  }
}

async function handleModal(interaction) {
  const rawValue = interaction.fields.getTextInputValue('value').trim();
  if (interaction.customId === 'nexa:modal:prompt') {
    if (rawValue.length < 3) {
      return interaction.reply({ content: 'Prompt minimal 3 karakter.', ephemeral: true });
    }
    await updateGuildConfig(interaction.guildId, {
      personality: 'custom',
      customSystemPrompt: rawValue.slice(0, 1500),
    });
    return interaction.reply({ content: 'Custom system prompt tersimpan.', ephemeral: true });
  }

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value)) {
    return interaction.reply({ content: 'Masukkan angka yang valid.', ephemeral: true });
  }

  if (interaction.customId === 'nexa:modal:history') {
    await updateGuildConfig(interaction.guildId, { maxHistory: clampInteger(value, 2, 60) });
    return interaction.reply({ content: 'Batas memory diperbarui.', ephemeral: true });
  }
  if (interaction.customId === 'nexa:modal:limit') {
    await updateGuildConfig(interaction.guildId, { dailyLimit: clampInteger(value, 1, 1000) });
    return interaction.reply({ content: 'Usage limit diperbarui.', ephemeral: true });
  }
}

async function updatePanel(interaction) {
  const config = await getGuildConfig(interaction.guildId);
  return interaction.update({
    content: null,
    ...buildSettingsPanel(config),
  });
}

function backButton() {
  return new ButtonBuilder()
    .setCustomId('nexa:panel:back')
    .setLabel('Kembali')
    .setStyle(ButtonStyle.Secondary);
}

function numberModal(customId, title, fieldId, label, value, min, max) {
  const input = new TextInputBuilder()
    .setCustomId('value')
    .setLabel(label)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(String(min).length)
    .setMaxLength(String(max).length)
    .setValue(value);
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(new ActionRowBuilder().addComponents(input));
}

function promptModal(prompt) {
  const input = new TextInputBuilder()
    .setCustomId('value')
    .setLabel('Instruksi custom untuk AI')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMinLength(3)
    .setMaxLength(1500)
    .setValue(prompt || 'Gunakan gaya bicara yang ramah dan membantu.');
  return new ModalBuilder()
    .setCustomId('nexa:modal:prompt')
    .setTitle('Custom system prompt')
    .addComponents(new ActionRowBuilder().addComponents(input));
}
