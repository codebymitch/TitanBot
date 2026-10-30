import { SlashCommandBuilder } from 'discord.js';
import { getProfile } from '../../services/cc/ccService.js';
import { CC, formatCC, ccEmbed } from '../../config/cc.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

/** A member's CC balance only (`cc` / `رصيد` and the balance buttons of the games and store panels). */
export async function ccProfileEmbed(client, guildId, target) {
    const { cc } = await getProfile(client, guildId, target.id);
    return ccEmbed(`${CC.emoji} ${CC.name}`, `${target}\n\n💰 الرصيد: ${formatCC(cc)}`, {
        thumbnail: target.displayAvatarURL?.() || null,
    });
}

export default {
    data: new SlashCommandBuilder()
        .setName('cc')
        .setDescription(`Show your ${CC.name} (${CC.short}) or another member's`)
        .setDMPermission(false)
        .addUserOption((option) => option.setName('user').setDescription('Member to check').setRequired(false)),

    async execute(interaction, config, client) {
        const target = interaction.options.getUser('user') || interaction.user;
        if (target.bot) {
            await InteractionHelper.safeReply(interaction, { content: 'البوتات مالهاش CC 🤖' });
            return;
        }

        const embed = await ccProfileEmbed(client, interaction.guildId, target);
        await InteractionHelper.safeReply(interaction, { embeds: [embed], allowedMentions: { parse: [] } });
    },
};
