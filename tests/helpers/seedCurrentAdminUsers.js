const seedCurrentAdminUsers = async (database) => {
    await database.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            full_name VARCHAR(100),
            name VARCHAR(100),
            email VARCHAR(100) UNIQUE NOT NULL,
            phone VARCHAR(20),
            password VARCHAR(255) NOT NULL,
            role VARCHAR(20) DEFAULT 'customer',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await database.query(`
        INSERT INTO users (id, email, password, role)
        VALUES
            (1, 'admin-smoke@example.invalid', 'not-used', 'admin'),
            (2, 'customer-smoke@example.invalid', 'not-used', 'customer')
        ON CONFLICT (id) DO UPDATE
        SET role = EXCLUDED.role
    `);
};

module.exports = { seedCurrentAdminUsers };
