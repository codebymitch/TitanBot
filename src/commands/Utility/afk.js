import { SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { setAfk } from '../../services/afkService.js';

// `afk <reason>` / `افك <reason>`: marks you AFK until your next message (see afkService.js).
const MAX_REASON = 200;

export default {
    data: new SlashCommandBuilder()
        .setName('afk')
        .setDescription('Set yourself AFK; people who mention you are told, and it clears when you talk again')
        .addStringOption((option) => option.setName('reason').setDescription('Why you are away').setMaxLength(MAX_REASON).setRequired(false))
        .setDMPermission(false),
    category: 'Utility',

    async execute(interaction, config, client) {
        const reason = (interaction.options.getString('reason') || 'AFK').trim().slice(0, MAX_REASON) || 'AFK';
        const member = interaction.member || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (!member) return;
        await setAfk(client, member, reason);
        await InteractionHelper.safeReply(interaction, {
            content: `💤 ${interaction.user} بقى AFK: ${reason}`,
            allowedMentions: { parse: [] },
        });
    },
};
