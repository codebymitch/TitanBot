import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { isServerOwner } from '../../config/serverOwners.js';
import { isHomeGuild, HOME_GUILD_ID } from '../../config/homeGuild.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// Owner-only, our server only: makes the bot leave another server by ID. Our own server can never be left this way.
export default {
    data: new SlashCommandBuilder()
        .setName('leaveserver')
        .setDescription('Owner only: make the bot leave a server')
        .addStringOption((o) => o.setName('server_id').setDescription('The server ID').setRequired(true)),

    async execute(interaction) {
        const reply = (payload) => InteractionHelper.safeReply(interaction, { flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] }, ...payload });
        if (!isHomeGuild(interaction.guildId)) return reply({ content: '❌ الأمر مش متاح هنا.' });
        if (!isServerOwner(interaction.user.id)) return reply({ content: '❌ الأمر ده للأونر بس.' });

        const id = interaction.options.getString('server_id').trim();
        if (id === HOME_GUILD_ID) return reply({ content: '❌ مينفعش أطلع من السيرفر ده.' });
        const guild = interaction.client.guilds.cache.get(id);
        if (!guild) return reply({ content: '❌ البوت مش في السيرفر ده.' });

        const name = guild.name;
        await guild.leave();
        return reply({ content: `✅ طلعت من **${name}** (\`${id}\`).` });
    },
};
