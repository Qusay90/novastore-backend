const pool = require('../config/db');
const { AdminCatalogMutationError } = require('../services/adminCatalogMutationPolicy');
const { ProductCategoryValidationError } = require('../services/productCategoryService');
const { AttributeValidationError } = require('../services/attributeService');
const {
    readAdminCatalogProductDetail,
    createAdminCatalogProduct,
    updateAdminCatalogProduct,
    archiveAdminCatalogProduct
} = require('../services/adminCatalogProductService');

const readRequestId = (req) => req.get?.('x-request-id') || req.headers?.['x-request-id'] || null;

const isExpectedCatalogError = (error) =>
    error instanceof AdminCatalogMutationError
    || error instanceof ProductCategoryValidationError
    || error instanceof AttributeValidationError;

const sendCatalogProductError = (res, error) => {
    const expected = isExpectedCatalogError(error);
    if (!expected) {
        console.error('Admin katalog ürün işlemi hatası:', error?.message || error);
    }
    const statusCode = expected ? (error.statusCode || 400) : 500;
    const payload = {
        code: expected ? (error.code || 'ADMIN_CATALOG_PRODUCT_INVALID') : 'ADMIN_CATALOG_PRODUCT_INTERNAL_ERROR',
        error: expected ? error.message : 'Ürün işlemi tamamlanamadı.'
    };
    if (expected && error.details !== undefined) payload.details = error.details;
    return res.status(statusCode).json(payload);
};

const createAdminCatalogProductHandlers = (database) => ({
    getAdminCatalogProduct: async (req, res) => {
        try {
            return res.status(200).json(await readAdminCatalogProductDetail(database, req.params.id));
        } catch (error) {
            return sendCatalogProductError(res, error);
        }
    },
    createAdminCatalogProduct: async (req, res) => {
        try {
            const result = await createAdminCatalogProduct(database, {
                actor: req.currentAdmin,
                body: req.body,
                requestId: readRequestId(req)
            });
            return res.status(201).json(result);
        } catch (error) {
            return sendCatalogProductError(res, error);
        }
    },
    updateAdminCatalogProduct: async (req, res) => {
        try {
            const result = await updateAdminCatalogProduct(database, req.params.id, {
                actor: req.currentAdmin,
                body: req.body,
                requestId: readRequestId(req)
            });
            return res.status(200).json(result);
        } catch (error) {
            return sendCatalogProductError(res, error);
        }
    },
    archiveAdminCatalogProduct: async (req, res) => {
        try {
            const result = await archiveAdminCatalogProduct(database, req.params.id, {
                actor: req.currentAdmin,
                body: req.body,
                requestId: readRequestId(req)
            });
            return res.status(200).json(result);
        } catch (error) {
            return sendCatalogProductError(res, error);
        }
    }
});

const handlers = createAdminCatalogProductHandlers(pool);

module.exports = {
    ...handlers,
    createAdminCatalogProductHandlers,
    sendCatalogProductError
};
