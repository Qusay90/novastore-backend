const createRequireCurrentAdmin = (database) => async (req, res, next) => {
    try {
        const result = await database.query(
            'SELECT id, role FROM users WHERE id = $1',
            [req.user.id]
        );
        const currentUser = result.rows[0];

        if (!currentUser) {
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
        return res.status(500).json({ error: 'Yönetici yetkisi doğrulanamadı.' });
    }
};

module.exports = { createRequireCurrentAdmin };
