import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import { logger } from '../utils/logger.js';
import { createSessionMiddleware, securityHeaders } from './lib/security.js';
import { csrfProtection } from './lib/csrf.js';
import { authRoutes } from './routes/auth.js';
import { pageRoutes } from './routes/pages.js';
import { apiRoutes } from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Wolf web dashboard.
 *
 * Security model:
 *  - hardened session (no shared default secret, httpOnly/sameSite)
 *  - CSRF token required on every state-changing POST
 *  - every /server/:id route (page + api) re-checks that the logged-in
 *    user actually has admin on THAT guild (closes the prior IDOR)
 *  - all dynamic text is HTML-escaped in the views
 */
export function setupDashboard(app, client) {
  app.use(express.urlencoded({ extended: true, limit: '32kb' }));

  app.use(
    '/assets',
    express.static(path.join(__dirname, 'public'), {
      maxAge: '7d',
      etag: true,
    }),
  );

  app.use(createSessionMiddleware());
  app.use(securityHeaders);
  app.use(csrfProtection);

  app.use('/', authRoutes());
  app.use('/', pageRoutes(client));
  app.use('/api', apiRoutes(client));

  logger.info('Wolf dashboard mounted (/, /dashboard, /server/:id, /api)');
}
