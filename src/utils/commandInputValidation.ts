// commandInputValidation.js

import { z } from 'zod';
import { createError, ErrorTypes } from './errorHandler.js';

const OptionValueSchema = z.union([
  z.string().max(2000),
  z.number().finite(),
  z.boolean(),
  z.null()
]);

interface CommandOptionInput {
  name: string;
  type: number;
  value?: z.infer<typeof OptionValueSchema>;
  options?: CommandOptionInput[];
}

const CommandOptionSchema: z.ZodType<CommandOptionInput> = z.lazy(() =>
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

export type CommandInputPayload = z.infer<typeof CommandInputSchema>;

/** Structural view of what is read from a (chat input or mock) interaction. */
interface ChatInputPayloadSource {
  commandName?: string | null;
  options?: { data?: readonly unknown[] } | null;
}

export function validateChatInputPayloadOrThrow(
  interaction: ChatInputPayloadSource | null | undefined,
  context: Record<string, unknown> = {}
): CommandInputPayload {
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
    'Mindestens eine Eingabe ist ungültig. Bitte prüfe deine Optionen und versuch es erneut.',
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
