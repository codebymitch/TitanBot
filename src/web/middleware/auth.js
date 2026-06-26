export function requireAuth(req, res, next) {
    if (!req.session?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

export function requireAuthPage(req, res, next) {
    if (!req.session?.user) {
        return res.redirect('/dashboard/login');
    }
    next();
}
