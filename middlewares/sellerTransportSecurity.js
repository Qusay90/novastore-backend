'use strict';

const net = require('node:net');

const normalizeRemoteAddress = (value) => {
    const address = String(value || '').trim();
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/iu.exec(address);
    return mapped ? mapped[1] : address;
};

const createIngressBlockList = (entries) => {
    const blockList = new net.BlockList();
    for (const entry of entries) {
        const slash = entry.lastIndexOf('/');
        const address = entry.slice(0, slash);
        const prefix = Number(entry.slice(slash + 1));
        const family = net.isIP(address) === 4 ? 'ipv4' : 'ipv6';
        blockList.addSubnet(address, prefix, family);
    }
    return blockList;
};

const createSellerTransportSecurityMiddleware = ({ required = false, trustedIngressCidrs = [] } = {}) => {
    const blockList = createIngressBlockList(trustedIngressCidrs);
    return (req, res, next) => {
        if (!required || req.socket?.encrypted === true) return next();
        const remoteAddress = normalizeRemoteAddress(req.socket?.remoteAddress);
        const family = net.isIP(remoteAddress);
        const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '').trim().toLowerCase();
        const trustedIngress = family !== 0 && blockList.check(remoteAddress, family === 4 ? 'ipv4' : 'ipv6');
        if (trustedIngress && forwardedProto === 'https') return next();
        return res.status(426).json({ code: 'HTTPS_REQUIRED', error: 'HTTPS_REQUIRED' });
    };
};

module.exports = Object.freeze({
    createSellerTransportSecurityMiddleware,
    normalizeRemoteAddress
});
