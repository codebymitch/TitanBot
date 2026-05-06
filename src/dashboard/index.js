<div class="main">

  <div class="stats-grid">

    <div class="stat-card">

      <h3>
        🌎 Servers
      </h3>

      <p>
        ${client.guilds.cache.size}
      </p>

    </div>

    <div class="stat-card">

      <h3>
        👥 Users
      </h3>

      <p>
        ${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}
      </p>

    </div>

    <div class="stat-card">

      <h3>
        ⚡ Ping
      </h3>

      <p>
        ${client.ws.ping}ms
      </p>

    </div>

    <div class="stat-card">

      <h3>
        🤖 Commands
      </h3>

      <p>
        ${client.commands.size}
      </p>

    </div>

  </div>

  <div class="card">