'use strict';

class SellerFinanceError extends Error {
    constructor(code, statusCode = 409) {
        super(code);
        this.name = 'SellerFinanceError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

const fail = (code, statusCode) => { throw new SellerFinanceError(code, statusCode); };
const integer = (value, code = 'VALIDATION_FAILED') => {
    const parsed = typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value;
    if (!Number.isSafeInteger(parsed) || parsed < 1) fail(code, 400);
    return parsed;
};
const currency = (value) => {
    if (typeof value !== 'string' || !/^[A-Z]{3}$/u.test(value)) fail('VALIDATION_FAILED', 400);
    return value;
};
const context = (value) => {
    const storeIds = Array.isArray(value?.storeIds) ? value.storeIds.map((id) => integer(id, 'RESOURCE_NOT_FOUND')) : [];
    if (!storeIds.length) fail('RESOURCE_NOT_FOUND', 404);
    return Object.freeze({ organizationId: integer(value?.organizationId, 'RESOURCE_NOT_FOUND'), storeIds });
};
const toNumber = (value) => Number(value || 0);

const selectCurrency = async (database, safeContext, requestedCurrency) => {
    if (requestedCurrency) return currency(requestedCurrency);
    const result = await database.query('SELECT DISTINCT currency FROM seller_ledger_entries WHERE organization_id = $1 AND store_id = ANY($2::bigint[]) ORDER BY currency', [safeContext.organizationId, safeContext.storeIds]);
    const currencies = (result.rows || []).map((row) => String(row.currency));
    if (currencies.length > 1) fail('RECONCILIATION_BLOCKED', 409);
    return currencies[0] || 'TRY';
};

const financeSummary = async (database, rawContext, query = {}) => {
    const safeContext = context(rawContext);
    if (!query || typeof query !== 'object' || Object.keys(query).some((key) => !['currency'].includes(key))) fail('VALIDATION_FAILED', 400);
    const selectedCurrency = await selectCurrency(database, safeContext, query.currency);
    const result = await database.query(
        `SELECT
            COALESCE(SUM(CASE WHEN entry_type = 'sale' THEN amount_minor ELSE 0 END), 0) AS gross_minor,
            COALESCE(SUM(CASE WHEN entry_type = 'commission' THEN -amount_minor ELSE 0 END), 0) AS commission_minor,
            COALESCE(SUM(CASE WHEN entry_type = 'refund' THEN -amount_minor ELSE 0 END), 0) AS refund_minor,
            COALESCE(SUM(CASE WHEN balance_bucket = 'pending' THEN amount_minor ELSE 0 END), 0) AS pending_minor,
            COALESCE(SUM(CASE WHEN balance_bucket = 'available' THEN amount_minor ELSE 0 END), 0) AS available_minor,
            COALESCE(SUM(CASE WHEN balance_bucket = 'reserved' THEN amount_minor ELSE 0 END), 0) AS reserved_minor,
            COALESCE(SUM(CASE WHEN balance_bucket = 'paid' THEN amount_minor ELSE 0 END), 0) AS paid_minor,
            MAX(id) AS ledger_cursor
           FROM seller_ledger_entries
          WHERE organization_id = $1 AND store_id = ANY($2::bigint[]) AND currency = $3`,
        [safeContext.organizationId, safeContext.storeIds, selectedCurrency]
    );
    const row = result.rows?.[0] || {};
    const gross = toNumber(row.gross_minor);
    const commission = toNumber(row.commission_minor);
    const refund = toNumber(row.refund_minor);
    if (gross < 0 || commission < 0 || refund < 0) fail('RECONCILIATION_BLOCKED', 409);
    return Object.freeze({ currency: selectedCurrency, gross_minor: gross, commission_minor: commission, refund_minor: refund, net_receivable_minor: gross - commission - refund, pending_minor: toNumber(row.pending_minor), available_minor: toNumber(row.available_minor), reserved_minor: toNumber(row.reserved_minor), paid_minor: toNumber(row.paid_minor), ledger_cursor: row.ledger_cursor === null ? null : Number(row.ledger_cursor) });
};

const listLedger = async (database, rawContext, query = {}) => {
    const safeContext = context(rawContext);
    if (!query || typeof query !== 'object' || Object.keys(query).some((key) => !['currency', 'type', 'limit'].includes(key))) fail('VALIDATION_FAILED', 400);
    const selectedCurrency = await selectCurrency(database, safeContext, query.currency);
    const limit = query.limit === undefined ? 100 : integer(query.limit);
    if (limit > 100) fail('VALIDATION_FAILED', 400);
    const type = query.type === undefined ? null : String(query.type);
    if (type !== null && !['sale', 'commission', 'refund', 'reserve', 'paid', 'adjustment'].includes(type)) fail('VALIDATION_FAILED', 400);
    const result = await database.query('SELECT id, seller_order_id, entry_type, balance_bucket, amount_minor, currency, source_type, source_id, occurred_at FROM seller_ledger_entries WHERE organization_id = $1 AND store_id = ANY($2::bigint[]) AND currency = $3 AND ($4::varchar IS NULL OR entry_type = $4) ORDER BY occurred_at DESC, id DESC LIMIT $5', [safeContext.organizationId, safeContext.storeIds, selectedCurrency, type, limit]);
    return Object.freeze((result.rows || []).map((row) => Object.freeze({ id: Number(row.id), seller_order_id: row.seller_order_id === null ? null : Number(row.seller_order_id), entry_type: String(row.entry_type), balance_bucket: String(row.balance_bucket), amount_minor: Number(row.amount_minor), currency: String(row.currency), occurred_at: row.occurred_at })));
};

const listSettlements = async (database, rawContext, query = {}) => {
    const safeContext = context(rawContext);
    if (!query || typeof query !== 'object' || Object.keys(query).some((key) => !['currency', 'limit', 'status'].includes(key))) fail('VALIDATION_FAILED', 400);
    const selectedCurrency = await selectCurrency(database, safeContext, query.currency);
    const limit = query.limit === undefined ? 50 : integer(query.limit);
    if (limit > 50) fail('VALIDATION_FAILED', 400);
    const status = query.status === undefined ? null : String(query.status);
    if (status !== null && !['prepared', 'reviewed', 'blocked', 'superseded'].includes(status)) fail('VALIDATION_FAILED', 400);
    const result = await database.query('SELECT id, store_id, currency, ledger_through_id, gross_minor, commission_minor, refund_minor, net_minor, status, revision, created_at FROM seller_settlements WHERE organization_id = $1 AND store_id = ANY($2::bigint[]) AND currency = $3 AND ($4::varchar IS NULL OR status = $4) ORDER BY id DESC LIMIT $5', [safeContext.organizationId, safeContext.storeIds, selectedCurrency, status, limit]);
    return Object.freeze((result.rows || []).map((row) => Object.freeze({ id: Number(row.id), store_id: Number(row.store_id), currency: String(row.currency), ledger_through_id: Number(row.ledger_through_id), gross_minor: Number(row.gross_minor), commission_minor: Number(row.commission_minor), refund_minor: Number(row.refund_minor), net_minor: Number(row.net_minor), status: String(row.status), revision: Number(row.revision), created_at: row.created_at })));
};

const dashboard = async (database, rawContext, query = {}) => {
    const safeContext = context(rawContext);
    if (!query || typeof query !== 'object' || Object.keys(query).some((key) => key !== 'currency')) fail('VALIDATION_FAILED', 400);
    const [finance, orders, inventory] = await Promise.all([
        financeSummary(database, safeContext, query),
        database.query('SELECT status, COUNT(*)::integer AS count FROM seller_orders WHERE organization_id = $1 AND store_id = ANY($2::bigint[]) GROUP BY status', [safeContext.organizationId, safeContext.storeIds]),
        database.query(`SELECT COUNT(*)::integer AS low_stock_count FROM seller_inventory_items inventory
            JOIN seller_offer_variants variant ON variant.organization_id = inventory.organization_id AND variant.id = inventory.variant_id AND variant.store_id = inventory.store_id
            JOIN seller_offers offer ON offer.organization_id = variant.organization_id AND offer.id = variant.offer_id AND offer.store_id = variant.store_id
            JOIN seller_stores store ON store.organization_id = offer.organization_id AND store.id = offer.store_id AND store.status = 'active' AND store.closed_at IS NULL
            JOIN products product ON product.id = offer.product_id AND product.store_id = store.legacy_store_id AND product.deleted_at IS NULL
            WHERE inventory.organization_id = $1 AND inventory.store_id = ANY($2::bigint[]) AND product.stock <= inventory.low_stock_threshold`, [safeContext.organizationId, safeContext.storeIds])
    ]);
    return Object.freeze({ finance, orders_by_status: Object.freeze((orders.rows || []).map((row) => Object.freeze({ status: String(row.status), count: Number(row.count) }))), low_stock_count: Number(inventory.rows?.[0]?.low_stock_count || 0) });
};

module.exports = Object.freeze({ SellerFinanceError, financeSummary, listLedger, listSettlements, dashboard });
