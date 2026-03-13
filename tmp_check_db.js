const pool = require('./config/db');

(async () => {
    try {
        const result = await pool.query("SELECT id, email, role FROM users WHERE role = 'admin';");
        console.log('Admin Users:', result.rows);
        process.exit(0);
    } catch (err) {
        console.error('Error checking users:', err);
        process.exit(1);
    }
})();
