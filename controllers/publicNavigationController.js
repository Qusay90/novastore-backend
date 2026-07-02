const { getPublicNavigation } = require('../services/menuService');

const getNavigation = async (req, res) => {
    try {
        return res.status(200).json(await getPublicNavigation(req.params.code));
    } catch (error) {
        if (!error.statusCode || error.statusCode >= 500) {
            console.error('Public navigation hatası:', error.message);
        }
        return res.status(error.statusCode || 500).json({
            error: error.statusCode ? error.message : 'Navigasyon yüklenemedi.',
            code: error.code
        });
    }
};

module.exports = { getNavigation };
