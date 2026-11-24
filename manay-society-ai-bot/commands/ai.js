import { ChannelType, SlashCommandBuilder } from 'discord.js';
import { MODEL_CHOICES, PERSONALITY_CHOICES } from '../ai/prompts.js';
import { executeAiCommand } from '../handlers/aiCommands.js';

const data = new SlashCommandBuilder()
  .setName('ai')
  .setDescription('Chat dan atur AI Manay Society')
  .addSubcommand((sub) => sub
    .setName('chat')
    .setDescription('Ngobrol dengan AI secara privat')
    .addStringOption((option) => option
      .setName('prompt')
      .setDescription('Pesan untuk AI')
      .setRequired(true)
      .setMaxLength(4000)))
  .addSubcommand((sub) => sub.setName('setchannel').setDescription('Pilih satu channel AI'))
  .addSubcommand((sub) => sub.setName('addchannel').setDescription('Tambahkan channel AI'))
  .addSubcommand((sub) => sub
    .setName('removechannel')
    .setDescription('Hapus channel dari daftar AI')
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('Channel yang akan dihapus')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)))
  .addSubcommand((sub) => sub.setName('listchannel').setDescription('Lihat channel yang diizinkan'))
  .addSubcommand((sub) => sub.setName('allchannel').setDescription('Izinkan AI di semua channel teks'))
  .addSubcommand((sub) => sub
    .setName('disablechannel')
    .setDescription('Nonaktifkan AI pada channel tertentu')
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('Channel yang dikecualikan')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)))
  .addSubcommand((sub) => sub.setName('resetchannel').setDescription('Hapus seluruh pengaturan channel'))
  .addSubcommand((sub) => sub
    .setName('personality')
    .setDescription('Pilih karakter AI server')
    .addStringOption((option) => option
      .setName('type')
      .setDescription('Karakter AI')
      .setRequired(true)
      .addChoices(...PERSONALITY_CHOICES)))
  .addSubcommand((sub) => sub
    .setName('prompt')
    .setDescription('Atur system prompt custom')
    .addStringOption((option) => option
      .setName('text')
      .setDescription('Instruksi karakter AI')
      .setRequired(true)
      .setMaxLength(1500)))
  .addSubcommand((sub) => sub.setName('resetpersonality').setDescription('Kembalikan personality ke Friendly'))
  .addSubcommand((sub) => sub
    .setName('memory')
    .setDescription('Lihat atau atur memory server')
    .addBooleanOption((option) => option
      .setName('enabled')
      .setDescription('Aktifkan atau nonaktifkan memory'))
    .addIntegerOption((option) => option
      .setName('max_messages')
      .setDescription('Jumlah pesan konteks yang disimpan')
      .setMinValue(2)
      .setMaxValue(60)))
  .addSubcommand((sub) => sub.setName('resetmemory').setDescription('Hapus memory percakapan kamu'))
  .addSubcommand((sub) => sub.setName('enable').setDescription('Aktifkan AI server'))
  .addSubcommand((sub) => sub.setName('disable').setDescription('Nonaktifkan AI server'))
  .addSubcommand((sub) => sub
    .setName('setmodel')
    .setDescription('Pilih model OpenAI')
    .addStringOption((option) => option
      .setName('model')
      .setDescription('Model yang dipakai server')
      .setRequired(true)
      .addChoices(...MODEL_CHOICES)))
  .addSubcommand((sub) => sub
    .setName('setlimit')
    .setDescription('Atur batas request AI per pengguna per hari')
    .addIntegerOption((option) => option
      .setName('requests')
      .setDescription('Jumlah request harian')
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(1000)))
  .addSubcommand((sub) => sub.setName('status').setDescription('Lihat konfigurasi AI server'))
  .addSubcommand((sub) => sub.setName('reset').setDescription('Reset pengaturan AI server ke default'))
  .addSubcommand((sub) => sub.setName('settings').setDescription('Buka panel pengaturan interaktif'));

export default {
  data,
  async execute(interaction) {
    return executeAiCommand(interaction);
  },
};
