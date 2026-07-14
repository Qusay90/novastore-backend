const pool = require('../config/db');
const { createRequireCurrentAdmin } = require('../services/currentAdminGuard');

const requireCurrentAdmin = createRequireCurrentAdmin(pool);

const requireCurrentAdminIfClaimed = (req, res, next) => {
    if (req.user?.role !== 'admin') return next();
    return requireCurrentAdmin(req, res, next);
};

module.exports = { createRequireCurrentAdmin, requireCurrentAdmin, requireCurrentAdminIfClaimed };
