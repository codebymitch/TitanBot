/**
 * Prefix command restrictions — dashboard and advanced setup flows stay slash-only.
 */

import type {
  APIApplicationCommandOption,
  APIApplicationCommandSubcommandGroupOption,
  APIApplicationCommandSubcommandOption,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import type { Command } from '../../types/index.js';

export interface PrefixRestriction {
  blocked: boolean;
  reason?: string;
}

type PrefixCheckedCommand = Pick<Command, 'data' | 'prefixOnly' | 'slashOnly' | 'resolveRoute'>;

function isSubcommandGroupOption(opt: APIApplicationCommandOption): opt is APIApplicationCommandSubcommandGroupOption {
  return opt.type === 2;
}

function isSubcommandOption(opt: APIApplicationCommandOption): opt is APIApplicationCommandSubcommandOption {
  return opt.type === 1;
}

/** Top-level commands that cannot be invoked via prefix at all. */
export const SLASH_ONLY_COMMANDS = new Set([
  'configwizard',
  'help',
  'wipedata',
  'apply',
]);

/** Subcommands blocked for every command when invoked via prefix. */
export const GLOBAL_BLOCKED_SUBCOMMANDS = new Set([
  'dashboard',
  'setup',
]);

/** Subcommand groups blocked for every command when invoked via prefix. */
export const GLOBAL_BLOCKED_SUBCOMMAND_GROUPS = new Set([
  'config',
]);

/** Per-command subcommands that stay slash-only (beyond the global block list). */
export const COMMAND_BLOCKED_SUBCOMMANDS: Record<string, Set<string> | undefined> = {
  music: new Set([
    'shuffle',
    'loop',
    'seek',
    'remove',
    'move',
    'clear',
    '247',
  ]),
  birthday: new Set(['setchannel']),
  report: new Set(['setchannel']),
};

function collectSubcommandNames(commandJson: RESTPostAPIChatInputApplicationCommandsJSONBody): string[] {
  const names = (commandJson.options?.filter(isSubcommandOption) || []).map((sub) => sub.name);
  for (const group of commandJson.options?.filter(isSubcommandGroupOption) || []) {
    names.push(...(group.options?.map((sub) => sub.name) || []));
  }
  return names;
}

function isSubcommandBlocked(commandName: string, subcommandName: string | null | undefined): boolean {
  if (!subcommandName) {
    return false;
  }

  if (GLOBAL_BLOCKED_SUBCOMMANDS.has(subcommandName)) {
    return true;
  }

  const commandBlocked = COMMAND_BLOCKED_SUBCOMMANDS[commandName];
  return commandBlocked?.has(subcommandName) ?? false;
}

/**
 * Returns whether a prefix invocation should be rejected.
 * @param {object} command - Loaded command module
 * @param {string[]} args - Parsed prefix arguments (after command name)
 * @param {(name: string) => string} resolveSubcommandAlias
 * @returns {{ blocked: boolean, reason?: string }}
 */
export function getPrefixRestriction(
  command: PrefixCheckedCommand | null | undefined,
  args: string[],
  resolveSubcommandAlias: (name: string) => string,
): PrefixRestriction {
  if (!command?.data?.toJSON) {
    return { blocked: false };
  }

  const commandJson = command.data.toJSON();
  const commandName = commandJson.name?.toLowerCase();

  if (command.prefixOnly === false || command.slashOnly === true) {
    return { blocked: true, reason: 'Dieser Command ist nur als Slash-Command verfügbar.' };
  }

  if (SLASH_ONLY_COMMANDS.has(commandName)) {
    return { blocked: true, reason: 'Dieser Command ist nur als Slash-Command verfügbar.' };
  }

  const [firstArg, secondArg] = args.map((arg) => arg?.toLowerCase?.() || null);
  const resolvedFirstArg = firstArg ? resolveSubcommandAlias(firstArg) : null;
  const resolvedSecondArg = secondArg ? resolveSubcommandAlias(secondArg) : null;

  const matchedGroup = commandJson.options?.find(
    (opt): opt is APIApplicationCommandSubcommandGroupOption => isSubcommandGroupOption(opt) && opt.name === firstArg,
  );

  const allSubcommandNames = collectSubcommandNames(commandJson);
  const allSubcommandsBlocked =
    allSubcommandNames.length > 0 &&
    allSubcommandNames.every((name) => isSubcommandBlocked(commandName, name));

  if (allSubcommandsBlocked) {
    return { blocked: true, reason: 'Dieser Command ist nur als Slash-Command verfügbar.' };
  }

  if (firstArg && GLOBAL_BLOCKED_SUBCOMMAND_GROUPS.has(firstArg)) {
    return {
      blocked: true,
      reason: 'Diese Konfiguration ist nur als Slash-Command verfügbar.',
    };
  }

  // Routed subcommands keep the slash-only flag of the old command they come from (e.g. /eco shop).
  const route = matchedGroup
    ? command.resolveRoute?.(matchedGroup.name, null)
    : firstArg && (command.resolveRoute?.(null, firstArg) ?? command.resolveRoute?.(null, resolvedFirstArg));
  if (route && route.module.slashOnly) {
    return {
      blocked: true,
      reason: 'Dieser Subcommand ist nur als Slash-Command verfügbar.',
    };
  }

  if (firstArg && (isSubcommandBlocked(commandName, firstArg) || isSubcommandBlocked(commandName, resolvedFirstArg))) {
    return {
      blocked: true,
      reason: 'Dieser Subcommand ist nur als Slash-Command verfügbar.',
    };
  }

  if (matchedGroup && secondArg && (isSubcommandBlocked(commandName, secondArg) || isSubcommandBlocked(commandName, resolvedSecondArg))) {
    return {
      blocked: true,
      reason: 'Dieser Subcommand ist nur als Slash-Command verfügbar.',
    };
  }

  return { blocked: false };
}

export function isPrefixRestrictedCommand(
  command: PrefixCheckedCommand | null | undefined,
  args: string[],
  resolveSubcommandAlias: (name: string) => string,
): boolean {
  return getPrefixRestriction(command, args, resolveSubcommandAlias).blocked;
}
