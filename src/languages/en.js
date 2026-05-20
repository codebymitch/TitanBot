export default {

  // ────────────────────────────────────────────────────────────────
  // wolf.*  — strings authored by the Wolf rebuild. {placeholder}
  // interpolation supported via src/services/i18n.js -> t()
  // ────────────────────────────────────────────────────────────────
  wolf: {
    access: {
      blocked: {
        title: '🔒 Server not approved',
        description: "This server doesn't have access to **{brand}** yet.\n\nAsk the bot owner to approve it before using commands.",
        descriptionWithSupport: "This server doesn't have access to **{brand}** yet.\n\nJoin the support server and send the ID to get it approved:\n{support}",
        serverIdLabel: 'Server ID',
      },
      pending: {
        title: '🔒 {brand} is pending approval',
        description: 'Thanks for adding **{brand}**! This server is **not approved yet**, so commands stay locked until access is granted.',
        howWithSupport: 'Join the support server and send your **server ID** so we can approve access.\n{support}',
        howWithoutSupport: "Share this server's ID with the bot owner and ask them to approve it.",
        howLabel: '📋 How to activate',
        serverIdLabel: '🆔 Server ID',
        panelLabel: '🌐 Dashboard',
      },
    },
    setup: {
      title: '🐺 Welcome to {brand}!',
      description: "Your server is now **approved**. Pick the bot's language below to get started.",
      note: 'You can change it any time from the web dashboard.',
      langSet: '✓ Language changed to **{language}**.',
      langButtonES: 'Español',
      langButtonEN: 'English',
      panelButton: 'Open web dashboard',
    },
    music: {
      notInVc: "🔇 You're not in a voice channel",
      joinFirst: 'Join a voice channel first.',
      noPerms: '🚫 Missing permissions',
      noPermsDesc: "I can't connect or speak in {channel}.",
      queued: '🎵 Added to queue',
      playlistAdded: '📜 Playlist added',
      playlistAddedDesc: '**{name}** · {count} tracks',
      cantPlay: "❌ Couldn't play",
      nothingTitle: '⚠️ Nothing playing',
      nothingDesc: 'Nothing in the queue right now.',
      skipTitle: '⏭️ Skip',
      skipped: 'Skipped: **{title}**',
      skipping: 'Skipping…',
      pauseTitle: '⏸️ Paused',
      paused: 'Playback paused.',
      resumeTitle: '▶️ Resumed',
      resumed: 'Playback resumed.',
      stopTitle: '⏹️ Stop',
      stopped: 'Queue cleared and bot disconnected.',
      shuffleTitle: '🔀 Shuffle',
      shuffled: 'Shuffled **{count}** tracks.',
      loopTitle: '🔁 Repeat',
      loopSet: 'Mode: **{mode}**.',
      loopOff: 'off',
      loopTrack: 'current track',
      loopQueue: 'full queue',
      loopAutoplay: 'autoplay (recommendations)',
      volumeTitle: '🔊 Volume',
      volumeSet: 'Volume set to **{level}**.',
      queueTitle: '📜 Queue',
      nowPlayingHeader: 'Now playing',
      nowPlayingFooter: 'Requested by {user}',
      queueNowPlaying: '**Now playing:** [{title}]({url})',
      queueEmpty: '*(the queue is empty)*',
      queueMore: '*+ {n} more in queue…*',
      queueFooter: '{n} tracks in queue',
      removed: '✂️ Removed',
      removedDesc: 'Removed: **{title}**.',
      positionTitle: "❌ Doesn't exist",
      positionDesc: 'No track at position {pos}.',
      trackAddedToQueue: 'Added to queue',
      playlistFull: 'Playlist added',
      playlistTracks: '**{count}** tracks added to the queue.',
      queueEnded: 'Queue empty. Leaving the voice channel.',
      errorTitle: 'Playback error',
      '247OnTitle': '🔁 24/7 mode enabled',
      '247OnDesc': "The bot will stay in the voice channel even if the queue empties. Applies from the next playback.",
      '247OffTitle': '⏹️ 24/7 mode disabled',
      '247OffDesc': 'The bot will leave the voice channel when the queue ends or becomes empty.',
    },
    cmd: {
      ping: {
        title: '🏓 Pong!',
        pinging: 'Pinging...',
        botLatency: 'Bot Latency',
        apiLatency: 'API Latency',
        errorTitle: 'System Error',
        errorDesc: 'Could not determine latency at this time.',
      },
      bug: {
        title: '🐛 Report a bug',
        description: 'Found a bug? Report it on GitHub.\n\n**When reporting, include:**\n• Detailed description\n• Steps to reproduce\n• Screenshots if applicable\n• Bot version and environment\n\nThis helps us fix it faster.',
        button: 'Report on GitHub',
      },
      help: {
        title: '🤖 {bot} Help Center',
        description: 'Your all-in-one Discord companion for moderation, economy, fun, and server management.',
        footer: 'Made with ❤️',
        closedTitle: 'Help menu closed',
        closedDesc: 'Help menu has been closed, use /help again.',
        reportBug: 'Report Bug',
        supportServer: 'Support Server',
        selectPlaceholder: 'Select to view the commands',
        allCommands: '📋 All Commands',
        allCommandsDesc: 'View all available commands with pagination',
        categoryDesc: 'View commands in the {name} category',
      },
      overview: {
        title: '🖥️ System Overview',
        description: 'Read-only snapshot for **{server}**. Use the relevant module dashboard to make changes.',
        coreSystems: '⚙️ Core Systems',
        channels: '📡 Configured Channels',
        snapshot: '🕒 Snapshot Taken',
        footer: 'Read-only — run /logging dashboard to manage audit settings',
        errorTitle: 'Overview Error',
        errorDesc: 'Failed to load the system overview.',
        notConfigured: '`Not configured`',
        missing: '⚠️ Missing ({id})',
        on: '✅ On',
        off: '❌ Off',
        labels: {
          audit: '🧾 **Audit Logging**',
          leveling: '📈 **Leveling**',
          welcome: '👋 **Welcome**',
          goodbye: '👋 **Goodbye**',
          birthdays: '🎂 **Birthdays**',
          applications: '📋 **Applications**',
          verification: '✅ **Verification**',
          autoverify: '🤖 **Auto-Verify**',
          jointocreate: '🎧 **Join to Create**',
          autorole: '🛡️ **Auto Role**',
          auditChannel: '**Audit Log:**',
          ticketLogs: '**Ticket Lifecycle:**',
          ticketTranscripts: '**Ticket Transcripts:**',
          reports: '**Reports:**',
          birthdayChannel: '**Birthdays:**',
        },
      },
      stats: {
        title: '📊 System Statistics',
        description: 'Real-time performance metrics.',
        servers: 'Servers',
        users: 'Users',
        memory: 'Memory Usage',
        errorTitle: 'System Error',
        errorDesc: 'Could not fetch system statistics.',
      },
      uptime: {
        title: '⏱️ System Uptime',
        errorTitle: 'System Error',
        errorDesc: 'Could not compute uptime.',
      },
      mod: {
        common: {
          noReason: 'No reason provided',
          reasonLabel: '**Reason:**',
          caseLabel: '**Case #**',
          cantSelf: "You can't do that to yourself.",
          cantBot: "You can't do that to the bot.",
          targetNotFound: 'The target user is not currently in this server.',
          higherRole: 'You cannot moderate a user with an equal or higher role than you.',
          botCannot: "I can't perform this action. Check my role position relative to the target.",
          permDenied: 'Permission denied',
          unexpectedError: 'An unexpected error occurred while running this action.',
        },
        ban: {
          successTitle: '🚫 Banned: {user}',
          permDenied: 'You need the `Ban Members` permission.',
        },
        kick: {
          successTitle: '👢 Kicked: {user}',
          permDenied: 'You need the `Kick Members` permission.',
          unexpectedError: 'Could not kick the user.',
        },
        timeout: {
          successTitle: '⏳ Timed out {user} for {duration}',
          permDenied: 'You need the `Moderate Members` permission to set a timeout.',
          cannotTimeout: "I can't timeout this user; they may have a higher role.",
        },
        untimeout: {
          successTitle: '🔓 Timeout removed from {user}',
        },
        unban: {
          successTitle: '✅ User Unbanned',
          successDesc: 'Successfully unbanned **{user}** from the server.\n\n**Reason:** {reason}\n**Case #**{caseId}',
        },
        purge: {
          permDenied: 'You need the `Manage Messages` permission to purge messages.',
          invalidAmount: 'Please specify a number between 1 and 100.',
          rateLimited: "You're purging too fast. Please wait a minute before trying again.",
          rateLimitedTitle: '⏳ Rate Limited',
          successDesc: '🗑️ Deleted {count} messages in {channel}.',
          oldMessages: 'An unexpected error occurred during deletion. Note: messages older than 14 days cannot be bulk deleted.',
        },
      },
    },
  },

  welcome: {

    title:
      '👋 Welcome',

    goodbye:
      '👋 Goodbye'

  },

  logs: {

    member_join:
      '📥 Member Joined',

    member_leave:
      '📤 Member Left',

    message_delete:
      '🗑️ Message Deleted'

  },

  dashboard: {

    welcome:
      'Welcome',

    logs:
      'Logs',

    enable:
      'Enable',

    disable:
      'Disable'

  }

};