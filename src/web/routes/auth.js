import { Router } from 'express';

const router = Router();

const DISCORD_API = 'https://discord.com/api/v10';

function getOAuthURL(state) {
    const params = new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        redirect_uri: process.env.DASHBOARD_URL + '/auth/callback',
        response_type: 'code',
        scope: 'identify guilds',
        state,
    });
    return `https://discord.com/api/oauth2/authorize?${params}`;
}

router.get('/debug', (req, res) => {
    res.json({
        CLIENT_ID: process.env.CLIENT_ID,
        DASHBOARD_URL: process.env.DASHBOARD_URL,
        redirect_uri: process.env.DASHBOARD_URL + '/auth/callback',
        full_url: getOAuthURL('test'),
    });
});

router.get('/login', (req, res) => {
    const state = Math.random().toString(36).slice(2);
    req.session.oauthState = state;
    req.session.save(() => res.redirect(getOAuthURL(state)));
});

router.get('/callback', async (req, res) => {
    const { code, state } = req.query;

    if (!code || state !== req.session.oauthState) {
        return res.redirect('/dashboard/login?error=invalid_state');
    }

    delete req.session.oauthState;

    try {
        const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                redirect_uri: process.env.DASHBOARD_URL + '/auth/callback',
            }),
        });

        if (!tokenRes.ok) throw new Error('Token exchange failed');
        const tokens = await tokenRes.json();

        const [userRes, guildsRes] = await Promise.all([
            fetch(`${DISCORD_API}/users/@me`, {
                headers: { Authorization: `Bearer ${tokens.access_token}` },
            }),
            fetch(`${DISCORD_API}/users/@me/guilds`, {
                headers: { Authorization: `Bearer ${tokens.access_token}` },
            }),
        ]);

        const user = await userRes.json();
        const guilds = await guildsRes.json();

        req.session.user = {
            id: user.id,
            username: user.username,
            avatar: user.avatar,
            accessToken: tokens.access_token,
        };
        req.session.guilds = guilds;

        res.redirect('/dashboard');
    } catch (err) {
        console.error('OAuth error:', err);
        res.redirect('/dashboard/login?error=auth_failed');
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/dashboard/login');
});

export default router;
