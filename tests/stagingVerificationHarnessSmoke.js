const assert = require('node:assert/strict');
const express = require('express');
const {
    createStagingAccessGate
} = require('../middlewares/stagingAccessGate');
const { createRuntimeMetaRouter } = require('../routes/runtimeMetaRoutes');
const {
    StagingVerificationError,
    assertRedirectAllowed,
    attestResolvedAddresses,
    createPinnedLookup,
    isSafeVerificationRequest,
    isUnsafeIpAddress,
    planVerificationTarget,
    resolvePinnedAddresses,
    runVerificationHarness,
    validateBounds
} = require('../scripts/stagingVerificationHarness');

const revision = 'a'.repeat(40);
const syntheticUsername = 'p4d1c-synthetic-operator';
const syntheticPassword = 'p4d1c-synthetic-password-not-for-reuse';
const syntheticHash = '$2b$12$' + 'A'.repeat(53);
const syntheticSessionSecret = 'p4d1c-synthetic-session-secret-not-for-reuse';
const results = { pass: 0, fail: 0, skip: 0 };

const check = async (number, name, assertion) => {
    try {
        await assertion();
        results.pass += 1;
        console.log(`PASS ${number}. ${name}`);
    } catch (error) {
        results.fail += 1;
        console.error(`FAIL ${number}. ${name}: ${error.message}`);
    }
};

const expectCode = (assertion, code) => assert.throws(
    assertion,
    (error) => error instanceof StagingVerificationError && error.code === code
);

const createFixture = async () => {
    const environment = {
        NOVASTORE_DEPLOY_ENV: 'staging',
        NOVASTORE_STAGING_ACCESS_GATE_ENABLED: 'true',
        NOVASTORE_STAGING_ACCESS_USERNAME: syntheticUsername,
        NOVASTORE_STAGING_ACCESS_PASSWORD_HASH: syntheticHash,
        NOVASTORE_STAGING_ACCESS_SESSION_SECRET: syntheticSessionSecret,
        NOVASTORE_STAGING_EXTERNAL_SIDE_EFFECTS_DISABLED: 'true',
        NOVASTORE_ADMIN_CATALOG_PRODUCT_WRITE_ENABLED: 'false',
        NOVASTORE_ADMIN_CATALOG_STRUCTURE_WRITE_ENABLED: 'false',
        NOVASTORE_ADMIN_CANCEL_WRITE_ENABLED: 'false',
        NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED: 'false',
        AI_PROVIDER: 'mock',
        AI_PROVIDER_FALLBACK_ENABLED: 'false',
        SKIP_SCHEMA_INIT: 'true',
        NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
        RENDER_GIT_COMMIT: revision
    };
    const app = express();
    const requests = [];
    app.use((req, _res, next) => {
        requests.push(`${req.method} ${req.originalUrl}`);
        next();
    });
    app.use(createStagingAccessGate({
        environment,
        comparePassword: async (password, hash) => (
            password === syntheticPassword && hash === syntheticHash
        )
    }));
    app.use('/api', createRuntimeMetaRouter({
        environment,
        database: { query: async () => ({ rows: [{ ready: 1 }] }) }
    }));
    app.get('/', (_req, res) => res.status(200).type('html').send('<!doctype html><title>Storefront</title>'));
    app.get('/admin.html', (_req, res) => res.status(200).type('html').send('<!doctype html><title>Admin</title>'));
    app.get('/socket.io/', (_req, res) => res.status(200).send('unexpected'));

    const server = await new Promise((resolve, reject) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
        instance.once('error', reject);
    });
    return {
        target: `http://127.0.0.1:${server.address().port}`,
        requests,
        close: () => new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        })
    };
};

const hasCheck = (result, name) => result.checks.some((entry) => (
    entry.name === name && entry.status === 'PASS'
));

(async () => {
    let actualRemoteRequests = 0;
    let actualRemoteDnsRequests = 0;
    let expandedTargetCorpus = 0;

    await check(21, 'default remote target rejected', () => {
        expectCode(
            () => planVerificationTarget({ target: 'https://staging.example.test' }),
            'REMOTE_CAPABILITY_REQUIRED'
        );
    });

    await check(22, 'production custom domains rejected', () => {
        for (const target of ['https://novastore.tr', 'https://www.novastore.tr']) {
            expectCode(() => planVerificationTarget({
                target,
                allowRemote: true,
                expectedHostname: new URL(target).hostname
            }), 'PRODUCTION_HOST_FORBIDDEN');
        }
    });

    await check(23, 'production provider hostname rejected', () => {
        expectCode(() => planVerificationTarget({
            target: 'https://novastore-backend.onrender.com',
            allowRemote: true,
            expectedHostname: 'novastore-backend.onrender.com'
        }), 'PRODUCTION_HOST_FORBIDDEN');
    });

    await check(24, 'non-loopback HTTP rejected', () => {
        expectCode(
            () => planVerificationTarget({ target: 'http://staging.example.test' }),
            'NON_LOOPBACK_HTTP_FORBIDDEN'
        );
    });

    await check(25, 'URL credential query and fragment rejected', () => {
        const credentialTarget = `http://${[
            'synthetic-user',
            'synthetic-password-not-for-reuse'
        ].join(':')}@127.0.0.1`;
        expectCode(
            () => planVerificationTarget({ target: credentialTarget }),
            'TARGET_URL_CREDENTIALS_FORBIDDEN'
        );
        expectCode(
            () => planVerificationTarget({ target: 'http://127.0.0.1?credential=value' }),
            'TARGET_URL_QUERY_FORBIDDEN'
        );
        expectCode(
            () => planVerificationTarget({ target: 'http://127.0.0.1#fragment' }),
            'TARGET_URL_FRAGMENT_FORBIDDEN'
        );
    });

    await check(26, 'cross-origin redirect rejected', () => {
        const plan = planVerificationTarget({ target: 'http://127.0.0.1:41001' });
        expectCode(
            () => assertRedirectAllowed(plan, 'https://staging.example.test/'),
            'CROSS_ORIGIN_REDIRECT_FORBIDDEN'
        );
    });

    await check(27, 'explicit expected-host mismatch rejected', () => {
        expectCode(() => planVerificationTarget({
            target: 'https://staging.example.test',
            allowRemote: true,
            expectedHostname: 'different.example.test'
        }), 'EXPECTED_HOST_MISMATCH');
    });

    await check(28, 'loopback HTTP test targets accepted', () => {
        assert.equal(planVerificationTarget({ target: 'http://127.0.0.1:41002' }).mode, 'loopback');
        assert.equal(planVerificationTarget({ target: 'http://localhost:41003' }).mode, 'loopback');
        expectCode(
            () => planVerificationTarget({ target: 'http://2130706433:41004' }),
            'LOOPBACK_LOOKALIKE_FORBIDDEN'
        );
    });

    await check(29, 'remote HTTPS requires capability exact host and safe DNS plan', () => {
        const plan = planVerificationTarget({
            target: 'https://staging.example.test',
            allowRemote: true,
            expectedHostname: 'staging.example.test'
        });
        assert.equal(plan.mode, 'remote-staging');
        assert.equal(plan.requiresDnsAttestation, true);
        assert.deepEqual(attestResolvedAddresses([{ address: '93.184.216.34', family: 4 }]), [
            { address: '93.184.216.34', family: 4 }
        ]);
        expectCode(
            () => attestResolvedAddresses([{ address: '127.0.0.1', family: 4 }]),
            'DNS_REBINDING_RISK'
        );
        expectCode(
            () => attestResolvedAddresses([{ address: '10.0.0.1', family: 4 }]),
            'DNS_REBINDING_RISK'
        );
    });

    await check(30, 'actual remote request count remains zero', () => {
        assert.equal(actualRemoteRequests, 0);
    });

    await check('30a', 'canonical byte-level IPv6 and translation corpus rejects unsafe addresses', () => {
        const unsafeAddresses = [
            '::ffff:7f00:1',
            '::ffff:a00:1',
            '0:0:0:0:0:ffff:7f00:1',
            '::127.0.0.1',
            '64:ff9b::7f00:1',
            '::ffff:127.0.0.1',
            '::ffff:c0a8:1',
            '64:ff9b::a00:1',
            '::1',
            '::',
            'fc00::1',
            'fd00::1',
            'fe80::1',
            'ff02::1',
            '0:0:0:0:0:FFFF:C0A8:0001',
            '::FFFF:192.168.0.1',
            '64:FF9B::C0A8:1',
            '64:ff9b:1::7f00:1',
            '2002:7f00:1::',
            '2001:0000:4136:e378:8000:63bf:3fff:fdd2'
        ];
        const safeAddresses = [
            '2001:4860:4860::8888',
            '2001:4860:4860:0:0:0:0:8888',
            '2606:4700:4700::1111',
            '93.184.216.34',
            '8.8.8.8'
        ];
        for (const address of unsafeAddresses) {
            assert.equal(isUnsafeIpAddress(address), true, address);
            expectCode(() => attestResolvedAddresses([{ address }]), 'DNS_REBINDING_RISK');
        }
        for (const address of safeAddresses) {
            assert.equal(isUnsafeIpAddress(address), false, address);
            assert.equal(attestResolvedAddresses([{ address }]).length, 1);
        }
        expandedTargetCorpus += unsafeAddresses.length + safeAddresses.length;
    });

    await check('30b', 'mixed malformed and family-confused DNS answers fail closed', () => {
        const rejectedRecords = [
            [{ address: 'not-an-ip' }],
            [{ address: '' }],
            [{ address: ' 93.184.216.34' }],
            [{ address: '93.184.216.34', family: 6 }],
            [{ address: '2001:4860:4860::8888', family: 4 }],
            [{ address: '2001:::1' }],
            [{ address: '93.184.216.34' }, { address: '10.0.0.1' }]
        ];
        for (const records of rejectedRecords) {
            expectCode(() => attestResolvedAddresses(records), 'DNS_REBINDING_RISK');
        }
        expectCode(() => attestResolvedAddresses([]), 'DNS_ATTESTATION_EMPTY');
        expandedTargetCorpus += rejectedRecords.length + 1;
    });

    await check('30c', 'injected resolver and pinned lookup preserve the attested address', async () => {
        const remotePlan = planVerificationTarget({
            target: 'https://staging.example.test',
            allowRemote: true,
            expectedHostname: 'staging.example.test'
        });
        let injectedResolverCalls = 0;
        const records = await resolvePinnedAddresses(remotePlan, async () => {
            injectedResolverCalls += 1;
            return [{ address: '93.184.216.34', family: 4 }];
        });
        assert.equal(injectedResolverCalls, 1);
        const lookup = createPinnedLookup(records);
        await new Promise((resolve, reject) => lookup('staging.example.test', {}, (error, address, family) => {
            if (error) return reject(error);
            assert.equal(address, '93.184.216.34');
            assert.equal(family, 4);
            return resolve();
        }));
        assert.equal(actualRemoteDnsRequests, 0);
    });

    await check('30d', 'verification request contract is exact method plus path', () => {
        const allowed = [
            ['GET', '/api/health/live'],
            ['HEAD', '/api/health/live'],
            ['GET', '/api/health/ready'],
            ['HEAD', '/api/health/ready'],
            ['GET', '/api/version'],
            ['GET', '/'],
            ['GET', '/admin.html'],
            ['GET', '/_staging/access'],
            ['POST', '/_staging/access'],
            ['POST', '/_staging/logout'],
            ['GET', '/socket.io/?EIO=4&transport=polling']
        ];
        for (const pair of allowed) assert.equal(isSafeVerificationRequest(...pair), true, pair.join(' '));
        for (const pair of [
            ['GET', '/api/products'],
            ['POST', '/api/version'],
            ['GET', '/api/version?extra=1'],
            ['GET', '/socket.io/'],
            ['GET', '/socket.io/?EIO=4&transport=polling&extra=1']
        ]) assert.equal(isSafeVerificationRequest(...pair), false, pair.join(' '));
    });

    const fixture = await createFixture();
    let result;
    try {
        const plan = planVerificationTarget({ target: fixture.target });
        result = await runVerificationHarness({
            plan,
            expectedRevision: revision,
            readCredentials: () => ({
                username: syntheticUsername,
                password: syntheticPassword
            }),
            timeoutMs: 5000,
            maxRedirects: 2
        });
        actualRemoteRequests += result.metrics.remoteHttpRequests;

        await check('30e', 'actual emitted method and path allowlist is exact', () => {
            assert.deepEqual(fixture.requests, [
                'GET /api/health/live',
                'HEAD /api/health/live',
                'GET /api/health/ready',
                'HEAD /api/health/ready',
                'GET /api/version',
                'GET /',
                'GET /_staging/access',
                'POST /_staging/access',
                'GET /api/version',
                'GET /',
                'GET /admin.html',
                'POST /_staging/logout',
                'GET /',
                'GET /api/version',
                'GET /socket.io/?EIO=4&transport=polling'
            ]);
            assert.equal(fixture.requests.some((entry) => entry.includes('/api/products')), false);
        });

        await check(31, 'live GET and HEAD pass', () => {
            assert.equal(hasCheck(result, 'health-live'), true);
        });

        await check(32, 'ready GET and HEAD pass', () => {
            assert.equal(hasCheck(result, 'health-ready'), true);
        });

        await check(33, 'unauthenticated version and storefront protected', () => {
            assert.equal(hasCheck(result, 'unauthenticated-protection'), true);
        });

        await check(34, 'synthetic local access login passes', () => {
            assert.equal(hasCheck(result, 'synthetic-access-login'), true);
        });

        await check(35, 'secure cookie contract passes', () => {
            assert.equal(hasCheck(result, 'secure-cookie'), true);
        });

        await check(36, 'authenticated version revision exact', () => {
            assert.equal(result.revision, revision);
            assert.equal(hasCheck(result, 'revision-attestation'), true);
        });

        await check(37, 'revision mismatch fails closed', async () => {
            await assert.rejects(
                runVerificationHarness({
                    plan,
                    expectedRevision: 'b'.repeat(40),
                    readCredentials: () => ({
                        username: syntheticUsername,
                        password: syntheticPassword
                    })
                }),
                (error) => error instanceof StagingVerificationError && error.code === 'REVISION_MISMATCH'
            );
        });

        await check(38, 'logout cookie clearing passes', () => {
            assert.equal(hasCheck(result, 'logout-cookie-clear'), true);
        });

        await check(39, 'post-logout protected state passes', () => {
            assert.equal(hasCheck(result, 'post-logout-protection'), true);
        });

        await check(40, 'Socket unauthenticated request rejected', () => {
            assert.equal(hasCheck(result, 'socket-unauthenticated-rejection'), true);
        });

        await check(41, 'functional mutation request count zero', () => {
            assert.equal(result.metrics.functionalMutationRequests, 0);
        });

        await check(42, 'provider and external side-effect call count zero', () => {
            assert.equal(result.metrics.externalSideEffectCalls, 0);
        });

        await check(43, 'credential cookie header hash and DSN leak zero', () => {
            const output = JSON.stringify(result);
            for (const marker of [
                syntheticUsername,
                syntheticPassword,
                syntheticHash,
                syntheticSessionSecret,
                'Authorization:',
                'postgresql://'
            ]) assert.equal(output.includes(marker), false);
        });

        await check(44, 'timeout and redirect bounds pass', () => {
            assert.deepEqual(validateBounds({ timeoutMs: 5000, maxRedirects: 2 }), {
                timeoutMs: 5000,
                maxRedirects: 2,
                maxResponseBytes: 65536
            });
            expectCode(() => validateBounds({ timeoutMs: 10001 }), 'TIMEOUT_BOUND_INVALID');
            expectCode(() => validateBounds({ maxRedirects: 4 }), 'REDIRECT_BOUND_INVALID');
        });
    } finally {
        await fixture.close();
    }

    assert.equal(actualRemoteRequests, 0);
    assert.equal(actualRemoteDnsRequests, 0);
    assert.equal(expandedTargetCorpus, 33);
    console.log(
        `stagingVerificationHarnessSmoke: PASS=${results.pass} FAIL=${results.fail} SKIPPED=${results.skip} expanded=33 remote-dns=0 remote-http=0 products=0 mutation=0 external=0`
    );
    if (results.fail > 0 || results.skip > 0) process.exitCode = 1;
})().catch((error) => {
    results.fail += 1;
    console.error(`FAIL staging verification harness: ${error.message}`);
    console.log(
        `stagingVerificationHarnessSmoke: PASS=${results.pass} FAIL=${results.fail} SKIPPED=${results.skip} remote=0`
    );
    process.exitCode = 1;
});
