import { logger } from '../utils/logger.js';

export const botConfig = {
  // =========================
  // BOT PRESENCE (what users see under the bot name)
  // =========================
  // `status` options:
  // - "online"    = green dot
  // - "idle"      = yellow moon
  // - "dnd"       = red do-not-disturb
  // - "invisible" = appears offline
  presence: {
    // Current online state shown on Discord.
    status: "online",

    // Activity lines shown under the bot name.
    // `type` number mapping from Discord:
    // 0 = Playing
    // 1 = Streaming
    // 2 = Listening
    // 3 = Watching
    // 4 = Custom
    // 5 = Competing
    activities: [
      {
        name: "Custom Status", // required by Discord API, not shown in the client
        state: "stalking",     // this is what people actually see
        type: 4,               // Custom
      },
    ],
  },

  // =========================
  // COMMAND BEHAVIOR
  // =========================
  commands: {
    // Bot owner user IDs (comma-separated in OWNER_IDS env var).
    // Owners can access owner/admin-level bot commands.
    owners: process.env.OWNER_IDS?.split(",").map((id) => id.trim()).filter(Boolean) || [],

    // Default wait time between command uses (in seconds).
    defaultCooldown: 3,

    // If true, old commands are removed before re-registering.
    deleteCommands: false,

    // Optional server ID retained for tutorial compatibility; not used for command registration.
    testGuildId: process.env.TEST_GUILD_ID,

    // When true (or MAINTENANCE_MODE=true), only bot owners can run commands.
    maintenanceMode: process.env.MAINTENANCE_MODE === "true",

    // Command prefix for text-based commands (e.g., "!" for "!ping").
    // Supports both slash commands and prefix commands.
    prefix: process.env.PREFIX || "!",
  },

  // =========================
  // APPLICATIONS SYSTEM
  // =========================
  applications: {
    // Default questions shown when someone fills out an application.
    defaultQuestions: [
      { question: "What is your name?", required: true },
      { question: "How old are you?", required: true },
      { question: "Why do you want to join?", required: true },
    ],

    // Embed colors by application status.
    statusColors: {
      pending: "#FFA500",
      approved: "#00FF00",
      denied: "#FF0000",
    },

    // How long users must wait before submitting another application (hours).
    applicationCooldown: 24,

    // Auto-delete denied applications after this many days.
    deleteDeniedAfter: 7,

    // Auto-delete approved applications after this many days.
    deleteApprovedAfter: 30,

    // Role IDs allowed to manage applications.
    managerRoles: [], // Will be populated from environment or database
  },

  // =========================
  // EMBED COLORS & BRANDING
  // =========================
  // IMPORTANT: This is the SINGLE SOURCE OF TRUTH for all bot colors
  embeds: {
    colors: {
      // Main brand colors.
      primary: "#336699",
      secondary: "#2F3136",

      // Standard status colors for success/error/warning/info messages.
      success: "#57F287",
      error: "#ED4245",
      warning: "#FEE75C",
      info: "#3498DB",

      // Neutral utility colors.
      light: "#FFFFFF",
      dark: "#202225",
      gray: "#99AAB5",

      // Discord-style palette shortcuts.
      blurple: "#5865F2",
      green: "#57F287",
      yellow: "#FEE75C",
      fuchsia: "#EB459E",
      red: "#ED4245",
      black: "#000000",

      // Feature-specific colors.
      giveaway: {
        active: "#57F287",
        ended: "#ED4245",
      },
      ticket: {
        open: "#57F287",
        claimed: "#FAA61A",
        closed: "#ED4245",
        pending: "#99AAB5",
      },
      economy: "#F1C40F",
      birthday: "#E91E63",
      moderation: "#9B59B6",

      // Ticket priority color mapping.
      priority: {
        none: "#95A5A6",
        low: "#3498db",
        medium: "#2ecc71",
        high: "#f1c40f",
        urgent: "#e74c3c",
      },
    },
    footer: {
      // Default footer text used in bot embeds.
      text: "Titan Bot",
      // Footer icon URL (null = no icon).
      icon: null,
    },
    // Default thumbnail URL for embeds (null = no thumbnail).
    thumbnail: null,
    author: {
      // Optional default embed author block.
      name: null,
      icon: null,
      url: null,
    },
  },

  // =========================
  // ECONOMY SETTINGS
  // =========================
  economy: {
    currency: {
      // Currency display name.
      name: "coins",
      // Plural display name.
      namePlural: "coins",
      // Currency symbol shown in balances.
      symbol: "$",
    },

    // Starting balance for new users.
    startingBalance: 0,

    // Maximum bank amount before upgrades (if upgrades are used).
    baseBankCapacity: 100000,

    // Daily reward amount.
    dailyAmount: 100,

    // Work command random payout range.
    workMin: 10,
    workMax: 100,

    // Beg command random payout range.
    begMin: 5,
    begMax: 50,

    // Command cooldowns (milliseconds).
    cooldowns: {
      daily: 24 * 60 * 60 * 1000,
      work: 60 * 60 * 1000,
      crime: 2 * 60 * 60 * 1000,
      rob: 4 * 60 * 60 * 1000,
    },

    // Chance to succeed when robbing (0.4 = 40%).
    robSuccessRate: 0.4,

    // Jail time after failed rob (milliseconds).
    // 3600000 = 1 hour.
    robFailJailTime: 3600000,
  },

  // =========================
  // SHOP SETTINGS
  // =========================
  // Add shop defaults here when needed.
  shop: {

  },

  // =========================
  // TICKET SYSTEM
  // =========================
  tickets: {
    // Category ID where new tickets are created (null = no forced category).
    defaultCategory: null,

    // Role IDs allowed to manage/support tickets.
    supportRoles: [],

    // Priority options users/staff can assign.
    priorities: {
      none: {
        emoji: "⚪",
        color: "#95A5A6",
        label: "None",
      },
      low: {
        emoji: "🟢",
        color: "#2ECC71",
        label: "Low",
      },
      medium: {
        emoji: "🟡",
        color: "#F1C40F",
        label: "Medium",
      },
      high: {
        emoji: "🔴",
        color: "#E74C3C",
        label: "High",
      },
      urgent: {
        emoji: "🚨",
        color: "#E91E63",
        label: "Urgent",
      },
    },

    // Default priority for new tickets.
    defaultPriority: "none",

    // Category ID where closed tickets are archived.
    archiveCategory: null,

    // Channel ID where ticket logs are sent.
    logChannel: null,
  },

  // =========================
  // GIVEAWAY SETTINGS
  // =========================
  giveaways: {
    // Default giveaway duration in milliseconds.
    // 86400000 = 24 hours.
    defaultDuration: 86400000,

    // Allowed winner count range.
    minimumWinners: 1,
    maximumWinners: 10,

    // Allowed giveaway duration range in milliseconds.
    // 300000 = 5 minutes.
    minimumDuration: 300000,
    // 2592000000 = 30 days.
    maximumDuration: 2592000000,

    // Role IDs allowed to host giveaways.
    allowedRoles: [],

    // Role IDs that bypass giveaway restrictions.
    bypassRoles: [],
  },

  // =========================
  // BIRTHDAY SETTINGS
  // =========================
  birthday: {
    // Role ID given to users on their birthday.
    defaultRole: null,

    // Channel ID where birthday announcements are posted.
    announcementChannel: null,

    // Timezone used to calculate birthday dates.
    timezone: "UTC",
  },

  // =========================
  // VERIFICATION SETTINGS
  // =========================
  verification: {
    // Message shown when posting the verification panel.
    defaultMessage: "Click the button below to verify yourself and gain access to the server!",

    // Text on the verification button.
    defaultButtonText: "Verify",

    // Automatic verification behavior.
    autoVerify: {
      // How automatic verification decides who is auto-approved:
      // - "none"        = everyone is auto-verified immediately
      // - "account_age" = account must be older than set days
      // - "server_size" = auto-verify everyone only in smaller servers
      defaultCriteria: "none",

      // Days used when `defaultCriteria` is `account_age`.
      defaultAccountAgeDays: 7,

      // Member count threshold used when `defaultCriteria` is `server_size`.
      // Example: 1000 means auto-verify if server has fewer than 1000 members.
      serverSizeThreshold: 1000,

      // Allowed safety limits for account-age requirements.
      // 1 = minimum day, 365 = maximum days.
      minAccountAge: 1,
      maxAccountAge: 365,

      // If true, user receives a DM after verification.
      sendDMNotification: true,

      // Human-readable descriptions for each criteria mode.
      criteria: {
        account_age: "Account must be older than specified days",
        server_size: "All users if server has less than 1000 members",
        none: "All users immediately"
      }
    },

    // Minimum time between verification attempts (milliseconds).
    // 5000 = 5 seconds.
    verificationCooldown: 5000,

    // Maximum failed attempts allowed inside the time window below.
    maxVerificationAttempts: 3,

    // Time window for counting attempts (milliseconds).
    // 60000 = 1 minute.
    attemptWindow: 60000,

    // In-memory safety limits (helps avoid unbounded memory growth).
    maxCooldownEntries: 10000,
    maxAttemptEntries: 10000,
    // Cleanup frequency for cooldown/attempt maps (milliseconds).
    // 300000 = 5 minutes.
    cooldownCleanupInterval: 300000,
    // Maximum metadata payload size for audit entries (bytes).
    maxAuditMetadataBytes: 4096,
    // Maximum number of audit entries kept in memory.
    maxInMemoryAuditEntries: 1000,
    // If true, log every verification action.
    logAllVerifications: true,
    // If true, preserve verification audit history.
    keepAuditTrail: true,
  },

  // =========================
  // WELCOME / GOODBYE MESSAGES
  // =========================
  welcome: {
    // Welcome template posted when a user joins.
    // Placeholders: {user}, {server}, {memberCount}
    defaultWelcomeMessage:
      "Welcome {user} to {server}! We now have {memberCount} members!",
    // Goodbye template posted when a user leaves.
    // Placeholders: {user}, {memberCount}
    defaultGoodbyeMessage:
      "{user} has left the server. We now have {memberCount} members.",
    // Channel ID for welcome messages.
    defaultWelcomeChannel: null,
    // Channel ID for goodbye messages.
    defaultGoodbyeChannel: null,
  },

  // =========================
  // COUNTER CHANNELS
  // =========================
  counters: {
    defaults: {
      // Default naming/description templates for counter entries.
      name: "{name} Counter",
      description: "Server {name} counter",
      // Channel type used for counters (typically "voice").
      type: "voice",
      // Channel name format. `{count}` is replaced automatically.
      channelName: "{name}-{count}",
    },
    permissions: {
      // Default denied permissions for the counter channel.
      deny: ["VIEW_CHANNEL"],
      // Default allowed permissions for the counter channel.
      allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK"],
    },
    messages: {
      // Default response messages for counter actions.
      created: "✅ Created counter **{name}**",
      deleted: "🗑️ Deleted counter **{name}**",
      updated: "🔄 Updated counter **{name}**",
    },
    types: {
      // Built-in counter types and how each count is calculated.
      members: {
        name: "👥 Members",
        description: "Total members in the server",
        getCount: (guild) => guild.memberCount.toString(),
      },
      bots: {
        name: "🤖 Bots",
        description: "Total bot accounts in the server",
        getCount: (guild) =>
          guild.members.cache.filter((m) => m.user.bot).size.toString(),
      },
      members_only: {
        name: "👤 Humans",
        description: "Total human members (non-bots)",
        getCount: (guild) =>
          guild.members.cache.filter((m) => !m.user.bot).size.toString(),
      },
    },
  },

  // =========================
  // GENERIC BOT MESSAGES
  // =========================
  messages: {
    noPermission: "You do not have permission to use this command.",
    cooldownActive: "Please wait {time} before using this command again.",
    errorOccurred: "An error occurred while executing this command.",
    missingPermissions:
      "I am missing required permissions to perform this action.",
    commandDisabled: "This command has been disabled.",
    maintenanceMode: "The bot is currently in maintenance mode.",
  },

  // =========================
  // FEATURE TOGGLES
  // =========================
  // Set any feature to `false` to disable it globally.
  features: {
    // Core systems.
    economy: true,
    leveling: true,
    moderation: true,
    logging: true,
    welcome: true,

    // Community engagement systems.
    tickets: true,
    giveaways: true,
    birthday: true,
    counter: true,

    // Security and self-service systems.
    verification: true,
    reactionRoles: true,
    joinToCreate: true,

    // Utility/quality-of-life modules.
    voice: true,
    search: true,
    tools: true,
    utility: true,
    community: true,
    fun: true,
    music: true,
  },
};

export function validateConfig(config) {
  const errors = [];

  if (process.env.NODE_ENV !== 'production') {
    logger.debug('Environment variables check:');
    logger.debug('DISCORD_TOKEN exists:', !!process.env.DISCORD_TOKEN);
    logger.debug('TOKEN exists:', !!process.env.TOKEN);
    logger.debug('CLIENT_ID exists:', !!process.env.CLIENT_ID);
    logger.debug('GUILD_ID exists:', !!process.env.GUILD_ID);
    logger.debug('POSTGRES_HOST exists:', !!process.env.POSTGRES_HOST);
    logger.debug('NODE_ENV:', process.env.NODE_ENV);
  }

  if (!process.env.DISCORD_TOKEN && !process.env.TOKEN) {
    errors.push("Bot token is required (DISCORD_TOKEN or TOKEN environment variable)");
  }

  if (!process.env.CLIENT_ID) {
    errors.push("Client ID is required (CLIENT_ID environment variable)");
  }

  if (process.env.NODE_ENV === 'production') {
    // A full connection URL (DATABASE_URL / POSTGRES_URL) satisfies all Postgres
    // requirements, matching how src/config/database/postgres.js resolves the pool config.
    const hasConnectionUrl = Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);

    if (!hasConnectionUrl) {
      if (!process.env.POSTGRES_HOST) {
        errors.push("PostgreSQL connection is required in production (set DATABASE_URL/POSTGRES_URL, or POSTGRES_HOST)");
      }
      if (!process.env.POSTGRES_USER) {
        import {
    Client, GatewayIntentBits, EmbedBuilder, Events,
    TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ChannelType, PermissionFlagsBits
} from "discord.js";
import chalk from "chalk";
import ora from "ora";
import dotenv from "dotenv";

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const spinner = ora(chalk.bold("جاري الاتصال بديسكورد...")).start();

try {
    await client.login(process.env.TOKEN);
} catch (error) {
    spinner.fail(chalk.red("فشل تسجيل الدخول إلى ديسكورد"));
    console.error(chalk.red("تفاصيل الخطأ:"), error);
    process.exit(1);
}

client.once(Events.ClientReady, async (client) => {

    spinner.succeed(chalk.green(`تم تسجيل الدخول باسم ${client.user.tag}`));

    await client.application?.commands.set([

        { name: "help", description: "Show all bot commands" },
        { name: "ping", description: "Check bot response speed" },

        // Quran
        { name: "verse", description: "Show a random verse from the Holy Quran" },
        {
            name: "surah", description: "Show a verse from a specific surah",
            options: [
                { name: "surah_number", description: "Surah number (1-114)", type: 4, required: true, min_value: 1, max_value: 114 },
                { name: "verse_number", description: "Verse number (optional)", type: 4, required: false, min_value: 1 }
            ]
        },

        // Administration
        {
            name: "setup", description: "Setup the bot in the server",
            options: [{ name: "channel", description: "القناة الرئيسية للبوت", type: 7, required: true }]
        },
        {
            name: "config", description: "Edit bot settings",
            options: [{
                name: "language", description: "لغة البوت", type: 3, required: false,
                choices: [{ name: "العربية", value: "ar" }, { name: "English", value: "en" }]
            }]
        },

        // Moderation
        {
            name: "ban", description: "Ban a member from the server",
            options: [
                { name: "user", description: "العضو المراد حظره", type: 6, required: true },
                { name: "reason", description: "سبب الحظر", type: 3, required: false }
            ]
        },
        {
            name: "kick", description: "Kick a member from the server",
            options: [
                { name: "user", description: "العضو المراد طرده", type: 6, required: true },
                { name: "reason", description: "سبب الطرد", type: 3, required: false }
            ]
        },
        {
            name: "mute", description: "Mute a member",
            options: [
                { name: "user", description: "العضو المراد إسكاته", type: 6, required: true },
                { name: "duration", description: "المدة بالدقائق", type: 4, required: false, min_value: 1, max_value: 1440 },
                { name: "reason", description: "سبب الإسكات", type: 3, required: false }
            ]
        },
        {
            name: "unmute", description: "Remove mute from a member",
            options: [{ name: "user", description: "العضو المراد رفع الإسكات عنه", type: 6, required: true }]
        },
        {
            name: "warn", description: "Give a warning to a member",
            options: [
                { name: "user", description: "العضو المراد تحذيره", type: 6, required: true },
                { name: "reason", description: "سبب التحذير", type: 3, required: false }
            ]
        },
        {
            name: "clear", description: "Delete messages",
            options: [{ name: "amount", description: "عدد الرسائل (1-100)", type: 4, required: true, min_value: 1, max_value: 100 }]
        },
        {
            name: "unban", description: "Unban a user",
            options: [{ name: "user_id", description: "معرف المستخدم المراد رفع حظره", type: 3, required: true }]
        },

        // Tickets
        { name: "ticket", description: "إرسال لوحة التذاكر في قناة #🧾tiket" },

        // Giveaway
        {
            name: "giveaway", description: "Create a Giveaway",
            options: [
                { name: "prize", description: "الجائزة", type: 3, required: true },
                { name: "duration", description: "المدة بالدقائق", type: 4, required: true, min_value: 1 },
                { name: "winners", description: "عدد الفائزين", type: 4, required: false, min_value: 1, max_value: 20 }
            ]
        },

        // Events
        {
            name: "event", description: "Create a new event",
            options: [
                { name: "title", description: "عنوان الحدث", type: 3, required: true },
                { name: "description", description: "وصف الحدث", type: 3, required: true },
                { name: "date", description: "تاريخ الحدث (مثال: 2024-12-25)", type: 3, required: false }
            ]
        },

        // Levels
        {
            name: "rank", description: "Show member level",
            options: [{ name: "user", description: "العضو (اختياري)", type: 6, required: false }]
        },

        // Economy
        {
            name: "balance", description: "Show balance",
            options: [{ name: "user", description: "العضو (اختياري)", type: 6, required: false }]
        },

        // Music
        {
            name: "play", description: "Play a song",
            options: [{ name: "song", description: "اسم الأغنية أو الرابط", type: 3, required: true }]
        },

        { name: "meme", description: "Send a meme image" },

        // Info
        {
            name: "userinfo", description: "Show member information",
            options: [{ name: "user", description: "العضو (اختياري)", type: 6, required: false }]
        },
        { name: "serverinfo", description: "Show server information" },

        // Welcome
        {
            name: "welcome", description: "Setup welcome message",
            options: [
                { name: "channel", description: "قناة الترحيب", type: 7, required: true },
                { name: "message", description: "رسالة الترحيب (استخدم {user})", type: 3, required: false }
            ]
        },

        // Reaction Roles
        {
            name: "reactionroles", description: "Create roles via reaction",
            options: [
                { name: "channel", description: "القناة لإرسال الرسالة فيها", type: 7, required: true },
                { name: "message", description: "نص الرسالة", type: 3, required: true }
            ]
        },

        // Suggestions
        {
            name: "suggest", description: "Send a suggestion",
            options: [{ name: "text", description: "نص الاقتراح", type: 3, required: true }]
        },

        // Polls
        {
            name: "poll", description: "Create a poll",
            options: [{ name: "question", description: "سؤال التصويت", type: 3, required: true }]
        },

        // Logs
        {
            name: "logs", description: "Setup server logs",
            options: [
                { name: "channel", description: "قناة السجلات", type: 7, required: true },
                {
                    name: "type", description: "نوع السجلات", type: 3, required: false,
                    choices: [
                        { name: "الكل", value: "all" },
                        { name: "الدخول والخروج", value: "joins" },
                        { name: "الرسائل", value: "messages" },
                        { name: "المودريشن", value: "moderation" }
                    ]
                }
            ]
        },

        { name: "dashboard", description: "Open the control panel" }

    ]);

    console.log(chalk.green("✓ تم تحميل أوامر السلاش بنجاح"));
});

// ─────────────────────────────────────────────
//  INTERACTIONS
// ─────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {

    // ── Buttons ──
    if (interaction.isButton()) {

        // زر إنشاء تذكرة
        if (interaction.customId === "create_ticket") {
            const guild = interaction.guild!;
            const member = interaction.member!;
            const userId = interaction.user.id;

            const existing = guild.channels.cache.find(
                c => c.name === `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, "")}` ||
                     c.topic === `ticket:${userId}`
            );
            if (existing) {
                return await interaction.reply({
                    content: `❌ لديك تذكرة مفتوحة بالفعل: ${existing}`,
                    flags: 64
                });
            }

            try {
                const ticketChannel = await guild.channels.create({
                    name: `🎫・${interaction.user.username}`,
                    type: ChannelType.GuildText,
                    topic: `ticket:${userId}`,
                    permissionOverwrites: [
                        {
                            id: guild.roles.everyone.id,
                            deny: [PermissionFlagsBits.ViewChannel]
                        },
                        {
                            id: userId,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ReadMessageHistory
                            ]
                        },
                        {
                            id: client.user!.id,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ManageChannels
                            ]
                        }
                    ]
                });

                const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId("close_ticket")
                        .setLabel("🔒 إغلاق التذكرة")
                        .setStyle(ButtonStyle.Danger)
                );

                const ticketEmbed = new EmbedBuilder()
                    .setTitle("🎫 تذكرة دعم جديدة")
                    .setDescription(
`مرحباً ${interaction.user} 👋

شكراً على تواصلك معنا.
يرجى شرح مشكلتك بالتفصيل وسيرد عليك أحد المشرفين في أقرب وقت.

للإغلاق اضغط على الزر أدناه.`
                    )
                    .setColor("Green")
                    .setFooter({ text: `Tickets System | ${guild.name}` })
                    .setTimestamp();

                await ticketChannel.send({
                    content: `${interaction.user}`,
                    embeds: [ticketEmbed],
                    components: [closeRow]
                });

                await interaction.reply({
                    content: `✅ تم إنشاء تذكرتك: ${ticketChannel}`,
                    flags: 64
                });

            } catch (err) {
                console.error(err);
                await interaction.reply({
                    content: "❌ فشل إنشاء التذكرة. تأكد من أن البوت لديه صلاحية إدارة القنوات.",
                    flags: 64
                });
            }
        }

        // زر إغلاق التذكرة
        if (interaction.customId === "close_ticket") {
            const channel = interaction.channel as TextChannel;

            const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId("confirm_close")
                    .setLabel("✅ تأكيد الإغلاق")
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId("cancel_close")
                    .setLabel("❌ إلغاء")
                    .setStyle(ButtonStyle.Secondary)
            );

            await interaction.reply({
                content: "هل أنت متأكد من إغلاق هذه التذكرة؟",
                components: [confirmRow],
                flags: 64
            });
        }

        // تأكيد الإغلاق
        if (interaction.customId === "confirm_close") {
            const channel = interaction.channel as TextChannel;
            await interaction.reply({ content: "🔒 جاري إغلاق التذكرة..." });
            setTimeout(() => channel.delete().catch(() => null), 3000);
        }

        // إلغاء الإغلاق
        if (interaction.customId === "cancel_close") {
            await interaction.reply({ content: "✅ تم إلغاء الإغلاق.", flags: 64 });
        }

        return;
    }

    // ── Slash Commands ──
    if (!interaction.isChatInputCommand()) return;

    const cmd = interaction.commandName;

    // ── ping ──
    if (cmd === "ping") {
        await interaction.reply({ content: `🏓 البينق: ${client.ws.ping}ms` });
    }

    // ── help ──
    else if (cmd === "help") {
        const embed = new EmbedBuilder()
            .setTitle("📚 أوامر البوت")
            .setDescription(
`📖 **القرآن الكريم**
\`/verse\` — آية عشوائية
\`/surah\` — آية من سورة محددة

⚙️ **الإدارة**
\`/setup\` — إعداد البوت
\`/config\` — تعديل الإعدادات

👮 **المودريشن**
\`/ban\` — حظر عضو
\`/unban\` — رفع الحظر
\`/kick\` — طرد عضو
\`/mute\` — إسكات عضو
\`/unmute\` — رفع الإسكات
\`/warn\` — تحذير عضو
\`/clear\` — حذف رسائل

🎉 **الجيف أواي**
\`/giveaway\` — إنشاء مسابقة

📅 **الأحداث**
\`/event\` — إنشاء حدث

🎫 **التذاكر**
\`/ticket\` — إرسال لوحة التذاكر

⭐ **المستويات**
\`/rank\` — عرض المستوى

💰 **الاقتصاد**
\`/balance\` — عرض الرصيد

🎵 **الموسيقى**
\`/play\` — تشغيل أغنية

😀 **الترفيه**
\`/meme\` — صورة ميم

🛠️ **الأدوات**
\`/userinfo\` — معلومات عضو
\`/serverinfo\` — معلومات السيرفر
\`/welcome\` — إعداد الترحيب
\`/reactionroles\` — رتب التفاعل
\`/suggest\` — إرسال اقتراح
\`/poll\` — إنشاء تصويت
\`/logs\` — إعداد السجلات
\`/dashboard\` — لوحة التحكم`
            )
            .setColor("Blue");
        await interaction.reply({ embeds: [embed] });
    }

    // ── verse ──
    else if (cmd === "verse") {
        await interaction.deferReply();
        try {
            const surah = Math.floor(Math.random() * 114) + 1;
            const infoRes = await fetch(`https://api.alquran.cloud/v1/surah/${surah}`);
            const infoData = await infoRes.json() as any;
            const totalAyahs = infoData.data.numberOfAyahs;
            const ayah = Math.floor(Math.random() * totalAyahs) + 1;
            const res = await fetch(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/ar.alafasy`);
            const data = await res.json() as any;
            const v = data.data;
            const embed = new EmbedBuilder()
                .setTitle(`📖 ${v.surah.name} — الآية ${v.numberInSurah}`)
                .setDescription(`\`\`\`${v.text}\`\`\``)
                .setFooter({ text: `سورة ${v.surah.name} • الجزء ${v.juz}` })
                .setColor(0x1DB954);
            await interaction.editReply({ embeds: [embed] });
        } catch {
            await interaction.editReply({ content: "❌ حدث خطأ أثناء جلب الآية، حاول مرة أخرى." });
        }
    }

    // ── surah ──
    else if (cmd === "surah") {
        await interaction.deferReply();
        try {
            const surahNum = interaction.options.getInteger("surah_number", true);
            const ayahNum = interaction.options.getInteger("verse_number");
            let ayahRef: string;
            if (ayahNum) {
                ayahRef = `${surahNum}:${ayahNum}`;
            } else {
                const infoRes = await fetch(`https://api.alquran.cloud/v1/surah/${surahNum}`);
                const infoData = await infoRes.json() as any;
                const total = infoData.data.numberOfAyahs;
                ayahRef = `${surahNum}:${Math.floor(Math.random() * total) + 1}`;
            }
            const res = await fetch(`https://api.alquran.cloud/v1/ayah/${ayahRef}/ar.alafasy`);
            const data = await res.json() as any;
            const v = data.data;
            const embed = new EmbedBuilder()
                .setTitle(`📖 ${v.surah.name} — الآية ${v.numberInSurah}`)
                .setDescription(`\`\`\`${v.text}\`\`\``)
                .setFooter({ text: `سورة ${v.surah.name} • الجزء ${v.juz}` })
                .setColor(0x1DB954);
            await interaction.editReply({ embeds: [embed] });
        } catch {
            await interaction.editReply({ content: "❌ حدث خطأ أثناء جلب الآية، حاول مرة أخرى." });
        }
    }

    // ── setup ──
    else if (cmd === "setup") {
        const channel = interaction.options.getChannel("channel", true);
        const embed = new EmbedBuilder()
            .setTitle("✅ تم إعداد البوت")
            .setDescription(`تم تعيين القناة الرئيسية: ${channel}`)
            .setColor("Green");
        await interaction.reply({ embeds: [embed] });
    }

    // ── config ──
    else if (cmd === "config") {
        const language = interaction.options.getString("language") ?? "ar";
        const embed = new EmbedBuilder()
            .setTitle("🛠️ تم تحديث الإعدادات")
            .addFields({ name: "اللغة", value: language === "ar" ? "العربية" : "English", inline: true })
            .setColor("Blue");
        await interaction.reply({ embeds: [embed] });
    }

    // ── ban ──
    else if (cmd === "ban") {
        if (!interaction.memberPermissions?.has("BanMembers"))
            return await interaction.reply({ content: "❌ ليس لديك صلاحية الحظر.", flags: 64 });
        const user = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason") ?? "لا يوجد سبب";
        const member = interaction.guild?.members.cache.get(user.id);
        if (!member) return await interaction.reply({ content: "❌ العضو غير موجود.", flags: 64 });
        if (!member.bannable) return await interaction.reply({ content: "❌ لا يمكنني حظر هذا العضو.", flags: 64 });
        try {
            await member.ban({ reason });
            const embed = new EmbedBuilder()
                .setTitle("🔨 تم الحظر")
                .setThumbnail(user.displayAvatarURL())
                .addFields(
                    { name: "العضو", value: user.tag, inline: true },
                    { name: "المعرف", value: user.id, inline: true },
                    { name: "السبب", value: reason, inline: false }
                )
                .setFooter({ text: `بواسطة ${interaction.user.username}` })
                .setColor("Red");
            await interaction.reply({ embeds: [embed] });
        } catch {
            await interaction.reply({ content: "❌ فشل تنفيذ الحظر.", flags: 64 });
        }
    }

    // ── unban ──
    else if (cmd === "unban") {
        if (!interaction.memberPermissions?.has("BanMembers"))
            return await interaction.reply({ content: "❌ ليس لديك صلاحية رفع الحظر.", flags: 64 });
        const userId = interaction.options.getString("user_id", true);
        try {
            await interaction.guild?.members.unban(userId);
            await interaction.reply({ embeds: [new EmbedBuilder().setTitle("✅ تم رفع الحظر").setDescription(`المعرف: \`${userId}\``).setColor("Green")] });
        } catch {
            await interaction.reply({ content: "❌ فشل رفع الحظر. تأكد من صحة المعرف.", flags: 64 });
        }
    }

    // ── kick ──
    else if (cmd === "kick") {
        if (!interaction.memberPermissions?.has("KickMembers"))
            return await interaction.reply({ content: "❌ ليس لديك صلاحية الطرد.", flags: 64 });
        const user = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason") ?? "لا يوجد سبب";
        const member = interaction.guild?.members.cache.get(user.id);
        if (!member) return await interaction.reply({ content: "❌ العضو غير موجود.", flags: 64 });
        if (!member.kickable) return await interaction.reply({ content: "❌ لا يمكنني طرد هذا العضو.", flags: 64 });
        try {
            await member.kick(reason);
            const embed = new EmbedBuilder()
                .setTitle("👢 تم الطرد")
                .setThumbnail(user.displayAvatarURL())
                .addFields(
                    { name: "العضو", value: user.tag, inline: true },
                    { name: "السبب", value: reason, inline: false }
                )
                .setFooter({ text: `بواسطة ${interaction.user.username}` })
                .setColor("Orange");
            await interaction.reply({ embeds: [embed] });
        } catch {
            await interaction.reply({ content: "❌ فشل تنفيذ الطرد.", flags: 64 });
        }
    }

    // ── mute ──
    else if (cmd === "mute") {
        if (!interaction.memberPermissions?.has("ModerateMembers"))
            return await interaction.reply({ content: "❌ ليس لديك صلاحية الإسكات.", flags: 64 });
        const user = interaction.options.getUser("user", true);
        const duration = interaction.options.getInteger("duration") ?? 10;
        const reason = interaction.options.getString("reason") ?? "لا يوجد سبب";
        const member = interaction.guild?.members.cache.get(user.id);
        if (!member) return await interaction.reply({ content: "❌ العضو غير موجود.", flags: 64 });
        if (!member.moderatable) return await interaction.reply({ content: "❌ لا يمكنني إسكات هذا العضو.", flags: 64 });
        try {
            await member.timeout(duration * 60 * 1000, reason);
            const embed = new EmbedBuilder()
                .setTitle("🔇 تم الإسكات")
                .setThumbnail(user.displayAvatarURL())
                .addFields(
                    { name: "العضو", value: user.tag, inline: true },
                    { name: "المدة", value: `${duration} دقيقة`, inline: true },
                    { name: "السبب", value: reason, inline: false }
                )
                .setFooter({ text: `بواسطة ${interaction.user.username}` })
                .setColor("Yellow");
            await interaction.reply({ embeds: [embed] });
        } catch {
            await interaction.reply({ content: "❌ فشل تنفيذ الإسكات.", flags: 64 });
        }
    }

    // ── unmute ──
    else if (cmd === "unmute") {
        if (!interaction.memberPermissions?.has("ModerateMembers"))
            return await interaction.reply({ content: "❌ ليس لديك صلاحية رفع الإسكات.", flags: 64 });
        const user = interaction.options.getUser("user", true);
        const member = interaction.guild?.members.cache.get(user.id);
        if (!member) return await interaction.reply({ content: "❌ العضو غير موجود.", flags: 64 });
        try {
            await member.timeout(null);
            await interaction.reply({ embeds: [new EmbedBuilder().setTitle("🔊 تم رفع الإسكات").setDescription(`تم رفع الإسكات عن ${user.tag}`).setColor("Green")] });
        } catch {
            await interaction.reply({ content: "❌ فشل رفع الإسكات.", flags: 64 });
        }
    }

    // ── warn ──
    else if (cmd === "warn") {
        if (!interaction.memberPermissions?.has("ModerateMembers"))
            return await interaction.reply({ content: "❌ ليس لديك صلاحية التحذير.", flags: 64 });
        const user = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason") ?? "لا يوجد سبب";
        await user.send({ embeds: [new EmbedBuilder().setTitle(`⚠️ تلقيت تحذيراً في ${interaction.guild?.name}`).addFields({ name: "السبب", value: reason }).setColor("Yellow")] }).catch(() => null);
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle("⚠️ تم التحذير").addFields({ name: "العضو", value: user.tag, inline: true }, { name: "السبب", value: reason, inline: true }).setThumbnail(user.displayAvatarURL()).setFooter({ text: `بواسطة ${interaction.user.username}` }).setColor("Yellow")] });
    }

    // ── clear ──
    else if (cmd === "clear") {
        if (!interaction.memberPermissions?.has("ManageMessages"))
            return await interaction.reply({ content: "❌ ليس لديك صلاحية حذف الرسائل.", flags: 64 });
        const amount = interaction.options.getInteger("amount", true);
        const channel = interaction.channel as TextChannel;
        try {
            await interaction.deferReply({ flags: 64 });
            const deleted = await channel.bulkDelete(amount, true);
            await interaction.editReply({ content: `✅ تم حذف **${deleted.size}** رسالة.` });
        } catch {
            await interaction.editReply({ content: "❌ فشل حذف الرسائل (الرسائل الأقدم من 14 يوم لا يمكن حذفها)." });
        }
    }

    // ── ticket — إرسال لوحة التذاكر ──
    else if (cmd === "ticket") {
        if (!interaction.memberPermissions?.has("ManageChannels"))
            return await interaction.reply({ content: "❌ ليس لديك صلاحية إعداد التذاكر.", flags: 64 });

        const guild = interaction.guild!;
        const ticketChannel = guild.channels.cache.find(
            c => c.name.includes("tiket") || c.name.includes("ticket") || c.name.includes("تذكرة")
        ) as TextChannel;

        if (!ticketChannel) {
            return await interaction.reply({ content: "❌ لم يتم العثور على قناة `#🧾tiket`. تأكد من أن القناة موجودة.", flags: 64 });
        }

        const panelEmbed = new EmbedBuilder()
            .setAuthor({
                name: `${client.user?.username} | نظام التذاكر`,
                iconURL: client.user?.displayAvatarURL()
            })
            .setTitle("🎫 دعم الخادم")
            .setDescription(
`إذا كنت تريد إنشاء تذكرة، اضغط على القائمة المنسدلة أسفل الرسالة.

**⏱️ وقت الاستجابة**
نحن نسعى دائماً للحفاظ على وقت استجابة قصير للتذاكر. ومع ذلك، يرجى التذكر أننا لسنا روبوتات، لذا نرجو منك التحلي بالصبر أثناء تعاملنا مع تذاكر الآخرين. سنتلقى ردًا في أقرب وقت ممكن.

**📋 تقديم المعلومات**
عند فتح تذكرة، يجب عليك إرسال مرحبًا أو هاي فقط ثم المغادرة. بدلًا من ذلك، قم بشرح مشكلتك بوضوح في رسالة مكتوبة بشكل جيد.

**⚠️ التذاكر في القسم الخاطئ**
يرجى التأكد من فتح تذكرتك في القسم الصحيح. إذا تم فتح التذكرة في قسم خاطئ، سيتم إغلاقها بدون رد، وستحتاج إلى إعادة فتحها في القسم الصحيح.

**هذا يساعدنا على التعامل مع الطلبات بشكل أسرع والحفاظ على تنظيم الدعم.**`
            )
            .setColor(0x57F287)
            .setFooter({ text: `${client.user?.username} | Tickets System` });

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId("create_ticket")
                .setLabel("إنشاء تذكرة")
                .setEmoji("🎫")
                .setStyle(ButtonStyle.Success)
        );

        await ticketChannel.send({ embeds: [panelEmbed], components: [row] });
        await interaction.reply({ content: `✅ تم إرسال لوحة التذاكر في ${ticketChannel}`, flags: 64 });
    }

    // ── giveaway ──
    else if (cmd === "giveaway") {
        const prize = interaction.options.getString("prize", true);
        const duration = interaction.options.getInteger("duration", true);
        const winners = interaction.options.getInteger("winners") ?? 1;
        const embed = new EmbedBuilder()
            .setTitle("🎉 مسابقة جديدة!")
            .addFields(
                { name: "🏆 الجائزة", value: prize, inline: true },
                { name: "⏱️ المدة", value: `${duration} دقيقة`, inline: true },
                { name: "🥇 عدد الفائزين", value: `${winners}`, inline: true }
            )
            .setFooter({ text: `بدأت بواسطة ${interaction.user.username}` })
            .setColor("Gold");
        const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
        await msg.react("🎉");
    }

    // ── event ──
    else if (cmd === "event") {
        const title = interaction.options.getString("title", true);
        const description = interaction.options.getString("description", true);
        const date = interaction.options.getString("date") ?? "غير محدد";
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`📅 ${title}`).setDescription(description).addFields({ name: "📆 التاريخ", value: date, inline: true }).setFooter({ text: `أنشأه ${interaction.user.username}` }).setColor("Purple")] });
    }

    // ── rank ──
    else if (cmd === "rank") {
        const user = interaction.options.getUser("user") ?? interaction.user;
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle("⭐ المستوى").setThumbnail(user.displayAvatarURL()).setDescription(`مستوى ${user}: **المستوى 1** — 0 XP`).setColor("Gold")] });
    }

    // ── balance ──
    else if (cmd === "balance") {
        const user = interaction.options.getUser("user") ?? interaction.user;
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle("💰 الرصيد").setThumbnail(user.displayAvatarURL()).setDescription(`رصيد ${user}: **0 عملة**`).setColor("Gold")] });
    }

    // ── play ──
    else if (cmd === "play") {
        const song = interaction.options.getString("song", true);
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle("🎵 جاري التشغيل").setDescription(`**${song}**\nميزة الموسيقى قيد التطوير. قريباً!`).setColor("Green")] });
    }

    // ── meme ──
    else if (cmd === "meme") {
        await interaction.deferReply();
        try {
            const res = await fetch("https://meme-api.com/gimme");
            const data = await res.json() as any;
            await interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`😂 ${data.title}`).setImage(data.url).setColor("Random")] });
        } catch {
            await interaction.editReply({ content: "❌ تعذر جلب الميم، حاول مرة أخرى." });
        }
    }

    // ── userinfo ──
    else if (cmd === "userinfo") {
        const user = interaction.options.getUser("user") ?? interaction.user;
        const member = interaction.guild?.members.cache.get(user.id);
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle("👤 معلومات العضو").setThumbnail(user.displayAvatarURL()).addFields({ name: "الاسم", value: user.username, inline: true }, { name: "المعرف", value: user.id, inline: true }, { name: "تاريخ إنشاء الحساب", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`, inline: false }, { name: "تاريخ الانضمام للسيرفر", value: member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>` : "غير معروف", inline: false }).setColor("Blue")] });
    }

    // ── serverinfo ──
    else if (cmd === "serverinfo") {
        const guild = interaction.guild;
        if (!guild) return;
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🏠 ${guild.name}`).setThumbnail(guild.iconURL()).addFields({ name: "المعرف", value: guild.id, inline: true }, { name: "عدد الأعضاء", value: `${guild.memberCount}`, inline: true }, { name: "تاريخ الإنشاء", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: false }).setColor("Blue")] });
    }

    // ── welcome ──
    else if (cmd === "welcome") {
        const channel = interaction.options.getChannel("channel", true);
        const message = interaction.options.getString("message") ?? "مرحباً {user} في سيرفرنا! 🎉";
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle("👋 تم إعداد الترحيب").addFields({ name: "📢 القناة", value: `${channel}`, inline: true }, { name: "💬 الرسالة", value: message, inline: false }).setColor("Green")] });
    }

    // ── reactionroles ──
    else if (cmd === "reactionroles") {
        const channel = interaction.options.getChannel("channel", true);
        const message = interaction.options.getString("message", true);
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle("✅ تم إعداد رتب التفاعل").addFields({ name: "📢 القناة", value: `${channel}`, inline: true }, { name: "💬 الرسالة", value: message, inline: false }).setColor("Purple")] });
    }

    // ── suggest ──
    else if (cmd === "suggest") {
        const text = interaction.options.getString("text", true);
        const embed = new EmbedBuilder().setTitle("💡 اقتراح جديد").setDescription(text).addFields({ name: "✅ موافق", value: "0", inline: true }, { name: "❌ غير موافق", value: "0", inline: true }).setFooter({ text: `اقترحه: ${interaction.user.username}` }).setColor("Yellow");
        const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
        await msg.react("✅");
        await msg.react("❌");
    }

    // ── poll ──
    else if (cmd === "poll") {
        const question = interaction.options.getString("question", true);
        const embed = new EmbedBuilder().setTitle("📊 تصويت").setDescription(question).setFooter({ text: `تصويت بواسطة ${interaction.user.username}` }).setColor("Blue");
        const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
        await msg.react("✅");
        await msg.react("❌");
    }

    // ── logs ──
    else if (cmd === "logs") {
        const channel = interaction.options.getChannel("channel", true);
        const type = interaction.options.getString("type") ?? "all";
        const typeNames: Record<string, string> = { all: "الكل", joins: "الدخول والخروج", messages: "الرسائل", moderation: "المودريشن" };
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle("📋 تم إعداد السجلات").addFields({ name: "📢 قناة السجلات", value: `${channel}`, inline: true }, { name: "📂 النوع", value: typeNames[type], inline: true }).setColor("Grey")] });
    }

    // ── dashboard ──
    else if (cmd === "dashboard") {
        const guild = interaction.guild;
        if (!guild) return;
        const uptime = process.uptime();
        const h = Math.floor(uptime / 3600), m = Math.floor((uptime % 3600) / 60), s = Math.floor(uptime % 60);
        const embed = new EmbedBuilder()
            .setTitle(`🖥️ لوحة التحكم — ${guild.name}`)
            .setThumbnail(guild.iconURL())
            .addFields(
                { name: "👥 الأعضاء", value: `${guild.memberCount}`, inline: true },
                { name: "💬 قنوات النصوص", value: `${guild.channels.cache.filter(c => c.type === 0).size}`, inline: true },
                { name: "🔊 قنوات الصوت", value: `${guild.channels.cache.filter(c => c.type === 2).size}`, inline: true },
                { name: "🎭 الرتب", value: `${guild.roles.cache.size - 1}`, inline: true },
                { name: "📶 البينق", value: `${client.ws.ping}ms`, inline: true },
                { name: "⏱️ وقت التشغيل", value: `${h}س ${m}د ${s}ث`, inline: true }
            )
            .setTimestamp()
            .setColor("Blue");
        await interaction.reply({ embeds: [embed] });
    }

});
        errors.push("PostgreSQL user is required in production (set DATABASE_URL/POSTGRES_URL, or POSTGRES_USER)");
      }
      if (!process.env.POSTGRES_PASSWORD) {
        errors.push("PostgreSQL password is required in production (set DATABASE_URL/POSTGRES_URL, or POSTGRES_PASSWORD)");
      }
    }
  }

  return errors;
}

const configErrors = validateConfig(botConfig);
if (configErrors.length > 0) {
  logger.error("Bot configuration errors:", configErrors.join("\n"));
  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  }
}

export const BotConfig = botConfig;

const COMMAND_CATEGORY_FEATURE_MAP = {
  birthday: "birthday",
  community: "community",
  economy: "economy",
  fun: "fun",
  giveaway: "giveaways",
  jointocreate: "joinToCreate",
  leveling: "leveling",
  logging: "logging",
  moderation: "moderation",
  music: "music",
  reaction_roles: "reactionRoles",
  search: "search",
  serverstats: "counter",
  ticket: "tickets",
  tools: "tools",
  utility: "utility",
  verification: "verification",
  welcome: "welcome",
};

function normalizeCategoryKey(category) {
  return String(category || "").trim().toLowerCase().replace(/\s+/g, "_");
}

export function getCommandPrefix() {
  return botConfig.commands?.prefix ?? "!";
}

export function getBotOwners() {
  return (botConfig.commands?.owners ?? [])
    .map((id) => String(id).trim())
    .filter(Boolean);
}

export function isBotOwner(userId) {
  if (!userId) {
    return false;
  }

  return getBotOwners().includes(String(userId));
}

export function isMaintenanceMode() {
  return botConfig.commands?.maintenanceMode === true;
}

export function getBotMessage(key, replacements = {}) {
  let message = botConfig.messages?.[key] || key;

  for (const [placeholder, value] of Object.entries(replacements)) {
    message = message.replace(new RegExp(`\\{${placeholder}\\}`, "g"), String(value));
  }

  return message;
}

export function isFeatureEnabled(featureKey) {
  if (!featureKey) {
    return true;
  }

  return botConfig.features?.[featureKey] !== false;
}

export function isCommandCategoryEnabled(category) {
  const normalized = normalizeCategoryKey(category);

  if (!normalized || normalized === "core") {
    return true;
  }

  const featureKey = COMMAND_CATEGORY_FEATURE_MAP[normalized];
  if (!featureKey) {
    return true;
  }

  return isFeatureEnabled(featureKey);
}

export function getApplicationStatusColor(status) {
  const colors = botConfig.applications?.statusColors || {};
  const hex = colors[status];
  return hex ? getColor(hex) : getColor(status === "approved" ? "success" : status === "denied" ? "error" : "warning");
}

export function getDefaultApplicationQuestions() {
  return (botConfig.applications?.defaultQuestions || []).map((entry) =>
    typeof entry === "string" ? entry : entry.question,
  ).filter(Boolean);
}

export function getColor(path, fallback = "#99AAB5") {
  
  if (typeof path === "number") return path;
  if (typeof path === "string" && path.startsWith("#")) {
    
    return parseInt(path.replace("#", ""), 16);
  }
  const result = path
    .split(".")
    .reduce(
      (obj, key) => (obj && obj[key] !== undefined ? obj[key] : fallback),
      botConfig.embeds.colors,
    );
  
  if (typeof result === "string" && result.startsWith("#")) {
    return parseInt(result.replace("#", ""), 16);
  }
  return result;
}

export function getRandomColor() {
  const colors = Object.values(botConfig.embeds.colors).flatMap((color) =>
    typeof color === "string" ? color : Object.values(color),
  );
  return colors[Math.floor(Math.random() * colors.length)];
}

export default botConfig;
