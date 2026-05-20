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
      bug: {
        title: '🐛 Reportar un error',
        description: '¿Encontraste un error? Repórtalo en nuestro GitHub.\n\n**Al reportar, incluye:**\n• Descripción detallada\n• Pasos para reproducirlo\n• Capturas si aplica\n• Versión del bot y entorno\n\nNos ayuda a corregirlo más rápido.',
        button: 'Reportar en GitHub',
      },
      help: {
        title: '🤖 Centro de Ayuda de {bot}',
        description: 'Tu bot todo-en-uno para moderación, economía, diversión y gestión del servidor.',
        footer: 'Hecho con ❤️',
        closedTitle: 'Menú de ayuda cerrado',
        closedDesc: 'El menú se ha cerrado, usa /help de nuevo.',
        reportBug: 'Reportar Error',
        supportServer: 'Servidor de Soporte',
        selectPlaceholder: 'Selecciona para ver los comandos',
        allCommands: '📋 Todos los Comandos',
        allCommandsDesc: 'Ver todos los comandos disponibles con paginación',
        categoryDesc: 'Ver comandos de la categoría {name}',
      },
      overview: {
        title: '🖥️ Resumen del Sistema',
        description: 'Vista de solo lectura para **{server}**. Usa el dashboard del módulo correspondiente para cambiar ajustes.',
        coreSystems: '⚙️ Sistemas principales',
        channels: '📡 Canales configurados',
        snapshot: '🕒 Captura tomada',
        footer: 'Solo lectura — usa /logging dashboard para configurar',
        errorTitle: 'Error de resumen',
        errorDesc: 'No se pudo cargar el resumen del sistema.',
        notConfigured: '`Sin configurar`',
        missing: '⚠️ No encontrado ({id})',
        on: '✅ Activado',
        off: '❌ Desactivado',
        labels: {
          audit: '🧾 **Auditoría**',
          leveling: '📈 **Niveles**',
          welcome: '👋 **Bienvenida**',
          goodbye: '👋 **Despedida**',
          birthdays: '🎂 **Cumpleaños**',
          applications: '📋 **Aplicaciones**',
          verification: '✅ **Verificación**',
          autoverify: '🤖 **Auto-verificación**',
          jointocreate: '🎧 **Join to Create**',
          autorole: '🛡️ **Auto-rol**',
          auditChannel: '**Canal de auditoría:**',
          ticketLogs: '**Logs de tickets:**',
          ticketTranscripts: '**Transcripciones:**',
          reports: '**Reportes:**',
          birthdayChannel: '**Cumpleaños:**',
        },
      },
      stats: {
        title: '📊 Estadísticas del Sistema',
        description: 'Métricas de rendimiento en tiempo real.',
        servers: 'Servidores',
        users: 'Usuarios',
        memory: 'Uso de memoria',
        errorTitle: 'Error del sistema',
        errorDesc: 'No se pudieron obtener las estadísticas.',
      },
      uptime: {
        title: '⏱️ Tiempo Activo',
        errorTitle: 'Error del sistema',
        errorDesc: 'No se pudo calcular el tiempo activo.',
      },
      mod: {
        common: {
          noReason: 'Sin razón especificada',
          reasonLabel: '**Razón:**',
          caseLabel: '**Caso #**',
          cantSelf: 'No puedes hacer eso contigo mismo.',
          cantBot: 'No puedes hacer eso con el bot.',
          targetNotFound: 'El usuario objetivo no está en este servidor.',
          higherRole: 'No puedes moderar a un usuario con un rol igual o superior al tuyo.',
          botCannot: 'No puedo realizar esa acción. Comprueba la posición de mi rol respecto al objetivo.',
          permDenied: 'Permiso denegado',
          unexpectedError: 'Ocurrió un error inesperado al ejecutar la acción.',
        },
        ban: {
          successTitle: '🚫 Baneado: {user}',
          permDenied: 'Necesitas el permiso `Banear miembros`.',
        },
        kick: {
          successTitle: '👢 Expulsado: {user}',
          permDenied: 'Necesitas el permiso `Expulsar miembros`.',
          unexpectedError: 'No se pudo expulsar al usuario.',
        },
        timeout: {
          successTitle: '⏳ Timeout aplicado a {user} por {duration}',
          permDenied: 'Necesitas el permiso `Moderar miembros` para aplicar un timeout.',
          cannotTimeout: 'No puedo aplicar timeout a este usuario; podría tener un rol superior.',
        },
        untimeout: {
          successTitle: '🔓 Timeout removido a {user}',
        },
        unban: {
          successTitle: '✅ Usuario desbaneado',
          successDesc: '**{user}** ha sido desbaneado del servidor.\n\n**Razón:** {reason}\n**Caso #**{caseId}',
        },
        purge: {
          permDenied: 'Necesitas el permiso `Gestionar mensajes` para borrar mensajes.',
          invalidAmount: 'Indica un número entre 1 y 100.',
          rateLimited: 'Estás borrando mensajes muy rápido. Espera un minuto antes de reintentar.',
          rateLimitedTitle: '⏳ Limitado',
          successDesc: '🗑️ Borrados {count} mensajes en {channel}.',
          oldMessages: 'Error inesperado al borrar. Nota: los mensajes de más de 14 días no se pueden borrar en bloque.',
        },
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