class ProxyTrustConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ProxyTrustConfigError';
        this.code = 'PROXY_TRUST_CONFIG_INVALID';
    }
}

const getTrustedProxyHops = (env = process.env) => {
    const raw = String(env.NOVASTORE_TRUST_PROXY_HOPS || '').trim();
    if (!raw) return 0;
    if (!/^[0-9]+$/.test(raw)) {
        throw new ProxyTrustConfigError('NOVASTORE_TRUST_PROXY_HOPS must be an integer between 0 and 8.');
    }
    const hops = Number(raw);
    if (!Number.isSafeInteger(hops) || hops < 0 || hops > 8) {
        throw new ProxyTrustConfigError('NOVASTORE_TRUST_PROXY_HOPS must be an integer between 0 and 8.');
    }
    return hops;
};

const isRenderRuntime = (env = process.env) => (
    String(env.RENDER || '').trim().toLowerCase() === 'true'
    || Boolean(String(env.RENDER_SERVICE_ID || '').trim())
    || Boolean(String(env.RENDER_EXTERNAL_URL || '').trim())
);

const getPaymentClientIpConfigIssues = (env = process.env) => {
    try {
        const hops = getTrustedProxyHops(env);
        return isRenderRuntime(env) && hops === 0 ? ['NOVASTORE_TRUST_PROXY_HOPS'] : [];
    } catch (_) {
        return ['NOVASTORE_TRUST_PROXY_HOPS'];
    }
};

module.exports = {
    ProxyTrustConfigError,
    getPaymentClientIpConfigIssues,
    getTrustedProxyHops,
    isRenderRuntime
};
