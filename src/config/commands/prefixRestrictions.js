export const SLASH_ONLY_COMMANDS = new Set(['configwizard', 'help', 'embedbuilder', 'wipedata', 'apply']);
export const GLOBAL_BLOCKED_SUBCOMMANDS = new Set(['dashboard', 'setup']);
export const GLOBAL_BLOCKED_SUBCOMMAND_GROUPS = new Set(['config']);
export const COMMAND_BLOCKED_SUBCOMMANDS = {
  birthday: new Set(['setchannel']),
  report: new Set(['setchannel']),
};
function collectSubcommandNames(commandJson) {
  const group = commandJson.options?.find((option) => option.type === 2);
  if (group) return (group.options || []).flatMap((item) => item.options?.map((option) => option.name) || []);
  return (commandJson.options?.filter((option) => option.type === 1) || []).map((option) => option.name);
}
function isSubcommandBlocked(commandName, subcommandName) {
  return !!subcommandName && (GLOBAL_BLOCKED_SUBCOMMANDS.has(subcommandName) || COMMAND_BLOCKED_SUBCOMMANDS[commandName]?.has(subcommandName));
}
export function getPrefixRestriction(command, args, resolveSubcommandAlias) {
  if (!command?.data?.toJSON) return { blocked: false };
  const commandJson = command.data.toJSON();
  const commandName = commandJson.name?.toLowerCase();
  if (command.prefixOnly === false || command.slashOnly === true || SLASH_ONLY_COMMANDS.has(commandName)) return { blocked: true, reason: 'This command is only available as a slash command.' };
  const [firstArg, secondArg] = args.map((arg) => arg?.toLowerCase?.() || null);
  const resolvedFirstArg = firstArg ? resolveSubcommandAlias(firstArg) : null;
  const resolvedSecondArg = secondArg ? resolveSubcommandAlias(secondArg) : null;
  const group = commandJson.options?.find((option) => option.type === 2);
  const subcommands = collectSubcommandNames(commandJson);
  if (subcommands.length && subcommands.every((name) => isSubcommandBlocked(commandName, name))) return { blocked: true, reason: 'This command is only available as a slash command.' };
  if (firstArg && GLOBAL_BLOCKED_SUBCOMMAND_GROUPS.has(firstArg)) return { blocked: true, reason: 'This configuration flow is only available as a slash command.' };
  if (resolvedFirstArg && isSubcommandBlocked(commandName, resolvedFirstArg)) return { blocked: true, reason: 'This subcommand is only available as a slash command.' };
  if (group && resolvedSecondArg && isSubcommandBlocked(commandName, resolvedSecondArg)) return { blocked: true, reason: 'This subcommand is only available as a slash command.' };
  return { blocked: false };
}
export function isPrefixRestrictedCommand(command, args, resolveSubcommandAlias) { return getPrefixRestriction(command, args, resolveSubcommandAlias).blocked; }
