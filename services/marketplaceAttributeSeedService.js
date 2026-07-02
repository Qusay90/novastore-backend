const {
    MARKETPLACE_ATTRIBUTES,
    MARKETPLACE_TEMPLATE_SPECS
} = require('../data/marketplaceAttributeTemplateSeed');
const { flattenTree } = require('./marketplaceCategorySeedService');

class MarketplaceAttributeSeedConflictError extends Error {
    constructor(report) {
        super(`Marketplace attribute seed has ${report.conflicts.length} conflict(s).`);
        this.code = 'MARKETPLACE_ATTRIBUTE_SEED_CONFLICT';
        this.report = report;
    }
}

const normalize = (value) => String(value || '').trim().toLocaleLowerCase('tr-TR');

const selectCategoryRecords = (selector, records) => records.filter((record) => {
    const parts = record.key.split(' > ');
    if (parts[0] !== selector.root) return false;
    if (selector.directChildren) return parts.length === 2;
    if (selector.exact?.includes(record.name)) return true;
    if (selector.nameIncludes?.some((value) => record.name.includes(value))) return true;
    if (selector.subtrees?.some((value) => parts.includes(value))) return true;
    return false;
});

const buildTemplateBindings = (
    specs = MARKETPLACE_TEMPLATE_SPECS,
    categoryRecords = flattenTree()
) => specs.flatMap((spec) =>
    selectCategoryRecords(spec.selector, categoryRecords).map((category) => ({
        template_name: spec.name,
        category_slug: category.slug,
        category_key: category.key,
        attributes: spec.attributes
    }))
);

const makeReport = (apply, attributes, bindings) => ({
    mode: apply ? 'apply' : 'dry-run',
    total_attributes: attributes.length,
    total_options: attributes.reduce((sum, item) => sum + (item.options?.length || 0), 0),
    total_templates: bindings.length,
    total_template_attribute_links: bindings.reduce((sum, item) => sum + item.attributes.length, 0),
    attributes: { added: [], existing: [] },
    options: { added: [], existing: [] },
    templates: { added: [], existing: [] },
    links: { added: [], existing: [] },
    conflicts: []
});

const planOrApplyAttributeSeed = async (
    queryable,
    {
        apply = false,
        attributes = MARKETPLACE_ATTRIBUTES,
        templateSpecs = MARKETPLACE_TEMPLATE_SPECS
    } = {}
) => {
    const bindings = buildTemplateBindings(templateSpecs);
    const report = makeReport(apply, attributes, bindings);
    const categoryResult = await queryable.query(
        'SELECT id, slug FROM categories WHERE deleted_at IS NULL'
    );
    const categoryBySlug = new Map(categoryResult.rows.map((row) => [normalize(row.slug), Number(row.id)]));
    const existingAttributes = await queryable.query('SELECT * FROM attribute_definitions ORDER BY id');
    const attributeByCode = new Map(existingAttributes.rows.map((row) => [normalize(row.code), row]));
    const resolvedAttributeIds = new Map();
    let virtualAttributeId = -1;

    for (let index = 0; index < attributes.length; index += 1) {
        const definition = attributes[index];
        const existing = attributeByCode.get(normalize(definition.code));
        if (existing && existing.type !== definition.type) {
            report.conflicts.push({
                entity: 'attribute',
                code: definition.code,
                reason: 'code_type_conflict',
                expected_type: definition.type,
                existing_type: existing.type
            });
            continue;
        }

        let attributeId = existing ? Number(existing.id) : virtualAttributeId--;
        if (!existing && apply) {
            const inserted = await queryable.query(`
                INSERT INTO attribute_definitions (
                    code, name, type, unit, is_filterable, is_required,
                    is_variant_relevant, sort_order, validation_metadata, is_active
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::JSONB,$10)
                RETURNING id
            `, [
                definition.code,
                definition.name,
                definition.type,
                definition.unit || null,
                definition.is_filterable === true,
                definition.is_required === true,
                definition.is_variant_relevant === true,
                index,
                JSON.stringify(definition.validation_metadata || {}),
                definition.is_active !== false
            ]);
            attributeId = Number(inserted.rows[0].id);
        }
        resolvedAttributeIds.set(definition.code, attributeId);
        report.attributes[existing ? 'existing' : 'added'].push({
            code: definition.code,
            id: existing || apply ? attributeId : null
        });

        const optionResult = existing
            ? await queryable.query(
                'SELECT id, value FROM attribute_options WHERE attribute_id=$1',
                [attributeId]
            )
            : { rows: [] };
        const existingOptions = new Map(optionResult.rows.map((row) => [normalize(row.value), row]));
        for (let optionIndex = 0; optionIndex < (definition.options || []).length; optionIndex += 1) {
            const option = definition.options[optionIndex];
            const existingOption = existingOptions.get(normalize(option.value));
            if (!existingOption && apply) {
                await queryable.query(`
                    INSERT INTO attribute_options (
                        attribute_id, value, label, sort_order, is_active
                    )
                    VALUES ($1,$2,$3,$4,TRUE)
                `, [attributeId, option.value, option.label, optionIndex]);
            }
            report.options[existingOption ? 'existing' : 'added'].push({
                attribute_code: definition.code,
                value: option.value
            });
        }
    }

    const templateResult = await queryable.query(
        'SELECT id, category_id, name FROM attribute_templates'
    );
    const templateByKey = new Map(templateResult.rows.map((row) => [
        `${Number(row.category_id)}::${normalize(row.name)}`,
        row
    ]));
    let virtualTemplateId = -1;

    for (let templateIndex = 0; templateIndex < bindings.length; templateIndex += 1) {
        const binding = bindings[templateIndex];
        const categoryId = categoryBySlug.get(normalize(binding.category_slug));
        if (!categoryId) {
            report.conflicts.push({
                entity: 'template',
                template_name: binding.template_name,
                category_slug: binding.category_slug,
                reason: 'category_not_found'
            });
            continue;
        }
        const key = `${categoryId}::${normalize(binding.template_name)}`;
        const existingTemplate = templateByKey.get(key);
        let templateId = existingTemplate ? Number(existingTemplate.id) : virtualTemplateId--;
        if (!existingTemplate && apply) {
            const inserted = await queryable.query(`
                INSERT INTO attribute_templates (
                    name, category_id, sort_order, is_active
                )
                VALUES ($1,$2,$3,TRUE)
                RETURNING id
            `, [binding.template_name, categoryId, templateIndex]);
            templateId = Number(inserted.rows[0].id);
        }
        report.templates[existingTemplate ? 'existing' : 'added'].push({
            name: binding.template_name,
            category_slug: binding.category_slug,
            id: existingTemplate || apply ? templateId : null
        });

        const existingLinks = existingTemplate
            ? await queryable.query(
                'SELECT attribute_id FROM template_attributes WHERE template_id=$1',
                [templateId]
            )
            : { rows: [] };
        const existingAttributeIds = new Set(existingLinks.rows.map((row) => Number(row.attribute_id)));
        for (let sortOrder = 0; sortOrder < binding.attributes.length; sortOrder += 1) {
            const code = binding.attributes[sortOrder];
            const attributeId = resolvedAttributeIds.get(code);
            if (!attributeId) {
                report.conflicts.push({
                    entity: 'template_attribute',
                    template_name: binding.template_name,
                    category_slug: binding.category_slug,
                    attribute_code: code,
                    reason: 'attribute_unavailable'
                });
                continue;
            }
            const exists = existingAttributeIds.has(attributeId);
            if (!exists && apply) {
                await queryable.query(`
                    INSERT INTO template_attributes (
                        template_id, attribute_id, is_required, is_filterable, sort_order
                    )
                    VALUES ($1,$2,FALSE,TRUE,$3)
                `, [templateId, attributeId, sortOrder]);
            }
            report.links[exists ? 'existing' : 'added'].push({
                template_name: binding.template_name,
                category_slug: binding.category_slug,
                attribute_code: code
            });
        }
    }

    return report;
};

const runMarketplaceAttributeSeed = async (pool, options = {}) => {
    const apply = options.apply === true;
    const client = await pool.connect();
    try {
        await client.query(apply
            ? 'BEGIN ISOLATION LEVEL SERIALIZABLE'
            : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'
        );
        if (apply) {
            await client.query(
                `SELECT pg_advisory_xact_lock(hashtext('novastore-marketplace-attribute-seed-v1'))`
            );
        }
        const report = await planOrApplyAttributeSeed(client, { ...options, apply });
        if (apply && report.conflicts.length) {
            throw new MarketplaceAttributeSeedConflictError(report);
        }
        await client.query(apply ? 'COMMIT' : 'ROLLBACK');
        return report;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    MarketplaceAttributeSeedConflictError,
    selectCategoryRecords,
    buildTemplateBindings,
    planOrApplyAttributeSeed,
    runMarketplaceAttributeSeed
};
