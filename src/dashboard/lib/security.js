import session from 'express-session';
import crypto from 'crypto';
import { logger } from '../../utils/logger.js';

/**
 * Hardened session middleware.
 *
 * - SESSION_SECRET is required in production. In dev we generate an
 *   ephemeral one (sessions won't survive a restart, which is fine).
 *   We never ship a hardcoded shared default.
 * - Cookie is httpOnly + sameSite=lax, and Secure when not local.
 */
export function createSessionMiddleware() {
  let secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 16 || secret === 'change_me_to_a_long_random_string') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'SESSION_SECRET is required in production and must be a long random string.',
      );
    }
    secret = crypto.randomBytes(32).toString('hex');
    logger.warn('SESSION_SECRET not set — using a temporary dev secret (sessions reset on restart).');
  }

  const isProd = process.env.NODE_ENV === 'production';
  const redirect = process.env.REDIRECT_URI || '';
  const secureCookie = isProd && redirect.startsWith('https://');

  return session({
    name: 'wolf.sid',
    secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookie,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  });
}

/**
 * Baseline security headers (no extra dependency / no helmet needed).
 */
export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "img-src 'self' https://cdn.discordapp.com data:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "script-src 'self' 'unsafe-inline'",
      "frame-ancestors 'none'",
    ].join('; '),
  );
  next();
}
