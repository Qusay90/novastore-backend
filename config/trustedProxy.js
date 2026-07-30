const net = require('node:net');

const isRenderRuntime = (env = process.env) => (
    String(env.RENDER || '').trim().toLowerCase() === 'true'
);

const resolveTrustedProxy = (env = process.env) => (isRenderRuntime(env) ? 1 : false);

const normalizeIp = (value) => {
    let candidate = String(value || '').trim();
    if (candidate.startsWith('[') && candidate.endsWith(']')) candidate = candidate.slice(1, -1);
    if (candidate.toLowerCase().startsWith('::ffff:')) {
        const mappedIpv4 = candidate.slice(7);
        if (net.isIP(mappedIpv4) === 4) return mappedIpv4;
    }
    return net.isIP(candidate) ? candidate.toLowerCase() : '';
};

const isPrivateProxyAddress = (value) => {
    const address = normalizeIp(value);
    if (!address) return false;
    if (net.isIP(address) === 4) {
        const [first, second] = address.split('.').map(Number);
        return first === 10
            || first === 127
            || (first === 169 && second === 254)
            || (first === 172 && second >= 16 && second <= 31)
            || (first === 192 && second === 168);
    }
    return address === '::1'
        || address.startsWith('fc')
        || address.startsWith('fd')
        || /^fe[89ab]/.test(address);
};

const invalidProxyChain = () => Object.assign(
    new Error('PUBLIC_AUTH_PROXY_CHAIN_INVALID'),
    { code: 'PUBLIC_AUTH_PROXY_CHAIN_INVALID', statusCode: 503 }
);

const resolveSensitiveRequestIp = (req, { env = process.env } = {}) => {
    const peer = normalizeIp(req?.socket?.remoteAddress || req?.connection?.remoteAddress);
    if (!peer) throw invalidProxyChain();
    if (!isRenderRuntime(env)) return peer;

    // Render is a single trusted proxy hop. Reject any forwarded chain that
    // could have survived upstream sanitisation instead of accepting a spoofed client IP.
    if (!isPrivateProxyAddress(peer)) throw invalidProxyChain();
    const forwarded = req?.headers?.['x-forwarded-for'];
    if (Array.isArray(forwarded) || typeof forwarded !== 'string') throw invalidProxyChain();
    const values = forwarded.split(',').map((part) => part.trim()).filter(Boolean);
    if (values.length !== 1) throw invalidProxyChain();
    const client = normalizeIp(values[0]);
    if (!client) throw invalidProxyChain();
    return client;
};

const configureTrustedProxy = (app, { env = process.env } = {}) => {
    const trustProxy = resolveTrustedProxy(env);
    app.set('trust proxy', trustProxy);
    return trustProxy;
};

module.exports = {
    configureTrustedProxy,
    isPrivateProxyAddress,
    isRenderRuntime,
    normalizeIp,
    resolveSensitiveRequestIp,
    resolveTrustedProxy
};
