import { z } from 'zod';
import { createError, ErrorTypes } from './errorHandler.js';

const OptionValueSchema = z.union([
  z.string().max(2000),
  z.number().finite(),
  z.boolean(),
  z.null()
]);

const CommandOptionSchema = z.lazy(() =>
  z.object({
    name: z.string().min(1).max(32),
    type: z.number().int().min(1).max(20),
    value: OptionValueSchema.optional(),
    options: z.array(CommandOptionSchema).max(25).optional()
  })
);

const CommandInputSchema = z.object({
  commandName: z.string().min(1).max(32),
  options: z.array(CommandOptionSchema).max(25)
});

export function validateChatInputPayloadOrThrow(interaction, context = {}) {
  const payload = {
    commandName: interaction?.commandName,
    options: Array.isArray(interaction?.options?.data) ? interaction.options.data : []
  };

  const parsed = CommandInputSchema.safeParse(payload);
  if (parsed.success) {
    return parsed.data;
  }

  throw createError(
    'Invalid command input payload',
    ErrorTypes.VALIDATION,
    'One or more command inputs are invalid. Please review your options and try again.',
    {
      ...context,
      errorCode: 'VALIDATION_FAILED',
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code
      }))
    }
  );
}
