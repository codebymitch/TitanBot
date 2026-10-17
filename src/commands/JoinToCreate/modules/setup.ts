import { ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { NexoBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { addJoinToCreateTrigger, getJoinToCreateConfig } from '../../../utils/database.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import type { CategoryChannel } from 'discord.js';
import type { SubcommandModule } from '../../../types/index.js';
export default {
    async execute(interaction, config, client) {
        const category = interaction.options.getChannel('category') as CategoryChannel | null;
        const nameTemplate = interaction.options.getString('channel_name') || "Raum von {username}";
        const userLimit = interaction.options.getInteger('user_limit') || 0;
        const bitrate = interaction.options.getInteger('bitrate') || 64;
        const guildId = interaction.guild!.id;

        try {
            const triggerChannel = await interaction.guild!.channels.create({
                name: 'Join-to-Create',
                type: ChannelType.GuildVoice,
                parent: category?.id,
                userLimit: userLimit,
                bitrate: bitrate * 1000,
                permissionOverwrites: [
                    {
                        id: interaction.guild!.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
                    },
                ],
            });

            // categoryId is not part of JoinToCreateChannelOptions (ignored by addJoinToCreateTrigger) but kept as in the JS.
            const triggerOptions = {
                nameTemplate: nameTemplate,
                userLimit: userLimit,
                bitrate: bitrate * 1000,
                categoryId: category?.id
            };
            await addJoinToCreateTrigger(client, guildId, triggerChannel.id, triggerOptions);

            const embed = successEmbed(
                '✅ Join-to-Create eingerichtet',
                `Trigger-Kanal erstellt: ${triggerChannel}\n\n` +
                `**Einstellungen:**\n` +
                `• Namensvorlage für temporäre Kanäle: \`${nameTemplate}\`\n` +
                `• Nutzerlimit: ${userLimit === 0 ? 'Kein Limit' : userLimit + ' Nutzer'}\n` +
                `• Bitrate: ${bitrate} kbps\n` +
                `${category ?`• Kategorie: ${category.name}`: '• Kategorie: Keine (oberste Ebene)'}\n\n` +
                `Wenn Nutzer diesem Kanal beitreten, wird für sie ein temporärer Sprachkanal erstellt.`
            );

            try {
                if (interaction.deferred) {
                    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
                } else {
                    await InteractionHelper.safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
                }
            } catch (responseError) {
                logger.error('Error responding to interaction:', responseError);
                
                try {
                    if (!interaction.replied) {
                        await InteractionHelper.safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
                    }
                } catch (e) {
                    logger.error('All response attempts failed:', e);
                }
            }
        } catch (error) {
            if (error instanceof NexoBotError) {
                throw error;
            }
            logger.error('Error in JoinToCreate setup:', error);
            throw new NexoBotError(
                `Setup failed: ${(error as Error).message}`,
                ErrorTypes.DISCORD_API,
                'Join-to-Create konnte nicht eingerichtet werden.'
            );
        }
    }
} satisfies SubcommandModule;