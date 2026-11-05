export const SLASH_ONLY_COMMANDS = new Set(['configwizard', 'help', 'embedbuilder', 'wipedata', 'apply']);
export const GLOBAL_BLOCKED_SUBCOMMANDS = new Set(['dashboard', 'setup']);
export const GLOBAL_BLOCKED_SUBCOMMAND_GROUPS = new Set(['config']);
export const COMMAND_BLOCKED_SUBCOMMANDS = { birthday: new Set(['setchannel']), report: new Set(['setchannel']) };
function collectSubcommandNames(data) { const group = data.options?.find((option) => option.type === 2); if (group) return (group.options || []).flatMap((item) => item.options?.map((option) => option.name) || []); return (data.options?.filter((option) => option.type === 1) || []).map((option) => option.name); }
function isSubcommandBlocked(command, subcommand) { return !!subcommand && (GLOBAL_BLOCKED_SUBCOMMANDS.has(subcommand) || COMMAND_BLOCKED_SUBCOMMANDS[command]?.has(subcommand)); }
export function getPrefixRestriction(command, args, resolveAlias) {
  if (!command?.data?.toJSON) return { blocked: false };
  const data = command.data.toJSON(); const name = data.name?.toLowerCase();
  if (command.prefixOnly === false || command.slashOnly === true || SLASH_ONLY_COMMANDS.has(name)) return { blocked: true, reason: 'This command is only available as a slash command.' };
  const [first, second] = args.map((arg) => arg?.toLowerCase?.() || null); const resolvedFirst = first ? resolveAlias(first) : null; const resolvedSecond = second ? resolveAlias(second) : null;
  const group = data.options?.find((option) => option.type === 2); const all = collectSubcommandNames(data);
  if (all.length && all.every((sub) => isSubcommandBlocked(name, sub))) return { blocked: true, reason: 'This command is only available as a slash command.' };
  if (first && GLOBAL_BLOCKED_SUBCOMMAND_GROUPS.has(first)) return { blocked: true, reason: 'This configuration flow is only available as a slash command.' };
  if (resolvedFirst && isSubcommandBlocked(name, resolvedFirst)) return { blocked: true, reason: 'This subcommand is only available as a slash command.' };
  if (group && resolvedSecond && isSubcommandBlocked(name, resolvedSecond)) return { blocked: true, reason: 'This subcommand is only available as a slash command.' };
  return { blocked: false };
}
export function isPrefixRestrictedCommand(command, args, resolveAlias) { return getPrefixRestriction(command, args, resolveAlias).blocked; }
