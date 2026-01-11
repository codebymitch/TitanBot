import { Events, EmbedBuilder } from 'discord.js';
import { getReactionRoleMessage, addReactionRole, removeReactionRole } from '../services/reactionRoleService.js';
import { errorEmbed } from '../utils/embeds.js';

/**
 * Handle reaction add events for reaction roles
 * @param {import('discord.js').Client} client - The Discord client
 * @param {import('discord.js').MessageReaction} reaction - The reaction object
 * @param {import('discord.js').User} user - The user who reacted
 * @returns {Promise<void>}
 */
async function handleReactionAdd(client, reaction, user) {
    try {
        // If the reaction is from a bot or in a DM, ignore it
        if (user.bot || !reaction.message.guild) return;

        // Get the message ID and guild ID
        const { message } = reaction;
        const { guild } = message;
        const emoji = reaction.emoji.id || reaction.emoji.name;

        // Get the reaction role message from the database
        const reactionRoleMessage = await getReactionRoleMessage(
            client,
            guild.id,
            message.id
        );

        // If there's no reaction role message for this message, ignore it
        if (!reactionRoleMessage) return;

        // Find the role ID for this emoji
        const roleId = reactionRoleMessage.roles[emoji];
        if (!roleId) return;

        // Get the member and role
        const member = await guild.members.fetch(user.id);
        const role = guild.roles.cache.get(roleId);

        // If the role doesn't exist, remove the reaction role
        if (!role) {
            await removeReactionRole(client, guild.id, message.id, emoji);
            return;
        }

        // Add the role to the member
        await member.roles.add(role);

    } catch (error) {
        console.error('Error in handleReactionAdd:', error);
    }
}

/**
 * Handle reaction remove events for reaction roles
 * @param {import('discord.js').Client} client - The Discord client
 * @param {import('discord.js').MessageReaction} reaction - The reaction object
 * @param {import('discord.js').User} user - The user who removed their reaction
 * @returns {Promise<void>}
 */
async function handleReactionRemove(client, reaction, user) {
    try {
        // If the reaction is from a bot or in a DM, ignore it
        if (user.bot || !reaction.message.guild) return;

        // Get the message ID and guild ID
        const { message } = reaction;
        const { guild } = message;
        const emoji = reaction.emoji.id || reaction.emoji.name;

        // Get the reaction role message from the database
        const reactionRoleMessage = await getReactionRoleMessage(
            client,
            guild.id,
            message.id
        );

        // If there's no reaction role message for this message, ignore it
        if (!reactionRoleMessage) return;

        // Find the role ID for this emoji
        const roleId = reactionRoleMessage.roles[emoji];
        if (!roleId) return;

        // Get the member and role
        const member = await guild.members.fetch(user.id);
        const role = guild.roles.cache.get(roleId);

        // If the role doesn't exist, remove the reaction role
        if (!role) {
            await removeReactionRole(client, guild.id, message.id, emoji);
            return;
        }

        // Remove the role from the member
        await member.roles.remove(role);

    } catch (error) {
        console.error('Error in handleReactionRemove:', error);
    }
}

/**
 * Handle reaction role interactions
 * @param {import('discord.js').Interaction} interaction - The interaction to handle
 * @returns {Promise<boolean>} Whether the interaction was handled
 */
export async function handleReactionRoles(interaction) {
    try {
        if (!interaction.isCommand()) return false;

        const { commandName, options, guild, member } = interaction;

        // Handle reaction role creation
        if (commandName === 'reactionrole') {
            const subcommand = options.getSubcommand();
            
            if (subcommand === 'create') {
                // Check if the user has the required permissions
                if (!member.permissions.has('MANAGE_ROLES')) {
                    await interaction.reply({
                        embeds: [errorEmbed('You need the `Manage Roles` permission to use this command.')],
                        ephemeral: true
                    });
                    return true;
                }

                const messageId = options.getString('message_id');
                const emoji = options.getString('emoji');
                const role = options.getRole('role');

                // Validate the emoji
                let emojiId = emoji;
                const emojiMatch = emoji.match(/<a?:\w+:(\d+)>/);
                if (emojiMatch) {
                    emojiId = emojiMatch[1];
                }

                // Add the reaction role
                await addReactionRole(
                    interaction.client,
                    guild.id,
                    messageId,
                    emojiId,
                    role.id
                );

                // Add the reaction to the message
                try {
                    const channel = interaction.channel;
                    const message = await channel.messages.fetch(messageId);
                    await message.react(emoji);
                } catch (error) {
                    console.error('Error adding reaction to message:', error);
                }

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`✅ Added reaction role for ${emoji} to <@&${role.id}>`)
                            .setColor('#00ff00')
                    ],
                    ephemeral: true
                });

                return true;
            }
        }

        return false;
    } catch (error) {
        console.error('Error in handleReactionRoles:', error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
                embeds: [errorEmbed('An error occurred while processing your request.')],
                ephemeral: true
            });
        } else {
            await interaction.reply({
                embeds: [errorEmbed('An error occurred while processing your request.')],
                ephemeral: true
            });
        }
        return true;
    }
}

/**
 * Set up reaction role event listeners
 * @param {import('discord.js').Client} client - The Discord client
 */
export function setupReactionRoleListeners(client) {
    client.on(Events.MessageReactionAdd, async (reaction, user) => {
        await handleReactionAdd(client, reaction, user);
    });

    client.on(Events.MessageReactionRemove, async (reaction, user) => {
        await handleReactionRemove(client, reaction, user);
    });
}
