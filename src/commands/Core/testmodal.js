import { SlashCommandBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

async function getRecentLogs(maxChars = 3500) {
  try {
    const logsDir = path.resolve(new URL('../../logs', import.meta.url).pathname);
    const files = await fs.readdir(logsDir).catch(() => []);
    const combinedFiles = files.filter(f => f.startsWith('combined-') && f.endsWith('.log'));
    if (combinedFiles.length === 0) return '';

    // pick newest file by mtime
    let newest = null;
    for (const f of combinedFiles) {
      const full = path.join(logsDir, f);
      const stat = await fs.stat(full).catch(() => null);
      if (!stat) continue;
      if (!newest || stat.mtimeMs > newest.mtimeMs) newest = { file: full, mtimeMs: stat.mtimeMs };
    }
    if (!newest) return '';

    const content = await fs.readFile(newest.file, 'utf8').catch(() => '');
    if (!content) return '';
    // return last maxChars characters
    return content.slice(-maxChars);
  } catch (e) {
    logger.warn('Failed to read recent logs:', e.message || e);
    return '';
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('testmodal')
    .setDescription('Open the Debug Test modal (developer logs)'),

  async execute(interaction) {
    const ready = await InteractionHelper.ensureReady(interaction, { flags: 0 });
    if (!ready) return;

    try {
      const modal = new ModalBuilder()
        .setCustomId('test_debug_modal')
        .setTitle('Debug Test');

      const logs = await getRecentLogs(3500);

      const input = new TextInputBuilder()
        .setCustomId('dev_logs')
        .setLabel('Dev Logs (read-only)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(4000)
        .setPlaceholder('No logs available')
        .setValue(logs || 'No recent logs available');

      const row = new ActionRowBuilder().addComponents(input);
      modal.addComponents(row);

      await interaction.showModal(modal);
    } catch (error) {
      logger.error('Failed to show TestModal:', error);
      await InteractionHelper.safeReply(interaction, { content: 'Could not open debug modal.', flags: 1 << 6 });
    }
  },
};
