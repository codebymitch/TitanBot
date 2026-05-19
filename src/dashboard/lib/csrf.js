import crypto from 'crypto';

/**
 * Minimal session-bound CSRF protection (no dependency).
 *
 * A per-session token is generated lazily and embedded as a hidden
 * field in every form. Unsafe methods must echo it back; we compare
 * in constant time.
 */
export function ensureCsrfToken(req) {
  if (!req.session) return '';
  if (!req.session.csrf) {
    req.session.csrf = crypto.randomBytes(24).toString('hex');
  }
  return req.session.csrf;
}

export function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    ensureCsrfToken(req);
    return next();
  }

  const expected = req.session?.csrf;
  const provided = req.body?._csrf || req.get('x-csrf-token');

  const ok =
    expected &&
    provided &&
    expected.length === provided.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));

  if (!ok) {
    return res.status(403).send(
      renderError('Sesión inválida o token CSRF incorrecto. Vuelve atrás y reintenta.'),
    );
  }
  return next();
}

function renderError(message) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>403</title></head>
  <body style="font-family:system-ui;background:#0c0e14;color:#e6e8ee;display:grid;place-items:center;height:100vh;margin:0">
  <div style="text-align:center"><h1 style="color:#ef4444">403</h1><p>${message}</p>
  <a href="/dashboard" style="color:#7c5cff">← Volver al panel</a></div></body></html>`;
}

/**
 * Hidden input to drop inside every <form>.
 */
export function csrfField(token) {
  return `<input type="hidden" name="_csrf" value="${token}">`;
}
