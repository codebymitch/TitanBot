import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { generateWheelGIF, generateWheelImage, COLOR_PALETTES } from '../wheel-generator.js';

export const data = new SlashCommandBuilder()
  .setName('spin')
  .setDescription('Spin a wheel to pick a random winner')
  .addSubcommand(subcommand =>
    subcommand
      .setName('members')
      .setDescription('Spin with server members')
      .addRoleOption(option =>
        option
          .setName('role')
          .setDescription('Only include members with this role')
          .setRequired(false)
      )
      .addBooleanOption(option =>
        option
          .setName('exclude_bots')
          .setDescription('Exclude bots from the spin (default: true)')
          .setRequired(false)
      )
      .addStringOption(option =>
        option
          .setName('color')
          .setDescription('Color theme for the wheel')
          .setRequired(false)
          .addChoices(
            { name: 'Uplup (Purple/Pink)', value: 'uplup' },
            { name: 'Vibrant', value: 'vibrant' },
            { name: 'Pastel', value: 'pastel' },
            { name: 'Sunset', value: 'sunset' },
            { name: 'Ocean', value: 'ocean' }
          )
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('custom')
      .setDescription('Spin with custom entries')
      .addStringOption(option =>
        option
          .setName('entries')
          .setDescription('Comma-separated list of entries (e.g., "Pizza, Burgers, Tacos")')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('color')
          .setDescription('Color theme for the wheel')
          .setRequired(false)
          .addChoices(
            { name: 'Uplup (Purple/Pink)', value: 'uplup' },
            { name: 'Vibrant', value: 'vibrant' },
            { name: 'Pastel', value: 'pastel' },
            { name: 'Sunset', value: 'sunset' },
            { name: 'Ocean', value: 'ocean' }
          )
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('reactions')
      .setDescription('Spin with users who reacted to a message')
      .addStringOption(option =>
        option
          .setName('message_id')
          .setDescription('The message ID to get reactions from')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('emoji')
          .setDescription('Only count this emoji (default: all reactions)')
          .setRequired(false)
      )
      .addStringOption(option =>
        option
          .setName('color')
          .setDescription('Color theme for the wheel')
          .setRequired(false)
          .addChoices(
            { name: 'Uplup (Purple/Pink)', value: 'uplup' },
            { name: 'Vibrant', value: 'vibrant' },
            { name: 'Pastel', value: 'pastel' },
            { name: 'Sunset', value: 'sunset' },
            { name: 'Ocean', value: 'ocean' }
          )
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('voice')
      .setDescription('Spin with members in a voice channel')
      .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('The voice channel (default: your current channel)')
          .setRequired(false)
      )
      .addStringOption(option =>
        option
          .setName('color')
          .setDescription('Color theme for the wheel')
          .setRequired(false)
          .addChoices(
            { name: 'Uplup (Purple/Pink)', value: 'uplup' },
            { name: 'Vibrant', value: 'vibrant' },
            { name: 'Pastel', value: 'pastel' },
            { name: 'Sunset', value: 'sunset' },
            { name: 'Ocean', value: 'ocean' }
          )
      )
  );

export async function execute(interaction, uplupAPI) {
  // Defer reply - generating GIF takes time
  await interaction.deferReply();

  const subcommand = interaction.options.getSubcommand();
  const colorPalette = interaction.options.getString('color') || 'uplup';
  let entries = [];
  let wheelName = '';

  try {
    switch (subcommand) {
      case 'members': {
        const role = interaction.options.getRole('role');
        const excludeBots = interaction.options.getBoolean('exclude_bots') ?? true;

        // Fetch guild members
        await interaction.guild.members.fetch();
        let members = interaction.guild.members.cache;

        // Filter by role if specified
        if (role) {
          members = members.filter(member => member.roles.cache.has(role.id));
          wheelName = `${role.name} Members`;
        } else {
          wheelName = `${interaction.guild.name} Members`;
        }

        // Exclude bots if specified
        if (excludeBots) {
          members = members.filter(member => !member.user.bot);
        }

        entries = members.map(member => member.displayName);
        break;
      }

      case 'custom': {
        const entriesString = interaction.options.getString('entries');
        entries = entriesString.split(',').map(e => e.trim()).filter(e => e.length > 0);
        wheelName = 'Custom Wheel';
        break;
      }

      case 'reactions': {
        const messageId = interaction.options.getString('message_id');
        const emojiFilter = interaction.options.getString('emoji');

        try {
          const message = await interaction.channel.messages.fetch(messageId);
          const reactions = message.reactions.cache;
          const users = new Set();

          for (const [reactionEmoji, reaction] of reactions) {
            if (emojiFilter && reactionEmoji !== emojiFilter) continue;

            const reactionUsers = await reaction.users.fetch();
            reactionUsers.forEach(user => {
              if (!user.bot) {
                users.add(user.displayName || user.username);
              }
            });
          }

          entries = Array.from(users);
          wheelName = 'Reaction Giveaway';
        } catch (error) {
          await interaction.editReply({
            content: 'Could not find that message. Make sure the message ID is correct and the message is in this channel.'
          });
          return;
        }
        break;
      }

      case 'voice': {
        let voiceChannel = interaction.options.getChannel('channel');

        // If no channel specified, use the user's current voice channel
        if (!voiceChannel) {
          const memberVoiceState = interaction.member.voice;
          if (!memberVoiceState.channel) {
            await interaction.editReply({
              content: 'You must be in a voice channel or specify a channel!'
            });
            return;
          }
          voiceChannel = memberVoiceState.channel;
        }

        // Get members in voice channel
        const voiceMembers = voiceChannel.members.filter(member => !member.user.bot);
        entries = voiceMembers.map(member => member.displayName);
        wheelName = `${voiceChannel.name} Voice`;
        break;
      }
    }

    // Validate entries
    if (entries.length < 2) {
      await interaction.editReply({
        content: 'Need at least 2 entries to spin the wheel!'
      });
      return;
    }

    // Hard cap at 100 for performance (GIF rendering)
    if (entries.length > 100) {
      entries = entries.slice(0, 100);
      wheelName += ' (Limited to 100)';
    }

    // Pick a random winner
    const winnerIndex = Math.floor(Math.random() * entries.length);
    const winner = entries[winnerIndex];

    // Generate the wheel GIF
    const gifBuffer = await generateWheelGIF(entries, {
      winner,
      colorPalette,
      duration: 4000,
      fps: 20,
      spinRevolutions: 4
    });

    // Create attachment
    const attachment = new AttachmentBuilder(gifBuffer, { name: 'wheel-spin.gif' });

    // Create embed with Discord timestamp (shows viewer's local timezone on hover)
    const spinTimestamp = Math.floor(Date.now() / 1000);
    const embed = new EmbedBuilder()
      .setColor(0x6C60D7)
      .setTitle(wheelName)
      .setImage('attachment://wheel-spin.gif')
      .addFields(
        { name: 'Winner', value: `**${winner}**`, inline: true },
        { name: 'Entries', value: `${entries.length}`, inline: true },
        { name: 'Spun at', value: `<t:${spinTimestamp}:f>`, inline: true }
      )
      .setFooter({
        text: 'Powered by Uplup',
        iconURL: 'https://uplup.com/favicon.ico'
      });

    // Log to Uplup API if available (creates a temporary wheel for tracking)
    if (uplupAPI) {
      try {
        const createResponse = await uplupAPI.createWheel(wheelName, entries);
        const wheelId = createResponse.data?.wheel_id;
        if (wheelId) {
          // Clean up temporary wheel
          await uplupAPI.deleteWheel(wheelId);
        }
      } catch (apiError) {
        // Silently fail API logging - don't break the user experience
        console.error('Uplup API logging failed:', apiError.message);
      }
    }

    await interaction.editReply({
      embeds: [embed],
      files: [attachment]
    });

  } catch (error) {
    console.error('Spin command error:', error);
    await interaction.editReply({
      content: `An error occurred: ${error.message}`
    });
  }
}
