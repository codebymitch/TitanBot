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