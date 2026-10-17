// commandRouter.ts — builds consolidated top-level commands that delegate to the pre-consolidation modules.

import { ApplicationCommandOptionType } from 'discord.js';
import type {
  APIApplicationCommandBasicOption,
  APIApplicationCommandOption,
  APIApplicationCommandSubcommandGroupOption,
  APIApplicationCommandSubcommandOption,
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import type { Command, CommandData, GuildConfig, NexoClient, ResolvedRoute } from '../types/index.js';
import { LEGACY_COMMAND_MAP } from '../config/commands/legacyCommandMap.js';
import { createError, ErrorTypes } from './errorHandler.js';
import { enforceDefaultCommandPermissions } from './permissionGuard.js';

const MAX_OPTIONS = 25;

export interface RouterRoute {
  /** Old top-level command name: a key of LEGACY_COMMAND_MAP, or the router's own name for `spread`. */
  legacyName: string;
  module: Command;
  /** Expose the old command's own subcommands directly on the router (e.g. /music pause). */
  spread?: boolean;
}

export interface RouterOptions {
  name: string;
  description: string;
  /** Category folder of the router file (same as the loader derives). */
  category: string;
  defaultMemberPermissions?: bigint | null;
  routes: RouterRoute[];
}

interface BuiltRoute extends ResolvedRoute {
  /** First-level option names this route answers to (subcommand or group names). */
  names: Set<string>;
  isGroup: boolean;
  permissions: string | null;
  guildOnly: boolean;
}

function isSubcommand(option: APIApplicationCommandOption): option is APIApplicationCommandSubcommandOption {
  return option.type === ApplicationCommandOptionType.Subcommand;
}

function isGroup(option: APIApplicationCommandOption): option is APIApplicationCommandSubcommandGroupOption {
  return option.type === ApplicationCommandOptionType.SubcommandGroup;
}

function isBasicOption(option: APIApplicationCommandOption): option is APIApplicationCommandBasicOption {
  return !isSubcommand(option) && !isGroup(option);
}

export function createRouterCommand(options: RouterOptions): Command {
  const routerPermissions = options.defaultMemberPermissions == null
    ? null
    : options.defaultMemberPermissions.toString();
  const jsonOptions: APIApplicationCommandOption[] = [];
  const builtRoutes: BuiltRoute[] = [];

  for (const route of options.routes) {
    const json = route.module.data.toJSON();
    const moduleOptions = json.options ?? [];
    const base = {
      legacyName: route.legacyName,
      module: route.module,
      permissions: json.default_member_permissions ?? null,
      guildOnly: json.dm_permission === false,
    };

    if (route.spread) {
      if (!moduleOptions.every(isSubcommand)) {
        throw new Error(`Router ${options.name}: spread route ${route.legacyName} may only contain subcommands`);
      }
      jsonOptions.push(...moduleOptions);
      builtRoutes.push({
        ...base,
        category: options.category,
        names: new Set(moduleOptions.map((option) => option.name)),
        isGroup: false,
      });
      continue;
    }

    const target = LEGACY_COMMAND_MAP[route.legacyName];
    if (!target || target.command !== options.name) {
      throw new Error(`Router ${options.name}: ${route.legacyName} is not mapped to this command`);
    }

    if (target.group) {
      jsonOptions.push({
        type: ApplicationCommandOptionType.SubcommandGroup,
        name: target.group,
        description: json.description,
        options: moduleOptions.filter(isSubcommand),
      });
    } else {
      jsonOptions.push({
        type: ApplicationCommandOptionType.Subcommand,
        name: target.subcommand!,
        description: json.description,
        options: moduleOptions.filter(isBasicOption),
      });
    }

    builtRoutes.push({
      ...base,
      category: target.category,
      names: new Set([(target.group ?? target.subcommand)!]),
      isGroup: Boolean(target.group),
    });
  }

  const names = jsonOptions.map((option) => option.name);
  if (names.length > MAX_OPTIONS || new Set(names).size !== names.length) {
    throw new Error(`Router ${options.name}: needs at most ${MAX_OPTIONS} unique subcommands/groups, got ${names.join(', ')}`);
  }

  const allGuildOnly = builtRoutes.every((route) => route.guildOnly);
  const commandJson: RESTPostAPIChatInputApplicationCommandsJSONBody = {
    name: options.name,
    description: options.description,
    options: jsonOptions,
    ...(routerPermissions !== null ? { default_member_permissions: routerPermissions } : {}),
    ...(allGuildOnly ? { dm_permission: false } : {}),
  };

  const data: CommandData & { description: string } = {
    name: options.name,
    description: options.description,
    toJSON: () => structuredClone(commandJson),
  };

  const findRoute = (group: string | null, subcommand: string | null): BuiltRoute | null => {
    if (group) {
      return builtRoutes.find((route) => route.isGroup && route.names.has(group)) ?? null;
    }
    if (subcommand) {
      return builtRoutes.find((route) => !route.isGroup && route.names.has(subcommand)) ?? null;
    }
    return null;
  };

  const dispatch = async (
    handler: 'execute' | 'prefixExecute',
    interaction: ChatInputCommandInteraction,
    guildConfig: GuildConfig | null,
    client: NexoClient,
  ): Promise<unknown> => {
    const route = findRoute(
      interaction.options.getSubcommandGroup(false),
      interaction.options.getSubcommand(false),
    );

    if (!route) {
      throw createError(
        `No route for /${options.name}`,
        ErrorTypes.VALIDATION,
        'Unbekannter Subcommand.',
        { commandName: options.name },
      );
    }

    if (route.guildOnly && !allGuildOnly && !interaction.guildId) {
      throw createError(
        `/${options.name} ${route.legacyName} used outside a guild`,
        ErrorTypes.VALIDATION,
        'Dieser Command kann nur auf einem Server genutzt werden.',
        { commandName: options.name },
      );
    }

    // Old commands that were stricter than the router keep their own permission requirement.
    if (route.permissions !== null && route.permissions !== routerPermissions) {
      const allowed = await enforceDefaultCommandPermissions(
        interaction,
        { data: route.module.data, category: route.category },
        { source: 'commandRouter', guildConfig },
      );
      if (!allowed) {
        return undefined;
      }
    }

    const target = handler === 'prefixExecute' && route.module.prefixExecute
      ? route.module.prefixExecute
      : route.module.execute;
    return target.call(route.module, interaction, guildConfig, client);
  };

  return {
    data,
    slashOnly: options.routes.every((route) => route.module.slashOnly === true) || undefined,
    execute: (interaction, guildConfig, client) => dispatch('execute', interaction, guildConfig, client),
    prefixExecute: (interaction, guildConfig, client) => dispatch('prefixExecute', interaction, guildConfig, client),
    resolveRoute(group, subcommand) {
      const route = findRoute(group, subcommand);
      return route ? { legacyName: route.legacyName, category: route.category, module: route.module } : null;
    },
  };
}
