require('dotenv').config({ quiet: true });

const { parseMode, assertSafeSeedTarget } = require('./seedMarketplaceCategories');

const main = async () => {
    const mode = parseMode(process.argv.slice(2));
    const safety = assertSafeSeedTarget(process.env);
    const { runMarketplaceNavigationSeed } = require('../services/marketplaceNavigationSeedService');
    const pool = require('../config/db');
    try {
        const report = await runMarketplaceNavigationSeed(pool, { apply: mode === 'apply' });
        console.log(JSON.stringify({ target: safety.target.label, ...report }, null, 2));
    } finally {
        await pool.end();
    }
};

if (require.main === module) {
    main().catch((error) => {
        console.error(JSON.stringify({
            error: error.message,
            code: error.code || null,
            report: error.report || null
        }, null, 2));
        process.exitCode = 1;
    });
}

module.exports = { main };
