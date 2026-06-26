import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import session from 'express-session';
import authRouter from './routes/auth.js';
import { createApiRouter } from './routes/api.js';
import { requireAuthPage } from './middleware/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, 'public');

export function mountDashboard(app, client) {
    app.set('trust proxy', 1);

    app.use(session({
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

    app.get('/dashboard/guild/:id/applications', requireAuthPage, (req, res) => {
        res.sendFile(join(publicDir, 'applications.html'));
    });
}
