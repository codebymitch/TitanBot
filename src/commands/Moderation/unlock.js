import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("unlock")
        .setDescription("Unlock the channel for all roles")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);
        const channel = interaction.channel;
        const guild = interaction.guild;

        try {
            const overwrites = channel.permissionOverwrites.cache;
            const roleIds = [...overwrites.keys(), guild.roles.everyone.id];

            for (const id of roleIds) {
                try {
                    await channel.permissionOverwrites.edit(id, { SendMessages: null });
                } catch (e) {
                    console.log(`Skipping role ${id}:`, e.message);
                }
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed("🔓 Channel unlocked successfully.")],
                flags: MessageFlags.Ephemeral,
            });

        } catch (error) {
            console.error("Critical unlock error:", error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed("Error", "Failed to process unlock command.")],
            });
        }
    }
};
