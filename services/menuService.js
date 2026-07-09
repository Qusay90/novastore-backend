const pool = require('../config/db');
const { listPublicCategories } = require('./categoryService');
const { listPublicCollections } = require('./collectionService');

const MENU_CODES = new Set(['main', 'footer', 'mobile', 'home']);
const TARGET_TYPES = new Set(['category', 'collection', 'internal_url']);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

class MenuDomainError extends Error {
    constructor(message, { code = 'MENU_DOMAIN_ERROR', statusCode = 400 } = {}) {
        super(message);
        this.name = 'MenuDomainError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

const asInteger = (value, field, { nullable = false, min = 0 } = {}) => {
    if (nullable && (value === null || value === undefined || value === '')) return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min) {
        throw new MenuDomainError(`${field} geçerli bir tamsayı olmalıdır.`);
    }
    return parsed;
};

const cleanText = (value, maxLength, { nullable = true } = {}) => {
    if (value === null || value === undefined) return nullable ? null : '';
    const normalized = String(value).trim();
    if (!normalized) return nullable ? null : '';
    return normalized.slice(0, maxLength);
};

const safeInternalUrl = (value) => {
    const normalized = cleanText(value, 500);
    if (!normalized) return null;
    if (!normalized.startsWith('/') || normalized.startsWith('//') || /[\\\u0000-\u001f]/.test(normalized)) {
        throw new MenuDomainError('internal_url yalnızca güvenli site içi path olabilir.', {
            code: 'MENU_URL_INVALID'
        });
    }
    return normalized;
};

const safePublicAssetUrl = (value) => {
    const normalized = cleanText(value, 2000);
    if (!normalized) return null;
    if (normalized.startsWith('/') && !normalized.startsWith('//')) return normalized;
    try {
        const parsed = new URL(normalized);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
    } catch (_) {
        return null;
    }
};

const buildPublicCategoryTarget = (category) => {
    if (!category) return null;
    const rawPath = cleanText(category.path || category.slug, 1000);
    if (!rawPath) return null;
    const encodedPath = rawPath
        .replace(/^\/+|\/+$/g, '')
        .split('/')
        .map((segment) => segment.trim())
        .filter(Boolean)
        .map(encodeURIComponent)
        .join('/');
    if (!encodedPath) return null;
    return {
        type: 'category',
        id: category.id,
        slug: category.slug,
        path: category.path || category.slug,
        url: `/kategori/${encodedPath}`
    };
};

const normalizeMenu = (row) => ({
    ...row,
    id: Number(row.id)
});

const normalizeMenuItem = (row) => ({
    ...row,
    id: Number(row.id),
    menu_id: Number(row.menu_id),
    parent_id: row.parent_id === null ? null : Number(row.parent_id),
    category_id: row.category_id === null ? null : Number(row.category_id),
    collection_id: row.collection_id === null ? null : Number(row.collection_id),
    sort_order: Number(row.sort_order || 0)
});

const compareItems = (left, right) =>
    Number(left.sort_order || 0) - Number(right.sort_order || 0) ||
    Number(left.id) - Number(right.id);

const buildAdminItemTree = (items) => {
    const nodes = items.map((item) => ({ ...item, children: [] }));
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const roots = [];
    nodes.forEach((node) => {
        const parent = node.parent_id === null ? null : byId.get(node.parent_id);
        if (parent) parent.children.push(node);
        else roots.push(node);
    });
    const sort = (entries) => {
        entries.sort(compareItems);
        entries.forEach((entry) => sort(entry.children));
    };
    sort(roots);
    return roots;
};

const listAdminMenus = async ({ queryable = pool } = {}) => {
    const result = await queryable.query(`
        SELECT menu.*, COUNT(item.id)::INTEGER AS item_count
        FROM menus menu
        LEFT JOIN menu_items item ON item.menu_id = menu.id
        GROUP BY menu.id
        ORDER BY menu.code ASC
    `);
    return result.rows.map((row) => ({
        ...normalizeMenu(row),
        item_count: Number(row.item_count || 0)
    }));
};

const getMenu = async (id, queryable = pool) => {
    const parsedId = asInteger(id, 'menu id', { min: 1 });
    const result = await queryable.query('SELECT * FROM menus WHERE id = $1', [parsedId]);
    if (result.rows.length === 0) {
        throw new MenuDomainError('Menü bulunamadı.', {
            code: 'MENU_NOT_FOUND',
            statusCode: 404
        });
    }
    return normalizeMenu(result.rows[0]);
};

const createMenu = async (body = {}, { queryable = pool } = {}) => {
    const code = String(body.code || '').trim().toLowerCase();
    const name = cleanText(body.name, 120, { nullable: false });
    if (!MENU_CODES.has(code)) {
        throw new MenuDomainError('Menü code main, footer, mobile veya home olmalıdır.');
    }
    if (!name) throw new MenuDomainError('Menü adı zorunludur.');
    try {
        const result = await queryable.query(`
            INSERT INTO menus (code, name, is_active)
            VALUES ($1, $2, $3)
            RETURNING *
        `, [code, name, body.is_active ?? body.isActive ?? true]);
        return normalizeMenu(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            throw new MenuDomainError('Menü code zaten kullanılıyor.', {
                code: 'MENU_CODE_CONFLICT',
                statusCode: 409
            });
        }
        throw error;
    }
};

const updateMenu = async (id, body = {}, { queryable = pool } = {}) => {
    const existing = await getMenu(id, queryable);
    const code = String(body.code ?? existing.code).trim().toLowerCase();
    const name = cleanText(body.name ?? existing.name, 120, { nullable: false });
    if (!MENU_CODES.has(code)) throw new MenuDomainError('Geçersiz menü code.');
    if (!name) throw new MenuDomainError('Menü adı zorunludur.');
    try {
        const result = await queryable.query(`
            UPDATE menus
            SET code = $1, name = $2, is_active = $3, updated_at = CURRENT_TIMESTAMP
            WHERE id = $4
            RETURNING *
        `, [code, name, body.is_active ?? body.isActive ?? existing.is_active, existing.id]);
        return normalizeMenu(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            throw new MenuDomainError('Menü code zaten kullanılıyor.', {
                code: 'MENU_CODE_CONFLICT',
                statusCode: 409
            });
        }
        throw error;
    }
};

const listAdminMenuItems = async (
    { menuId = null, format = 'tree', queryable = pool } = {}
) => {
    const values = [];
    const where = menuId === null || menuId === undefined
        ? ''
        : 'WHERE item.menu_id = $1';
    if (where) values.push(asInteger(menuId, 'menu_id', { min: 1 }));
    const result = await queryable.query(`
        SELECT item.*
        FROM menu_items item
        ${where}
        ORDER BY item.sort_order ASC, item.id ASC
    `, values);
    const items = result.rows.map(normalizeMenuItem);
    return format === 'flat' ? items : buildAdminItemTree(items);
};

const normalizeTarget = (body, existing = null) => {
    const rawType = hasOwn(body, 'target_type')
        ? body.target_type
        : hasOwn(body, 'targetType')
            ? body.targetType
            : existing?.target_type ?? null;
    const targetType = rawType === null || rawType === '' ? null : String(rawType).trim().toLowerCase();
    if (targetType !== null && !TARGET_TYPES.has(targetType)) {
        throw new MenuDomainError('Geçersiz menu item target_type.');
    }
    const categoryId = targetType === 'category'
        ? asInteger(body.category_id ?? body.categoryId ?? existing?.category_id, 'category_id', { min: 1 })
        : null;
    const collectionId = targetType === 'collection'
        ? asInteger(body.collection_id ?? body.collectionId ?? existing?.collection_id, 'collection_id', { min: 1 })
        : null;
    const internalUrl = targetType === 'internal_url'
        ? safeInternalUrl(body.internal_url ?? body.internalUrl ?? existing?.internal_url)
        : null;
    if (targetType === 'internal_url' && !internalUrl) {
        throw new MenuDomainError('internal_url hedefi zorunludur.');
    }
    return {
        target_type: targetType,
        category_id: categoryId,
        collection_id: collectionId,
        internal_url: internalUrl
    };
};

const assertTargetExists = async (target, queryable) => {
    if (target.target_type === 'category') {
        const result = await queryable.query('SELECT 1 FROM categories WHERE id = $1', [target.category_id]);
        if (result.rows.length === 0) {
            throw new MenuDomainError('Target kategori bulunamadı.', {
                code: 'MENU_CATEGORY_NOT_FOUND',
                statusCode: 404
            });
        }
    }
    if (target.target_type === 'collection') {
        const result = await queryable.query('SELECT 1 FROM collections WHERE id = $1', [target.collection_id]);
        if (result.rows.length === 0) {
            throw new MenuDomainError('Target koleksiyon bulunamadı.', {
                code: 'MENU_COLLECTION_NOT_FOUND',
                statusCode: 404
            });
        }
    }
};

const getMenuItem = async (id, queryable = pool) => {
    const parsedId = asInteger(id, 'menu item id', { min: 1 });
    const result = await queryable.query('SELECT * FROM menu_items WHERE id = $1', [parsedId]);
    if (result.rows.length === 0) {
        throw new MenuDomainError('Menü öğesi bulunamadı.', {
            code: 'MENU_ITEM_NOT_FOUND',
            statusCode: 404
        });
    }
    return normalizeMenuItem(result.rows[0]);
};

const assertParentAllowed = async ({ itemId = null, menuId, parentId, queryable }) => {
    if (parentId === null) return;
    const parent = await getMenuItem(parentId, queryable);
    if (parent.menu_id !== menuId) {
        throw new MenuDomainError('Parent aynı menü içinde olmalıdır.', {
            code: 'MENU_PARENT_INVALID',
            statusCode: 409
        });
    }
    if (itemId === null) return;
    const visited = new Set([itemId]);
    let cursor = parent;
    while (cursor) {
        if (visited.has(cursor.id)) {
            throw new MenuDomainError('Menü ağacında döngü oluşturulamaz.', {
                code: 'MENU_CYCLE',
                statusCode: 409
            });
        }
        visited.add(cursor.id);
        cursor = cursor.parent_id === null ? null : await getMenuItem(cursor.parent_id, queryable);
    }
};

const createMenuItem = async (body = {}, { queryable = pool } = {}) => {
    const menuId = asInteger(body.menu_id ?? body.menuId, 'menu_id', { min: 1 });
    await getMenu(menuId, queryable);
    const parentId = asInteger(body.parent_id ?? body.parentId, 'parent_id', {
        nullable: true,
        min: 1
    });
    await assertParentAllowed({ menuId, parentId, queryable });
    const title = cleanText(body.title, 160, { nullable: false });
    if (!title) throw new MenuDomainError('Menü öğesi başlığı zorunludur.');
    const target = normalizeTarget(body);
    await assertTargetExists(target, queryable);
    const result = await queryable.query(`
        INSERT INTO menu_items (
            menu_id, parent_id, title, subtitle, target_type,
            category_id, collection_id, internal_url, icon, image_url,
            accent_color, sort_order, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
    `, [
        menuId,
        parentId,
        title,
        cleanText(body.subtitle, 240),
        target.target_type,
        target.category_id,
        target.collection_id,
        target.internal_url,
        cleanText(body.icon, 120),
        cleanText(body.image_url ?? body.imageUrl, 2000),
        cleanText(body.accent_color ?? body.accentColor, 20),
        asInteger(body.sort_order ?? body.sortOrder ?? 0, 'sort_order'),
        body.is_active ?? body.isActive ?? true
    ]);
    return normalizeMenuItem(result.rows[0]);
};

const updateMenuItem = async (id, body = {}, { queryable = pool } = {}) => {
    const existing = await getMenuItem(id, queryable);
    const menuId = asInteger(body.menu_id ?? body.menuId ?? existing.menu_id, 'menu_id', { min: 1 });
    await getMenu(menuId, queryable);
    const requestedParentId = hasOwn(body, 'parent_id')
        ? body.parent_id
        : hasOwn(body, 'parentId')
            ? body.parentId
            : existing.parent_id;
    const parentId = asInteger(
        requestedParentId,
        'parent_id',
        { nullable: true, min: 1 }
    );
    await assertParentAllowed({ itemId: existing.id, menuId, parentId, queryable });
    const title = cleanText(body.title ?? existing.title, 160, { nullable: false });
    if (!title) throw new MenuDomainError('Menü öğesi başlığı zorunludur.');
    const target = normalizeTarget(body, existing);
    await assertTargetExists(target, queryable);
    const result = await queryable.query(`
        UPDATE menu_items
        SET menu_id = $1,
            parent_id = $2,
            title = $3,
            subtitle = $4,
            target_type = $5,
            category_id = $6,
            collection_id = $7,
            internal_url = $8,
            icon = $9,
            image_url = $10,
            accent_color = $11,
            sort_order = $12,
            is_active = $13,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $14
        RETURNING *
    `, [
        menuId,
        parentId,
        title,
        cleanText(body.subtitle ?? existing.subtitle, 240),
        target.target_type,
        target.category_id,
        target.collection_id,
        target.internal_url,
        cleanText(body.icon ?? existing.icon, 120),
        cleanText(body.image_url ?? body.imageUrl ?? existing.image_url, 2000),
        cleanText(body.accent_color ?? body.accentColor ?? existing.accent_color, 20),
        asInteger(body.sort_order ?? body.sortOrder ?? existing.sort_order, 'sort_order'),
        body.is_active ?? body.isActive ?? existing.is_active,
        existing.id
    ]);
    return normalizeMenuItem(result.rows[0]);
};

const archiveMenuItem = async (id, archived = true, { queryable = pool } = {}) => {
    const existing = await getMenuItem(id, queryable);
    const result = await queryable.query(`
        UPDATE menu_items
        SET is_active = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
    `, [!archived, existing.id]);
    return normalizeMenuItem(result.rows[0]);
};

const reorderMenuItems = async (items, { queryable = pool } = {}) => {
    if (!Array.isArray(items) || items.length === 0 || items.length > 500) {
        throw new MenuDomainError('Reorder için 1-500 öğe gönderilmelidir.');
    }
    const client = typeof queryable.connect === 'function' ? await queryable.connect() : queryable;
    const shouldRelease = client !== queryable;
    try {
        await client.query('BEGIN');
        const updated = [];
        for (const item of items) {
            const existing = await getMenuItem(item.id, client);
            const sortOrder = asInteger(item.sort_order ?? item.sortOrder, 'sort_order');
            const result = await client.query(`
                UPDATE menu_items
                SET sort_order = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                RETURNING *
            `, [sortOrder, existing.id]);
            updated.push(normalizeMenuItem(result.rows[0]));
        }
        await client.query('COMMIT');
        return updated;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        if (shouldRelease) client.release();
    }
};

const getPublicNavigation = async (code, { queryable = pool } = {}) => {
    const normalizedCode = String(code || '').trim().toLowerCase();
    if (!MENU_CODES.has(normalizedCode)) {
        throw new MenuDomainError('Menü bulunamadı.', {
            code: 'MENU_NOT_PUBLIC',
            statusCode: 404
        });
    }
    const menuResult = await queryable.query(`
        SELECT *
        FROM menus
        WHERE code = $1 AND is_active = TRUE
        LIMIT 1
    `, [normalizedCode]);
    if (menuResult.rows.length === 0) {
        throw new MenuDomainError('Menü bulunamadı veya yayında değil.', {
            code: 'MENU_NOT_PUBLIC',
            statusCode: 404
        });
    }
    const menu = normalizeMenu(menuResult.rows[0]);
    const itemResult = await queryable.query(`
        SELECT *
        FROM menu_items
        WHERE menu_id = $1
        ORDER BY sort_order ASC, id ASC
    `, [menu.id]);
    const items = itemResult.rows.map(normalizeMenuItem);
    const publicCategories = await listPublicCategories({ format: 'flat', queryable });
    const publicCollections = await listPublicCollections({ queryable });
    const categoriesById = new Map(publicCategories.map((category) => [category.id, category]));
    const collectionsById = new Map(publicCollections.map((collection) => [collection.id, collection]));
    const childrenByParent = new Map();
    items.forEach((item) => {
        const key = item.parent_id === null ? 'root' : item.parent_id;
        if (!childrenByParent.has(key)) childrenByParent.set(key, []);
        childrenByParent.get(key).push(item);
    });
    childrenByParent.forEach((children) => children.sort(compareItems));

    const visiting = new Set();
    const toPublicItem = (item) => {
        if (!item.is_active || visiting.has(item.id)) return null;
        visiting.add(item.id);
        const children = (childrenByParent.get(item.id) || [])
            .map(toPublicItem)
            .filter(Boolean);
        visiting.delete(item.id);

        let target = null;
        if (item.target_type === 'category') {
            const category = categoriesById.get(item.category_id);
            target = buildPublicCategoryTarget(category);
        } else if (item.target_type === 'collection') {
            const collection = collectionsById.get(item.collection_id);
            if (collection) {
                target = {
                    type: 'collection',
                    id: collection.id,
                    slug: collection.slug,
                    url: `/koleksiyon/${encodeURIComponent(collection.slug)}`
                };
            }
        } else if (item.target_type === 'internal_url') {
            try {
                const url = safeInternalUrl(item.internal_url);
                if (url) target = { type: 'internal_url', url };
            } catch (_) {
                target = null;
            }
        }
        if (!target && children.length === 0) return null;
        return {
            id: item.id,
            title: item.title,
            subtitle: item.subtitle,
            icon: item.icon,
            image_url: safePublicAssetUrl(item.image_url),
            accent_color: /^#[0-9a-f]{6}$/i.test(String(item.accent_color || ''))
                ? item.accent_color
                : null,
            sort_order: item.sort_order,
            target,
            children
        };
    };

    return {
        code: menu.code,
        name: menu.name,
        items: (childrenByParent.get('root') || []).map(toPublicItem).filter(Boolean)
    };
};

module.exports = {
    MenuDomainError,
    buildPublicCategoryTarget,
    listAdminMenus,
    createMenu,
    updateMenu,
    listAdminMenuItems,
    createMenuItem,
    updateMenuItem,
    archiveMenuItem,
    reorderMenuItems,
    getPublicNavigation
};
