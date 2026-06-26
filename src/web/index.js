import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import authRouter from './routes/auth.js';
import { createApiRouter } from './routes/api.js';
import { requireAuthPage } from './middleware/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, 'public');
const PgSession = connectPgSimple(session);

export function mountDashboard(app, client) {
    const pool = client.db?.db?.pool;

    const store = pool
        ? new PgSession({ pool, createTableIfMissing: true })
        : undefined;

    app.use(session({
        store,
        secret: process.env.SESSION_SECRET || 'titanbot-dashboard-secret-change-me',
        resave: false,
        saveUninitialized: false,
        cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 86400000 },
    }));

    app.use(express.json());

    app.use('/auth', authRouter);
    app.use('/api', createApiRouter(client));
    app.use('/dashboard/assets', express.static(join(publicDir, 'assets')));

    app.get('/dashboard/login', (req, res) => {
        if (req.session?.user) return res.redirect('/dashboard');
        res.sendFile(join(publicDir, 'login.html'));
    });

    app.get('/dashboard', requireAuthPage, (req, res) => {
        res.sendFile(join(publicDir, 'dashboard.html'));
    });

    app.get('/dashboard/guild/:id', requireAuthPage, (req, res) => {
        res.sendFile(join(publicDir, 'guild.html'));
    });
}
