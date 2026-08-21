'use strict';

const crypto = require('node:crypto');

const APPLICATION_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EDITABLE_STATUSES = new Set(['DRAFT', 'IN_PROGRESS', 'NEEDS_CORRECTION']);
const TERMINAL_STATUSES = new Set(['APPROVED', 'REJECTED', 'WITHDRAWN']);
const STEP_ORDER = Object.freeze(['identity', 'business', 'contact', 'agreements', 'documents', 'payout', 'submission']);
const VERIFICATION_CHANNELS = new Set(['email', 'phone', 'identity', 'documents', 'bank']);

class SellerApplicationError extends Error {
    constructor(code, statusCode = 400) {
        super(code);
        this.name = 'SellerApplicationError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

const requireSecret = (value) => {
    if (typeof value !== 'string' || value.length < 32) throw new SellerApplicationError('SELLER_APPLICATION_AUTH_SECRET_REQUIRED', 503);
    return value;
};

const hmacHex = (secret, namespace, value) => crypto
    .createHmac('sha256', secret)
    .update(`${namespace}\u0000${value}`, 'utf8')
    .digest('hex');

const hmacToken = (secret, applicationId, idempotencyKey) => `nova_app_${crypto
    .createHmac('sha256', secret)
    .update(`seller-applicant-session-v1\u0000${applicationId}\u0000${idempotencyKey}`, 'utf8')
    .digest('base64url')}`;

const stable = (value) => {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
};

const fingerprint = (value) => crypto.createHash('sha256').update(stable(value), 'utf8').digest('hex');

const plainObject = (value, allowedKeys, code = 'VALIDATION_FAILED') => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !allowedKeys.includes(key))) {
        throw new SellerApplicationError(code, 400);
    }
    return value;
};

const cleanText = (value, { min = 1, max = 160, code = 'VALIDATION_FAILED' } = {}) => {
    if (typeof value !== 'string') throw new SellerApplicationError(code, 400);
    const normalized = value.trim();
    if (normalized.length < min || normalized.length > max || /[\u0000-\u001f\u007f]/u.test(normalized)) {
        throw new SellerApplicationError(code, 400);
    }
    return normalized;
};

const normalizedEmail = (value) => {
    const email = cleanText(value, { max: 320 }).toLocaleLowerCase('tr-TR');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) throw new SellerApplicationError('VALIDATION_FAILED', 400);
    return email;
};

const normalizedPhone = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const phone = cleanText(value, { max: 32 }).replace(/[\s()-]/gu, '');
    if (!/^\+?[1-9]\d{9,14}$/u.test(phone)) throw new SellerApplicationError('VALIDATION_FAILED', 400);
    return phone;
};

const idempotencyKey = (value) => {
    const key = cleanText(value, { min: 16, max: 160, code: 'IDEMPOTENCY_KEY_REQUIRED' });
    if (!/^[A-Za-z0-9._:-]+$/u.test(key)) throw new SellerApplicationError('IDEMPOTENCY_KEY_REQUIRED', 400);
    return key;
};

const revision = (value) => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new SellerApplicationError('PRECONDITION_REQUIRED', 428);
    return parsed;
};

const parseJsonObject = (value) => {
    if (!value) return {};
    if (typeof value === 'string') {
        try { return JSON.parse(value); } catch (_) { return {}; }
    }
    return value;
};

const withTransaction = async (database, work) => {
    if (!database || typeof database.connect !== 'function') throw new TypeError('Seller application database pool is required.');
    const client = await database.connect();
    try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

const mapApplication = (row, currentTermsRevision = null) => {
    const steps = parseJsonObject(row.step_payload);
    const verificationState = parseJsonObject(row.verification_state);
    const requiredComplete = STEP_ORDER.slice(0, -1).every((step) => Boolean(steps[step]));
    const termsCurrent = Boolean(currentTermsRevision) && row.terms_revision === currentTermsRevision;
    return Object.freeze({
        id: row.id,
        status: row.status,
        revision: Number(row.revision),
        current_step: row.current_step,
        next_allowed_step: row.next_allowed_step,
        correction_steps: Object.freeze(Array.isArray(row.correction_steps) ? row.correction_steps : []),
        terms_revision: row.terms_revision || null,
        steps: Object.freeze(steps),
        verification_state: Object.freeze(verificationState),
        submission_eligibility: Object.freeze({
            complete: requiredComplete,
            terms_current: termsCurrent,
            eligible: requiredComplete && termsCurrent && EDITABLE_STATUSES.has(row.status)
        }),
        submitted_at: row.submitted_at || null,
        created_at: row.created_at,
        updated_at: row.updated_at
    });
};

const applicationSelect = "SELECT id, applicant_identity_hash, applicant_email, applicant_phone, applicant_display_name, status, revision, current_step, next_allowed_step, correction_steps, terms_revision, step_payload, verification_state, creation_idempotency_key_hash, creation_request_fingerprint, submitted_at, created_at, updated_at FROM seller_applications";

const recordEvent = (client, row, eventType, fromStatus, resultCode, metadata = {}) => client.query(
    'INSERT INTO seller_application_events (application_id, event_type, from_status, to_status, application_revision, result_code, metadata_redacted) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)',
    [row.id, eventType, fromStatus, row.status, row.revision, resultCode, JSON.stringify(metadata)]
);

const validateCreate = (body) => {
    plainObject(body, ['identity']);
    const identity = plainObject(body.identity, ['email', 'full_name', 'phone']);
    return Object.freeze({
        email: normalizedEmail(identity.email),
        full_name: cleanText(identity.full_name, { min: 2, max: 160 }),
        phone: normalizedPhone(identity.phone)
    });
};

const validateStepPayload = (step, body, termsRevision) => {
    if (step === 'identity') {
        plainObject(body, ['expected_revision', 'full_name', 'phone']);
        return Object.freeze({ full_name: cleanText(body.full_name, { min: 2, max: 160 }), phone: normalizedPhone(body.phone) });
    }
    if (step === 'business') {
        plainObject(body, ['expected_revision', 'legal_name', 'store_name', 'business_type']);
        const type = cleanText(body.business_type, { max: 40 }).toLocaleLowerCase('en-US');
        if (!['individual', 'sole_proprietor', 'company'].includes(type)) throw new SellerApplicationError('VALIDATION_FAILED', 400);
        return Object.freeze({
            legal_name: cleanText(body.legal_name, { min: 2, max: 180 }),
            store_name: cleanText(body.store_name, { min: 2, max: 160 }),
            business_type: type
        });
    }
    if (step === 'contact') {
        plainObject(body, ['expected_revision', 'address_line', 'city', 'district', 'postal_code']);
        return Object.freeze({
            address_line: cleanText(body.address_line, { min: 5, max: 300 }),
            city: cleanText(body.city, { min: 2, max: 100 }),
            district: cleanText(body.district, { min: 2, max: 100 }),
            postal_code: cleanText(body.postal_code, { min: 5, max: 12 })
        });
    }
    if (step === 'agreements') {
        plainObject(body, ['expected_revision', 'accepted', 'terms_revision']);
        if (!termsRevision) throw new SellerApplicationError('TERMS_REVISION_UNAVAILABLE', 503);
        if (body.accepted !== true || cleanText(body.terms_revision, { max: 120 }) !== termsRevision) {
            throw new SellerApplicationError('TERMS_REVISION_MISMATCH', 409);
        }
        return Object.freeze({ accepted: true, terms_revision: termsRevision });
    }
    if (step === 'documents') {
        plainObject(body, ['expected_revision', 'items']);
        if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 10) throw new SellerApplicationError('VALIDATION_FAILED', 400);
        const items = body.items.map((item) => {
            plainObject(item, ['kind', 'document_reference']);
            const kind = cleanText(item.kind, { max: 40 }).toLocaleLowerCase('en-US');
            if (!['identity', 'tax', 'trade_registry'].includes(kind)) throw new SellerApplicationError('VALIDATION_FAILED', 400);
            return Object.freeze({ kind, document_reference: cleanText(item.document_reference, { min: 8, max: 160 }), state: 'uploaded_unverified' });
        });
        return Object.freeze({ items: Object.freeze(items), verification: 'provider_pending' });
    }
    if (step === 'payout') {
        plainObject(body, ['expected_revision', 'account_holder', 'iban_last4']);
        const last4 = cleanText(body.iban_last4, { min: 4, max: 4 });
        if (!/^\d{4}$/u.test(last4)) throw new SellerApplicationError('VALIDATION_FAILED', 400);
        return Object.freeze({ account_holder: cleanText(body.account_holder, { min: 2, max: 180 }), iban_last4: last4, verification: 'provider_pending' });
    }
    throw new SellerApplicationError('APPLICATION_STEP_INVALID', 400);
};

const receiptReplay = async (client, applicationId, operation, keyHash, requestFingerprint) => {
    const result = await client.query(
        'SELECT request_fingerprint, response_payload FROM seller_application_command_receipts WHERE application_id = $1 AND operation = $2 AND idempotency_key_hash = $3',
        [applicationId, operation, keyHash]
    );
    const row = result.rows?.[0];
    if (!row) return null;
    if (row.request_fingerprint !== requestFingerprint) throw new SellerApplicationError('IDEMPOTENCY_CONFLICT', 409);
    return Object.freeze(parseJsonObject(row.response_payload));
};

const saveReceipt = (client, applicationId, operation, keyHash, requestFingerprint, response) => client.query(
    'INSERT INTO seller_application_command_receipts (application_id, operation, idempotency_key_hash, request_fingerprint, response_payload) VALUES ($1, $2, $3, $4, $5::jsonb)',
    [applicationId, operation, keyHash, requestFingerprint, JSON.stringify(response)]
);

const createSellerApplicationService = ({ database, secret, termsRevision = null, now = () => new Date(), randomUUID = crypto.randomUUID } = {}) => {
    const effectiveSecret = requireSecret(secret);
    const effectiveTermsRevision = typeof termsRevision === 'string' && termsRevision.trim() ? termsRevision.trim() : null;

    const create = async (body, rawIdempotencyKey) => {
        const identity = validateCreate(body);
        const key = idempotencyKey(rawIdempotencyKey);
        const keyHash = hmacHex(effectiveSecret, 'seller-application-idempotency-v1', key);
        const requestFingerprint = fingerprint(identity);
        const identityHash = hmacHex(effectiveSecret, 'seller-application-identity-v1', identity.email);
        const createdAt = now();
        return withTransaction(database, async (client) => {
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [identityHash]);
            const replayResult = await client.query(`${applicationSelect} WHERE creation_idempotency_key_hash = $1 FOR UPDATE`, [keyHash]);
            const replay = replayResult.rows?.[0];
            if (replay) {
                if (replay.creation_request_fingerprint !== requestFingerprint) throw new SellerApplicationError('IDEMPOTENCY_CONFLICT', 409);
                return Object.freeze({ application: mapApplication(replay, effectiveTermsRevision), applicant_token: hmacToken(effectiveSecret, replay.id, key), token_type: 'Applicant' });
            }
            const active = await client.query("SELECT id FROM seller_applications WHERE applicant_identity_hash = $1 AND status NOT IN ('REJECTED', 'WITHDRAWN') FOR UPDATE", [identityHash]);
            if (active.rows?.length) throw new SellerApplicationError('APPLICATION_ALREADY_EXISTS', 409);
            const applicationId = randomUUID();
            const applicantToken = hmacToken(effectiveSecret, applicationId, key);
            const tokenHash = hmacHex(effectiveSecret, 'seller-applicant-token-v1', applicantToken);
            const sessionId = randomUUID();
            const expiresAt = new Date(createdAt.getTime() + APPLICATION_SESSION_TTL_MS);
            const steps = { identity: { email: identity.email, full_name: identity.full_name, phone: identity.phone, verification: 'provider_pending' } };
            const inserted = await client.query(
                "INSERT INTO seller_applications (id, applicant_identity_hash, applicant_email, applicant_phone, applicant_display_name, status, revision, current_step, next_allowed_step, step_payload, creation_idempotency_key_hash, creation_request_fingerprint, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, 'IN_PROGRESS', 1, 'identity', 'business', $6::jsonb, $7, $8, $9, $9) RETURNING *",
                [applicationId, identityHash, identity.email, identity.phone, identity.full_name, JSON.stringify(steps), keyHash, requestFingerprint, createdAt]
            );
            await client.query(
                'INSERT INTO seller_applicant_sessions (id, application_id, token_hash, expires_at, issued_at) VALUES ($1, $2, $3, $4, $5)',
                [sessionId, applicationId, tokenHash, expiresAt, createdAt]
            );
            await recordEvent(client, inserted.rows[0], 'seller.application.created', null, 'success', { applicant_authority: 'APPLICATION_BOUND', auto_approved: false });
            return Object.freeze({ application: mapApplication(inserted.rows[0], effectiveTermsRevision), applicant_token: applicantToken, token_type: 'Applicant', expires_in: Math.ceil(APPLICATION_SESSION_TTL_MS / 1000) });
        });
    };

    const authenticate = async (rawToken) => {
        if (typeof rawToken !== 'string' || !/^nova_app_[A-Za-z0-9_-]{43}$/u.test(rawToken)) {
            throw new SellerApplicationError('APPLICANT_AUTH_REQUIRED', 401);
        }
        const tokenHash = hmacHex(effectiveSecret, 'seller-applicant-token-v1', rawToken);
        const result = await database.query(
            "SELECT session.id AS session_id, session.application_id, application.status, application.revision FROM seller_applicant_sessions session JOIN seller_applications application ON application.id = session.application_id WHERE session.token_hash = $1 AND session.status = 'active' AND session.expires_at > CURRENT_TIMESTAMP",
            [tokenHash]
        );
        const row = result.rows?.[0];
        if (!row) throw new SellerApplicationError('APPLICANT_AUTH_REQUIRED', 401);
        return Object.freeze({ sessionId: row.session_id, applicationId: row.application_id, authority: 'APPLICATION_BOUND' });
    };

    const current = async (applicant) => {
        const result = await database.query(`${applicationSelect} WHERE id = $1`, [applicant.applicationId]);
        if (!result.rows?.[0]) throw new SellerApplicationError('APPLICATION_NOT_FOUND', 404);
        return mapApplication(result.rows[0], effectiveTermsRevision);
    };

    const updateStep = async (applicant, stepValue, body, rawIdempotencyKey = null) => {
        const step = cleanText(stepValue, { max: 40 }).toLocaleLowerCase('en-US');
        if (!STEP_ORDER.includes(step)) throw new SellerApplicationError('APPLICATION_STEP_INVALID', 400);
        const expectedRevision = revision(body?.expected_revision);
        if (step === 'submission') {
            plainObject(body, ['expected_revision']);
            const key = idempotencyKey(rawIdempotencyKey);
            const keyHash = hmacHex(effectiveSecret, 'seller-application-idempotency-v1', key);
            const requestFingerprint = fingerprint({ expected_revision: expectedRevision });
            return withTransaction(database, async (client) => {
                const replay = await receiptReplay(client, applicant.applicationId, 'submit', keyHash, requestFingerprint);
                if (replay) return replay;
                const result = await client.query(`${applicationSelect} WHERE id = $1 FOR UPDATE`, [applicant.applicationId]);
                const row = result.rows?.[0];
                if (!row) throw new SellerApplicationError('APPLICATION_NOT_FOUND', 404);
                if (Number(row.revision) !== expectedRevision) throw new SellerApplicationError('REVISION_CONFLICT', 409);
                if (!EDITABLE_STATUSES.has(row.status) || row.next_allowed_step !== 'submission') throw new SellerApplicationError('INVALID_STATE_TRANSITION', 409);
                const steps = parseJsonObject(row.step_payload);
                if (!STEP_ORDER.slice(0, -1).every((requiredStep) => Boolean(steps[requiredStep]))) throw new SellerApplicationError('APPLICATION_INCOMPLETE', 409);
                if (!effectiveTermsRevision) throw new SellerApplicationError('TERMS_REVISION_UNAVAILABLE', 503);
                if (row.terms_revision !== effectiveTermsRevision || steps.agreements?.terms_revision !== effectiveTermsRevision) throw new SellerApplicationError('TERMS_REVISION_MISMATCH', 409);
                const updated = await client.query(
                    "UPDATE seller_applications SET status = 'AWAITING_EXTERNAL_VERIFICATION', revision = revision + 1, current_step = 'submission', next_allowed_step = 'external_verification', submitted_at = $2, updated_at = $2 WHERE id = $1 AND revision = $3 RETURNING *",
                    [applicant.applicationId, now(), expectedRevision]
                );
                if (updated.rows?.length !== 1) throw new SellerApplicationError('REVISION_CONFLICT', 409);
                const response = Object.freeze({ application: mapApplication(updated.rows[0], effectiveTermsRevision), submitted: true, auto_approved: false });
                await recordEvent(client, updated.rows[0], 'seller.application.submitted', row.status, 'pending_external_verification', { auto_approved: false, organization_created: false, store_created: false, membership_created: false });
                await saveReceipt(client, applicant.applicationId, 'submit', keyHash, requestFingerprint, response);
                return response;
            });
        }

        const payload = validateStepPayload(step, body, effectiveTermsRevision);
        return withTransaction(database, async (client) => {
            const result = await client.query(`${applicationSelect} WHERE id = $1 FOR UPDATE`, [applicant.applicationId]);
            const row = result.rows?.[0];
            if (!row) throw new SellerApplicationError('APPLICATION_NOT_FOUND', 404);
            if (Number(row.revision) !== expectedRevision) throw new SellerApplicationError('REVISION_CONFLICT', 409);
            if (!EDITABLE_STATUSES.has(row.status)) throw new SellerApplicationError('INVALID_STATE_TRANSITION', 409);
            const corrections = Array.isArray(row.correction_steps) ? row.correction_steps : [];
            if (row.next_allowed_step !== step && !corrections.includes(step)) throw new SellerApplicationError('STEP_SEQUENCE_CONFLICT', 409);
            const steps = parseJsonObject(row.step_payload);
            const effectivePayload = step === 'identity' ? Object.freeze({ ...payload, email: row.applicant_email }) : payload;
            steps[step] = effectivePayload;
            const remainingCorrections = corrections.filter((entry) => entry !== step);
            const nextIndex = STEP_ORDER.indexOf(step) + 1;
            const nextStep = remainingCorrections[0] || (corrections.length > 0 ? 'submission' : STEP_ORDER[nextIndex]);
            const nextStatus = remainingCorrections.length > 0 ? 'NEEDS_CORRECTION' : 'IN_PROGRESS';
            const updated = await client.query(
                'UPDATE seller_applications SET status = $2, revision = revision + 1, current_step = $3, next_allowed_step = $4, correction_steps = $5::text[], terms_revision = CASE WHEN $12::boolean THEN $6 ELSE terms_revision END, step_payload = $7::jsonb, applicant_phone = CASE WHEN $13::boolean THEN $8 ELSE applicant_phone END, applicant_display_name = CASE WHEN $13::boolean THEN $9 ELSE applicant_display_name END, updated_at = $10 WHERE id = $1 AND revision = $11 RETURNING *',
                [applicant.applicationId, nextStatus, step, nextStep, remainingCorrections, step === 'agreements' ? effectiveTermsRevision : null, JSON.stringify(steps), step === 'identity' ? effectivePayload.phone : null, step === 'identity' ? effectivePayload.full_name : null, now(), expectedRevision, step === 'agreements', step === 'identity']
            );
            if (updated.rows?.length !== 1) throw new SellerApplicationError('REVISION_CONFLICT', 409);
            await recordEvent(client, updated.rows[0], 'seller.application.step_updated', row.status, 'success', { step, verification_claimed: false });
            return Object.freeze({ application: mapApplication(updated.rows[0], effectiveTermsRevision) });
        });
    };

    const verificationCommand = async (applicant, channelValue, body, rawIdempotencyKey) => {
        const channel = cleanText(channelValue, { max: 24 }).toLocaleLowerCase('en-US');
        if (!VERIFICATION_CHANNELS.has(channel)) throw new SellerApplicationError('VERIFICATION_CHANNEL_INVALID', 400);
        plainObject(body, ['command', 'expected_revision']);
        if (body.command !== 'request') throw new SellerApplicationError('VERIFICATION_COMMAND_INVALID', 400);
        const expectedRevision = revision(body.expected_revision);
        const key = idempotencyKey(rawIdempotencyKey);
        const keyHash = hmacHex(effectiveSecret, 'seller-application-idempotency-v1', key);
        const requestFingerprint = fingerprint({ channel, command: 'request', expected_revision: expectedRevision });
        return withTransaction(database, async (client) => {
            const operation = `verification:${channel}:request`;
            const replay = await receiptReplay(client, applicant.applicationId, operation, keyHash, requestFingerprint);
            if (replay) return replay;
            const result = await client.query(`${applicationSelect} WHERE id = $1 FOR UPDATE`, [applicant.applicationId]);
            const row = result.rows?.[0];
            if (!row) throw new SellerApplicationError('APPLICATION_NOT_FOUND', 404);
            if (Number(row.revision) !== expectedRevision) throw new SellerApplicationError('REVISION_CONFLICT', 409);
            if (TERMINAL_STATUSES.has(row.status)) throw new SellerApplicationError('INVALID_STATE_TRANSITION', 409);
            const existing = await client.query(
                "SELECT id, status, revision FROM seller_application_verification_requests WHERE application_id = $1 AND channel = $2 AND status IN ('provider_pending', 'provider_unavailable') FOR UPDATE",
                [applicant.applicationId, channel]
            );
            let requestRow = existing.rows?.[0];
            if (!requestRow) {
                const inserted = await client.query(
                    "INSERT INTO seller_application_verification_requests (id, application_id, channel, status) VALUES ($1, $2, $3, 'provider_unavailable') RETURNING id, status, revision",
                    [randomUUID(), applicant.applicationId, channel]
                );
                requestRow = inserted.rows[0];
            }
            const verificationState = parseJsonObject(row.verification_state);
            verificationState[channel] = { status: 'provider_unavailable', verified: false, request_id: requestRow.id };
            const updated = await client.query(
                'UPDATE seller_applications SET revision = revision + 1, verification_state = $2::jsonb, updated_at = $3 WHERE id = $1 AND revision = $4 RETURNING *',
                [applicant.applicationId, JSON.stringify(verificationState), now(), expectedRevision]
            );
            if (updated.rows?.length !== 1) throw new SellerApplicationError('REVISION_CONFLICT', 409);
            const response = Object.freeze({ application: mapApplication(updated.rows[0], effectiveTermsRevision), verification: Object.freeze({ channel, status: 'provider_unavailable', verified: false }) });
            await recordEvent(client, updated.rows[0], 'seller.application.verification_requested', row.status, 'provider_unavailable', { channel, verified: false, provider_called: false });
            await saveReceipt(client, applicant.applicationId, operation, keyHash, requestFingerprint, response);
            return response;
        });
    };

    const reviewDecision = async (reviewer, input) => {
        if (reviewer?.authority !== 'ADMIN_REVIEW' || !Number.isSafeInteger(Number(reviewer.userId)) || Number(reviewer.userId) < 1) {
            throw new SellerApplicationError('ADMIN_REVIEW_AUTHORITY_REQUIRED', 403);
        }
        plainObject(input, ['application_id', 'expected_revision', 'command', 'correction_steps']);
        const applicationId = cleanText(input.application_id, { max: 64 });
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(applicationId)) {
            throw new SellerApplicationError('VALIDATION_FAILED', 400);
        }
        const expectedRevision = revision(input.expected_revision);
        const command = cleanText(input.command, { max: 40 }).toLocaleLowerCase('en-US');
        if (!['start_review', 'request_correction', 'approve', 'reject'].includes(command)) {
            throw new SellerApplicationError('REVIEW_COMMAND_INVALID', 400);
        }
        return withTransaction(database, async (client) => {
            const result = await client.query(`${applicationSelect} WHERE id = $1 FOR UPDATE`, [applicationId]);
            const row = result.rows?.[0];
            if (!row) throw new SellerApplicationError('APPLICATION_NOT_FOUND', 404);
            if (Number(row.revision) !== expectedRevision) throw new SellerApplicationError('REVISION_CONFLICT', 409);
            let nextStatus;
            let correctionSteps = [];
            let nextAllowedStep = row.next_allowed_step;
            if (command === 'start_review') {
                if (!['SUBMITTED', 'AWAITING_EXTERNAL_VERIFICATION'].includes(row.status)) throw new SellerApplicationError('INVALID_STATE_TRANSITION', 409);
                nextStatus = 'UNDER_REVIEW';
                nextAllowedStep = 'review_pending';
            } else if (command === 'request_correction') {
                if (!['SUBMITTED', 'UNDER_REVIEW', 'AWAITING_EXTERNAL_VERIFICATION'].includes(row.status)) throw new SellerApplicationError('INVALID_STATE_TRANSITION', 409);
                if (!Array.isArray(input.correction_steps) || input.correction_steps.length < 1) throw new SellerApplicationError('VALIDATION_FAILED', 400);
                correctionSteps = [...new Set(input.correction_steps.map((step) => cleanText(step, { max: 40 }).toLocaleLowerCase('en-US')))];
                if (correctionSteps.some((step) => !STEP_ORDER.slice(0, -1).includes(step))) throw new SellerApplicationError('APPLICATION_STEP_INVALID', 400);
                nextStatus = 'NEEDS_CORRECTION';
                nextAllowedStep = correctionSteps[0];
            } else if (command === 'approve') {
                if (row.status !== 'UNDER_REVIEW') throw new SellerApplicationError('INVALID_STATE_TRANSITION', 409);
                const verificationState = parseJsonObject(row.verification_state);
                if (!['identity', 'documents', 'bank'].every((channel) => verificationState[channel]?.status === 'verified')) {
                    throw new SellerApplicationError('EXTERNAL_VERIFICATION_REQUIRED', 409);
                }
                nextStatus = 'APPROVED';
                nextAllowedStep = 'complete';
            } else {
                if (row.status !== 'UNDER_REVIEW') throw new SellerApplicationError('INVALID_STATE_TRANSITION', 409);
                nextStatus = 'REJECTED';
                nextAllowedStep = 'complete';
            }
            const updated = await client.query(
                'UPDATE seller_applications SET status = $2::varchar(48), revision = revision + 1, correction_steps = $3::text[], next_allowed_step = $4, decided_at = CASE WHEN $2::varchar(48) IN (\'APPROVED\', \'REJECTED\') THEN $5 ELSE decided_at END, updated_at = $5 WHERE id = $1 AND revision = $6 RETURNING *',
                [applicationId, nextStatus, correctionSteps, nextAllowedStep, now(), expectedRevision]
            );
            if (updated.rows?.length !== 1) throw new SellerApplicationError('REVISION_CONFLICT', 409);
            await recordEvent(client, updated.rows[0], `seller.application.review.${command}`, row.status, 'success', { reviewer_user_id: Number(reviewer.userId), provider_verified: nextStatus === 'APPROVED' });
            return Object.freeze({ application: mapApplication(updated.rows[0], effectiveTermsRevision) });
        });
    };

    return Object.freeze({ authenticate, create, current, reviewDecision, updateStep, verificationCommand });
};

const toSafeApplicationError = (error) => error instanceof SellerApplicationError
    ? error
    : new SellerApplicationError('SELLER_APPLICATION_UNAVAILABLE', 503);

module.exports = Object.freeze({
    APPLICATION_SESSION_TTL_MS,
    STEP_ORDER,
    SellerApplicationError,
    createSellerApplicationService,
    toSafeApplicationError
});
