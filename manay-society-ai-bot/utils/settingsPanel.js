import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { MODEL_CHOICES, PERSONALITY_CHOICES } from '../ai/prompts.js';

export function buildSettingsPanel(config) {
  const channelSummary = config.allChannels
    ? `Semua channel${config.disabledChannelIds.length ? `, kecuali ${config.disabledChannelIds.length} channel` : ''}`
    : config.channelIds.length
      ? `${config.channelIds.length} channel terpilih`
      : 'Belum ada channel';

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Manay Society | AI Settings')
    .setDescription('Atur AI server ini lewat tombol. Perubahan tersimpan otomatis di MongoDB.')
    .addFields(
      { name: 'AI', value: config.enabled ? 'Aktif' : 'Nonaktif', inline: true },
      { name: 'Channel', value: channelSummary, inline: true },
      { name: 'Personality', value: config.personality, inline: true },
      { name: 'Model', value: config.model, inline: true },
      { name: 'Memory', value: config.memoryEnabled ? `Aktif (${config.maxHistory} pesan)` : 'Nonaktif', inline: true },
      { name: 'Batas harian', value: `${config.dailyLimit} request per pengguna`, inline: true },
      { name: 'Image generator', value: config.imageEnabled ? 'Aktif' : 'Nonaktif', inline: true },
    )
    .setFooter({ text: 'Hanya Administrator yang dapat mengubah pengaturan.' });

  const controls = [
    new ButtonBuilder().setCustomId('nexa:panel:channels').setLabel('Channels').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('nexa:panel:personality').setLabel('Personality').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('nexa:panel:model').setLabel('Model').setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('nexa:panel:memory')
      .setLabel(config.memoryEnabled ? 'Memory: ON' : 'Memory: OFF')
      .setStyle(config.memoryEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('nexa:panel:history').setLabel('Batas memory').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('nexa:panel:limit').setLabel('Usage limit').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('nexa:panel:image')
      .setLabel(config.imageEnabled ? 'Image: ON' : 'Image: OFF')
      .setStyle(config.imageEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('nexa:panel:prompt').setLabel('Custom prompt').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('nexa:panel:close').setLabel('Tutup').setStyle(ButtonStyle.Danger),
  ];

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(...controls.slice(0, 4)),
      new ActionRowBuilder().addComponents(...controls.slice(4)),
    ],
  };
}

export function buildChannelPicker(mode) {
  const isSet = mode === 'set';
  const menu = new ChannelSelectMenuBuilder()
    .setCustomId(`nexa:channel:${mode}`)
    .setPlaceholder(isSet ? 'Pilih satu channel AI' : 'Pilih channel yang ingin ditambahkan')
    .setChannelTypes(ChannelType.GuildText)
    .setMinValues(1)
    .setMaxValues(isSet ? 1 : 10);

  return [
    new ActionRowBuilder().addComponents(menu),
  ];
}

export function buildPersonalityMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('nexa:panel:select-personality')
      .setPlaceholder('Pilih personality')
      .addOptions(PERSONALITY_CHOICES.map(({ name, value }) => ({
        label: name,
        value,
      }))),
  );
}

export function buildModelMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('nexa:panel:select-model')
      .setPlaceholder('Pilih model AI')
      .addOptions(MODEL_CHOICES.map(({ name, value }) => ({
        label: name,
        value,
      }))),
  );
}

export function buildPanelChannelMenu() {
  return new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId('nexa:panel:select-channels')
      .setPlaceholder('Pilih channel untuk ditambahkan')
      .setChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(10),
  );
}
