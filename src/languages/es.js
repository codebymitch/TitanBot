export default {

  // ────────────────────────────────────────────────────────────────
  // wolf.*  — strings authored by the Wolf rebuild (access gate,
  // music, dashboard, etc.). Uses {placeholder} interpolation.
  // ────────────────────────────────────────────────────────────────
  wolf: {
    access: {
      blocked: {
        title: '🔒 Servidor no activado',
        description: 'Este servidor todavía no tiene acceso a **{brand}**.\n\nPide al dueño del bot que lo active para empezar a usar los comandos.',
        descriptionWithSupport: 'Este servidor todavía no tiene acceso a **{brand}**.\n\nÚnete al servidor de soporte y envía el ID para activarlo:\n{support}',
        serverIdLabel: 'ID del servidor',
      },
      pending: {
        title: '🔒 {brand} está pendiente de activación',
        description: '¡Gracias por añadir **{brand}**! Este servidor todavía **no está activado**, así que los comandos estarán bloqueados hasta que se conceda acceso.',
        howWithSupport: 'Únete al servidor de soporte y envía el **ID de tu servidor** para que aprobemos el acceso.\n{support}',
        howWithoutSupport: 'Comparte el ID de este servidor con el dueño del bot y pídele que lo active.',
        howLabel: '📋 Para activarlo',
        serverIdLabel: '🆔 ID de este servidor',
        panelLabel: '🌐 Panel',
      },
    },
    setup: {
      title: '🐺 ¡Bienvenido a {brand}!',
      description: 'Tu servidor ya está **activado**. Elige el idioma del bot abajo para empezar.',
      note: 'Puedes cambiarlo en cualquier momento desde el panel web.',
      langSet: '✓ Idioma cambiado a **{language}**.',
      langButtonES: 'Español',
      langButtonEN: 'English',
      panelButton: 'Abrir panel web',
    },
    music: {
      notInVc: '🔇 No estás en un canal de voz',
      joinFirst: 'Únete a un canal de voz primero.',
      noPerms: '🚫 Sin permisos',
      noPermsDesc: 'No puedo conectarme o hablar en {channel}.',
      queued: '🎵 Añadido a la cola',
      playlistAdded: '📜 Playlist añadida',
      playlistAddedDesc: '**{name}** · {count} canciones',
      cantPlay: '❌ No se pudo reproducir',
      nothingTitle: '⚠️ Nada sonando',
      nothingDesc: 'No hay nada en la cola en este momento.',
      skipTitle: '⏭️ Skip',
      skipped: 'Saltada: **{title}**',
      skipping: 'Saltando…',
      pauseTitle: '⏸️ Pausa',
      paused: 'Reproducción pausada.',
      resumeTitle: '▶️ Reanudar',
      resumed: 'Reproducción reanudada.',
      stopTitle: '⏹️ Stop',
      stopped: 'Cola vaciada y bot desconectado.',
      shuffleTitle: '🔀 Shuffle',
      shuffled: 'Mezcladas **{count}** canciones.',
      loopTitle: '🔁 Repetición',
      loopSet: 'Modo: **{mode}**.',
      loopOff: 'desactivado',
      loopTrack: 'canción actual',
      loopQueue: 'cola completa',
      loopAutoplay: 'autoplay (recomendaciones)',
      volumeTitle: '🔊 Volumen',
      volumeSet: 'Volumen ajustado a **{level}**.',
      queueTitle: '📜 Cola de reproducción',
      nowPlayingHeader: 'Sonando ahora',
      nowPlayingFooter: 'Pedida por {user}',
      queueNowPlaying: '**Sonando ahora:** [{title}]({url})',
      queueEmpty: '*(la cola está vacía)*',
      queueMore: '*+ {n} más en la cola…*',
      queueFooter: '{n} canciones en cola',
      removed: '✂️ Removida',
      removedDesc: 'Quitada: **{title}**.',
      positionTitle: '❌ No existe',
      positionDesc: 'No hay canción en la posición {pos}.',
      trackAddedToQueue: 'Añadido a la cola',
      playlistFull: 'Playlist añadida',
      playlistTracks: '**{count}** canciones añadidas a la cola.',
      queueEnded: 'Cola vacía. Saliendo del canal de voz.',
      errorTitle: 'Error reproduciendo',
      '247OnTitle': '🔁 Modo 24/7 activado',
      '247OnDesc': 'El bot se quedará en el canal de voz aunque la cola se vacíe. Aplica desde la próxima reproducción.',
      '247OffTitle': '⏹️ Modo 24/7 desactivado',
      '247OffDesc': 'El bot saldrá del canal cuando la cola termine o se quede vacío.',
    },
    cmd: {
      ping: {
        title: '🏓 ¡Pong!',
        pinging: 'Comprobando...',
        botLatency: 'Latencia del bot',
        apiLatency: 'Latencia de la API',
        errorTitle: 'Error del sistema',
        errorDesc: 'No se pudo determinar la latencia en este momento.',
      },
    },
  },

  welcome: {

    title:
      '👋 Bienvenido',

    goodbye:
      '👋 Adiós'

  },

  logs: {

    member_join:
      '📥 Usuario entró',

    member_leave:
      '📤 Usuario salió',

    message_delete:
      '🗑️ Mensaje eliminado'

  },

  dashboard: {

    welcome:
      'Bienvenida',

    logs:
      'Logs',

    enable:
      'Activar',

    disable:
      'Desactivar'

  }

};