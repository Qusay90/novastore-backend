const {
    listPublicCollections,
    getPublicCollection
} = require('../services/collectionService');

const sendError = (res, error, fallback) => {
    if (!error.statusCode || error.statusCode >= 500) {
        console.error('Public koleksiyon API hatası:', error.message);
    }
    return res.status(error.statusCode || 500).json({
        error: error.statusCode ? error.message : fallback,
        code: error.code
    });
};

const getCollections = async (req, res) => {
    try {
        return res.status(200).json(await listPublicCollections());
    } catch (error) {
        return sendError(res, error, 'Koleksiyonlar yüklenemedi.');
    }
};

const getCollection = async (req, res) => {
    try {
        return res.status(200).json(await getPublicCollection(req.params.slug, {
            page: req.query.page || 1,
            limit: req.query.limit || 24
        }));
    } catch (error) {
        return sendError(res, error, 'Koleksiyon yüklenemedi.');
    }
};

module.exports = {
    getCollections,
    getCollection
};
