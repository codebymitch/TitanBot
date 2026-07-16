const STATUS_KEY = 'latest';
const MAX_STATUS_AGE_MS = 90_000;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  }
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/status' && request.method === 'GET') {
      const saved = await env.STATUS_KV.get(STATUS_KEY, 'json');
      if (!saved) return json({ bot: { online: false }, community: {} });
      const online = Date.now() - new Date(saved.updatedAt).getTime() <= MAX_STATUS_AGE_MS;
      return json({ ...saved, bot: { ...saved.bot, online } });
    }

    if (url.pathname === '/api/heartbeat' && request.method === 'POST') {
      const token = request.headers.get('authorization');
      if (!token || token !== `Bearer ${env.HEARTBEAT_SECRET}`) return json({ error: 'Unauthorized' }, 401);
      const payload = await request.json().catch(() => null);
      if (!payload?.bot || !payload?.community) return json({ error: 'Invalid payload' }, 400);
      const safe = {
        bot: {
          online: true,
          avatar: String(payload.bot.avatar || '').slice(0, 500),
          commands: Math.max(0, Number(payload.bot.commands) || 0),
          latency: Math.max(0, Number(payload.bot.latency) || 0),
          servers: Math.max(0, Number(payload.bot.servers) || 0)
        },
        community: {
          members: Math.max(0, Number(payload.community.members) || 0),
          channels: Math.max(0, Number(payload.community.channels) || 0),
          resources: Math.max(0, Number(payload.community.resources) || 0),
          competitions: Math.max(0, Number(payload.community.competitions) || 0)
        },
        updatedAt: new Date().toISOString()
      };
      await env.STATUS_KV.put(STATUS_KEY, JSON.stringify(safe), { expirationTtl: 3600 });
      return json({ ok: true });
    }

    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    return env.ASSETS.fetch(request);
  }
};
