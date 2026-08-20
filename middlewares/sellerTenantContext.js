'use strict';

const {
    SellerTenantError,
    resolveTenantContext,
    requireTenantPermission
} = require('../services/sellerTenantContextService');

const sellerError = (res, code, statusCode) => res.status(statusCode).json({ code, error: code });

const createSellerTenantContextMiddleware = ({ resolveContext = resolveTenantContext, requirePermission = requireTenantPermission } = {}) => {
    if (typeof resolveContext !== 'function' || typeof requirePermission !== 'function') throw new TypeError('Seller tenant dependencies are required.');
    const resolveServerTenantContext = async (req, res, next) => {
        try {
            const context = await resolveContext(req.app?.locals?.sellerDatabase, req.sellerSession);
            req.sellerContext = Object.freeze(context);
            return next();
        } catch (error) {
            const code = error instanceof SellerTenantError ? error.code : 'NO_ACTIVE_MEMBERSHIP';
            const status = error instanceof SellerTenantError ? error.statusCode : 403;
            return sellerError(res, code, status);
        }
    };
    const requireSellerPermission = (permission) => (req, res, next) => {
        try {
            requirePermission(req.sellerContext, permission);
            return next();
        } catch (error) {
            const code = error instanceof SellerTenantError ? error.code : 'PERMISSION_DENIED';
            const status = error instanceof SellerTenantError ? error.statusCode : 403;
            return sellerError(res, code, status);
        }
    };
    return Object.freeze({ resolveServerTenantContext, requireSellerPermission });
};

module.exports = Object.freeze({ createSellerTenantContextMiddleware });
