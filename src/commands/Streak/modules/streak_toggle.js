import { PermissionsBitField, MessageFlags } from 'discord.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { successEmbed, warningEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            const embed = warningEmbed('Akses Ditolak', 'Kamu butuh permission **Manage Server** untuk mengubah pengaturan streak.');
            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        }

        try {
            const guildId = interaction.guildId;
            const guildConfig = await getGuildConfig(client, guildId);
            const streak = guildConfig.streak && typeof guildConfig.streak === 'object'
                ? { ...guildConfig.streak }
                : {};

            const nextEnabled = streak.enabled !== true;
            streak.enabled = nextEnabled;
            guildConfig.streak = streak;
            await setGuildConfig(client, guildId, guildConfig);

            const embed = nextEnabled
                ? successEmbed('Streak Diaktifkan', 'Sistem streak sekarang **aktif** di server ini. Pastikan channel streak sudah di-set lewat `/streak channel` supaya notifikasi bisa dikirim.')
                : warningEmbed('Streak Dimatikan', 'Sistem streak sekarang **nonaktif** di server ini. Streak tidak akan dicatat dan notifikasi tidak akan dikirim.');

            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('streak_toggle error:', error);
            const embed = warningEmbed('Gagal Menyimpan', 'Tidak bisa menyimpan pengaturan streak. Coba lagi nanti.');
            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
