// commandAccessService.js

import { getGuildConfig, updateGuildConfig } from './config/guildConfig.js';
import {
  normalizeCategoryKey,
  formatCategoryName,
  getCategoryIcon,
  PROTECTED_COMMANDS,
} from '../config/commands/commandCategories.js';
import { resolveLegacyName, LEGACY_COMMAND_MAP, toStoredAccessKey, translateLegacyAccessKey } from '../config/commands/legacyCommandMap.js';
import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import type { GuildConfigContext } from '../utils/database/guildConfigStorage.js';
import type { CommandData, NexoClient } from '../types/index.js';

export interface CommandRegistryEntry {
  name: string;
  description: string;
  protected: boolean;
  isSubcommand: boolean;
  parentCommand?: string;
}

export interface CommandRegistryCategory {
  key: string;
  folder: string;
  displayName: string;
  icon: string;
  commands: CommandRegistryEntry[];
}

/** The config fields this service reads; values may be legacy arrays or toggle records. */
export interface CommandAccessConfig {
  disabledCommands?: unknown;
  disabledCategories?: unknown;
}

function normalizeToggleRecord(raw: unknown): Record<string, boolean> {
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

/**
 * Stored keys may still use pre-consolidation names (`balance`, `usernotes add`); there is no data
 * migration, so they are translated to the new naming on read.
 */
function translateDisabledCommands(record: Record<string, boolean>): Record<string, boolean> {
  const translated: Record<string, boolean> = {};
  for (const [key, disabled] of Object.entries(record)) {
    if (disabled) {
      translated[translateLegacyAccessKey(key)] = true;
    }
  }
  return translated;
}

/** Remove a key and every stored legacy key that translates to it. */
function deleteDisabledKey(record: Record<string, boolean>, normalizedName: string): void {
  for (const key of Object.keys(record)) {
    if (translateLegacyAccessKey(key) === normalizedName) {
      delete record[key];
    }
  }
}

export function buildCommandRegistry(client: NexoClient): Map<string, CommandRegistryCategory> {
  const categories = new Map<string, CommandRegistryCategory>();

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
    categories.get(categoryKey)!.commands.push({
      name: command.data.name,
      description: (command.data as CommandData & { description?: string }).description || 'Keine Beschreibung',
      protected: PROTECTED_COMMANDS.has(command.data.name.toLowerCase()),
      isSubcommand: false,
    });

    // Add subcommands if they exist
    const commandJson: Partial<RESTPostAPIChatInputApplicationCommandsJSONBody> = command.data.toJSON?.() || {};

    for (const option of commandJson.options || []) {
      if (option.type === 1) {
        const subcommandName = `${command.data.name} ${option.name}`;
        categories.get(categoryKey)!.commands.push({
          name: subcommandName,
          description: option.description || 'Keine Beschreibung',
          protected: false,
          isSubcommand: true,
          parentCommand: command.data.name,
        });
      }

      if (option.type === 2) {
        // The group itself is toggleable too (legacy keys like `usernotes` map to `msg notes`).
        categories.get(categoryKey)!.commands.push({
          name: `${command.data.name} ${option.name}`,
          description: option.description || 'Keine Beschreibung',
          protected: false,
          isSubcommand: true,
          parentCommand: command.data.name,
        });

        for (const sub of option.options || []) {
          if (sub.type === 1) {
            const subcommandName = `${command.data.name} ${option.name} ${sub.name}`;
            categories.get(categoryKey)!.commands.push({
              name: subcommandName,
              description: sub.description || 'Keine Beschreibung',
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

export function getCategoryRegistry(client: NexoClient, categoryKey?: null): Map<string, CommandRegistryCategory>;
export function getCategoryRegistry(client: NexoClient, categoryKey: string): CommandRegistryCategory | null;
export function getCategoryRegistry(client: NexoClient, categoryKey: string | null = null): Map<string, CommandRegistryCategory> | CommandRegistryCategory | null {
  const registry = buildCommandRegistry(client);

  if (!categoryKey) {
    return registry;
  }

  return registry.get(normalizeCategoryKey(categoryKey)) || null;
}

export function isProtectedCommand(commandName: string | null | undefined): boolean {
  return PROTECTED_COMMANDS.has(String(commandName || '').toLowerCase());
}

export function isCommandEnabledInConfig(config: CommandAccessConfig | null | undefined, commandName: string, category: string | null | undefined): boolean {
  // Queried names are always current names (access keys, registry entries); only stored keys are translated.
  const normalizedName = String(commandName || '').toLowerCase().trim();
  const tokens = normalizedName.split(/\s+/);
  const baseCommand = tokens[0];
  const isProtected = isProtectedCommand(baseCommand);

  // Protected commands and their subcommands should always remain enabled.
  if (isProtected) {
    return true;
  }

  const disabledCommands = translateDisabledCommands(normalizeToggleRecord(config?.disabledCommands));
  const disabledCategories = normalizeToggleRecord(config?.disabledCategories);

  // The command/subcommand itself or any parent path (msg notes add -> msg notes -> msg)
  for (let length = tokens.length; length > 0; length -= 1) {
    if (disabledCommands[tokens.slice(0, length).join(' ')]) {
      return false;
    }
  }

  // Check if the category is disabled
  if (disabledCategories[normalizeCategoryKey(category)]) {
    return false;
  }

  // Moved commands also follow the category they used to live in (e.g. /tools weather was Utility).
  const legacyName = resolveLegacyName(baseCommand, tokens.length > 2 ? tokens[1] : null, tokens.length > 2 ? tokens[2] : tokens[1] ?? null);
  const legacyCategory = legacyName ? LEGACY_COMMAND_MAP[legacyName].category : null;
  if (legacyCategory && disabledCategories[normalizeCategoryKey(legacyCategory)]) {
    return false;
  }

  return true;
}

export async function isCommandEnabled(client: NexoClient, guildId: string, commandName: string, category: string | null = null): Promise<boolean> {
  const config = await getGuildConfig(client, guildId);
  let resolvedCategory = category;

  if (!resolvedCategory) {
    const command = client.commands.get(commandName);
    resolvedCategory = command?.category || 'Core';
  }

  return isCommandEnabledInConfig(config, commandName, resolvedCategory);
}

export function getCommandAccessSnapshot(client: NexoClient, config: CommandAccessConfig | null | undefined) {
  const registry = buildCommandRegistry(client);
  const disabledCommands = translateDisabledCommands(normalizeToggleRecord(config?.disabledCommands));
  const disabledCategories = normalizeToggleRecord(config?.disabledCategories);

  const categories: Array<CommandRegistryCategory & {
    categoryDisabled: boolean;
    enabledCount: number;
    disabledCount: number;
    totalCount: number;
    enabledCommands: string[];
    disabledCommandNames: string[];
  }> = [];

  for (const category of registry.values()) {
    const categoryDisabled = Boolean(disabledCategories[category.key]);
    const enabledCommands: string[] = [];
    const disabledCommandNames: string[] = [];

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

async function persistAccessConfig(client: NexoClient, guildId: string, updates: Record<string, unknown>, context: GuildConfigContext = {}) {
  return updateGuildConfig(client, guildId, updates, context);
}

export function resolveCommandTarget(client: NexoClient, commandName: string | null | undefined): CommandRegistryEntry | null {
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

/** Registry entry for user input: a current name, or a pre-consolidation name (`balance`, `usernotes`). */
export function resolveAccessTarget(client: NexoClient, input: string | null | undefined): { name: string; target: CommandRegistryEntry } | null {
  const rawName = String(input || '').toLowerCase().trim();
  for (const name of [rawName, translateLegacyAccessKey(rawName)]) {
    const target = resolveCommandTarget(client, name);
    if (target) {
      return { name, target };
    }
  }
  return null;
}

export async function disableCommand(client: NexoClient, guildId: string, commandName: string, context: GuildConfigContext = {}) {
  const resolved = resolveAccessTarget(client, commandName);

  if (!resolved) {
    throw new Error(`Unbekannter Command: \`${String(commandName || '').toLowerCase().trim()}\`.`);
  }
  const { name: normalizedName, target } = resolved;

  const isProtectedTarget = isProtectedCommand(normalizedName) || (target.isSubcommand && isProtectedCommand(target.parentCommand));
  if (isProtectedTarget) {
    throw new Error(`Der Command \`${normalizedName}\` kann nicht deaktiviert werden.`);
  }

  const config = await getGuildConfig(client, guildId, context);
  const disabledCommands = normalizeToggleRecord(config?.disabledCommands);
  disabledCommands[toStoredAccessKey(normalizedName)] = true;

  await persistAccessConfig(client, guildId, { disabledCommands }, context);
  return { commandName: normalizedName, enabled: false };
}

export async function enableCommand(client: NexoClient, guildId: string, commandName: string, context: GuildConfigContext = {}) {
  const resolved = resolveAccessTarget(client, commandName);

  if (!resolved) {
    throw new Error(`Unbekannter Command: \`${String(commandName || '').toLowerCase().trim()}\`.`);
  }
  const { name: normalizedName } = resolved;

  const config = await getGuildConfig(client, guildId, context);
  const disabledCommands = normalizeToggleRecord(config?.disabledCommands);
  deleteDisabledKey(disabledCommands, normalizedName);

  await persistAccessConfig(client, guildId, { disabledCommands }, context);
  return { commandName: normalizedName, enabled: true };
}

export async function disableCategory(client: NexoClient, guildId: string, categoryKey: string, context: GuildConfigContext = {}) {
  const normalizedKey = normalizeCategoryKey(categoryKey);
  const category = getCategoryRegistry(client, normalizedKey);

  if (!category) {
    throw new Error(`Unbekannte Kategorie: \`${categoryKey}\`.`);
  }

  const config = await getGuildConfig(client, guildId, context);
  const disabledCategories = normalizeToggleRecord(config?.disabledCategories);
  disabledCategories[normalizedKey] = true;

  await persistAccessConfig(client, guildId, { disabledCategories }, context);
  return { categoryKey: normalizedKey, displayName: category.displayName, enabled: false };
}

export async function enableCategory(client: NexoClient, guildId: string, categoryKey: string, context: GuildConfigContext = {}) {
  const normalizedKey = normalizeCategoryKey(categoryKey);
  const category = getCategoryRegistry(client, normalizedKey);

  if (!category) {
    throw new Error(`Unbekannte Kategorie: \`${categoryKey}\`.`);
  }

  const config = await getGuildConfig(client, guildId, context);
  const disabledCategories = normalizeToggleRecord(config?.disabledCategories);
  delete disabledCategories[normalizedKey];

  await persistAccessConfig(client, guildId, { disabledCategories }, context);
  return { categoryKey: normalizedKey, displayName: category.displayName, enabled: true };
}

export async function resetCategoryCommands(client: NexoClient, guildId: string, categoryKey: string, context: GuildConfigContext = {}) {
  const normalizedKey = normalizeCategoryKey(categoryKey);
  const category = getCategoryRegistry(client, normalizedKey);

  if (!category) {
    throw new Error(`Unbekannte Kategorie: \`${categoryKey}\`.`);
  }

  const config = await getGuildConfig(client, guildId, context);
  const disabledCommands = normalizeToggleRecord(config?.disabledCommands);

  for (const command of category.commands) {
    deleteDisabledKey(disabledCommands, command.name.toLowerCase());
  }

  await persistAccessConfig(client, guildId, { disabledCommands }, context);
  return { categoryKey: normalizedKey, displayName: category.displayName };
}

export function resolveCategoryChoice(client: NexoClient, input: string | null | undefined): CommandRegistryCategory | null {
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
