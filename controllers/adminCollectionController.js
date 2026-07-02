const {
    listAdminCollections,
    createCollection,
    updateCollection,
    archiveCollection,
    addManualCollectionProduct,
    removeManualCollectionProduct
} = require('../services/collectionService');

const sendError = (res, error, fallback) => {
    if (!error.statusCode || error.statusCode >= 500) {
        console.error('Admin koleksiyon API hatası:', error.message);
    }
    return res.status(error.statusCode || 500).json({
        error: error.statusCode ? error.message : fallback,
        code: error.code
    });
};

const getCollections = async (req, res) => {
    try {
        return res.status(200).json(await listAdminCollections());
    } catch (error) {
        return sendError(res, error, 'Koleksiyonlar yüklenemedi.');
    }
};

const postCollection = async (req, res) => {
    try {
        return res.status(201).json({ collection: await createCollection(req.body) });
    } catch (error) {
        return sendError(res, error, 'Koleksiyon oluşturulamadı.');
    }
};

const patchCollection = async (req, res) => {
    try {
        return res.status(200).json({
            collection: await updateCollection(req.params.id, req.body)
        });
    } catch (error) {
        return sendError(res, error, 'Koleksiyon güncellenemedi.');
    }
};

const patchCollectionArchive = async (req, res) => {
    try {
        return res.status(200).json({
            collection: await archiveCollection(req.params.id, req.body.archived !== false)
        });
    } catch (error) {
        return sendError(res, error, 'Koleksiyon arşivlenemedi.');
    }
};

const postCollectionProduct = async (req, res) => {
    try {
        return res.status(201).json({
            item: await addManualCollectionProduct(
                req.params.id,
                req.body.product_id ?? req.body.productId,
                req.body.sort_order ?? req.body.sortOrder ?? 0
            )
        });
    } catch (error) {
        return sendError(res, error, 'Koleksiyon ürünü eklenemedi.');
    }
};

const deleteCollectionProduct = async (req, res) => {
    try {
        return res.status(200).json(await removeManualCollectionProduct(
            req.params.id,
            req.params.productId
        ));
    } catch (error) {
        return sendError(res, error, 'Koleksiyon ürünü çıkarılamadı.');
    }
};

module.exports = {
    getCollections,
    postCollection,
    patchCollection,
    patchCollectionArchive,
    postCollectionProduct,
    deleteCollectionProduct
};
