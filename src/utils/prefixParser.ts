// prefixParser.js

import { resolveSubcommandAlias } from '../config/commands/commandAliases.js';
import { logger } from './logger.js';

/** A command option as found in a command's JSON (only the fields read here). */
export interface PrefixOptionDef {
  name: string;
  description?: string;
  type: number;
  required?: boolean;
  options?: readonly PrefixOptionDef[];
}

/** The parts of a command's JSON body the prefix parser reads. */
export interface PrefixCommandJson {
  name?: string;
  options?: readonly PrefixOptionDef[];
}

/** A SlashCommandBuilder (anything with toJSON) or its plain JSON. */
export interface PrefixCommandData extends PrefixCommandJson {
  toJSON?(): PrefixCommandJson;
}

export interface MissingPrefixOption {
  name: string;
  description?: string;
  type: number;
}

export interface PrefixValidationResult {
  valid: boolean;
  missing: MissingPrefixOption[];
  subcommandName?: string | null;
  subcommandGroupName?: string | null;
  optionDefs?: PrefixOptionDef[];
}

/**
 * Mimics the subset of CommandInteractionOptionResolver used by commands.
 * Values are the raw string arguments; resolving users/channels/roles is done by messageAdapter.
 */
export interface PrefixOptionResolver {
  _positional: string[];
  get(name: string): string | null;
  getString(name: string): string | null;
  getUser(name: string): string | null;
  getMember?(name: string): string | null;
  getChannel?(name: string): string | null;
  getRole?(name: string): string | null;
  getInteger(name: string): number | null;
  getBoolean(name: string): boolean;
  getSubcommand(): string | null;
  getSubcommandGroup(): string | null;
  validateRequired(): PrefixValidationResult;
}

export interface ParsedPrefixCommand {
  commandName: string;
  args: string[];
}

export function parsePrefixCommand(content: string | null | undefined, prefix: string): ParsedPrefixCommand | null {
  if (!content || !content.startsWith(prefix)) {
    return null;
  }

  const withoutPrefix = content.slice(prefix.length).trim();
  
  if (!withoutPrefix) {
    return null;
  }

  const args = parseArguments(withoutPrefix);
  
  if (args.length === 0) {
    return null;
  }

  const commandName = args[0].toLowerCase();
  const commandArgs = args.slice(1);

  return {
    commandName,
    args: commandArgs
  };
}

function parseArguments(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuote) {
      if (char === quoteChar) {
        
        inQuote = false;
        args.push(current);
        current = '';
      } else {
        current += char;
      }
    } else {
      if (char === '"' || char === "'") {
        
        if (current.trim()) {
          args.push(current.trim());
          current = '';
        }
        inQuote = true;
        quoteChar = char;
      } else if (char === ' ') {
        
        if (current.trim()) {
          args.push(current.trim());
          current = '';
        }
      } else {
        current += char;
      }
    }
  }

  if (current.trim()) {
    args.push(current.trim());
  }

  return args;
}

export function mapArgumentsToOptions(args: string[], commandData: PrefixCommandData): PrefixOptionResolver {
  const options: Record<string, string> = {};
  let subcommandName: string | null = null;
  let subcommandGroupName: string | null = null;

  const cmdData: PrefixCommandJson = commandData.toJSON ? commandData.toJSON() : commandData;
  
  if (!cmdData || !cmdData.options) {
    
    return {
      _positional: args,
      get: (name: string) => args[0] || null,
      getString: (name: string) => args[0] || null,
      getUser: (name: string) => null,
      getInteger: (name: string) => parseInt(args[0]) || null,
      getBoolean: (name: string) => args[0] === 'true',
      getSubcommand: () => null,
      getSubcommandGroup: () => null,
      validateRequired: () => ({ valid: true, missing: [] })
    };
  }

  // Commands may mix direct subcommands and subcommand groups (e.g. /msg purge and /msg notes add).
  const groups = cmdData.options.filter((opt) => opt.type === 2);
  const subcommands = cmdData.options.filter((opt) => opt.type === 1);
  const hasSubcommands = subcommands.length > 0;
  const hasGroups = groups.length > 0;
  let matchedGroup: PrefixOptionDef | null = null;

  // An exact name wins over a subcommand alias (e.g. /fun roll vs. the "roll" -> "reroll" alias).
  const findSubcommand = (list: readonly PrefixOptionDef[], raw: string): PrefixOptionDef | undefined =>
    list.find((s) => s.name === raw.toLowerCase()) ?? list.find((s) => s.name === resolveSubcommandAlias(raw));
  const basicOptions = (sub: PrefixOptionDef): PrefixOptionDef[] =>
    sub.options?.filter((opt) => opt.type !== 1 && opt.type !== 2) || [];

  let currentArgs = args;
  let optionDefs: PrefixOptionDef[] = [];

  logger.debug(
    `Parsing prefix command: commandName=${cmdData.name}, args=${JSON.stringify(args)}, hasSubcommands=${hasSubcommands}, hasSubcommandGroup=${hasGroups}, optionsCount=${cmdData.options.length}`,
  );

  if ((hasSubcommands || hasGroups) && args.length > 0) {
    const firstArg = args[0].toLowerCase();
    matchedGroup = groups.find((g) => g.name === firstArg) ?? null;

    if (matchedGroup) {
      subcommandGroupName = firstArg;
      if (args.length > 1) {
        const sub = findSubcommand(matchedGroup.options || [], args[1]);
        if (sub) {
          subcommandName = sub.name;
          optionDefs = basicOptions(sub);
          currentArgs = args.slice(2);
        } else {
          logger.debug(`Subcommand ${args[1]} not found in group ${subcommandGroupName}`);
        }
      }
    } else if (hasSubcommands) {
      logger.debug(`Looking for subcommand: ${args[0]}, available: ${subcommands.map((s) => s.name).join(', ')}`);
      const sub = findSubcommand(subcommands, args[0]);
      if (sub) {
        subcommandName = sub.name;
        optionDefs = basicOptions(sub);
        currentArgs = args.slice(1);
        logger.debug(`Found subcommand ${subcommandName}, optionDefs: ${optionDefs.length}`);
      } else {
        logger.debug(`Subcommand ${args[0]} not found`);
      }
    } else {
      logger.debug(`Subcommand group ${firstArg} not found`);
    }
  } else if (!hasSubcommands && !hasGroups) {
    optionDefs = cmdData.options.filter((opt) => opt.type !== 1 && opt.type !== 2);
  }

  for (let i = 0; i < Math.min(currentArgs.length, optionDefs.length); i++) {
    const optionDef = optionDefs[i];
    const value = currentArgs[i];
    
    options[optionDef.name] = value;
  }

  const missing: MissingPrefixOption[] = [];
  if (subcommandName || (!hasSubcommands && !hasGroups)) {
    for (const opt of optionDefs) {
      if (opt.required && !options[opt.name]) {
        missing.push({
          name: opt.name,
          description: opt.description,
          type: opt.type,
        });
      }
    }
  }

  if ((hasSubcommands || hasGroups) && !subcommandName) {
    if (matchedGroup) {
      missing.push({
        name: 'subcommand',
        description: `Verfügbar: ${matchedGroup.options?.map((s) => s.name).join(', ') || 'keine'}`,
        type: 1,
      });
    } else {
      const available = [...subcommands, ...groups].map((s) => s.name).join(', ') || 'keine';
      missing.push({
        name: hasSubcommands ? 'subcommand' : 'subcommand group',
        description: `Verfügbar: ${available}`,
        type: 1,
      });
    }
  }

  return {
    ...options,
    _positional: args,
    get: (name: string) => options[name] || null,
    getString: (name: string) => options[name] || null,
    getUser: (name: string) => options[name] || null,
    getMember: (name: string) => options[name] || null,
    getChannel: (name: string) => options[name] || null,
    getRole: (name: string) => options[name] || null,
    getInteger: (name: string) => options[name] ? parseInt(options[name]) : null,
    getBoolean: (name: string) => options[name] === 'true',
    getSubcommand: () => subcommandName,
    getSubcommandGroup: () => subcommandGroupName,
    validateRequired: () => ({
      valid: missing.length === 0,
      missing,
      subcommandName,
      subcommandGroupName,
      optionDefs
    })
  };
}