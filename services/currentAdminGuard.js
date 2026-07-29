const createRequireCurrentAdmin = (database) => async (req, res, next) => {
    try {
        const result = await database.query(
            'SELECT id, role, auth_enabled FROM users WHERE id = $1',
            [req.user.id]
        );
        const currentUser = result.rows[0];

        if (!currentUser || currentUser.auth_enabled !== true) {
            return res.status(401).json({ error: 'Yönetici hesabı bulunamadı.' });
        }
        if (currentUser.role !== 'admin') {
            return res.status(403).json({ error: 'Yönetici yetkisi artık geçerli değil.' });
        }

        req.currentAdmin = {
            id: Number(currentUser.id),
            role: currentUser.role
        };
        return next();
    } catch (error) {
        console.error('Güncel admin yetkisi doğrulama hatası:', error.message);
        return res.status(503).json({ error: 'Yönetici yetkisi geçici olarak doğrulanamadı.' });
    }
};

module.exports = { createRequireCurrentAdmin };
