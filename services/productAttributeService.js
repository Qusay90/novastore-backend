const { AttributeValidationError, resolveTemplateAttributes } = require('./attributeService');

const hasAttributePayload = (body = {}) =>
    Object.prototype.hasOwnProperty.call(body, 'attributes') ||
    Object.prototype.hasOwnProperty.call(body, 'attributeValues') ||
    Object.prototype.hasOwnProperty.call(body, 'attribute_values');

const parseAttributePayload = (body = {}) => {
    const raw = body.attributes ?? body.attributeValues ?? body.attribute_values;
    if (raw === undefined || raw === null || raw === '') return {};
    let parsed = raw;
    if (typeof raw === 'string') {
        try {
            parsed = JSON.parse(raw);
        } catch (_) {
            throw new AttributeValidationError('attributes geçerli JSON olmalıdır.');
        }
    }
    if (Array.isArray(parsed)) {
        return parsed.reduce((acc, item) => {
            if (item && item.code) acc[String(item.code)] = item.value;
            return acc;
        }, {});
    }
    if (!parsed || typeof parsed !== 'object') {
        throw new AttributeValidationError('attributes object veya array olmalıdır.');
    }
    return parsed;
};

const isEmptyValue = (value) =>
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0);

const resolveOption = (definition, rawValue) => {
    const normalized = String(rawValue ?? '').trim().toLocaleLowerCase('tr-TR');
    return (definition.options || []).find((option) =>
        Number(option.id) === Number(rawValue) ||
        String(option.value).trim().toLocaleLowerCase('tr-TR') === normalized
    );
};

const validateNumber = (value, definition) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new AttributeValidationError(`${definition.name} sayısal bir değer olmalıdır.`);
    }
    const metadata = definition.validation_metadata || {};
    if (metadata.min !== undefined && parsed < Number(metadata.min)) {
        throw new AttributeValidationError(`${definition.name} en az ${metadata.min} olmalıdır.`);
    }
    if (metadata.max !== undefined && parsed > Number(metadata.max)) {
        throw new AttributeValidationError(`${definition.name} en fazla ${metadata.max} olmalıdır.`);
    }
    return parsed;
};

const normalizeValue = (definition, value) => {
    if (isEmptyValue(value)) return null;
    switch (definition.type) {
        case 'text': {
            const text = String(value).trim();
            const maxLength = Number(definition.validation_metadata?.maxLength || 2000);
            if (text.length > maxLength) {
                throw new AttributeValidationError(`${definition.name} en fazla ${maxLength} karakter olabilir.`);
            }
            return { text_value: text };
        }
        case 'number':
            return { number_value: validateNumber(value, definition) };
        case 'boolean': {
            if (typeof value === 'boolean') return { boolean_value: value };
            const normalized = String(value).trim().toLowerCase();
            if (['1', 'true', 'yes', 'on', 'evet'].includes(normalized)) return { boolean_value: true };
            if (['0', 'false', 'no', 'off', 'hayır', 'hayir'].includes(normalized)) return { boolean_value: false };
            throw new AttributeValidationError(`${definition.name} true veya false olmalıdır.`);
        }
        case 'option': {
            const option = resolveOption(definition, value);
            if (!option) {
                throw new AttributeValidationError(
                    `${definition.name} için yalnızca tanımlı ve aktif option kabul edilir.`,
                    'ATTRIBUTE_OPTION_INVALID'
                );
            }
            return { option_id: Number(option.id) };
        }
        case 'multi_option': {
            const values = Array.isArray(value) ? value : [value];
            const optionIds = [...new Set(values.map((item) => {
                const option = resolveOption(definition, item);
                if (!option) {
                    throw new AttributeValidationError(
                        `${definition.name} için geçersiz option seçildi.`,
                        'ATTRIBUTE_OPTION_INVALID'
                    );
                }
                return Number(option.id);
            }))];
            return optionIds.length ? { option_ids: optionIds } : null;
        }
        case 'range': {
            const minRaw = Array.isArray(value) ? value[0] : value.min;
            const maxRaw = Array.isArray(value) ? value[1] : value.max;
            const min = validateNumber(minRaw, definition);
            const max = validateNumber(maxRaw, definition);
            if (min > max) throw new AttributeValidationError(`${definition.name} min değeri max değerinden büyük olamaz.`);
            return { range_min: min, range_max: max };
        }
        default:
            throw new AttributeValidationError('Desteklenmeyen attribute type.');
    }
};

const validateProductAttributes = async (
    queryable,
    { categoryIds = [], body = {}, publicationStatus = 'draft', existingValues = [] } = {}
) => {
    const definitions = await resolveTemplateAttributes(queryable, categoryIds);
    const payload = parseAttributePayload(body);
    const byCode = new Map(definitions.map((definition) => [definition.code, definition]));
    const existingByCode = new Map(existingValues.map((item) => [item.code, item]));
    const unknownCodes = Object.keys(payload).filter((code) => !byCode.has(code));
    if (unknownCodes.length) {
        throw new AttributeValidationError(
            `Kategori template'lerinde bulunmayan attribute: ${unknownCodes.join(', ')}`,
            'ATTRIBUTE_NOT_IN_TEMPLATE',
            unknownCodes
        );
    }

    const values = [];
    const clears = [];
    for (const definition of definitions) {
        const hasValue = Object.prototype.hasOwnProperty.call(payload, definition.code);
        const rawValue = hasValue ? payload[definition.code] : undefined;
        const normalized = hasValue ? normalizeValue(definition, rawValue) : null;
        const existing = existingByCode.get(definition.code);
        const effectivePresent = normalized !== null || (!hasValue && Boolean(existing));
        if (
            String(publicationStatus).toLowerCase() === 'active' &&
            definition.effective_required &&
            !effectivePresent
        ) {
            throw new AttributeValidationError(
                `Aktif ürün için ${definition.name} zorunludur.`,
                'REQUIRED_ATTRIBUTE_MISSING',
                [definition.code]
            );
        }
        if (hasValue && normalized) values.push({ definition, value: normalized });
        if (hasValue && !normalized) clears.push(Number(definition.id));
    }
    return { definitions, values, clears };
};

const syncProductAttributeValues = async (queryable, productId, validation) => {
    for (const attributeId of validation.clears || []) {
        await queryable.query(
            'DELETE FROM product_attribute_values WHERE product_id=$1 AND attribute_id=$2',
            [productId, attributeId]
        );
    }
    for (const item of validation.values || []) {
        const value = item.value;
        await queryable.query(
            `INSERT INTO product_attribute_values (
                product_id,attribute_id,text_value,number_value,boolean_value,
                option_id,option_ids,range_min,range_max
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (product_id,attribute_id) DO UPDATE SET
                text_value=EXCLUDED.text_value,
                number_value=EXCLUDED.number_value,
                boolean_value=EXCLUDED.boolean_value,
                option_id=EXCLUDED.option_id,
                option_ids=EXCLUDED.option_ids,
                range_min=EXCLUDED.range_min,
                range_max=EXCLUDED.range_max,
                updated_at=CURRENT_TIMESTAMP`,
            [
                productId,
                item.definition.id,
                value.text_value ?? null,
                value.number_value ?? null,
                value.boolean_value ?? null,
                value.option_id ?? null,
                value.option_ids ?? null,
                value.range_min ?? null,
                value.range_max ?? null
            ]
        );
    }
};

const formatStoredValue = (row) => {
    if (row.type === 'text') return row.text_value;
    if (row.type === 'number') return row.number_value === null ? null : Number(row.number_value);
    if (row.type === 'boolean') return row.boolean_value;
    if (row.type === 'option') {
        return row.option_id === null ? null : {
            id: Number(row.option_id),
            value: row.option_value,
            label: row.option_label
        };
    }
    if (row.type === 'multi_option') return row.multi_options || [];
    if (row.type === 'range') {
        return row.range_min === null || row.range_max === null
            ? null
            : { min: Number(row.range_min), max: Number(row.range_max) };
    }
    return null;
};

const getProductAttributeValues = async (queryable, productId, { publicOnly = false } = {}) => {
    const result = await queryable.query(
        `SELECT value.*, definition.code,definition.name,definition.type,definition.unit,
                definition.is_filterable,definition.is_required,definition.is_variant_relevant,
                definition.sort_order,definition.validation_metadata,
                selected_option.value AS option_value,selected_option.label AS option_label,
                COALESCE((
                    SELECT JSON_AGG(
                        JSON_BUILD_OBJECT('id', option_item.id,'value',option_item.value,'label',option_item.label)
                        ORDER BY option_item.sort_order,option_item.id
                    )
                    FROM attribute_options option_item
                    WHERE option_item.id=ANY(COALESCE(value.option_ids,ARRAY[]::INTEGER[]))
                ),'[]'::JSON) AS multi_options
         FROM product_attribute_values value
         JOIN attribute_definitions definition ON definition.id=value.attribute_id
         LEFT JOIN attribute_options selected_option ON selected_option.id=value.option_id
         WHERE value.product_id=$1
           ${publicOnly ? 'AND definition.is_active=TRUE' : ''}
         ORDER BY definition.sort_order,definition.id`,
        [productId]
    );
    return result.rows.map((row) => {
        const base = {
            code: row.code,
            name: row.name,
            type: row.type,
            unit: row.unit,
            value: formatStoredValue(row)
        };
        if (publicOnly) return base;
        return {
            ...base,
            attribute_id: Number(row.attribute_id),
            is_filterable: row.is_filterable,
            is_required: row.is_required,
            is_variant_relevant: row.is_variant_relevant
        };
    });
};

const parsePublicAttributeFilters = (query = {}) => {
    const raw = query.attributes ?? query.attributeFilters ?? query.attribute_filters;
    if (!raw) return {};
    let parsed = raw;
    if (typeof raw === 'string') {
        try {
            parsed = JSON.parse(raw);
        } catch (_) {
            throw new AttributeValidationError('Attribute filtreleri geçerli JSON olmalıdır.');
        }
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new AttributeValidationError('Attribute filtreleri object olmalıdır.');
    }
    return parsed;
};

const buildPublicAttributeFilterSql = (query, params = []) => {
    const filters = parsePublicAttributeFilters(query);
    const clauses = [];
    for (const [code, rawValue] of Object.entries(filters)) {
        const codeIndex = params.push(String(code).toLowerCase());
        if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) &&
            (rawValue.min !== undefined || rawValue.max !== undefined)) {
            const rangeClauses = [];
            if (rawValue.min !== undefined && rawValue.min !== '') {
                const min = Number(rawValue.min);
                if (!Number.isFinite(min)) throw new AttributeValidationError(`${code} min sayısal olmalıdır.`);
                const minIndex = params.push(min);
                rangeClauses.push(`COALESCE(value.number_value,value.range_max) >= $${minIndex}`);
            }
            if (rawValue.max !== undefined && rawValue.max !== '') {
                const max = Number(rawValue.max);
                if (!Number.isFinite(max)) throw new AttributeValidationError(`${code} max sayısal olmalıdır.`);
                const maxIndex = params.push(max);
                rangeClauses.push(`COALESCE(value.number_value,value.range_min) <= $${maxIndex}`);
            }
            if (rangeClauses.length) {
                clauses.push(`EXISTS (
                    SELECT 1 FROM product_attribute_values value
                    JOIN attribute_definitions definition ON definition.id=value.attribute_id
                    WHERE value.product_id=p.id AND definition.code=$${codeIndex}
                      AND definition.is_active=TRUE
                      AND EXISTS (
                          SELECT 1
                          FROM product_categories filter_category
                          JOIN attribute_templates filter_template
                            ON filter_template.category_id=filter_category.category_id
                           AND filter_template.is_active=TRUE
                          JOIN template_attributes filter_link
                            ON filter_link.template_id=filter_template.id
                           AND filter_link.attribute_id=definition.id
                          WHERE filter_category.product_id=p.id
                            AND COALESCE(filter_link.is_filterable,definition.is_filterable)=TRUE
                      )
                      AND ${rangeClauses.join(' AND ')}
                )`);
            }
            continue;
        }
        if (typeof rawValue === 'boolean') {
            const valueIndex = params.push(rawValue);
            clauses.push(`EXISTS (
                SELECT 1 FROM product_attribute_values value
                JOIN attribute_definitions definition ON definition.id=value.attribute_id
                WHERE value.product_id=p.id AND definition.code=$${codeIndex}
                  AND definition.is_active=TRUE
                  AND EXISTS (
                      SELECT 1
                      FROM product_categories filter_category
                      JOIN attribute_templates filter_template
                        ON filter_template.category_id=filter_category.category_id
                       AND filter_template.is_active=TRUE
                      JOIN template_attributes filter_link
                        ON filter_link.template_id=filter_template.id
                       AND filter_link.attribute_id=definition.id
                      WHERE filter_category.product_id=p.id
                        AND COALESCE(filter_link.is_filterable,definition.is_filterable)=TRUE
                  )
                  AND value.boolean_value=$${valueIndex}
            )`);
            continue;
        }
        const requested = (Array.isArray(rawValue) ? rawValue : [rawValue])
            .map((item) => String(item).trim())
            .filter(Boolean);
        if (!requested.length) continue;
        const valuesIndex = params.push(requested);
        clauses.push(`EXISTS (
            SELECT 1 FROM product_attribute_values value
            JOIN attribute_definitions definition ON definition.id=value.attribute_id
            WHERE value.product_id=p.id AND definition.code=$${codeIndex}
              AND definition.is_active=TRUE
              AND EXISTS (
                  SELECT 1
                  FROM product_categories filter_category
                  JOIN attribute_templates filter_template
                    ON filter_template.category_id=filter_category.category_id
                   AND filter_template.is_active=TRUE
                  JOIN template_attributes filter_link
                    ON filter_link.template_id=filter_template.id
                   AND filter_link.attribute_id=definition.id
                  WHERE filter_category.product_id=p.id
                    AND COALESCE(filter_link.is_filterable,definition.is_filterable)=TRUE
              )
              AND (
                value.text_value=ANY($${valuesIndex}::TEXT[])
                OR EXISTS (
                    SELECT 1 FROM attribute_options option_item
                    WHERE option_item.attribute_id=definition.id
                      AND option_item.is_active=TRUE
                      AND (option_item.value=ANY($${valuesIndex}::TEXT[]) OR option_item.id::TEXT=ANY($${valuesIndex}::TEXT[]))
                      AND (
                        value.option_id=option_item.id
                        OR option_item.id=ANY(COALESCE(value.option_ids,ARRAY[]::INTEGER[]))
                      )
                )
              )
        )`);
    }
    return { sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '', params };
};

const getPublicCategoryFacets = async (queryable, categoryId) => {
    const result = await queryable.query(
        `WITH RECURSIVE selected_categories AS (
            SELECT id FROM categories
            WHERE id=$1 AND is_active=TRUE AND is_customer_visible=TRUE AND deleted_at IS NULL
            UNION ALL
            SELECT child.id FROM categories child
            JOIN selected_categories parent ON child.parent_id=parent.id
            WHERE child.is_active=TRUE AND child.is_customer_visible=TRUE AND child.deleted_at IS NULL
         ), visible_products AS (
            SELECT DISTINCT product.id
            FROM products product
            JOIN product_categories link ON link.product_id=product.id
            JOIN selected_categories selected ON selected.id=link.category_id
            WHERE product.publication_status='active'
              AND product.is_customer_visible=TRUE
              AND product.deleted_at IS NULL
         )
         SELECT definition.id,definition.code,definition.name,definition.type,definition.unit,
                definition.sort_order,value.text_value,value.number_value,value.boolean_value,
                value.range_min,value.range_max,value.option_id,value.option_ids,
                selected_option.value AS option_value,selected_option.label AS option_label
         FROM visible_products product
         JOIN product_attribute_values value ON value.product_id=product.id
         JOIN attribute_definitions definition ON definition.id=value.attribute_id
         LEFT JOIN attribute_options selected_option
           ON selected_option.id=value.option_id AND selected_option.is_active=TRUE
         WHERE definition.is_active=TRUE
           AND EXISTS (
               SELECT 1
               FROM product_categories filter_category
               JOIN selected_categories filter_selected
                 ON filter_selected.id=filter_category.category_id
               JOIN attribute_templates filter_template
                 ON filter_template.category_id=filter_category.category_id
                AND filter_template.is_active=TRUE
               JOIN template_attributes filter_link
                 ON filter_link.template_id=filter_template.id
                AND filter_link.attribute_id=definition.id
               WHERE filter_category.product_id=product.id
                 AND COALESCE(filter_link.is_filterable,definition.is_filterable)=TRUE
           )
         ORDER BY definition.sort_order,definition.id`,
        [categoryId]
    );
    const requestedOptionIds = [...new Set(result.rows.flatMap((row) =>
        Array.isArray(row.option_ids) ? row.option_ids.map(Number) : []
    ))];
    const optionById = new Map();
    if (requestedOptionIds.length) {
        const optionsResult = await queryable.query(
            `SELECT id,value,label FROM attribute_options
             WHERE id=ANY($1::INTEGER[]) AND is_active=TRUE ORDER BY sort_order,id`,
            [requestedOptionIds]
        );
        optionsResult.rows.forEach((option) => optionById.set(Number(option.id), {
            ...option,
            id: Number(option.id)
        }));
    }
    const facets = new Map();
    for (const row of result.rows) {
        if (!facets.has(row.code)) {
            facets.set(row.code, {
                code: row.code,
                name: row.name,
                type: row.type,
                unit: row.unit,
                sort_order: row.sort_order,
                options: [],
                min: null,
                max: null
            });
        }
        const facet = facets.get(row.code);
        if (['number', 'range'].includes(row.type)) {
            const candidates = [row.number_value, row.range_min, row.range_max]
                .filter((item) => item !== null)
                .map(Number);
            for (const number of candidates) {
                facet.min = facet.min === null ? number : Math.min(facet.min, number);
                facet.max = facet.max === null ? number : Math.max(facet.max, number);
            }
        } else if (row.type === 'boolean') {
            const value = row.boolean_value === true;
            if (!facet.options.some((item) => item.value === value)) {
                facet.options.push({ value, label: value ? 'Evet' : 'Hayır' });
            }
        } else if (row.type === 'option' && row.option_id && row.option_value) {
            if (!facet.options.some((item) => Number(item.id) === Number(row.option_id))) {
                facet.options.push({
                    id: Number(row.option_id),
                    value: row.option_value,
                    label: row.option_label
                });
            }
        } else if (row.type === 'multi_option') {
            const optionIds = (row.option_ids || []).map(Number);
            optionIds.map((id) => optionById.get(id)).filter(Boolean).forEach((option) => {
                if (!facet.options.some((item) => Number(item.id) === Number(option.id))) {
                    facet.options.push(option);
                }
            });
        } else if (row.type === 'text' && row.text_value) {
            if (!facet.options.some((item) => item.value === row.text_value)) {
                facet.options.push({ value: row.text_value, label: row.text_value });
            }
        }
    }
    return [...facets.values()].map((facet) => {
        if (!['number', 'range'].includes(facet.type)) {
            delete facet.min;
            delete facet.max;
        } else {
            delete facet.options;
        }
        delete facet.sort_order;
        return facet;
    });
};

module.exports = {
    hasAttributePayload,
    parseAttributePayload,
    normalizeValue,
    validateProductAttributes,
    syncProductAttributeValues,
    getProductAttributeValues,
    parsePublicAttributeFilters,
    buildPublicAttributeFilterSql,
    getPublicCategoryFacets
};
