'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const express = require('express');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const { createSellerPasswordRecoveryService } = require('../services/sellerPasswordRecoveryService');
const { createSellerPasswordRecoveryDeliveryBoundary } = require('../services/sellerPasswordRecoveryDeliveryBoundary');
const { createSellerPasswordRecoveryController } = require('../controllers/sellerPasswordRecoveryController');
const { createSellerPasswordRecoveryRouter } = require('../routes/sellerPasswordRecoveryRoutes');
const { createSellerRecoveryRateLimit } = require('../middlewares/sellerAuthRateLimit');
const { createSellerApplicationService } = require('../services/sellerApplicationService');
const { createSellerApplicationController } = require('../controllers/sellerApplicationController');
const { createSellerApplicantAuth } = require('../middlewares/sellerApplicantAuth');
const { createSellerApplicationRouter } = require('../routes/sellerApplicationRoutes');
const { getSellerApplicationTermsAuthority } = require('../config/sellerApplicationTerms');

const connectionString = process.env.MAIN6U_DATABASE_URL;
if (!connectionString) throw new Error('MAIN6U_DATABASE_URL_REQUIRED');
const parsed = new URL(connectionString);
if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) || !parsed.pathname.includes('_test')) {
    throw new Error('MAIN6U_DISPOSABLE_DATABASE_REQUIRED');
}

const RECOVERY_SECRET = 'local-main6u-recovery-secret-0000000000000001';
const APPLICATION_SECRET = 'local-main6u-application-secret-0000000000001';
const TERMS_AUTHORITY = getSellerApplicationTermsAuthority();
const TERMS_REVISION = TERMS_AUTHORITY?.revision;
if (TERMS_REVISION !== 'seller-terms-local-test-v1' || TERMS_AUTHORITY.generation !== 1) {
    throw new Error('MAIN6U_EXPLICIT_LOCAL_TERMS_AUTHORITY_REQUIRED');
}
const pool = new Pool({ connectionString, ssl: false, application_name: 'novastore_main6u_local_e2e' });
const deliveryBoundary = createSellerPasswordRecoveryDeliveryBoundary({ syntheticEnabled: true });
const recoveryService = createSellerPasswordRecoveryService({ database: pool, secret: RECOVERY_SECRET, deliveryBoundary: deliveryBoundary.deliver });
const applicationService = createSellerApplicationService({ database: pool, secret: APPLICATION_SECRET, termsAuthority: TERMS_AUTHORITY });

const app = express();
app.use(express.json({ limit: '32kb' }));
app.locals.sellerDatabase = pool;
app.use('/api/seller/v1', createSellerPasswordRecoveryRouter({
    controller: createSellerPasswordRecoveryController({ service: recoveryService }),
    recoveryRateLimit: createSellerRecoveryRateLimit({ ipMaxRequests: 100, identifierMaxRequests: 100 })
}));
app.use('/api/seller/v1', createSellerApplicationRouter({
    controller: createSellerApplicationController({ service: applicationService }),
    applicantAuth: createSellerApplicantAuth({ service: applicationService })
}));
const server = http.createServer(app);

const request = async (base, method, path, { applicantSecret, body, token, idempotency } = {}) => {
    const response = await fetch(`${base}${path}`, {
        method,
        headers: {
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(idempotency ? { 'Idempotency-Key': idempotency } : {}),
            ...(applicantSecret ? { 'Applicant-Secret': applicantSecret } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error'
    });
    const text = await response.text();
    return Object.freeze({ status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers });
};

const forgot = (base, identifier) => request(base, 'POST', '/api/seller/v1/auth/password/forgot', { body: { identifier } });
const verify = (base, challengeId, code) => request(base, 'POST', `/api/seller/v1/auth/password/challenges/${challengeId}/verify`, { body: { code } });

(async () => {
    const unavailableTermsService = createSellerApplicationService({ database: pool, secret: APPLICATION_SECRET });
    await assert.rejects(
        unavailableTermsService.current({ applicationId: crypto.randomUUID() }),
        (error) => error.code === 'TERMS_REVISION_UNAVAILABLE' && error.statusCode === 503
    );

    const suffix = crypto.randomBytes(6).toString('hex');
    const existingEmail = `main6u-${suffix}@example.test`;
    const oldPassword = 'Old!SellerPassword9';
    const user = (await pool.query(
        "INSERT INTO users (full_name, email, password, role) VALUES ($1, $2, $3, 'customer') RETURNING id",
        ['Main6U Seller', existingEmail, await bcrypt.hash(oldPassword, 12)]
    )).rows[0];
    const organization = (await pool.query(
        "INSERT INTO seller_organizations (external_key, display_name, status) VALUES ($1, $2, 'active') RETURNING id",
        [crypto.randomUUID(), `Main6U ${suffix}`]
    )).rows[0];
    const ownerRole = (await pool.query("SELECT id FROM seller_roles WHERE organization_id IS NULL AND code = 'owner'")).rows[0];
    const membership = (await pool.query(
        "INSERT INTO seller_memberships (organization_id, user_id, role_id, status, security_stamp) VALUES ($1, $2, $3, 'active', $4) RETURNING id, membership_revision, security_stamp",
        [organization.id, user.id, ownerRole.id, crypto.randomUUID()]
    )).rows[0];
    const sessionId = crypto.randomUUID();
    const familyId = crypto.randomUUID();
    await pool.query(
        "INSERT INTO seller_sessions (id, user_id, organization_id, membership_id, audience, status, membership_revision, security_stamp, expires_at) VALUES ($1, $2, $3, $4, 'seller', 'active', $5, $6, CURRENT_TIMESTAMP + INTERVAL '1 day')",
        [sessionId, user.id, organization.id, membership.id, membership.membership_revision, membership.security_stamp]
    );
    await pool.query(
        "INSERT INTO seller_refresh_token_families (id, session_id, current_generation, status, expires_at) VALUES ($1, $2, 1, 'active', CURRENT_TIMESTAMP + INTERVAL '1 day')",
        [familyId, sessionId]
    );
    await pool.query(
        "INSERT INTO seller_refresh_tokens (id, family_id, generation, token_hash, status, expires_at) VALUES ($1, $2, 1, $3, 'active', CURRENT_TIMESTAMP + INTERVAL '1 day')",
        [crypto.randomUUID(), familyId, crypto.createHash('sha256').update(`refresh-${suffix}`).digest('hex')]
    );

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;

    const existingForgot = await forgot(base, existingEmail);
    const missingForgot = await forgot(base, `missing-${suffix}@example.test`);
    assert.equal(existingForgot.status, 202);
    assert.equal(missingForgot.status, 202);
    assert.deepEqual(Object.keys(existingForgot.body).sort(), Object.keys(missingForgot.body).sort());
    const delivery = deliveryBoundary.consumeSynthetic(existingForgot.body.challenge_id);
    assert.equal(delivery.destination, existingEmail);
    assert.equal(deliveryBoundary.consumeSynthetic(missingForgot.body.challenge_id), null);
    const dedupe = await forgot(base, existingEmail);
    assert.equal(dedupe.body.challenge_id, existingForgot.body.challenge_id);
    assert.equal(deliveryBoundary.consumeSynthetic(dedupe.body.challenge_id), null);
    assert.equal((await forgot(base, 'malformed')).status, 400);

    assert.equal((await verify(base, existingForgot.body.challenge_id, '00000000')).status, 401);
    const verified = await verify(base, existingForgot.body.challenge_id, delivery.code);
    assert.equal(verified.status, 200);
    assert.deepEqual(Object.keys(verified.body.recovery_authority).sort(), ['challenge_id', 'expires_in', 'reset_token', 'type']);
    assert.equal(verified.body.recovery_authority.type, 'RESET_TOKEN_BOUND');
    assert.equal(JSON.stringify(verified.body).includes('access_token'), false);
    assert.equal((await verify(base, existingForgot.body.challenge_id, delivery.code)).status, 401);

    const exhaustedForgot = await forgot(base, existingEmail);
    const exhaustedDelivery = deliveryBoundary.consumeSynthetic(exhaustedForgot.body.challenge_id);
    for (let attempt = 0; attempt < 5; attempt += 1) assert.equal((await verify(base, exhaustedForgot.body.challenge_id, '11111111')).status, 401);
    assert.equal((await verify(base, exhaustedForgot.body.challenge_id, exhaustedDelivery.code)).status, 401);

    const expiredForgot = await forgot(base, existingEmail);
    const expiredDelivery = deliveryBoundary.consumeSynthetic(expiredForgot.body.challenge_id);
    await pool.query("UPDATE seller_password_recovery_challenges SET created_at = CURRENT_TIMESTAMP - INTERVAL '2 seconds', expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id = $1", [expiredForgot.body.challenge_id]);
    assert.equal((await verify(base, expiredForgot.body.challenge_id, expiredDelivery.code)).status, 401);

    const raceForgot = await forgot(base, existingEmail);
    const raceDelivery = deliveryBoundary.consumeSynthetic(raceForgot.body.challenge_id);
    const verifyRace = await Promise.all([
        verify(base, raceForgot.body.challenge_id, raceDelivery.code),
        verify(base, raceForgot.body.challenge_id, raceDelivery.code)
    ]);
    assert.deepEqual(verifyRace.map((entry) => entry.status).sort(), [200, 401]);
    const resetAuthority = verifyRace.find((entry) => entry.status === 200).body.recovery_authority;
    const newPassword = 'New!SellerPassword7';
    assert.equal((await request(base, 'POST', '/api/seller/v1/auth/password/reset', {
        body: { challenge_id: resetAuthority.challenge_id, reset_token: resetAuthority.reset_token, new_password: 'weak' }
    })).status, 400);
    assert.equal((await request(base, 'POST', '/api/seller/v1/auth/password/reset', {
        token: 'admin.jwt.cannot-bypass',
        body: { challenge_id: resetAuthority.challenge_id, reset_token: 'invalid-reset-token', new_password: newPassword }
    })).status, 401);
    const resetBody = { challenge_id: resetAuthority.challenge_id, reset_token: resetAuthority.reset_token, new_password: newPassword };
    const resetRace = await Promise.all([
        request(base, 'POST', '/api/seller/v1/auth/password/reset', { body: resetBody }),
        request(base, 'POST', '/api/seller/v1/auth/password/reset', { body: resetBody })
    ]);
    assert.deepEqual(resetRace.map((entry) => entry.status).sort(), [200, 401]);
    const resetSuccess = resetRace.find((entry) => entry.status === 200).body;
    assert.equal(resetSuccess.auto_login, false);
    assert.equal(resetSuccess.revoked_session_count, 1);
    assert.equal((await request(base, 'POST', '/api/seller/v1/auth/password/reset', { body: resetBody })).status, 401);
    assert.equal((await request(base, 'POST', '/api/seller/v1/auth/password/reset', {
        body: {
            challenge_id: verified.body.recovery_authority.challenge_id,
            reset_token: verified.body.recovery_authority.reset_token,
            new_password: 'Stale!SellerPassword8'
        }
    })).status, 401);
    const supersededRecovery = (await pool.query(
        'SELECT status, reset_token_hash FROM seller_password_recovery_challenges WHERE id = $1',
        [verified.body.recovery_authority.challenge_id]
    )).rows[0];
    assert.deepEqual(supersededRecovery, { status: 'superseded', reset_token_hash: null });
    assert.equal(Number((await pool.query(
        "SELECT COUNT(*) FROM seller_password_recovery_challenges WHERE user_id = $1 AND status IN ('pending', 'verified')",
        [user.id]
    )).rows[0].count), 0);
    const securityState = (await pool.query(
        'SELECT user_row.password, session.status AS session_status, family.status AS family_status FROM users user_row JOIN seller_sessions session ON session.user_id = user_row.id JOIN seller_refresh_token_families family ON family.session_id = session.id WHERE user_row.id = $1',
        [user.id]
    )).rows[0];
    assert.equal(await bcrypt.compare(newPassword, securityState.password), true);
    assert.equal(securityState.session_status, 'revoked');
    assert.equal(securityState.family_status, 'revoked');
    const persistedRecovery = JSON.stringify((await pool.query('SELECT code_hash, reset_token_hash, metadata_redacted FROM seller_password_recovery_challenges challenge LEFT JOIN seller_password_recovery_events event ON event.challenge_id = challenge.id WHERE challenge.id = $1', [resetAuthority.challenge_id])).rows);
    assert.equal(persistedRecovery.includes(raceDelivery.code), false);
    assert.equal(persistedRecovery.includes(resetAuthority.reset_token), false);

    const firstCreateBody = { identity: { email: `applicant-${suffix}@example.test`, full_name: 'Başvuru Sahibi', phone: '+905551112233' } };
    const applicantBootstrapSecret = crypto.randomBytes(32).toString('base64url');
    const wrongBootstrapSecret = crypto.randomBytes(32).toString('base64url');
    const firstCreate = await request(base, 'POST', '/api/seller/v1/applications', {
        applicantSecret: applicantBootstrapSecret,
        body: firstCreateBody,
        idempotency: `create-main6u-${suffix}`
    });
    assert.equal(firstCreate.status, 201);
    assert.equal(firstCreate.body.application.terms_revision, TERMS_REVISION);
    assert.equal(firstCreate.body.application.submission_eligibility.terms_current, false);
    const applicantToken = firstCreate.body.applicant_token;
    const applicationId = firstCreate.body.application.id;
    assert.equal((await request(base, 'POST', '/api/seller/v1/applications', {
        body: firstCreateBody,
        idempotency: `create-main6u-${suffix}`
    })).status, 401);
    assert.equal((await request(base, 'POST', '/api/seller/v1/applications', {
        applicantSecret: wrongBootstrapSecret,
        body: firstCreateBody,
        idempotency: `create-main6u-${suffix}`
    })).status, 401);
    const createReplay = await request(base, 'POST', '/api/seller/v1/applications', {
        applicantSecret: applicantBootstrapSecret,
        body: firstCreateBody,
        idempotency: `create-main6u-${suffix}`
    });
    assert.equal(createReplay.body.application.id, applicationId);
    assert.equal(createReplay.body.applicant_token, applicantToken);
    assert.equal(createReplay.body.application.terms_revision, TERMS_REVISION);
    assert.equal((await request(base, 'POST', '/api/seller/v1/applications', {
        applicantSecret: applicantBootstrapSecret,
        body: firstCreateBody,
        idempotency: `different-main6u-${suffix}`
    })).status, 409);
    const sameUnverifiedEmail = await request(base, 'POST', '/api/seller/v1/applications', {
        applicantSecret: crypto.randomBytes(32).toString('base64url'),
        body: firstCreateBody,
        idempotency: `independent-main6u-${suffix}`
    });
    assert.equal(sameUnverifiedEmail.status, 201);
    assert.notEqual(sameUnverifiedEmail.body.application.id, applicationId);
    assert.equal(sameUnverifiedEmail.body.application.terms_revision, TERMS_REVISION);
    const rotatedTermsService = createSellerApplicationService({
        database: pool,
        secret: APPLICATION_SECRET,
        termsAuthority: { revision: 'seller-terms-local-test-v2', generation: 2 }
    });
    assert.equal((await request(base, 'GET', '/api/seller/v1/applications/current', { token: resetAuthority.reset_token })).status, 401);
    assert.equal((await request(base, 'GET', '/api/seller/v1/applications/current', { token: 'customer.jwt.token' })).status, 401);
    let current = await request(base, 'GET', '/api/seller/v1/applications/current', { token: applicantToken });
    assert.equal(current.body.application.id, applicationId);
    assert.equal(current.body.application.next_allowed_step, 'business');
    assert.equal(current.body.application.terms_revision, TERMS_REVISION);
    assert.equal((await pool.query('SELECT terms_revision FROM seller_applications WHERE id = $1', [applicationId])).rows[0].terms_revision, null);

    const foreignCreate = await request(base, 'POST', '/api/seller/v1/applications', {
        applicantSecret: crypto.randomBytes(32).toString('base64url'),
        body: { identity: { email: `foreign-${suffix}@example.test`, full_name: 'Yabancı Başvuru' } },
        idempotency: `create-foreign-${suffix}`
    });
    assert.notEqual(foreignCreate.body.application.id, applicationId);
    assert.equal((await request(base, 'PATCH', '/api/seller/v1/applications/current/steps/not-a-step', {
        token: applicantToken,
        body: { expected_revision: 1 }
    })).status, 400);
    assert.equal((await request(base, 'PATCH', '/api/seller/v1/applications/current/steps/business', {
        token: applicantToken,
        body: { expected_revision: 1, legal_name: 'Owned Company', store_name: 'Owned Store', business_type: 'company', application_id: foreignCreate.body.application.id }
    })).status, 400);

    const update = async (step, body, expectedStatus = 200) => {
        const result = await request(base, 'PATCH', `/api/seller/v1/applications/current/steps/${step}`, { token: applicantToken, body });
        assert.equal(result.status, expectedStatus, `${step}: ${JSON.stringify(result.body)}`);
        return result;
    };
    const business = await update('business', { expected_revision: 1, legal_name: 'Main6U Company', store_name: 'Main6U Store', business_type: 'company' });
    assert.equal((await update('contact', { expected_revision: 1, address_line: 'Test Cadde 1', city: 'İstanbul', district: 'Kadıköy', postal_code: '34710' }, 409)).body.code, 'REVISION_CONFLICT');
    const contact = await update('contact', { expected_revision: business.body.application.revision, address_line: 'Test Cadde 1', city: 'İstanbul', district: 'Kadıköy', postal_code: '34710' });
    assert.equal((await update('agreements', { expected_revision: contact.body.application.revision, accepted: true, terms_revision: null }, 400)).body.code, 'VALIDATION_FAILED');
    assert.equal((await update('agreements', { expected_revision: contact.body.application.revision, accepted: true, terms_revision: '' }, 400)).body.code, 'VALIDATION_FAILED');
    assert.equal((await update('agreements', { expected_revision: contact.body.application.revision, accepted: true, terms_revision: 'STALE' }, 409)).body.code, 'TERMS_REVISION_MISMATCH');
    assert.equal((await update('agreements', { expected_revision: contact.body.application.revision, accepted: true, terms_revision: 'client-invented-v1' }, 409)).body.code, 'TERMS_REVISION_MISMATCH');
    const agreements = await update('agreements', { expected_revision: contact.body.application.revision, accepted: true, terms_revision: TERMS_REVISION });
    assert.equal(agreements.body.application.terms_revision, TERMS_REVISION);
    assert.equal((await pool.query('SELECT terms_revision FROM seller_applications WHERE id = $1', [applicationId])).rows[0].terms_revision, TERMS_REVISION);
    const documents = await update('documents', { expected_revision: agreements.body.application.revision, items: [{ kind: 'identity', document_reference: `local-doc-${suffix}` }] });
    assert.equal(documents.body.application.steps.documents.items[0].state, 'uploaded_unverified');
    const payout = await update('payout', { expected_revision: documents.body.application.revision, account_holder: 'Başvuru Sahibi', iban_last4: '1234' });

    const rotationApplicant = { applicationId: sameUnverifiedEmail.body.application.id };
    let rotationApplication = await applicationService.updateStep(rotationApplicant, 'business', {
        expected_revision: sameUnverifiedEmail.body.application.revision,
        legal_name: 'Rotation Company',
        store_name: 'Rotation Store',
        business_type: 'company'
    });
    rotationApplication = await applicationService.updateStep(rotationApplicant, 'contact', {
        expected_revision: rotationApplication.application.revision,
        address_line: 'Rotation Cadde 1',
        city: 'İstanbul',
        district: 'Kadıköy',
        postal_code: '34710'
    });
    rotationApplication = await applicationService.updateStep(rotationApplicant, 'agreements', {
        expected_revision: rotationApplication.application.revision,
        accepted: true,
        terms_revision: TERMS_REVISION
    });
    rotationApplication = await applicationService.updateStep(rotationApplicant, 'documents', {
        expected_revision: rotationApplication.application.revision,
        items: [{ kind: 'identity', document_reference: `rotation-doc-${suffix}` }]
    });
    rotationApplication = await applicationService.updateStep(rotationApplicant, 'payout', {
        expected_revision: rotationApplication.application.revision,
        account_holder: 'Rotation Applicant',
        iban_last4: '5678'
    });
    const beforeCounts = (await pool.query('SELECT (SELECT COUNT(*) FROM seller_organizations) AS organizations, (SELECT COUNT(*) FROM seller_stores) AS stores, (SELECT COUNT(*) FROM seller_memberships) AS memberships')).rows[0];
    const submitBody = { expected_revision: payout.body.application.revision };
    const submitRace = await Promise.all([
        request(base, 'PATCH', '/api/seller/v1/applications/current/steps/submission', { token: applicantToken, body: submitBody, idempotency: `submit-main6u-${suffix}` }),
        request(base, 'PATCH', '/api/seller/v1/applications/current/steps/submission', { token: applicantToken, body: submitBody, idempotency: `submit-main6u-${suffix}` })
    ]);
    assert.deepEqual(submitRace.map((entry) => entry.status), [200, 200]);
    assert.deepEqual(submitRace[0].body, submitRace[1].body);
    const submitted = submitRace[0];
    assert.equal(submitted.body.application.status, 'AWAITING_EXTERNAL_VERIFICATION');
    assert.equal(submitted.body.auto_approved, false);
    const submitReplay = await request(base, 'PATCH', '/api/seller/v1/applications/current/steps/submission', { token: applicantToken, body: submitBody, idempotency: `submit-main6u-${suffix}` });
    assert.deepEqual(submitReplay.body, submitted.body);
    const afterCounts = (await pool.query('SELECT (SELECT COUNT(*) FROM seller_organizations) AS organizations, (SELECT COUNT(*) FROM seller_stores) AS stores, (SELECT COUNT(*) FROM seller_memberships) AS memberships')).rows[0];
    assert.deepEqual(afterCounts, beforeCounts);
    const verificationRace = await Promise.all([
        request(base, 'POST', '/api/seller/v1/applications/current/verifications/identity/commands', {
            token: applicantToken,
            body: { command: 'request', expected_revision: submitted.body.application.revision },
            idempotency: `verify-main6u-${suffix}`
        }),
        request(base, 'POST', '/api/seller/v1/applications/current/verifications/identity/commands', {
            token: applicantToken,
            body: { command: 'request', expected_revision: submitted.body.application.revision },
            idempotency: `verify-main6u-${suffix}`
        })
    ]);
    assert.deepEqual(verificationRace.map((entry) => entry.status), [200, 200]);
    assert.deepEqual(verificationRace[0].body, verificationRace[1].body);
    const verification = verificationRace[0];
    assert.deepEqual(verification.body.verification, { channel: 'identity', status: 'provider_unavailable', verified: false });
    const verificationReplay = await request(base, 'POST', '/api/seller/v1/applications/current/verifications/identity/commands', {
        token: applicantToken,
        body: { command: 'request', expected_revision: submitted.body.application.revision },
        idempotency: `verify-main6u-${suffix}`
    });
    assert.deepEqual(verificationReplay.body, verification.body);
    assert.equal((await request(base, 'POST', '/api/seller/v1/applications/current/verifications/identity/commands', {
        token: applicantToken,
        body: { command: 'approve', expected_revision: verification.body.application.revision },
        idempotency: `approve-main6u-${suffix}`
    })).status, 400);
    await assert.rejects(
        applicationService.reviewDecision({ authority: 'SELLER_SESSION', userId: user.id }, {
            application_id: applicationId,
            expected_revision: verification.body.application.revision,
            command: 'start_review'
        }),
        (error) => error.code === 'ADMIN_REVIEW_AUTHORITY_REQUIRED'
    );
    const reviewing = await applicationService.reviewDecision({ authority: 'ADMIN_REVIEW', userId: 9001 }, {
        application_id: applicationId,
        expected_revision: verification.body.application.revision,
        command: 'start_review'
    });
    assert.equal(reviewing.application.status, 'UNDER_REVIEW');
    await assert.rejects(
        applicationService.reviewDecision({ authority: 'ADMIN_REVIEW', userId: 9001 }, {
            application_id: applicationId,
            expected_revision: reviewing.application.revision,
            command: 'approve'
        }),
        (error) => error.code === 'EXTERNAL_VERIFICATION_REQUIRED'
    );
    const correction = await applicationService.reviewDecision({ authority: 'ADMIN_REVIEW', userId: 9001 }, {
        application_id: applicationId,
        expected_revision: reviewing.application.revision,
        command: 'request_correction',
        correction_steps: ['business']
    });
    assert.equal(correction.application.status, 'NEEDS_CORRECTION');
    assert.deepEqual(correction.application.correction_steps, ['business']);
    const corrected = await update('business', {
        expected_revision: correction.application.revision,
        legal_name: 'Main6U Company Corrected',
        store_name: 'Main6U Store Corrected',
        business_type: 'company'
    });
    assert.equal(corrected.body.application.next_allowed_step, 'submission');
    const resubmitted = await request(base, 'PATCH', '/api/seller/v1/applications/current/steps/submission', {
        token: applicantToken,
        body: { expected_revision: corrected.body.application.revision },
        idempotency: `resubmit-main6u-${suffix}`
    });
    assert.equal(resubmitted.status, 200);
    assert.equal(resubmitted.body.application.status, 'AWAITING_EXTERNAL_VERIFICATION');
    current = await request(base, 'GET', '/api/seller/v1/applications/current', { token: applicantToken });
    assert.equal(current.body.application.id, applicationId);
    assert.equal(current.body.application.status, 'AWAITING_EXTERNAL_VERIFICATION');
    const auditCount = Number((await pool.query('SELECT COUNT(*) FROM seller_application_events WHERE application_id = $1', [applicationId])).rows[0].count);
    assert.ok(auditCount >= 10);

    await assert.rejects(
        rotatedTermsService.updateStep(
            rotationApplicant,
            'submission',
            { expected_revision: rotationApplication.application.revision },
            `submit-rotated-direct-main6u-${suffix}`
        ),
        (error) => error.code === 'TERMS_REVISION_MISMATCH'
    );
    const authorityAfterRejectedDirectSubmit = (await pool.query(
        'SELECT active_revision, generation FROM seller_application_terms_authority WHERE authority_key = 1'
    )).rows[0];
    assert.deepEqual(authorityAfterRejectedDirectSubmit, {
        active_revision: 'seller-terms-local-test-v2',
        generation: '2'
    });
    assert.equal(Number((await pool.query(
        'SELECT COUNT(*) FROM seller_application_terms_authority_events WHERE generation = 2'
    )).rows[0].count), 1);
    const rotatedAccepted = await rotatedTermsService.current(rotationApplicant);
    assert.equal(rotatedAccepted.terms_revision, 'seller-terms-local-test-v2');
    assert.equal(rotatedAccepted.steps.agreements.terms_revision, TERMS_REVISION);
    assert.equal(rotatedAccepted.submission_eligibility.terms_current, false);
    await assert.rejects(
        applicationService.current(rotationApplicant),
        (error) => error.code === 'TERMS_REVISION_AUTHORITY_STALE' && error.statusCode === 503
    );
    await assert.rejects(
        applicationService.updateStep(rotationApplicant, 'agreements', {
            expected_revision: rotationApplication.application.revision,
            accepted: true,
            terms_revision: TERMS_REVISION
        }),
        (error) => error.code === 'TERMS_REVISION_AUTHORITY_STALE' && error.statusCode === 503
    );
    await assert.rejects(
        applicationService.updateStep(
            rotationApplicant,
            'submission',
            { expected_revision: rotationApplication.application.revision },
            `submit-stale-replica-main6u-${suffix}`
        ),
        (error) => error.code === 'TERMS_REVISION_AUTHORITY_STALE' && error.statusCode === 503
    );
    const conflictingReplicaService = createSellerApplicationService({
        database: pool,
        secret: APPLICATION_SECRET,
        termsAuthority: { revision: 'seller-terms-conflicting-v2', generation: 2 }
    });
    await assert.rejects(
        conflictingReplicaService.current(rotationApplicant),
        (error) => error.code === 'TERMS_REVISION_AUTHORITY_CONFLICT' && error.statusCode === 503
    );
    await assert.rejects(
        rotatedTermsService.updateStep(
            rotationApplicant,
            'submission',
            { expected_revision: rotationApplication.application.revision },
            `submit-rotated-main6u-${suffix}`
        ),
        (error) => error.code === 'TERMS_REVISION_MISMATCH'
    );
    const reacceptedRotation = await rotatedTermsService.updateStep(rotationApplicant, 'agreements', {
        expected_revision: rotationApplication.application.revision,
        accepted: true,
        terms_revision: 'seller-terms-local-test-v2'
    });
    assert.equal(reacceptedRotation.application.next_allowed_step, 'submission');
    assert.equal(reacceptedRotation.application.terms_revision, 'seller-terms-local-test-v2');
    assert.equal(reacceptedRotation.application.steps.agreements.terms_revision, 'seller-terms-local-test-v2');
    const rotationEvent = (await pool.query(
        "SELECT metadata_redacted FROM seller_application_events WHERE application_id = $1 AND event_type = 'seller.application.step_updated' AND metadata_redacted ->> 'step' = 'agreements' ORDER BY id DESC LIMIT 1",
        [rotationApplicant.applicationId]
    )).rows[0].metadata_redacted;
    assert.deepEqual(rotationEvent, {
        step: 'agreements',
        verification_claimed: false,
        previous_terms_revision: TERMS_REVISION,
        accepted_terms_revision: 'seller-terms-local-test-v2',
        terms_revision_rotated: true
    });
    const rotatedSubmission = await rotatedTermsService.updateStep(
        rotationApplicant,
        'submission',
        { expected_revision: reacceptedRotation.application.revision },
        `submit-rotated-current-main6u-${suffix}`
    );
    assert.equal(rotatedSubmission.application.status, 'AWAITING_EXTERNAL_VERIFICATION');
    const authority = (await pool.query(
        'SELECT active_revision, generation FROM seller_application_terms_authority WHERE authority_key = 1'
    )).rows[0];
    assert.deepEqual(authority, { active_revision: 'seller-terms-local-test-v2', generation: '2' });
    const authorityEvents = (await pool.query(
        'SELECT generation, active_revision, previous_generation, previous_revision FROM seller_application_terms_authority_events ORDER BY generation'
    )).rows;
    assert.deepEqual(authorityEvents, [
        { generation: '1', active_revision: TERMS_REVISION, previous_generation: null, previous_revision: null },
        { generation: '2', active_revision: 'seller-terms-local-test-v2', previous_generation: '1', previous_revision: TERMS_REVISION }
    ]);
    await assert.rejects(
        pool.query('UPDATE seller_application_terms_authority_events SET active_revision = active_revision WHERE generation = 2'),
        (error) => error.code === '55000'
    );
    await assert.rejects(
        pool.query('DELETE FROM seller_application_terms_authority_events WHERE generation = 2'),
        (error) => error.code === '55000'
    );
    await assert.rejects(
        pool.query('TRUNCATE TABLE seller_application_terms_authority_events'),
        (error) => error.code === '55000'
    );

    const generationThreeService = createSellerApplicationService({
        database: pool,
        secret: APPLICATION_SECRET,
        termsAuthority: { revision: 'seller-terms-local-test-v3', generation: 3 }
    });
    const generationFourService = createSellerApplicationService({
        database: pool,
        secret: APPLICATION_SECRET,
        termsAuthority: { revision: 'seller-terms-local-test-v4', generation: 4 }
    });
    const generationRace = await Promise.allSettled([
        generationThreeService.current(rotationApplicant),
        generationFourService.current(rotationApplicant)
    ]);
    assert.equal(generationRace[1].status, 'fulfilled');
    if (generationRace[0].status === 'rejected') {
        assert.equal(generationRace[0].reason.code, 'TERMS_REVISION_AUTHORITY_STALE');
    }
    assert.deepEqual((await pool.query(
        'SELECT active_revision, generation FROM seller_application_terms_authority WHERE authority_key = 1'
    )).rows[0], { active_revision: 'seller-terms-local-test-v4', generation: '4' });
    const concurrentGenerationEvents = (await pool.query(
        'SELECT generation, previous_generation FROM seller_application_terms_authority_events WHERE generation IN (3, 4) ORDER BY generation'
    )).rows;
    assert.ok(concurrentGenerationEvents.length === 1 || concurrentGenerationEvents.length === 2);
    assert.equal(concurrentGenerationEvents.at(-1).generation, '4');
    if (concurrentGenerationEvents.length === 1) {
        assert.deepEqual(concurrentGenerationEvents[0], { generation: '4', previous_generation: '2' });
    } else {
        assert.deepEqual(concurrentGenerationEvents, [
            { generation: '3', previous_generation: '2' },
            { generation: '4', previous_generation: '3' }
        ]);
    }

    const generationFiveA = createSellerApplicationService({
        database: pool,
        secret: APPLICATION_SECRET,
        termsAuthority: { revision: 'seller-terms-local-test-v5-a', generation: 5 }
    });
    const generationFiveB = createSellerApplicationService({
        database: pool,
        secret: APPLICATION_SECRET,
        termsAuthority: { revision: 'seller-terms-local-test-v5-b', generation: 5 }
    });
    const conflictingGenerationRace = await Promise.allSettled([
        generationFiveA.current(rotationApplicant),
        generationFiveB.current(rotationApplicant)
    ]);
    assert.deepEqual(conflictingGenerationRace.map((entry) => entry.status).sort(), ['fulfilled', 'rejected']);
    const rejectedGenerationFive = conflictingGenerationRace.find((entry) => entry.status === 'rejected');
    assert.equal(rejectedGenerationFive.reason.code, 'TERMS_REVISION_AUTHORITY_CONFLICT');
    const generationFiveAuthority = (await pool.query(
        'SELECT active_revision, generation FROM seller_application_terms_authority WHERE authority_key = 1'
    )).rows[0];
    assert.equal(generationFiveAuthority.generation, '5');
    assert.ok(['seller-terms-local-test-v5-a', 'seller-terms-local-test-v5-b'].includes(generationFiveAuthority.active_revision));
    assert.equal(Number((await pool.query(
        'SELECT COUNT(*) FROM seller_application_terms_authority_events WHERE generation = 5'
    )).rows[0].count), 1);
    await assert.rejects(
        generationFourService.current(rotationApplicant),
        (error) => error.code === 'TERMS_REVISION_AUTHORITY_STALE'
    );

    console.log('SELLER_MAIN6U_LOCAL_E2E=PASS');
    console.log('PASSWORD_ENUMERATION_RESPONSE_PARITY=PASS');
    console.log('RESET_CONCURRENCY_SINGLE_SUCCESS=PASS');
    console.log('RESET_SIBLING_AUTHORITY_SUPERSESSION=PASS');
    console.log('SELLER_SESSION_REVOCATION=PASS');
    console.log('APPLICANT_BOOTSTRAP_AUTHORITY=PASS');
    console.log('UNVERIFIED_IDENTITY_SQUATTING_PREVENTION=PASS');
    console.log('APPLICATION_IDOR=PASS');
    console.log('APPLICATION_REVISION_IDEMPOTENCY=PASS');
    console.log('AUTHORITATIVE_TERMS_REVISION=PASS');
    console.log('TERMS_REVISION_ROTATION_FAIL_CLOSED=PASS');
    console.log('APPLICATION_CORRECTION_CYCLE=PASS');
    console.log('AUTO_APPROVAL_PREVENTION=PASS');
    console.log('EXTERNAL_PROVIDER_BOUNDARY=PASS');
})().finally(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
}).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
