import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  MessageFlags,
} from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getFromDb, setInDb } from '../../utils/database.js';

const CONFIG_KEY = (guildId) => `announcement_config_${guildId}`;

async function getConfig(client, guildId) {
  return await getFromDb(CONFIG_KEY(guildId), {
    channelId: null,
    welcomeChannelId: null,
    boostChannelId: null,
    scheduledAnnouncements: [],
  });
}

async function saveConfig(client, guildId, config) {
  await setInDb(CONFIG_KEY(guildId), config);
}

function formatAnnouncementMessage(message) {
  const cleaned = String(message || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !/^[\s\-_=·]{3,}$/.test(line))
    .map(line => line.replace(/^[-*]\s+/, '• '))
    .map(line => line.replace(/·/g, '•'))
    .map(line => line.replace(/\s*—\s*/g, ' — '))
    .map(line => line.replace(/\s{2,}/g, ' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

  return cleaned;
}

function buildAnnouncementEmbed(title, message, color, image) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(formatAnnouncementMessage(message))
    .setColor(color);

  if (image) {
    embed.setImage(image);
  }

  return embed;
}

export default {
  data: new SlashCommandBuilder()
    .setName('announcement')
    .setDescription('Manage server announcements')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    // /announcement setchannel
    .addSubcommand(sub =>
      sub.setName('setchannel')
        .setDescription('Set the channel for announcements')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('The announcement channel')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('type')
            .setDescription('Type of channel to set')
            .setRequired(true)
            .addChoices(
              { name: 'General Announcements', value: 'general' },
              { name: 'Welcome Messages', value: 'welcome' },
              { name: 'Boost Announcements', value: 'boost' },
            )
        )
    )

    // /announcement send
    .addSubcommand(sub =>
      sub.setName('send')
        .setDescription('Send a manual announcement')
        .addStringOption(opt =>
          opt.setName('title').setDescription('Announcement title').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('message').setDescription('Announcement message').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('ping')
            .setDescription('Who to ping')
            .setRequired(false)
            .addChoices(
              { name: '@everyone', value: 'everyone' },
              { name: '@here', value: 'here' },
              { name: 'A specific role', value: 'role' },
              { name: 'No ping', value: 'none' },
            )
        )
        .addRoleOption(opt =>
          opt.setName('role').setDescription('Role to ping (if ping is set to role)').setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('color')
            .setDescription('Embed color')
            .setRequired(false)
            .addChoices(
              { name: 'Blue', value: '0x3498DB' },
              { name: 'Green', value: '0x2ECC71' },
              { name: 'Red', value: '0xE74C3C' },
              { name: 'Gold', value: '0xF1C40F' },
              { name: 'Purple', value: '0x9B59B6' },
              { name: 'White', value: '0xFFFFFF' },
            )
        )
        .addStringOption(opt =>
          opt.setName('image').setDescription('Image URL to attach to the announcement').setRequired(false)
        )
    )

    // /announcement schedule
    .addSubcommand(sub =>
      sub.setName('schedule')
        .setDescription('Schedule a recurring announcement')
        .addStringOption(opt =>
          opt.setName('title').setDescription('Announcement title').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('message').setDescription('Announcement message').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('interval')
            .setDescription('How often to post')
            .setRequired(true)
            .addChoices(
              { name: 'Every hour', value: '0 * * * *' },
              { name: 'Every 6 hours', value: '0 */6 * * *' },
              { name: 'Every 12 hours', value: '0 */12 * * *' },
              { name: 'Daily (9am)', value: '0 9 * * *' },
              { name: 'Weekly (Monday 9am)', value: '0 9 * * 1' },
            )
        )
        .addStringOption(opt =>
          opt.setName('ping')
            .setDescription('Who to ping')
            .setRequired(false)
            .addChoices(
              { name: '@everyone', value: 'everyone' },
              { name: '@here', value: 'here' },
              { name: 'No ping', value: 'none' },
            )
        )
    )

    // /announcement listschedules
    .addSubcommand(sub =>
      sub.setName('listschedules')
        .setDescription('List all scheduled announcements')
    )

    // /announcement deleteschedule
    .addSubcommand(sub =>
      sub.setName('deleteschedule')
        .setDescription('Delete a scheduled announcement')
        .addIntegerOption(opt =>
          opt.setName('id').setDescription('Schedule ID to delete').setRequired(true)
        )
    ),

  category: 'community',

  async execute(interaction, config, client) {
    try {
      const sub = interaction.options.getSubcommand();
      const guildConfig = await getConfig(client, interaction.guild.id);

      if (sub === 'setchannel') {
        const channel = interaction.options.getChannel('channel');
        const type = interaction.options.getString('type');

        if (type === 'general') guildConfig.channelId = channel.id;
        if (type === 'welcome') guildConfig.welcomeChannelId = channel.id;
        if (type === 'boost') guildConfig.boostChannelId = channel.id;

        await saveConfig(client, interaction.guild.id, guildConfig);

        const typeLabel = { general: 'General Announcements', welcome: 'Welcome Messages', boost: 'Boost Announcements' }[type];
        await InteractionHelper.universalReply(interaction, {
          embeds: [successEmbed(`✅ Channel Set`, `**${typeLabel}** will now be posted in <#${channel.id}>`)],
        });

      } else if (sub === 'send') {
        if (!guildConfig.channelId) {
          throw new TitanBotError('No channel set', ErrorTypes.CONFIGURATION, 'Please set an announcement channel first with `/announcement setchannel`.', { subtype: 'missing_channel' });
        }

        const title = interaction.options.getString('title');
        const message = interaction.options.getString('message');
        const ping = interaction.options.getString('ping') || 'none';
        const role = interaction.options.getRole('role');
        const colorStr = interaction.options.getString('color') || '0x3498DB';
        const image = interaction.options.getString('image');

        const channel = interaction.guild.channels.cache.get(guildConfig.channelId)
          || await interaction.guild.channels.fetch(guildConfig.channelId).catch(() => null);

        if (!channel) {
          throw new TitanBotError('Channel not found', ErrorTypes.CONFIGURATION, 'Announcement channel not found. Please set it again with `/announcement setchannel`.', { subtype: 'missing_channel' });
        }

        const embed = buildAnnouncementEmbed(title, message, parseInt(colorStr, 16), image);

        const announcementPayload = { embeds: [embed] };
        if (ping === 'everyone') announcementPayload.content = '@everyone';
        else if (ping === 'here') announcementPayload.content = '@here';
        else if (ping === 'role' && role) announcementPayload.content = `<@&${role.id}>`;

        await channel.send(announcementPayload);

        await InteractionHelper.universalReply(interaction, {
          embeds: [successEmbed('✅ Announcement Sent', `Your announcement has been posted in <#${channel.id}>`)],
          flags: MessageFlags.Ephemeral,
        });

      } else if (sub === 'schedule') {
        if (!guildConfig.channelId) {
          throw new TitanBotError('No channel set', ErrorTypes.CONFIGURATION, 'Please set an announcement channel first with `/announcement setchannel`.', { subtype: 'missing_channel' });
        }

        const title = interaction.options.getString('title');
        const message = interaction.options.getString('message');
        const interval = interaction.options.getString('interval');
        const ping = interaction.options.getString('ping') || 'none';

        const schedule = {
          id: Date.now(),
          title,
          message,
          interval,
          ping,
          channelId: guildConfig.channelId,
          createdBy: interaction.user.id,
          createdAt: new Date().toISOString(),
        };

        if (!guildConfig.scheduledAnnouncements) guildConfig.scheduledAnnouncements = [];
        guildConfig.scheduledAnnouncements.push(schedule);
        await saveConfig(client, interaction.guild.id, guildConfig);

        // Register the cron job
        registerSchedule(client, interaction.guild.id, schedule);

        const intervalLabel = {
          '0 * * * *': 'Every hour',
          '0 */6 * * *': 'Every 6 hours',
          '0 */12 * * *': 'Every 12 hours',
          '0 9 * * *': 'Daily at 9am',
          '0 9 * * 1': 'Weekly on Monday at 9am',
        }[interval];

        await InteractionHelper.universalReply(interaction, {
          embeds: [successEmbed('✅ Schedule Created', `**${title}** will be posted **${intervalLabel}** in <#${guildConfig.channelId}>`)],
        });

      } else if (sub === 'listschedules') {
        const schedules = guildConfig.scheduledAnnouncements || [];

        if (schedules.length === 0) {
          return InteractionHelper.universalReply(interaction, {
            embeds: [new EmbedBuilder().setColor(0x3498DB).setDescription('No scheduled announcements.')],
          });
        }

        const intervalLabels = {
          '0 * * * *': 'Every hour',
          '0 */6 * * *': 'Every 6 hours',
          '0 */12 * * *': 'Every 12 hours',
          '0 9 * * *': 'Daily at 9am',
          '0 9 * * 1': 'Weekly on Monday',
        };

        const embed = new EmbedBuilder()
          .setColor(0x3498DB)
          .setTitle('📅 Scheduled Announcements')
          .setDescription(
            schedules.map(s =>
              `**ID:** \`${s.id}\`\n**Title:** ${s.title}\n**Interval:** ${intervalLabels[s.interval] || s.interval}\n**Channel:** <#${s.channelId}>\n`
            ).join('\n')
          );

        await InteractionHelper.universalReply(interaction, { embeds: [embed] });

      } else if (sub === 'deleteschedule') {
        const id = interaction.options.getInteger('id');
        const schedules = guildConfig.scheduledAnnouncements || [];
        const index = schedules.findIndex(s => s.id === id);

        if (index === -1) {
          throw new TitanBotError('Schedule not found', ErrorTypes.USER_INPUT, `No schedule found with ID \`${id}\`. Use \`/announcement listschedules\` to see all schedules.`, { subtype: 'not_found' });
        }

        schedules.splice(index, 1);
        guildConfig.scheduledAnnouncements = schedules;
        await saveConfig(client, interaction.guild.id, guildConfig);

        await InteractionHelper.universalReply(interaction, {
          embeds: [successEmbed('✅ Schedule Deleted', `Schedule \`${id}\` has been removed.`)],
        });
      }

    } catch (error) {
      logger.error('Announcement command error:', error);
      await handleInteractionError(interaction, error, { subtype: 'announcement_failed' });
    }
  },
};

// Register a cron schedule for an announcement
export async function registerSchedule(client, guildId, schedule) {
  try {
    const { default: cron } = await import('node-cron');
    cron.schedule(schedule.interval, async () => {
      try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;

        const channel = guild.channels.cache.get(schedule.channelId)
          || await guild.channels.fetch(schedule.channelId).catch(() => null);
        if (!channel) return;

        const embed = buildAnnouncementEmbed(`📢 ${schedule.title}`, schedule.message, 0x3498DB)
          .setTimestamp();

        let pingContent = '';
        if (schedule.ping === 'everyone') pingContent = '@everyone';
        else if (schedule.ping === 'here') pingContent = '@here';

        await channel.send({ content: pingContent || undefined, embeds: [embed] });
      } catch (err) {
        logger.error(`Error sending scheduled announcement ${schedule.id}:`, err);
      }
    });
  } catch (err) {
    logger.error('Error registering schedule:', err);
  }
}
