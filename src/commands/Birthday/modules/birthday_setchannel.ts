import { PermissionsBitField, EmbedBuilder, MessageFlags, type GuildMember } from 'discord.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';
import type { SubcommandModule } from '../../../types/index.js';

export default {
    async execute(interaction, config, client) {
        if (!(interaction.member as GuildMember).permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Keine Berechtigung')
                .setDescription('Du brauchst die Berechtigung **Server verwalten**, um den Geburtstagskanal einzurichten.');
            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        }

        try {
            const channel = interaction.options.getChannel('channel');
            const guildId = interaction.guildId!;
            const guildConfig = await getGuildConfig(client, guildId);

            if (channel) {
                guildConfig.birthdayChannelId = channel.id;
                await setGuildConfig(client, guildId, guildConfig);
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('Geburtstagsankündigungen aktiviert')
                    .setDescription(`Geburtstagsankündigungen werden ab jetzt in ${channel} gepostet.`);
                return InteractionHelper.safeReply(interaction, {
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral,
                });
            } else {
                guildConfig.birthdayChannelId = null;
                await setGuildConfig(client, guildId, guildConfig);
                const embed = new EmbedBuilder()
                    .setColor(0xFFFF00)
                    .setTitle('Geburtstagsankündigungen deaktiviert')
                    .setDescription('Kein Kanal angegeben – Geburtstagsankündigungen wurden deaktiviert.');
                return InteractionHelper.safeReply(interaction, {
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral,
                });
            }
        } catch (error) {
            logger.error('birthday_setchannel error:', error);
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('⚠️ Konfigurationsfehler')
                .setDescription('Die Einstellung für den Geburtstagskanal konnte nicht gespeichert werden.');
            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
} satisfies SubcommandModule;