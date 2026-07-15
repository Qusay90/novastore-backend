const pool = require('../config/db');

const ATTRIBUTE_TYPES = new Set(['text', 'number', 'boolean', 'option', 'multi_option', 'range']);

class AttributeValidationError extends Error {
    constructor(message, code = 'ATTRIBUTE_INVALID', details = []) {
        super(message);
        this.statusCode = 400;
        this.code = code;
        this.details = details;
    }
}

const withOptionalTransaction = async (queryable, operation) => {
    if (typeof queryable.connect !== 'function' || typeof queryable.release === 'function') {
        return operation(queryable);
    }
    const client = await queryable.connect();
    try {
        await client.query('BEGIN');
        const result = await operation(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

const toId = (value, field = 'id') => {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
        throw new AttributeValidationError(`${field} geçerli bir tam sayı olmalıdır.`);
    }
    return id;
};

const normalizeCode = (value) => {
    const code = String(value || '').trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,79}$/.test(code)) {
        throw new AttributeValidationError(
            'Attribute code küçük harf ile başlamalı; yalnızca harf, sayı ve alt çizgi içermelidir.'
        );
    }
    return code;
};

const normalizeType = (value) => {
    const type = String(value || '').trim().toLowerCase();
    if (!ATTRIBUTE_TYPES.has(type)) {
        throw new AttributeValidationError('Geçersiz attribute type.');
    }
    return type;
};

const normalizeText = (value, field, maxLength = 160) => {
    const text = String(value || '').trim();
    if (!text) throw new AttributeValidationError(`${field} zorunludur.`);
    if (text.length > maxLength) {
        throw new AttributeValidationError(`${field} en fazla ${maxLength} karakter olabilir.`);
    }
    return text;
};

const normalizeSortOrder = (value, fallback = 0) => {
    const parsed = value === undefined ? fallback : Number(value);
    if (!Number.isInteger(parsed)) throw new AttributeValidationError('sort_order tam sayı olmalıdır.');
    return parsed;
};

const normalizeBoolean = (value, fallback = false) => {
    if (value === undefined) return fallback;
    if (typeof value === 'boolean') return value;
    return ['1', 'true', 'yes', 'on', 'evet'].includes(String(value).trim().toLowerCase());
};

const normalizeValidationMetadata = (value, fallback = {}) => {
    if (value === undefined) return fallback || {};
    let parsed = value;
    if (typeof value === 'string') {
        try {
            parsed = JSON.parse(value);
        } catch (_) {
            throw new AttributeValidationError('validation_metadata geçerli JSON olmalıdır.');
        }
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new AttributeValidationError('validation_metadata JSON object olmalıdır.');
    }
    return parsed;
};

const ensureCodeAvailable = async (queryable, code, type, excludeId = null) => {
    const result = await queryable.query(
        `SELECT id, type FROM attribute_definitions
         WHERE LOWER(code) = LOWER($1) AND ($2::INTEGER IS NULL OR id <> $2)
         LIMIT 1`,
        [code, excludeId]
    );
    if (!result.rows.length) return;
    const existing = result.rows[0];
    const codeName = existing.type === type ? 'ATTRIBUTE_CODE_EXISTS' : 'ATTRIBUTE_CODE_TYPE_CONFLICT';
    throw new AttributeValidationError(
        existing.type === type
            ? 'Bu attribute code zaten kullanılıyor.'
            : `Aynı attribute code ${existing.type} type ile kayıtlı; ${type} olarak kullanılamaz.`,
        codeName
    );
};

const listAttributes = async ({ includeInactive = true } = {}) => {
    const [attributesResult, optionsResult] = await Promise.all([
        pool.query(
            `SELECT * FROM attribute_definitions
             ${includeInactive ? '' : 'WHERE is_active = TRUE'}
             ORDER BY sort_order, id`
        ),
        pool.query(
            `SELECT * FROM attribute_options
             ${includeInactive ? '' : 'WHERE is_active = TRUE'}
             ORDER BY attribute_id, sort_order, id`
        )
    ]);
    const optionsByAttribute = new Map();
    optionsResult.rows.forEach((option) => {
        const key = Number(option.attribute_id);
        if (!optionsByAttribute.has(key)) optionsByAttribute.set(key, []);
        optionsByAttribute.get(key).push(option);
    });
    return attributesResult.rows.map((attribute) => ({
        ...attribute,
        options: optionsByAttribute.get(Number(attribute.id)) || []
    }));
};

const createAttribute = async (body = {}) => {
    const code = normalizeCode(body.code);
    const type = normalizeType(body.type);
    const name = normalizeText(body.name, 'name');
    await ensureCodeAvailable(pool, code, type);
    const result = await pool.query(
        `INSERT INTO attribute_definitions (
            code, name, type, unit, is_filterable, is_required,
            is_variant_relevant, sort_order, validation_metadata, is_active
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
            code,
            name,
            type,
            String(body.unit || '').trim() || null,
            normalizeBoolean(body.is_filterable),
            normalizeBoolean(body.is_required),
            normalizeBoolean(body.is_variant_relevant),
            normalizeSortOrder(body.sort_order),
            normalizeValidationMetadata(body.validation_metadata),
            normalizeBoolean(body.is_active, true)
        ]
    );
    return { ...result.rows[0], options: [] };
};

const updateAttribute = async (rawId, body = {}) => {
    const id = toId(rawId);
    const currentResult = await pool.query('SELECT * FROM attribute_definitions WHERE id=$1', [id]);
    if (!currentResult.rows.length) {
        const error = new AttributeValidationError('Attribute bulunamadı.', 'ATTRIBUTE_NOT_FOUND');
        error.statusCode = 404;
        throw error;
    }
    const current = currentResult.rows[0];
    const code = body.code === undefined ? current.code : normalizeCode(body.code);
    const type = body.type === undefined ? current.type : normalizeType(body.type);
    if (type !== current.type) {
        const usage = await pool.query(
            `SELECT 1 FROM product_attribute_values WHERE attribute_id=$1
             UNION ALL
             SELECT 1 FROM attribute_options WHERE attribute_id=$1
             LIMIT 1`,
            [id]
        );
        if (usage.rows.length) {
            throw new AttributeValidationError(
                'Option veya ürün değeri bulunan attribute type değiştirilemez.',
                'ATTRIBUTE_TYPE_IN_USE'
            );
        }
    }
    await ensureCodeAvailable(pool, code, type, id);
    const result = await pool.query(
        `UPDATE attribute_definitions SET
            code=$1, name=$2, type=$3, unit=$4, is_filterable=$5, is_required=$6,
            is_variant_relevant=$7, sort_order=$8, validation_metadata=$9,
            is_active=$10, revision=revision + 1, updated_at=CURRENT_TIMESTAMP
         WHERE id=$11 RETURNING *`,
        [
            code,
            body.name === undefined ? current.name : normalizeText(body.name, 'name'),
            type,
            body.unit === undefined ? current.unit : (String(body.unit || '').trim() || null),
            normalizeBoolean(body.is_filterable, current.is_filterable),
            normalizeBoolean(body.is_required, current.is_required),
            normalizeBoolean(body.is_variant_relevant, current.is_variant_relevant),
            normalizeSortOrder(body.sort_order, current.sort_order),
            normalizeValidationMetadata(body.validation_metadata, current.validation_metadata),
            normalizeBoolean(body.is_active, current.is_active),
            id
        ]
    );
    const options = await pool.query(
        'SELECT * FROM attribute_options WHERE attribute_id=$1 ORDER BY sort_order,id',
        [id]
    );
    return { ...result.rows[0], options: options.rows };
};

const setAttributeArchived = async (rawId, archived = true) =>
    updateAttribute(rawId, { is_active: !archived });

const createAttributeOption = async (body = {}) => {
    const attributeId = toId(body.attribute_id ?? body.attributeId, 'attribute_id');
    const attributeResult = await pool.query(
        'SELECT id,type FROM attribute_definitions WHERE id=$1',
        [attributeId]
    );
    if (!attributeResult.rows.length) throw new AttributeValidationError('Attribute bulunamadı.');
    if (!['option', 'multi_option'].includes(attributeResult.rows[0].type)) {
        throw new AttributeValidationError('Option yalnızca option veya multi_option attribute için eklenebilir.');
    }
    try {
        const result = await pool.query(
            `INSERT INTO attribute_options (attribute_id,value,label,sort_order,is_active)
             VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [
                attributeId,
                normalizeText(body.value, 'value'),
                normalizeText(body.label, 'label'),
                normalizeSortOrder(body.sort_order),
                normalizeBoolean(body.is_active, true)
            ]
        );
        return result.rows[0];
    } catch (error) {
        if (error.code === '23505') {
            throw new AttributeValidationError('Bu option value zaten kayıtlı.', 'ATTRIBUTE_OPTION_EXISTS');
        }
        throw error;
    }
};

const updateAttributeOption = async (rawId, body = {}) => {
    const id = toId(rawId);
    const currentResult = await pool.query('SELECT * FROM attribute_options WHERE id=$1', [id]);
    if (!currentResult.rows.length) {
        const error = new AttributeValidationError('Option bulunamadı.', 'ATTRIBUTE_OPTION_NOT_FOUND');
        error.statusCode = 404;
        throw error;
    }
    const current = currentResult.rows[0];
    try {
        const result = await pool.query(
            `UPDATE attribute_options SET value=$1,label=$2,sort_order=$3,is_active=$4,
                    revision=revision + 1,
                    updated_at=CURRENT_TIMESTAMP
             WHERE id=$5 RETURNING *`,
            [
                body.value === undefined ? current.value : normalizeText(body.value, 'value'),
                body.label === undefined ? current.label : normalizeText(body.label, 'label'),
                normalizeSortOrder(body.sort_order, current.sort_order),
                normalizeBoolean(body.is_active, current.is_active),
                id
            ]
        );
        return result.rows[0];
    } catch (error) {
        if (error.code === '23505') {
            throw new AttributeValidationError('Bu option value zaten kayıtlı.', 'ATTRIBUTE_OPTION_EXISTS');
        }
        throw error;
    }
};

const listTemplates = async () => {
    const result = await pool.query(`
        SELECT template.*, category.name AS category_name,
               COALESCE(
                   JSON_AGG(
                       JSON_BUILD_OBJECT(
                           'attribute_id', definition.id,
                           'code', definition.code,
                           'name', definition.name,
                           'type', definition.type,
                           'is_required', COALESCE(link.is_required, definition.is_required),
                           'is_filterable', COALESCE(link.is_filterable, definition.is_filterable),
                           'sort_order', link.sort_order
                       ) ORDER BY link.sort_order, definition.sort_order, definition.id
                   ) FILTER (WHERE definition.id IS NOT NULL),
                   '[]'::JSON
               ) AS attributes
        FROM attribute_templates template
        JOIN categories category ON category.id=template.category_id
        LEFT JOIN template_attributes link ON link.template_id=template.id
        LEFT JOIN attribute_definitions definition ON definition.id=link.attribute_id
        GROUP BY template.id, category.name
        ORDER BY template.sort_order, template.id
    `);
    return result.rows;
};

const ensureCategory = async (queryable, rawId) => {
    const categoryId = toId(rawId, 'category_id');
    const result = await queryable.query(
        'SELECT id FROM categories WHERE id=$1 AND deleted_at IS NULL',
        [categoryId]
    );
    if (!result.rows.length) throw new AttributeValidationError('Kategori bulunamadı veya arşivlenmiş.');
    return categoryId;
};

const createTemplate = async (body = {}) => {
    const categoryId = await ensureCategory(pool, body.category_id ?? body.categoryId);
    try {
        const result = await pool.query(
            `INSERT INTO attribute_templates (name,category_id,sort_order,is_active)
             VALUES ($1,$2,$3,$4) RETURNING *`,
            [
                normalizeText(body.name, 'name'),
                categoryId,
                normalizeSortOrder(body.sort_order),
                normalizeBoolean(body.is_active, true)
            ]
        );
        return { ...result.rows[0], attributes: [] };
    } catch (error) {
        if (error.code === '23505') {
            throw new AttributeValidationError('Bu kategoride aynı isimli template zaten var.', 'TEMPLATE_EXISTS');
        }
        throw error;
    }
};

const updateTemplate = async (rawId, body = {}) => {
    const id = toId(rawId);
    const currentResult = await pool.query('SELECT * FROM attribute_templates WHERE id=$1', [id]);
    if (!currentResult.rows.length) {
        const error = new AttributeValidationError('Template bulunamadı.', 'TEMPLATE_NOT_FOUND');
        error.statusCode = 404;
        throw error;
    }
    const current = currentResult.rows[0];
    const categoryId = body.category_id === undefined && body.categoryId === undefined
        ? Number(current.category_id)
        : await ensureCategory(pool, body.category_id ?? body.categoryId);
    try {
        const result = await pool.query(
            `UPDATE attribute_templates SET name=$1,category_id=$2,sort_order=$3,is_active=$4,
                    revision=revision + 1,
                    updated_at=CURRENT_TIMESTAMP
             WHERE id=$5 RETURNING *`,
            [
                body.name === undefined ? current.name : normalizeText(body.name, 'name'),
                categoryId,
                normalizeSortOrder(body.sort_order, current.sort_order),
                normalizeBoolean(body.is_active, current.is_active),
                id
            ]
        );
        return result.rows[0];
    } catch (error) {
        if (error.code === '23505') {
            throw new AttributeValidationError('Bu kategoride aynı isimli template zaten var.', 'TEMPLATE_EXISTS');
        }
        throw error;
    }
};

const addTemplateAttribute = async (
    rawTemplateId,
    body = {},
    { queryable = pool, bumpRevision = true } = {}
) => {
    const templateId = toId(rawTemplateId, 'template_id');
    const attributeId = toId(body.attribute_id ?? body.attributeId, 'attribute_id');
    return withOptionalTransaction(queryable, async (client) => {
        const result = await client.query(
            `INSERT INTO template_attributes (
                template_id,attribute_id,is_required,is_filterable,sort_order
             ) VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (template_id,attribute_id) DO UPDATE SET
                is_required=EXCLUDED.is_required,
                is_filterable=EXCLUDED.is_filterable,
                sort_order=EXCLUDED.sort_order
             RETURNING *`,
            [
                templateId,
                attributeId,
                body.is_required === undefined ? null : normalizeBoolean(body.is_required),
                body.is_filterable === undefined ? null : normalizeBoolean(body.is_filterable),
                normalizeSortOrder(body.sort_order)
            ]
        );
        if (bumpRevision !== false) {
            await client.query(
                `UPDATE attribute_templates
                 SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [templateId]
            );
        }
        return result.rows[0];
    });
};

const removeTemplateAttribute = async (
    rawTemplateId,
    rawAttributeId,
    { queryable = pool, bumpRevision = true } = {}
) => {
    const templateId = toId(rawTemplateId, 'template_id');
    const attributeId = toId(rawAttributeId, 'attribute_id');
    return withOptionalTransaction(queryable, async (client) => {
        const result = await client.query(
            `DELETE FROM template_attributes
             WHERE template_id=$1 AND attribute_id=$2 RETURNING *`,
            [templateId, attributeId]
        );
        if (!result.rows.length) {
            const error = new AttributeValidationError('Template attribute bağlantısı bulunamadı.');
            error.statusCode = 404;
            throw error;
        }
        if (bumpRevision !== false) {
            await client.query(
                `UPDATE attribute_templates
                 SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [templateId]
            );
        }
        return result.rows[0];
    });
};

const resolveTemplateAttributes = async (queryable, categoryIds = []) => {
    const ids = [...new Set(categoryIds.map(Number).filter(Number.isInteger))];
    if (!ids.length) return [];
    const result = await queryable.query(
        `SELECT definition.*, template.id AS template_id, template.name AS template_name,
                template.category_id,
                COALESCE(link.is_required, definition.is_required) AS effective_required,
                COALESCE(link.is_filterable, definition.is_filterable) AS effective_filterable,
                link.sort_order AS template_sort_order,
                COALESCE(
                    JSON_AGG(
                        JSON_BUILD_OBJECT(
                            'id', option.id, 'value', option.value, 'label', option.label,
                            'sort_order', option.sort_order, 'is_active', option.is_active
                        ) ORDER BY option.sort_order, option.id
                    ) FILTER (WHERE option.id IS NOT NULL AND option.is_active=TRUE),
                    '[]'::JSON
                ) AS options
         FROM attribute_templates template
         JOIN template_attributes link ON link.template_id=template.id
         JOIN attribute_definitions definition ON definition.id=link.attribute_id
         LEFT JOIN attribute_options option ON option.attribute_id=definition.id
         WHERE template.category_id = ANY($1::INTEGER[])
           AND template.is_active=TRUE
           AND definition.is_active=TRUE
         GROUP BY definition.id,template.id,template.name,template.category_id,
                  link.is_required,link.is_filterable,link.sort_order
         ORDER BY template.sort_order,link.sort_order,definition.sort_order,definition.id`,
        [ids]
    );
    const byCode = new Map();
    for (const row of result.rows) {
        const current = byCode.get(row.code);
        if (current && current.type !== row.type) {
            throw new AttributeValidationError(
                `${row.code} attribute code farklı type tanımlarıyla birleştirilemez.`,
                'ATTRIBUTE_CODE_TYPE_CONFLICT',
                [current.type, row.type]
            );
        }
        if (!current) {
            byCode.set(row.code, {
                ...row,
                effective_required: row.effective_required === true,
                effective_filterable: row.effective_filterable === true,
                template_ids: [Number(row.template_id)],
                category_ids: [Number(row.category_id)]
            });
        } else {
            current.effective_required = current.effective_required || row.effective_required === true;
            current.effective_filterable = current.effective_filterable || row.effective_filterable === true;
            if (!current.template_ids.includes(Number(row.template_id))) current.template_ids.push(Number(row.template_id));
            if (!current.category_ids.includes(Number(row.category_id))) current.category_ids.push(Number(row.category_id));
        }
    }
    return [...byCode.values()];
};

module.exports = {
    ATTRIBUTE_TYPES,
    AttributeValidationError,
    normalizeCode,
    listAttributes,
    createAttribute,
    updateAttribute,
    setAttributeArchived,
    createAttributeOption,
    updateAttributeOption,
    listTemplates,
    createTemplate,
    updateTemplate,
    addTemplateAttribute,
    removeTemplateAttribute,
    resolveTemplateAttributes
};
