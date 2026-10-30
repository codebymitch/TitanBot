import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { isServerOwner } from '../../config/serverOwners.js';
import { isHomeGuild } from '../../config/homeGuild.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// Owner-only, our server only: lists every server the bot is in. Hidden (ephemeral) because the bot is public.
export function buildServersList(guilds) {
    const rows = [...guilds]
        .sort((a, b) => b.memberCount - a.memberCount)
        .map((g, i) => `${i + 1}. ${g.name} — ${g.memberCount} عضو — \`${g.id}\``);
    const text = rows.join('\n') || 'مفيش سيرفرات';
    return text.length > 3800 ? `${text.slice(0, 3800)}\n…` : text;
}

export default {
    data: new SlashCommandBuilder()
        .setName('servers')
        .setDescription('Owner only: list the servers the bot is in'),

    async execute(interaction) {
        const reply = (payload) => InteractionHelper.safeReply(interaction, { flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] }, ...payload });
        if (!isHomeGuild(interaction.guildId)) return reply({ content: '❌ الأمر مش متاح هنا.' });
        if (!isServerOwner(interaction.user.id)) return reply({ content: '❌ الأمر ده للأونر بس.' });

        const guilds = [...interaction.client.guilds.cache.values()];
        return reply({ content: `**البوت في ${guilds.length} سيرفر:**\n${buildServersList(guilds)}` });
    },
};
