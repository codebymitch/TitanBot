import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { AutoresponderService } from '../../services/autoresponderService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('autoresponder')
        .setDescription('Manage automatic responses to trigger words or phrases')
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add a trigger and its response')
                .addStringOption(o =>
                    o.setName('trigger').setDescription('Word or phrase that triggers the response').setRequired(true)
                )
                .addStringOption(o =>
                    o.setName('response').setDescription('What the bot replies (use {user} for a mention)').setRequired(true)
                )
                .addStringOption(o =>
                    o.setName('match')
                        .setDescription('How to match the trigger (default: contains)')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Contains (anywhere in message)', value: 'contains' },
                            { name: 'Exact (whole message only)', value: 'exact' },
                            { name: 'Starts with', value: 'startswith' },
                        )
                )
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove a trigger by its text')
                .addStringOption(o =>
                    o.setName('trigger').setDescription('The trigger text to remove').setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all autoresponders in this server')
        )
        .addSubcommand(sub =>
            sub.setName('clear')
                .setDescription('Remove ALL autoresponders from this server')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    category: 'moderation',

    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction, { ephemeral: true });

        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        try {
            if (sub === 'add') {
                const trigger = interaction.options.getString('trigger').toLowerCase().trim();
                const response = interaction.options.getString('response').trim();
                const matchType = interaction.options.getString('match') ?? 'contains';

                if (trigger.length > 100) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Too Long', 'Trigger must be 100 characters or fewer.')],
                    });
                }
                if (response.length > 500) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Too Long', 'Response must be 500 characters or fewer.')],
                    });
                }

                const result = await AutoresponderService.add(client, guildId, {
                    trigger, response, matchType, createdBy: interaction.user.id,
                });

                if (!result.success) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Failed', result.error || 'Could not add autoresponder.')],
                    });
                }

                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(
                        'Autoresponder Added',
                        `**Trigger:** \`${trigger}\`\n**Response:** ${response}\n**Match:** ${matchType}\n**ID:** \`${result.id}\``,
                    )],
                });
            }

            if (sub === 'remove') {
                const trigger = interaction.options.getString('trigger').toLowerCase().trim();
                const result = await AutoresponderService.remove(client, guildId, trigger);

                if (!result.success) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Not Found', `No autoresponder found for \`${trigger}\`.`)],
                    });
                }

                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed('Autoresponder Removed', `Removed trigger: \`${trigger}\``)],
                });
            }

            if (sub === 'list') {
                const triggers = await AutoresponderService.list(client, guildId);

                if (!triggers.length) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [createEmbed({
                            title: 'Autoresponders',
                            description: 'No autoresponders set up. Use `/autoresponder add` to create one.',
                            color: 'blue',
                        })],
                    });
                }

                const lines = triggers.map((t, i) => {
                    const preview = t.response.length > 60 ? t.response.slice(0, 60) + '…' : t.response;
                    return `**${i + 1}.** \`${t.trigger}\` → ${preview} *(${t.matchType})*`;
                }).join('\n');

                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [createEmbed({
                        title: `Autoresponders (${triggers.length})`,
                        description: lines,
                        color: 'blue',
                    })],
                });
            }

            if (sub === 'clear') {
                await AutoresponderService.clear(client, guildId);
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed('Cleared', 'All autoresponders have been removed.')],
                });
            }
        } catch (error) {
            logger.error('Autoresponder command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Error', 'Something went wrong. Try again later.')],
            });
        }
    },
};
