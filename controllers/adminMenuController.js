const {
    listAdminMenus,
    createMenu,
    updateMenu,
    listAdminMenuItems,
    createMenuItem,
    updateMenuItem,
    archiveMenuItem,
    reorderMenuItems
} = require('../services/menuService');

const sendError = (res, error, fallback) => {
    if (!error.statusCode || error.statusCode >= 500) {
        console.error('Admin menü API hatası:', error.message);
    }
    return res.status(error.statusCode || 500).json({
        error: error.statusCode ? error.message : fallback,
        code: error.code
    });
};

const getMenus = async (req, res) => {
    try {
        return res.status(200).json(await listAdminMenus());
    } catch (error) {
        return sendError(res, error, 'Menüler yüklenemedi.');
    }
};

const postMenu = async (req, res) => {
    try {
        return res.status(201).json({ menu: await createMenu(req.body) });
    } catch (error) {
        return sendError(res, error, 'Menü oluşturulamadı.');
    }
};

const patchMenu = async (req, res) => {
    try {
        return res.status(200).json({ menu: await updateMenu(req.params.id, req.body) });
    } catch (error) {
        return sendError(res, error, 'Menü güncellenemedi.');
    }
};

const getMenuItems = async (req, res) => {
    const format = String(req.query.format || 'tree').toLowerCase();
    if (!['tree', 'flat'].includes(format)) {
        return res.status(400).json({ error: 'format tree veya flat olmalıdır.' });
    }
    try {
        return res.status(200).json(await listAdminMenuItems({
            menuId: req.query.menu_id,
            format
        }));
    } catch (error) {
        return sendError(res, error, 'Menü öğeleri yüklenemedi.');
    }
};

const postMenuItem = async (req, res) => {
    try {
        return res.status(201).json({ item: await createMenuItem(req.body) });
    } catch (error) {
        return sendError(res, error, 'Menü öğesi oluşturulamadı.');
    }
};

const patchMenuItem = async (req, res) => {
    try {
        return res.status(200).json({ item: await updateMenuItem(req.params.id, req.body) });
    } catch (error) {
        return sendError(res, error, 'Menü öğesi güncellenemedi.');
    }
};

const patchMenuItemArchive = async (req, res) => {
    try {
        return res.status(200).json({
            item: await archiveMenuItem(req.params.id, req.body.archived !== false)
        });
    } catch (error) {
        return sendError(res, error, 'Menü öğesi arşivlenemedi.');
    }
};

const patchMenuItemReorder = async (req, res) => {
    try {
        return res.status(200).json({
            items: await reorderMenuItems(req.body.items)
        });
    } catch (error) {
        return sendError(res, error, 'Menü sıralaması güncellenemedi.');
    }
};

module.exports = {
    getMenus,
    postMenu,
    patchMenu,
    getMenuItems,
    postMenuItem,
    patchMenuItem,
    patchMenuItemArchive,
    patchMenuItemReorder
};
