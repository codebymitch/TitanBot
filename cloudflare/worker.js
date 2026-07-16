const STATUS_KEY = 'latest';
const MAX_STATUS_AGE_MS = 90_000;
const STAFF_QUEUE_KEY = 'staffapp:queue';
const STAFF_SETTINGS_KEY = 'staffapp:settings';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  }
});

const secureAsset = async (request, env) => {
  const response = await env.ASSETS.fetch(request);
  const secured = new Response(response.body, response);
  secured.headers.set('content-security-policy', "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' https://cdn.discordapp.com data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  secured.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  secured.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  secured.headers.set('x-content-type-options', 'nosniff');
  secured.headers.set('x-frame-options', 'DENY');
  return secured;
};

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

    if (url.pathname === '/api/staff-applications' && request.method === 'POST') {
      const settings = await env.STATUS_KV.get(STAFF_SETTINGS_KEY, 'json');
      if (settings?.open !== true) return json({ error: 'Applications are closed' }, 403);
      const body = await request.json().catch(() => null);
      if (!body || body.website) return json({ error: 'Invalid application' }, 400);
      const discordId = String(body.discordId || '').trim();
      const fields = ['age', 'experience', 'motivation', 'availability', 'portfolio'];
      if (!/^\d{17,20}$/.test(discordId) || fields.some(key => !String(body[key] || '').trim() && key !== 'portfolio')) return json({ error: 'Missing or invalid fields' }, 400);
      const ip = request.headers.get('cf-connecting-ip') || 'unknown';
      const ipHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
      const rateKey = `staffapp:rate:${[...new Uint8Array(ipHash)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 24)}`;
      const userRateKey = `staffapp:user:${discordId}`;
      if (await env.STATUS_KV.get(rateKey) || await env.STATUS_KV.get(userRateKey)) return json({ error: 'Please wait before submitting another application' }, 429);
      if (body.portfolio && !/^https?:\/\/\S+$/i.test(String(body.portfolio))) return json({ error: 'Invalid portfolio URL' }, 400);
      const id = `APP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const application = { id, discordId, createdAt: new Date().toISOString(), status: 'pending' };
      for (const key of fields) application[key] = String(body[key] || '').trim().slice(0, key === 'age' ? 20 : 1000);
      await env.STATUS_KV.put(`staffapp:${id}`, JSON.stringify(application), { expirationTtl: 604800 });
      const queue = await env.STATUS_KV.get(STAFF_QUEUE_KEY, 'json') || [];
      await env.STATUS_KV.put(STAFF_QUEUE_KEY, JSON.stringify([...new Set([...queue, id])].slice(-100)), { expirationTtl: 604800 });
      await env.STATUS_KV.put(rateKey, '1', { expirationTtl: 3600 });
      await env.STATUS_KV.put(userRateKey, '1', { expirationTtl: 3600 });
      return json({ ok: true, id }, 201);
    }

    if (url.pathname === '/api/staff-applications/settings' && request.method === 'GET') {
      const settings = await env.STATUS_KV.get(STAFF_SETTINGS_KEY, 'json');
      return json({ open: settings?.open === true, updatedAt: settings?.updatedAt || null });
    }

    if (url.pathname === '/api/staff-applications/settings' && request.method === 'POST') {
      if (request.headers.get('authorization') !== `Bearer ${env.HEARTBEAT_SECRET}`) return json({ error: 'Unauthorized' }, 401);
      const update = await request.json().catch(() => null);
      if (typeof update?.open !== 'boolean') return json({ error: 'Invalid setting' }, 400);
      const settings = { open: update.open, updatedAt: new Date().toISOString() };
      await env.STATUS_KV.put(STAFF_SETTINGS_KEY, JSON.stringify(settings));
      return json(settings);
    }

    if (url.pathname === '/api/staff-applications/pending' && request.method === 'GET') {
      if (request.headers.get('authorization') !== `Bearer ${env.HEARTBEAT_SECRET}`) return json({ error: 'Unauthorized' }, 401);
      const queue = await env.STATUS_KV.get(STAFF_QUEUE_KEY, 'json') || [];
      const applications = (await Promise.all(queue.slice(0, 20).map(id => env.STATUS_KV.get(`staffapp:${id}`, 'json')))).filter(item => item?.status === 'pending');
      return json({ applications });
    }

    if (url.pathname.startsWith('/api/staff-applications/') && request.method === 'POST') {
      if (request.headers.get('authorization') !== `Bearer ${env.HEARTBEAT_SECRET}`) return json({ error: 'Unauthorized' }, 401);
      const id = decodeURIComponent(url.pathname.split('/').pop());
      const saved = await env.STATUS_KV.get(`staffapp:${id}`, 'json');
      if (!saved) return json({ error: 'Not found' }, 404);
      const update = await request.json().catch(() => ({}));
      saved.status = ['awaiting_confirmation', 'confirmed', 'rejected', 'failed'].includes(update.status) ? update.status : saved.status;
      if (['confirmed', 'rejected', 'failed'].includes(saved.status)) {
        for (const field of ['age', 'experience', 'motivation', 'availability', 'portfolio']) delete saved[field];
        const queue = await env.STATUS_KV.get(STAFF_QUEUE_KEY, 'json') || [];
        await env.STATUS_KV.put(STAFF_QUEUE_KEY, JSON.stringify(queue.filter(item => item !== id)), { expirationTtl: 604800 });
      }
      await env.STATUS_KV.put(`staffapp:${id}`, JSON.stringify(saved), { expirationTtl: 604800 });
      return json({ ok: true });
    }

    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    return secureAsset(request, env);
  }
};
