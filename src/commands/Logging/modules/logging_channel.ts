import type { Command, SubcommandModule } from '../../../types/index.js';
import { PermissionsBitField, ChannelType, type GuildMember, type TextChannel } from 'discord.js';
import { setLogChannel } from '../../../services/loggingService.js';
import { successEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
const DESTINATION_LABELS: Record<string, string> = {
  audit: 'Audit-Log',
  applications: 'Bewerbungen',
  reports: 'Meldungen',
};

export default {
  prefixOnly: false,
  async execute(interaction, config, client) {
    try {
      if (!(interaction.member as GuildMember).permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Du brauchst die Berechtigung **Server verwalten**, um Log-Kanäle einzustellen.' });
      }

      await InteractionHelper.safeDefer(interaction, { ephemeral: true });

      const destination = interaction.options.getString('destination')!;
      const channel = interaction.options.getChannel('channel');
      const disable = interaction.options.getBoolean('disable') ?? false;

      if (disable) {
        await setLogChannel(client, interaction.guildId!, destination, null);
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(
            'Kanal entfernt',
            `Der Kanal für **${DESTINATION_LABELS[destination]}** wurde entfernt.`,
          )],
        });
      }

      if (!channel || channel.type !== ChannelType.GuildText) {
        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Bitte gib einen gültigen Textkanal an.' });
      }

      const botPerms = (channel as TextChannel).permissionsFor(interaction.guild!.members.me!);
      if (!botPerms?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: `Ich brauche **Kanal ansehen**, **Nachrichten senden** und **Links einbetten** in ${channel}.` });
      }

      await setLogChannel(client, interaction.guildId!, destination, channel.id);

      return InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed(
          'Kanal aktualisiert',
          `Logs für **${DESTINATION_LABELS[destination]}** werden an ${channel} gesendet.\nNutze \`/logging dashboard\`, um Event-Kategorien umzuschalten.`,
        )],
      });
    } catch (error) {
      logger.error('logging_channel error:', error);
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Der Log-Kanal konnte nicht aktualisiert werden.' });
    }
  },
} satisfies SubcommandModule & Pick<Command, 'prefixOnly'>;
