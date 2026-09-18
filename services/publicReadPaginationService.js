'use strict';

const { createHash } = require('node:crypto');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
class PublicReadError extends Error {
    constructor(code, message = code, statusCode = 400) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
    }
}
const invalid = (code) => { throw new PublicReadError(code); };
const scalar = (query, key, maxLength) => {
    const value = query[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || value.length > maxLength) invalid('PUBLIC_QUERY_INVALID');
    return value;
};
const parsePage = (query = {}) => {
    const raw = scalar(query, 'limit', 3);
    const limit = raw === undefined ? DEFAULT_PAGE_SIZE : Number(raw);
    if (raw !== undefined && !/^[1-9]\d{0,2}$/u.test(raw)) invalid('PUBLIC_LIMIT_INVALID');
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) invalid('PUBLIC_LIMIT_INVALID');
    const mode = scalar(query, 'pagination', 16);
    if (mode !== undefined && mode !== 'cursor') invalid('PUBLIC_PAGINATION_INVALID');
    if (query.page !== undefined || query.offset !== undefined) invalid('PUBLIC_PAGINATION_INVALID');
    const cursor = scalar(query, 'cursor', 1024);
    if (cursor !== undefined && (!cursor || !/^[A-Za-z0-9_-]+$/u.test(cursor))) invalid('PUBLIC_CURSOR_INVALID');
    return { limit, cursor, envelope: mode === 'cursor' };
};
const scopeHash = (scope) => createHash('sha256').update(JSON.stringify(scope)).digest('hex');
const decodeCursor = (value, scope) => {
    if (value === undefined) return null;
    try {
        const bytes = Buffer.from(value, 'base64url');
        if (bytes.toString('base64url') !== value) throw new Error();
        const cursor = JSON.parse(bytes.toString('utf8'));
        if (!cursor || cursor.v !== 1 || cursor.scope !== scopeHash(scope)
            || ![0, 1].includes(cursor.rank)
            || !Number.isSafeInteger(cursor.id) || cursor.id < 1 || cursor.id > 2147483647
            || !(cursor.micros === null || (typeof cursor.micros === 'string'
                && /^-?\d{1,18}$/u.test(cursor.micros)
                && BigInt(cursor.micros) >= -62135596800000000n
                && BigInt(cursor.micros) <= 253402300799999999n))) throw new Error();
        return cursor;
    } catch (_) { invalid('PUBLIC_CURSOR_INVALID'); }
};

// PostgreSQL microseconds stay strings; a JS Date would discard sub-millisecond ties.
const microsSql = (column) => `(EXTRACT(EPOCH FROM ${column}) * 1000000)::BIGINT`;
const cursorColumns = (column, rank = '0') =>
    `${rank} AS page_rank, ${microsSql(column)}::TEXT AS page_micros`;
const afterCursorSql = (cursor, params, { id, time, rank = '0' }) => {
    if (!cursor) return '';
    const rankParam = `$${params.push(cursor.rank)}::INTEGER`;
    const timeParam = `$${params.push(cursor.micros)}::BIGINT`;
    const idParam = `$${params.push(cursor.id)}::INTEGER`;
    const micros = microsSql(time);
    return ` AND (${rank} > ${rankParam} OR (${rank} = ${rankParam} AND (
        (${timeParam} IS NOT NULL AND (${micros} < ${timeParam} OR ${time} IS NULL))
        OR (${micros} IS NOT DISTINCT FROM ${timeParam} AND ${id} < ${idParam})
    )))`;
};
const pageRows = (rows, limit, scope) => {
    const items = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    const last = items.at(-1);
    return {
        items, limit, hasMore,
        nextCursor: hasMore && last ? Buffer.from(JSON.stringify({
            v: 1, scope: scopeHash(scope), rank: Number(last.page_rank),
            micros: last.page_micros ?? null, id: Number(last.id)
        })).toString('base64url') : null
    };
};
const metadata = ({ limit, hasMore, nextCursor }) => ({ limit, hasMore, nextCursor });
const setPageHeaders = (res, page) => {
    // Optional for controller-level test doubles; actual HTTP always sets these.
    if (typeof res.set !== 'function') return;
    res.set('X-Pagination-Limit', String(page.limit));
    res.set('X-Pagination-Has-More', String(page.hasMore));
    res.set('X-Pagination-Next-Cursor', page.nextCursor || '');
    const exposed = res.get?.('Access-Control-Expose-Headers');
    res.set('Access-Control-Expose-Headers', [exposed,
        'X-Pagination-Limit, X-Pagination-Has-More, X-Pagination-Next-Cursor'].filter(Boolean).join(', '));
};

module.exports = {
    DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, PublicReadError, scalar, parsePage,
    decodeCursor, cursorColumns, afterCursorSql, pageRows, metadata, setPageHeaders
};
