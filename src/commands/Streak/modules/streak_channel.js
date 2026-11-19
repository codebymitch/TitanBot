import { PermissionsBitField, MessageFlags } from 'discord.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { successEmbed, warningEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            const embed = warningEmbed('Akses Ditolak', 'Kamu butuh permission **Manage Server** untuk mengubah channel streak.');
            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        }

        try {
            const guildId = interaction.guildId;
            const channel = interaction.options.getChannel('channel');
            const guildConfig = await getGuildConfig(client, guildId);
            const streak = guildConfig.streak && typeof guildConfig.streak === 'object'
                ? { ...guildConfig.streak }
                : {};

            streak.channelId = channel ? channel.id : null;
            guildConfig.streak = streak;
            await setGuildConfig(client, guildId, guildConfig);

            const embed = channel
                ? successEmbed('Channel Streak Di-set', `Notifikasi streak sekarang dikirim ke ${channel}.`)
                : warningEmbed('Channel Streak Dihapus', 'Channel streak sudah dihapus. Notifikasi tidak akan dikirim sampai channel baru di-set.');

            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('streak_channel error:', error);
            const embed = warningEmbed('Gagal Menyimpan', 'Tidak bisa menyimpan channel streak. Coba lagi nanti.');
            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
