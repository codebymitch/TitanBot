// Shared utilities for all dashboard pages

async function api(url, options = {}) {
    try {
        const res = await fetch(url, {
            headers: { 'Content-Type': 'application/json', ...options.headers },
            ...options,
            body: options.body ? JSON.stringify(options.body) : undefined,
        });
        if (res.status === 401) { location.href = '/dashboard/login'; return null; }
        if (!res.ok) throw new Error(await res.text());
        return await res.json();
    } catch (err) {
        console.error(url, err);
        toast(err.message || 'Request failed', 'error');
        return null;
    }
}

function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function toast(message, type = 'success') {
    const container = document.getElementById('toasts');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${type === 'success' ? '✅' : '❌'}</span> ${escHtml(message)}`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 4000);
}

function buildSelect(options, value, placeholder = 'None / Not set') {
    const opts = [`<option value="">${escHtml(placeholder)}</option>`,
        ...options.map(o => `<option value="${escHtml(o.id)}" ${o.id === value ? 'selected' : ''}>${escHtml(o.name)}</option>`)
    ];
    return opts.join('');
}

function channelOptions(channels, types) {
    return channels.filter(c => types.includes(c.type));
}

// Discord channel types
const CH = { TEXT: 0, CATEGORY: 4, ANNOUNCEMENT: 5 };
