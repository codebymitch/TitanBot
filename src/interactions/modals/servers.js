import { botConfig } from '../../config/botConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

export default {
    name: 'servers-leave-modal',
    async execute(interaction, client) {
        if (!botConfig.commands.owners.includes(interaction.user.id)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Access Denied', 'This action is restricted to the bot owner.')],
                ephemeral: true,
            });
        }

        const serverId = interaction.fields.getTextInputValue('server_id').trim();

        const guild = client.guilds.cache.get(serverId);
        if (!guild) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Server Not Found', `No server with ID \`${serverId}\` was found. The bot may not be in that server.`)],
                ephemeral: true,
            });
        }

        const guildName = guild.name;
        const memberCount = guild.memberCount;

        try {
            await guild.leave();
            logger.info(`Bot left guild "${guildName}" (${serverId}) — requested by owner ${interaction.user.tag}`);

            return InteractionHelper.safeReply(interaction, {
                embeds: [successEmbed('Left Server', `Successfully left **${guildName}** (\`${serverId}\`) — ${memberCount.toLocaleString()} members.`)],
                ephemeral: true,
            });
        } catch (error) {
            logger.error(`Failed to leave guild ${serverId}:`, error);
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Failed to Leave', `Could not leave **${guildName}**. ${error.message}`)],
                ephemeral: true,
            });
        }
    },
};
