const requireAdminCatalogJson = (req, res, next) => {
    const mediaType = String(req.headers?.['content-type'] || '')
        .split(';', 1)[0]
        .trim()
        .toLowerCase();
    if (mediaType !== 'application/json') {
        return res.status(415).json({
            code: 'ADMIN_CATALOG_JSON_REQUIRED',
            error: 'Bu katalog işlemi Content-Type application/json gerektirir.'
        });
    }
    return next();
};

module.exports = { requireAdminCatalogJson };
