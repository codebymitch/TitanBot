import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import type { APIActionRowComponent, APIComponentInMessageActionRow, ChatInputCommandInteraction } from 'discord.js';
import type { Command, NexoClient } from '../../types/index.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import {
  disableCategory,
  enableCategory,
  disableCommand,
  enableCommand,
  resolveCategoryChoice,
  buildCommandRegistry,
  isProtectedCommand,
} from '../../services/commandAccessService.js';
import {
  buildDashboardView,
  handleDashboardComponent,
  createDashboardCollectorFilter,
  isCommandAccessCustomId,
} from './modules/commands_dashboard.js';

const DASHBOARD_TIMEOUT_MS = 10 * 60 * 1000;

function buildCategoryChoices(client: NexoClient) {
  const registry = buildCommandRegistry(client);
  return [...registry.values()]
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .slice(0, 25)
    .map((category) => ({
      name: `${category.icon} ${category.displayName}`.slice(0, 100),
      value: category.key,
    }));
}

async function ensureManageGuild(interaction: ChatInputCommandInteraction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Du brauchst die Berechtigung **Server verwalten**, um Commands zu verwalten.' });
    return false;
  }

  return true;
}

export default {
  data: new SlashCommandBuilder()
    .setName('commands')
    .setDescription('Commands und Kategorien des Bots für diesen Server aktivieren oder deaktivieren')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('dashboard')
        .setDescription('Öffnet das interaktive Dashboard für Command-Zugriff'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('disable')
        .setDescription('Einen Command oder eine ganze Kategorie deaktivieren')
        .addStringOption((option) =>
          option
            .setName('scope')
            .setDescription('Einen einzelnen Command oder eine ganze Kategorie deaktivieren')
            .setRequired(true)
            .addChoices(
              { name: 'Kategorie', value: 'category' },
              { name: 'Command', value: 'command' },
            ),
        )
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('Name der Kategorie oder des Commands')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('enable')
        .setDescription('Einen Command oder eine ganze Kategorie aktivieren')
        .addStringOption((option) =>
          option
            .setName('scope')
            .setDescription('Einen einzelnen Command oder eine ganze Kategorie aktivieren')
            .setRequired(true)
            .addChoices(
              { name: 'Kategorie', value: 'category' },
              { name: 'Command', value: 'command' },
            ),
        )
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('Name der Kategorie oder des Commands')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),
  category: 'Core',

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);

    if (focused.name !== 'target') {
      return interaction.respond([]);
    }

    const scope = interaction.options.getString('scope');
    const query = focused.value.toLowerCase();

    if (scope === 'category') {
      const choices = buildCategoryChoices(interaction.client)
        .filter((choice) => choice.name.toLowerCase().includes(query) || choice.value.includes(query))
        .slice(0, 25);
      return interaction.respond(choices);
    }

    // For command scope, get all commands including subcommands
    const registry = buildCommandRegistry(interaction.client);
    const allCommands: string[] = [];
    
    // Check if the query matches a category name - if so, show commands from that category
    const matchedCategory = resolveCategoryChoice(interaction.client, query);
    
    if (matchedCategory) {
      // Show commands from the matched category
      for (const command of matchedCategory.commands) {
        if (!isProtectedCommand(command.name)) {
          allCommands.push(command.name);
        }
      }
    } else {
      // Show all commands
      for (const category of registry.values()) {
        for (const command of category.commands) {
          // Include both base commands and subcommands
          if (!isProtectedCommand(command.name)) {
            allCommands.push(command.name);
          }
        }
      }
    }

    const choices = allCommands
      .filter((name) => name.includes(query))
      .slice(0, 25)
      .map((name) => ({ name: `/${name}`, value: name }));

    return interaction.respond(choices);
  },

  async execute(interaction, config, client) {
    if (!(await ensureManageGuild(interaction))) {
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'dashboard') {
      const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferred) {
        return;
      }

      const view = await buildDashboardView(client, interaction.guildId!, interaction.guild!, 'overview');
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [view.embed],
        components: view.components,
      });

      const replyMessage = await interaction.fetchReply().catch(() => null);
      if (!replyMessage) {
        return;
      }

      const collector = replyMessage.createMessageComponentCollector({
        filter: createDashboardCollectorFilter(interaction.user.id, interaction.guildId),
        time: DASHBOARD_TIMEOUT_MS,
      });

      collector.on('collect', async (componentInteraction) => {
        try {
          if (!isCommandAccessCustomId(componentInteraction.customId)) {
            return;
          }
          await handleDashboardComponent(componentInteraction, client);
        } catch (error) {
          logger.error('Command access dashboard interaction failed', {
            error: (error as Error).message,
            customId: componentInteraction.customId,
            guildId: interaction.guildId,
          });
          await replyUserError(componentInteraction, {
            type: ErrorTypes.UNKNOWN,
            message: (error as Error).message || 'Command-Zugriff konnte nicht aktualisiert werden.',
          }).catch(() => {});
        }
      });

      collector.on('end', async () => {
        const finalView = await buildDashboardView(client, interaction.guildId!, interaction.guild!, 'overview');
        const disabledComponents = finalView.components.map((row) => {
          const newRow: APIActionRowComponent<APIComponentInMessageActionRow> = row.toJSON();
          newRow.components = newRow.components.map((component) => ({ ...component, disabled: true }));
          return newRow;
        });

        await replyMessage.edit({ components: disabledComponents }).catch(() => {});
      });

      return;
    }

    const scope = interaction.options.getString('scope');
    const target = interaction.options.getString('target');
    const isDisable = subcommand === 'disable';

    const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    if (!deferred) {
      return;
    }

    if (scope === 'category') {
      const category = resolveCategoryChoice(client, target);
      if (!category) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Keine Kategorie passt zu \`${target}\`. Nutze \`/commands dashboard\`, um die Kategorien zu durchsuchen.` });
      }

      if (isDisable) {
        await disableCategory(client, interaction.guildId!, category.key);
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              'Kategorie deaktiviert',
              `Alle Commands aus **${category.displayName}** sind jetzt deaktiviert.\nGeschützte Commands bleiben verfügbar.`,
            ),
          ],
        });
      }

      await enableCategory(client, interaction.guildId!, category.key);
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('Kategorie aktiviert', `Die Commands aus **${category.displayName}** sind jetzt aktiviert (außer einzeln deaktivierte Commands).`)],
      });
    }

    const commandName = target!.toLowerCase();
    if (isDisable) {
      const result = await disableCommand(client, interaction.guildId!, commandName);
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('Command deaktiviert', `\`/${result.commandName}\` ist auf diesem Server jetzt deaktiviert.`)],
      });
    }

    const result = await enableCommand(client, interaction.guildId!, commandName);
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [successEmbed('Command aktiviert', `\`/${result.commandName}\` ist auf diesem Server jetzt aktiviert.`)],
    });
  },
} satisfies Command;
