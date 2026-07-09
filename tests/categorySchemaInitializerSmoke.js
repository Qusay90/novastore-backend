const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const coreSource = fs.readFileSync(path.join(root, 'models', 'createCoreDb.js'), 'utf8');
const categoriesHelperSource = fs.readFileSync(path.join(root, 'models', 'createCategoriesDb.js'), 'utf8');
const constraintsSource = fs.readFileSync(
    path.join(root, 'migrations', '20260702_category_v2_backfill_constraints.sql'),
    'utf8'
);

const categoryTableBlock = (source) => {
    const match = source.match(/CREATE TABLE IF NOT EXISTS categories\s*\(([\s\S]*?)\n\s*\);/);
    assert(match, 'categories table initializer block should exist');
    return match[1];
};

for (const [label, source] of [
    ['createCoreDb', coreSource],
    ['createCategoriesDb', categoriesHelperSource]
]) {
    const block = categoryTableBlock(source);
    assert.match(block, /name\s+VARCHAR\(255\)\s+NOT NULL/i, `${label} should keep category name required`);
    assert.doesNotMatch(block, /name\s+VARCHAR\(255\)\s+UNIQUE\s+NOT NULL/i, `${label} must not create global name unique`);
    assert.doesNotMatch(block, /UNIQUE\s*\(\s*name\s*\)/i, `${label} must not add a table-level global name unique`);
    assert.doesNotMatch(block, /ON DELETE CASCADE/i, `${label} must not initialize category parent FK as cascade`);
}

assert(
    coreSource.includes('applyCategoryV2BackfillConstraints(pool)'),
    'createCoreDb must apply category v2 backfill constraints during bootstrap'
);

assert.match(
    categoriesHelperSource,
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_sibling_name_unique[\s\S]*COALESCE\(parent_id,\s*0\)[\s\S]*LOWER\(BTRIM\(name\)\)[\s\S]*WHERE deleted_at IS NULL/i,
    'createCategoriesDb should represent sibling-level active name uniqueness'
);

assert.match(
    categoriesHelperSource,
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_path_unique[\s\S]*LOWER\(path\)[\s\S]*WHERE path IS NOT NULL AND deleted_at IS NULL/i,
    'createCategoriesDb should represent canonical path uniqueness'
);

assert.match(
    constraintsSource,
    /ALTER TABLE categories DROP CONSTRAINT/i,
    'category v2 constraints migration should remove legacy global name constraints'
);
assert.match(
    constraintsSource,
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_sibling_name_unique/i,
    'category v2 constraints migration should create sibling name uniqueness'
);
assert.match(
    constraintsSource,
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_path_unique/i,
    'category v2 constraints migration should create path uniqueness'
);

console.log('categorySchemaInitializerSmoke: OK');
