import { resolveSubcommandAlias } from '../config/commands/commandAliases.js';
import { logger } from './logger.js';

export function parsePrefixCommand(content, prefix) {
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
    args: commandArgs,
  };
}

/**
 * Parse a command sent without the configured prefix.
 *
 * Prefix commands remain supported by parsePrefixCommand. This parser only
 * removes the requirement for the prefix; command resolution still happens in
 * messageCreate through the normal command alias map and loaded command list.
 * Unknown regular messages are ignored there because no command is found.
 */
export function parseMessageCommand(content, prefix) {
  if (!content || typeof content !== 'string') {
    return null;
  }

  const trimmed = content.trim();
  if (!trimmed || (prefix && trimmed.startsWith(prefix))) {
    return null;
  }

  const args = parseArguments(trimmed);
  if (args.length === 0) {
    return null;
  }

  return {
    commandName: args[0].toLowerCase(),
    args: args.slice(1),
  };
}

function toWesternDigits(value) {
  return value.replace(/[٠-٩]/gu, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

/** A typed command with or without the prefix; `prefixed` says which. Arabic digits become 0-9. */
export function parseTypedCommand(content, prefix) {
  const prefixed = parsePrefixCommand(content, prefix);
  const parsed = prefixed || parseMessageCommand(content, prefix);
  return parsed && { commandName: parsed.commandName, args: parsed.args.map(toWesternDigits), prefixed: Boolean(prefixed) };
}

function parseArguments(input) {
  const args = [];
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
    } else if (char === '"' || char === "'") {
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

  if (current.trim()) {
    args.push(current.trim());
  }

  return args;
}

const SNOWFLAKE = String.raw`\d{17,20}`;
const OPTION_VALUE_PATTERNS = {
  4: /^-?\d+/u, // integer (a trailing unit such as `10m` is accepted, parseInt reads the number)
  6: new RegExp(`^(?:<@!?${SNOWFLAKE}>|${SNOWFLAKE})$`, 'u'), // user
  7: new RegExp(`^(?:<#${SNOWFLAKE}>|${SNOWFLAKE})$`, 'u'), // channel
  8: new RegExp(`^(?:<@&${SNOWFLAKE}>|${SNOWFLAKE})$`, 'u'), // role
  9: new RegExp(`^(?:<@[!&]?${SNOWFLAKE}>|${SNOWFLAKE})$`, 'u'), // mentionable
  10: /^-?\d/u, // number
};

export function mapArgumentsToOptions(args, commandData) {
  const options = {};
  let subcommandName = null;
  let subcommandGroupName = null;

  const cmdData = commandData.toJSON ? commandData.toJSON() : commandData;
  if (!cmdData || !cmdData.options) {
    return {
      _positional: args,
      get: (name) => args[0] || null,
      getString: (name) => args[0] || null,
      getUser: (name) => null,
      getInteger: (name) => parseInt(args[0]) || null,
      getBoolean: (name) => args[0] === 'true',
      getSubcommand: () => null,
      getSubcommandGroup: () => null,
      validateRequired: () => ({ valid: true, missing: [] }),
    };
  }

  const subcommands = cmdData.options.filter((opt) => opt.type === 1);
  const subcommandGroups = cmdData.options.filter((opt) => opt.type === 2);
  // Commands may mix plain subcommands with subcommand groups (e.g. `todo add` and
  // `todo share create`). Only take the group path when the first argument names a group.
  const firstArg = args[0]?.toLowerCase();
  const matchedGroup = subcommandGroups.find((g) => g.name === firstArg);
  const subcommandGroup = matchedGroup || (subcommands.length === 0 ? subcommandGroups[0] : undefined);
  const hasSubcommands = subcommands.length > 0 && !subcommandGroup;

  let currentArgs = args;
  let optionDefs = [];

  logger.debug(
    `Parsing prefix command: commandName=${cmdData.name}, args=${JSON.stringify(args)}, hasSubcommands=${hasSubcommands}, hasSubcommandGroup=${!!subcommandGroup}, optionsCount=${cmdData.options.length}`,
  );

  if (subcommandGroup) {
    if (args.length > 0) {
      subcommandGroupName = args[0].toLowerCase();
      const group = subcommandGroups.find((g) => g.name === subcommandGroupName);
      if (group && args.length > 1) {
        const literalSubcommand = args[1].toLowerCase();
        subcommandName = group.options?.some((s) => s.name === literalSubcommand)
          ? literalSubcommand
          : resolveSubcommandAlias(args[1]);
        const sub = group.options?.find((s) => s.name === subcommandName);
        if (sub) {
          optionDefs = sub.options?.filter((opt) => opt.type !== 1 && opt.type !== 2) || [];
          currentArgs = args.slice(2);
        } else {
          logger.debug(`Subcommand ${subcommandName} not found in group ${subcommandGroupName}`);
        }
      } else if (!group) {
        logger.debug(`Subcommand group ${subcommandGroupName} not found`);
      }
    }
  } else if (hasSubcommands) {
    if (args.length > 0) {
      // Prefer an exact subcommand name over an alias (e.g. `music stop` must not become `end`).
      const literalSubcommand = args[0].toLowerCase();
      const resolvedSubcommand = subcommands.some((s) => s.name === literalSubcommand)
        ? literalSubcommand
        : resolveSubcommandAlias(args[0]);
      logger.debug(
        `Looking for subcommand: ${resolvedSubcommand}, available: ${subcommands.map((s) => s.name).join(', ')}`,
      );
      const sub = subcommands.find((s) => s.name === resolvedSubcommand);
      if (sub) {
        subcommandName = resolvedSubcommand;
        optionDefs = sub.options?.filter((opt) => opt.type !== 1 && opt.type !== 2) || [];
        currentArgs = args.slice(1);
        logger.debug(`Found subcommand ${subcommandName}, optionDefs: ${optionDefs.length}`);
      } else {
        logger.debug(`Subcommand ${resolvedSubcommand} not found`);
      }
    }
  } else {
    optionDefs = cmdData.options.filter((opt) => opt.type !== 1 && opt.type !== 2);
  }

  for (let i = 0; i < Math.min(currentArgs.length, optionDefs.length); i++) {
    const optionDef = optionDefs[i];
    // The last text option (usually `reason`) takes the rest of the message: `بان @user سبام كتير`.
    const isLastTextOption = i === optionDefs.length - 1 && optionDef.type === 3;
    const value = isLastTextOption ? currentArgs.slice(i).join(' ') : currentArgs[i];
    options[optionDef.name] = value;
  }

  const missing = [];
  // A value that cannot be what the option expects (e.g. `تايم الغداء` instead of a member)
  // is reported like a missing option so the usage line is shown instead of running the command.
  for (const optionDef of optionDefs) {
    const value = options[optionDef.name];
    const pattern = OPTION_VALUE_PATTERNS[optionDef.type];
    if (value !== undefined && pattern && !pattern.test(value)) {
      missing.push({ name: optionDef.name, description: optionDef.description, type: optionDef.type, invalid: true });
      delete options[optionDef.name];
    }
  }
  if (subcommandName || (!hasSubcommands && !subcommandGroup)) {
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

  if ((hasSubcommands || subcommandGroup) && !subcommandName && !subcommandGroupName) {
    const availableSubcommands = hasSubcommands
      ? subcommands.map((s) => s.name).join(',') || 'none'
      : subcommandGroups.map((g) => g.name).join(',') || 'none';
    missing.push({
      name: subcommandGroup ? 'subcommand group' : 'subcommand',
      description: `Available: ${availableSubcommands}`,
      type: 1,
    });
  } else if (hasSubcommands && args.length > 0 && !subcommandName) {
    missing.push({
      name: 'subcommand',
      description: `Available: ${subcommands.map((s) => s.name).join(', ')}`,
      type: 1,
    });
  } else if (subcommandGroup && subcommandGroupName && !subcommandName) {
    const group = subcommandGroups.find((g) => g.name === subcommandGroupName);
    const availableSubcommands = group?.options?.map((s) => s.name).join(',') || 'none';
    missing.push({
      name: 'subcommand',
      description: `Available: ${availableSubcommands}`,
      type: 1,
    });
  }

  return {
    ...options,
    _positional: args,
    get: (name) => options[name] || null,
    getString: (name) => options[name] || null,
    getUser: (name) => options[name] || null,
    getMember: (name) => options[name] || null,
    getChannel: (name) => options[name] || null,
    getRole: (name) => options[name] || null,
    getInteger: (name) => options[name] ? parseInt(options[name]) : null,
    getBoolean: (name) => options[name] === 'true',
    getSubcommand: () => subcommandName,
    getSubcommandGroup: () => subcommandGroupName,
    validateRequired: () => ({
      valid: missing.length === 0,
      missing,
      subcommandName,
      subcommandGroupName,
      optionDefs,
    }),
  };
}
