import { getColor } from '../../config/bot.js';
﻿import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { claimTicket } from '../../services/ticket.js';
import { logEvent } from '../../utils/moderation.js';
export default {
    data: new SlashCommandBuilder()
        .setName("claim")
        .setDescription("Claims an open ticket, assigning it to you.")
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

    async execute(interaction, guildConfig, client) {
const channel = interaction.channel;

        try {
            const result = await claimTicket(channel, interaction.user);
            
            if (!result.success) {
                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "Not a Ticket Channel",
                            result.error || "This command can only be used in a valid ticket channel.",
                        ),
                    ],
                });
            }

            await interaction.editReply({
                embeds: [
                    successEmbed(
                        "Ticket Claimed!",
                        "You have successfully claimed this ticket.",
                    ),
                ],
            });

            const logEmbed = createEmbed({
                title: "✅ Ticket Claimed (Audit Log)",
                description: `${interaction.user} claimed ticket ${channel}.`,
                color: getColor('success'),
                fields: [
                    {
                        name: "Claimed By",
                        value: interaction.user.tag,
                        inline: true,
                    },
                    {
                        name: "Channel",
                        value: channel.toString(),
                        inline: true,
                    },
                ]
            });

            await logEvent({
                client,
                guildId: interaction.guildId,
                event: {
                    action: "Ticket Claimed",
                    target: channel.toString(),
                    executor: interaction.user.toString()
                }
            });

        } catch (error) {
            console.error(`Error claiming ticket ${channel.id}:`, error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Claim Failed",
                        "Could not claim the ticket due to an internal error.",
                    ),
                ],
            });
        }
    },
};



