import { createEmbed } from '../../utils/embeds.js';
import { createButton, getPaginationRow } from '../../utils/components.js';
import { Collection, ActionRowBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

const BACK_BUTTON_ID = 'help-back-to-main';
const ALL_COMMANDS_ID = 'help-all-commands';
const PAGINATION_PREFIX = 'help-page';
const CATEGORY_SELECT_ID = 'help-category-select';
const FOOTER_TEXT = 'Made with ❤️';
const EXCLUDED_CATEGORIES = new Set(['economy', 'fun', 'music', 'jointocreate']);

function commandData(command) {
  const raw = command?.data;
  return raw?.toJSON ? raw.toJSON() : raw;
}

function displayEntries(client, category = null) {
  const result = [];
  for (const command of client?.commands?.values?.() ?? []) {
    const data = commandData(command);
    const name = data?.name;
    if (!name || EXCLUDED_CATEGORIES.has(String(command.category || '').toLowerCase())) continue;
    if (category && String(command.category).toLowerCase() !== String(category).toLowerCase()) continue;
    const options = data.options || [];
    const subcommands = options.filter((option) => option.type === 1);
    if (subcommands.length) {
      for (const sub of subcommands) result.push({ name: `${name} ${sub.name}`, description: sub.description || data.description || '', category: command.category });
    } else {
      result.push({ name, description: data.description || '', category: command.category });
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

function buildMenu(title, entries, client, includeCategories = false) {
  const embed = createEmbed({
    title,
    description: entries.length ? entries.map((entry) => `**/${entry.name}** — ${includeCategories ? `${entry.category}: ` : ''}${entry.description}`).join('\n').slice(0, 4000) : 'Keine Befehle in dieser Kategorie verfügbar.',
  });
  embed.setFooter({ text: FOOTER_TEXT });
  embed.setTimestamp();
  const back = createButton(BACK_BUTTON_ID, 'Zurück', 'primary', '⬅️', false);
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(back)] };
}

export async function createAllCommandsMenu(page = 1, client) {
  const entries = displayEntries(client);
  return buildMenu('📋 Alle Befehle', entries.slice((page - 1) * 45, page * 45), client, true);
}

export const helpCategorySelectMenu = {
  name: CATEGORY_SELECT_ID,
  async execute(interaction, client) {
    try {
      if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
      const category = interaction.values[0];
      const result = category === ALL_COMMANDS_ID
        ? await createAllCommandsMenu(1, client)
        : buildMenu(`${category} – Befehle`, displayEntries(client, category), client);
      await interaction.editReply(result);
    } catch (error) {
      if (error?.code === 40060 || error?.code === 10062) {
        logger.warn('Help category select interaction already acknowledged or expired.');
        return;
      }
      await handleInteractionError(interaction, error, { type: 'select_menu', customId: interaction.customId, handler: 'help_category' });
    }
  },
};
