export function setupDashboard(app, client) {

  console.log('🔥 Dashboard cargado'); // 👈 DEBUG

  app.get('/dashboard', (req, res) => {
    res.send(`
      <html>
        <body style="background:#111;color:white;font-family:Arial;padding:20px;">
          <h1>🤖 TitanBot Dashboard</h1>
          <p>Bot activo ✅</p>
          <p>Servidores: ${client.guilds.cache.size}</p>
        </body>
      </html>
    `);
  });

}