import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from '../../utils/embeds.js';
import { createSelectMenu } from '../../utils/components.js';

const ALL_COMMANDS_ID = 'help-all-commands';
const EXCLUDED_CATEGORIES = new Set(['economy', 'fun', 'music', 'jointocreate']);

export async function createInitialHelpMenu(client) {
  const categories = [...new Set([...(client?.commands?.values?.() ?? [])]
    .map((command) => command.category)
    .filter((category) => category && !EXCLUDED_CATEGORIES.has(String(category).toLowerCase())))].sort();
  const options = [
    { label: '📋 Alle Befehle', description: 'Alle verfügbaren Befehle anzeigen', value: ALL_COMMANDS_ID },
    ...categories.slice(0, 24).map((category) => ({
      label: category.replace(/_/g, ' '),
      description: `Befehle der Kategorie ${category}`,
      value: category,
    })),
  ];
  const embed = createEmbed({
    title: `📖 ${client?.user?.username || 'Bot'} Hilfe`,
    description: 'Wähle eine Kategorie aus, um die verfügbaren Befehle zu sehen.',
    color: 'primary',
    fields: [{ name: 'Hinweis', value: 'Nur aktiv geladene Befehle werden hier angezeigt.' }],
  });
  const menu = createSelectMenu('help-category-select', 'Kategorie auswählen', options);
  const bug = new ButtonBuilder().setCustomId('help-bug-report').setLabel('Report Bug').setStyle(ButtonStyle.Danger);
  const support = new ButtonBuilder().setLabel('Support Server').setURL('https://discord.gg/QnWNz2dKCE').setStyle(ButtonStyle.Link);
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(bug, support), menu] };
}

export default {
  slashOnly: true,
  data: new SlashCommandBuilder().setName('help').setDescription('Displays the help menu with all available commands'),
  async execute(interaction, guildConfig, client) {
    await InteractionHelper.safeDefer(interaction);
    const view = await createInitialHelpMenu(client);
    await InteractionHelper.safeEditReply(interaction, view);
  },
};
