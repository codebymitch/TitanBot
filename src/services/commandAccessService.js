// commandAccessService.js

import { getGuildConfig, updateGuildConfig } from './guildConfig.js';
import {
  normalizeCategoryKey,
  formatCategoryName,
  getCategoryIcon,
  PROTECTED_COMMANDS,
} from '../config/commandCategories.js';

function normalizeToggleRecord(raw) {
  if (!raw) {
    return {};
  }

  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.map((entry) => [String(entry).toLowerCase(), true]));
  }

  if (typeof raw === 'object') {
    return Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [String(key).toLowerCase(), Boolean(value)]),
    );
  }

  return {};
}

export function buildCommandRegistry(client) {
  const categories = new Map();

  for (const command of client.commands.values()) {
    if (!command?.data?.name) {
      continue;
    }

    const category = command.category || 'Core';
    const categoryKey = normalizeCategoryKey(category);

    if (!categories.has(categoryKey)) {
      categories.set(categoryKey, {
        key: categoryKey,
        folder: category,
        displayName: formatCategoryName(category),
        icon: getCategoryIcon(category),
        commands: [],
      });
    }

    // Add the main command
    categories.get(categoryKey).commands.push({
      name: command.data.name,
      description: command.data.description || 'No description',
      protected: PROTECTED_COMMANDS.has(command.data.name.toLowerCase()),
      isSubcommand: false,
    });

    // Add subcommands if they exist
    const commandJson = command.data.toJSON?.() || {};

    for (const option of commandJson.options || []) {
      if (option.type === 1) {
        const subcommandName = `${command.data.name} ${option.name}`;
        categories.get(categoryKey).commands.push({
          name: subcommandName,
          description: option.description || 'No description',
          protected: false,
          isSubcommand: true,
          parentCommand: command.data.name,
        });
      }

      if (option.type === 2) {
        for (const sub of option.options || []) {
          if (sub.type === 1) {
            const subcommandName = `${command.data.name} ${option.name} ${sub.name}`;
            categories.get(categoryKey).commands.push({
              name: subcommandName,
              description: sub.description || 'No description',
              protected: false,
              isSubcommand: true,
              parentCommand: command.data.name,
            });
          }
        }
      }
    }
  }

  for (const category of categories.values()) {
    category.commands.sort((a, b) => a.name.localeCompare(b.name));
  }

  return categories;
}

export function getCategoryRegistry(client, categoryKey = null) {
  const registry = buildCommandRegistry(client);

  if (!categoryKey) {
    return registry;
  }

  return registry.get(normalizeCategoryKey(categoryKey)) || null;
}

export function isProtectedCommand(commandName) {
  return PROTECTED_COMMANDS.has(String(commandName || '').toLowerCase());
}

export function isCommandEnabledInConfig(config, commandName, category) {
  const normalizedName = String(commandName || '').toLowerCase();

  // Check if it's a subcommand (contains space)
  const isSubcommand = normalizedName.includes(' ');
  const baseCommand = isSubcommand ? normalizedName.split(' ')[0] : normalizedName;

  // Protected commands (only applies to base commands, not subcommands)
  if (!isSubcommand && isProtectedCommand(baseCommand)) {
    return true;
  }

  const disabledCommands = normalizeToggleRecord(config?.disabledCommands);
  const disabledCategories = normalizeToggleRecord(config?.disabledCategories);

  // Check if the specific command/subcommand is disabled
  if (disabledCommands[normalizedName]) {
    return false;
  }

  // For subcommands, also check if the base command is disabled
  if (isSubcommand && disabledCommands[baseCommand]) {
    return false;
  }

  // Check if the category is disabled
  if (disabledCategories[normalizeCategoryKey(category)]) {
    return false;
  }

  return true;
}

export async function isCommandEnabled(client, guildId, commandName, category = null) {
  const config = await getGuildConfig(client, guildId);
  let resolvedCategory = category;

  if (!resolvedCategory) {
    const command = client.commands.get(commandName);
    resolvedCategory = command?.category || 'Core';
  }

  return isCommandEnabledInConfig(config, commandName, resolvedCategory);
}

export function getCommandAccessSnapshot(client, config) {
  const registry = buildCommandRegistry(client);
  const disabledCommands = normalizeToggleRecord(config?.disabledCommands);
  const disabledCategories = normalizeToggleRecord(config?.disabledCategories);

  const categories = [];

  for (const category of registry.values()) {
    const categoryDisabled = Boolean(disabledCategories[category.key]);
    const enabledCommands = [];
    const disabledCommandNames = [];

    for (const command of category.commands) {
      const enabled = isCommandEnabledInConfig(config, command.name, category.folder);
      if (enabled) {
        enabledCommands.push(command.name);
      } else {
        disabledCommandNames.push(command.name);
      }
    }

    categories.push({
      ...category,
      categoryDisabled,
      enabledCount: enabledCommands.length,
      disabledCount: disabledCommandNames.length,
      totalCount: category.commands.length,
      enabledCommands,
      disabledCommandNames,
    });
  }

  categories.sort((a, b) => a.displayName.localeCompare(b.displayName));

  const totalCommands = categories.reduce((sum, category) => sum + category.totalCount, 0);
  const enabledTotal = categories.reduce((sum, category) => sum + category.enabledCount, 0);

  return {
    categories,
    disabledCommands,
    disabledCategories,
    totalCommands,
    enabledTotal,
    disabledTotal: totalCommands - enabledTotal,
  };
}

async function persistAccessConfig(client, guildId, updates, context = {}) {
  return updateGuildConfig(client, guildId, updates, context);
}

export function resolveCommandTarget(client, commandName) {
  const normalizedName = String(commandName || '').toLowerCase().trim();
  const registry = buildCommandRegistry(client);

  for (const category of registry.values()) {
    const match = category.commands.find((command) => command.name.toLowerCase() === normalizedName);
    if (match) {
      return match;
    }
  }

  return null;
}

export async function disableCommand(client, guildId, commandName, context = {}) {
  const normalizedName = String(commandName || '').toLowerCase().trim();
  const target = resolveCommandTarget(client, normalizedName);

  if (!target) {
    throw new Error(`Unknown command: \`${normalizedName}\`.`);
  }

  if (!target.isSubcommand && isProtectedCommand(normalizedName)) {
    throw new Error(`The \`${normalizedName}\` command cannot be disabled.`);
  }

  const config = await getGuildConfig(client, guildId, context);
  const disabledCommands = normalizeToggleRecord(config?.disabledCommands);
  disabledCommands[normalizedName] = true;

  await persistAccessConfig(client, guildId, { disabledCommands }, context);
  return { commandName: normalizedName, enabled: false };
}

export async function enableCommand(client, guildId, commandName, context = {}) {
  const normalizedName = String(commandName || '').toLowerCase().trim();
  const target = resolveCommandTarget(client, normalizedName);

  if (!target) {
    throw new Error(`Unknown command: \`${normalizedName}\`.`);
  }

  const config = await getGuildConfig(client, guildId, context);
  const disabledCommands = normalizeToggleRecord(config?.disabledCommands);
  delete disabledCommands[normalizedName];

  await persistAccessConfig(client, guildId, { disabledCommands }, context);
  return { commandName: normalizedName, enabled: true };
}

export async function disableCategory(client, guildId, categoryKey, context = {}) {
  const normalizedKey = normalizeCategoryKey(categoryKey);
  const category = getCategoryRegistry(client, normalizedKey);

  if (!category) {
    throw new Error(`Unknown category: \`${categoryKey}\`.`);
  }

  const config = await getGuildConfig(client, guildId, context);
  const disabledCategories = normalizeToggleRecord(config?.disabledCategories);
  disabledCategories[normalizedKey] = true;

  await persistAccessConfig(client, guildId, { disabledCategories }, context);
  return { categoryKey: normalizedKey, displayName: category.displayName, enabled: false };
}

export async function enableCategory(client, guildId, categoryKey, context = {}) {
  const normalizedKey = normalizeCategoryKey(categoryKey);
  const category = getCategoryRegistry(client, normalizedKey);

  if (!category) {
    throw new Error(`Unknown category: \`${categoryKey}\`.`);
  }

  const config = await getGuildConfig(client, guildId, context);
  const disabledCategories = normalizeToggleRecord(config?.disabledCategories);
  delete disabledCategories[normalizedKey];

  await persistAccessConfig(client, guildId, { disabledCategories }, context);
  return { categoryKey: normalizedKey, displayName: category.displayName, enabled: true };
}

export async function resetCategoryCommands(client, guildId, categoryKey, context = {}) {
  const normalizedKey = normalizeCategoryKey(categoryKey);
  const category = getCategoryRegistry(client, normalizedKey);

  if (!category) {
    throw new Error(`Unknown category: \`${categoryKey}\`.`);
  }

  const config = await getGuildConfig(client, guildId, context);
  const disabledCommands = normalizeToggleRecord(config?.disabledCommands);

  for (const command of category.commands) {
    delete disabledCommands[command.name.toLowerCase()];
  }

  await persistAccessConfig(client, guildId, { disabledCommands }, context);
  return { categoryKey: normalizedKey, displayName: category.displayName };
}

export function resolveCategoryChoice(client, input) {
  if (!input) {
    return null;
  }

  const registry = buildCommandRegistry(client);
  const normalizedInput = normalizeCategoryKey(input);

  for (const [key, category] of registry.entries()) {
    if (
      key === normalizedInput ||
      normalizeCategoryKey(category.folder) === normalizedInput ||
      normalizeCategoryKey(category.displayName) === normalizedInput
    ) {
      return category;
    }
  }

  return null;
}
