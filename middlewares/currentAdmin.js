const pool = require('../config/db');
const { createRequireCurrentAdmin } = require('../services/currentAdminGuard');

const requireCurrentAdmin = createRequireCurrentAdmin(pool);

module.exports = { createRequireCurrentAdmin, requireCurrentAdmin };
