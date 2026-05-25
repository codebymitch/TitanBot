import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("lock")
        .setDescription("Lock the channel for EVERYONE and all specific roles")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);
        const channel = interaction.channel;
        const guild = interaction.guild;

        try {
            // Lấy tất cả các role/user đang có quyền trong kênh
            const overwrites = channel.permissionOverwrites.cache;

            // Chạy vòng lặp để khóa từng đối tượng một
            const tasks = overwrites.map(o => 
                channel.permissionOverwrites.edit(o.id, { SendMessages: false })
            );

            // Đảm bảo @everyone cũng bị khóa
            tasks.push(channel.permissionOverwrites.edit(guild.roles.everyone.id, { SendMessages: false }));

            await Promise.all(tasks);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed("🔒 Locked: Everyone and specific roles can no longer send messages.")],
                flags: MessageFlags.Ephemeral,
            });

        } catch (error) {
            console.error("Lock error:", error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed("Error", "Failed to lock channel.")],
            });
        }
    }
};
