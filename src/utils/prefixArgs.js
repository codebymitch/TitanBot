// Helpers for commands whose prefix form needs multi-word text in a non-final option.
const USER_ARG = /^(?:<@!?\d{17,20}>|\d{17,20})$/u;
const CHANNEL_ARG = /^(?:<#\d{17,20}>)$/u;

export function isUserArg(value) {
  return USER_ARG.test(value || '');
}

export function isChannelArg(value) {
  return CHANNEL_ARG.test(value || '');
}

/** Splits leading member mentions/IDs from the rest: `ID1 ID2 سبب` → ['ID1 ID2', 'سبب']. */
export function groupLeadingUsers(args) {
  let count = 0;
  while (count < args.length && isUserArg(args[count])) count += 1;
  if (count === 0) return args;
  const rest = args.slice(count).join(' ');
  return rest ? [args.slice(0, count).join(' '), rest] : [args.slice(0, count).join(' ')];
}
