import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Ticket/claim.js
export default {
    data: new SlashCommandBuilder()
        .setName("claim")
        .setDescription("Claims an open ticket, assigning it to you.")
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers), // Added default permissions

    /**
     * @param {import('discord.js').ChatInputCommandInteraction | import('discord.js').ButtonInteraction} interaction
     * @param {object} guildConfig
     * @param {import('discord.js').Client} client
     */
    async execute(interaction, guildConfig, client) {
        await interaction.deferReply({ ephemeral: true });

        const channel = interaction.channel;
        const guildId = interaction.guildId;
        const userId = interaction.user.id;
        const ticketKey = getTicketKey(guildId, channel.id);

        // --- 1. TICKET VALIDATION ---
        // Ensure channel is a ticket channel (checked via channel topic)
        const ticketOwnerId = isTicketChannel(channel);
        if (!ticketOwnerId) {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Not a Ticket Channel",
                        "This command can only be used in a valid ticket channel.",
                    ),
                ],
            });
        }

        // --- 2. PERMISSION CHECK (Require KickMembers equivalent for staff) ---
        // Permission check is now enforced via setDefaultMemberPermissions, but this is a good runtime check for button/menu use.
        if (
            !interaction.member.permissions.has(PermissionFlagsBits.KickMembers)
        ) {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Permission Denied",
                        "You do not have the required permissions to claim tickets.",
                    ),
                ],
            });
        }

        try {
            const ticketData = await client.db.get(ticketKey, {});

            if (ticketData.claimedBy) {
                // Fetch the user who claimed it
                const currentClaimer = await client.users
                    .fetch(ticketData.claimedBy)
                    .catch(() => "Unknown User");
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Already Claimed",
                            `This ticket has already been claimed by **${currentClaimer.tag || currentClaimer}**.`,
                        ),
                    ],
                });
            }

            // --- 3. APPLY CLAIM & PERSIST DATA ---

            // 💾 Update the database state with the claim information
            const newTicketData = {
                ...ticketData,
                claimedBy: userId, // User ID of the staff member who claimed it
                claimedAt: Date.now(),
                status: "Claimed", // Update status explicitly
            };

            await client.db.set(ticketKey, newTicketData);
            console.log(
                `[DB] Successfully saved claim data for ticket ${channel.name} (${ticketKey}) by ${interaction.user.tag}.`,
            );

            await updateTicketMessage(
                channel,
                true, // isClaimed = true
                interaction.user, // claimer
                false, // isClosed = false
                null, // closer
                ticketData.priority || null, // Pass existing priority, or null
            );

            await interaction.editReply({
                embeds: [
                    successEmbed(
                        "Ticket Claimed!",
                        `You have successfully claimed this ticket. Assisting <@${ticketOwnerId}> now!`,
                    ),
                ],
            });

            // --- 4. LOGGING ---
            const logEmbed = createEmbed(
                "✅ Ticket Claimed (Audit Log)",
                `${interaction.user} claimed ticket ${channel}.`,
            )
                .setColor("#00FF00")
                .addFields(
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
                );

            await logEvent(
                client,
                guildId,
                logEmbed,
                guildConfig,
                channel.id,
                userId,
            );
        } catch (error) {
            console.error(`Error claiming ticket ${channel.id}:`, error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Claim Failed",
                        "Could not claim the ticket due to an internal error. Please check the bot's console for details.",
                    ),
                ],
            });
        }
    },
};
