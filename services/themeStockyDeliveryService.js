'use strict';

const crypto = require('node:crypto');
const v = require('./themePlatformValidation');
const f = require('./themePlatformService');
const transport = require('./stockySystemConnectorService');
const policy = require('./themePlatformExperiencePolicy');
const { one, transaction } = f;
const EVENT_PATH = transport.THEME_EVENT_PATH;

// Explicit independent activation, sharing the existing endpoint/secret and
// startup attestation policy. Enabling order delivery never enables themes.
const resolveThemeDeliveryRuntime = ({ environment = process.env, startupSafety } = {}) => {
    const translated = { ...environment };
    for (const key of ['ENABLED','WORKER_ENABLED','ACTIVATION_MODE','ALLOWED_HOSTS','LOCAL_TRANSPORT_ENABLED']) {
        translated[`NOVASTORE_STOCKY_SYSTEM_COMMERCE_${key}`] = environment[`NOVASTORE_STOCKY_THEME_DELIVERY_${key}`];
    }
    return transport.resolveStockySystemCommerceRuntime({ environment: translated, startupSafety });
};

async function enqueueAssignment(client, { service, assignment, operationId, revoked = false }) {
    // All identifiers come from already-authorized transactional rows. Missing
    // binding leaves a prepared offer; it never creates a fabricated receipt.
    const connection = await one(client, `SELECT * FROM stocky_connector_connections
        WHERE organization_id=$1 AND store_id=$2 AND status='active' FOR SHARE`, [service.organization_id, service.store_id]);
    if (!connection) return { state: 'PREPARED', reason: 'STOCKY_CONNECTION_REQUIRED', deliveryVerified: false };
    const version = f.found(await one(client, `SELECT v.*,t.name,p.package_digest,p.renderer_id,p.renderer_version
        FROM theme_versions v JOIN themes t ON t.id=v.theme_id JOIN theme_version_packages p ON p.theme_version_id=v.id
        WHERE v.id=$1 FOR SHARE`, [assignment.theme_version_id]));
    if (version.document.schemaVersion !== 2) v.fail('THEME_DELIVERY_SCHEMA_UNSUPPORTED');
    const experience = f.found(await one(client, `SELECT COALESCE(e.profile_code,'BASIC') AS profile_code,
        COALESCE(e.overrides,'{}'::jsonb) AS overrides,p.capabilities
        FROM seller_theme_services s LEFT JOIN theme_service_experiences e ON e.service_id=s.id
        JOIN theme_experience_profiles p ON p.code=COALESCE(e.profile_code,'BASIC')
        WHERE s.id=$1 FOR SHARE OF s,p`, [service.id]));
    const capabilities = Object.fromEntries(Object.keys(policy.CATALOG).map(code => {
        const override = experience.overrides[code];
        return [code, override?.effect === 'DENY' ? 'HIDDEN' : override?.state || experience.capabilities[code] || 'HIDDEN'];
    }));
    policy.validateStates(capabilities);
    const eventId = crypto.randomUUID();
    const payload = {
        contract_version: 'theme.v1', event_id: eventId,
        event_type: revoked ? 'theme.assignment.revoked' : 'theme.assignment.upserted', event_version: 1,
        occurred_at: new Date().toISOString(), store_id: connection.remote_store_id,
        service_id: service.id, assignment_id: assignment.id, assignment_revision: Number(assignment.revision),
        assignment: { theme_id: version.theme_id, theme_version_id: version.id, theme_name: version.name,
            package_sha256: version.package_digest, renderer_id: version.renderer_id, renderer_version: version.renderer_version,
            document_schema_version: 2, channel: assignment.channel, experience_profile: experience.profile_code,
            policy_revision: Number(service.policy_revision), capabilities, document: version.document }
    };
    const raw = transport.stableStringify(payload);
    if (Buffer.byteLength(raw) > 1024 * 1024) v.fail('THEME_DELIVERY_PAYLOAD_TOO_LARGE');
    await client.query(`INSERT INTO theme_outbox(id,service_id,organization_id,store_id,operation_id,event_type,payload,payload_hash)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [eventId, ...f.scope(service), operationId, payload.event_type, payload, transport.sha256Hex(raw)]);
    await client.query(`INSERT INTO theme_stocky_deliveries(outbox_id,connection_id,service_id,organization_id,store_id,assignment_id)
        VALUES($1,$2,$3,$4,$5,$6)`, [eventId, connection.id, ...f.scope(service), assignment.id]);
    return { state: 'DELIVERY_PENDING', eventId, deliveryVerified: false };
}

function validateReceipt(receipt, payload) {
    const keys = ['contract_version','event_type','source_event_id','store_id','service_id','assignment_id',
        'assignment_revision','theme_version_id','package_sha256','channel','processing_status','result_revision','processed_at','result_id',
        'receipt_status','acknowledged_at'];
    v.keys(receipt, [...keys,'replayed'], keys);
    const expected = {
        contract_version: 'theme.v1', event_type: 'theme.processing_result', source_event_id: payload.event_id,
        store_id: payload.store_id, service_id: payload.service_id, assignment_id: payload.assignment_id,
        assignment_revision: payload.assignment_revision, theme_version_id: payload.assignment.theme_version_id,
        package_sha256: payload.assignment.package_sha256, channel: payload.assignment.channel, result_revision: 1
    };
    if (Object.entries(expected).some(([key,value]) => receipt[key] !== value)) v.fail('THEME_DELIVERY_RECEIPT_IDENTITY', 502);
    if (!/^[a-f0-9]{64}$/u.test(receipt.result_id || '')) v.fail('THEME_DELIVERY_RECEIPT_IDENTITY',502);
    stockyUtcDate(receipt.processed_at);
    v.choice(receipt.receipt_status,['awaiting_ack','acknowledged']);
    if (receipt.receipt_status==='acknowledged') stockyUtcDate(receipt.acknowledged_at);
    else if (receipt.acknowledged_at!==null) v.fail('THEME_DELIVERY_ACK_INVALID',502);
    if (receipt.replayed!==undefined) v.boolean(receipt.replayed);
    const expectedStatus = payload.event_type === 'theme.assignment.revoked' ? 'revoked' : 'delivered';
    if (receipt.processing_status !== expectedStatus) v.fail('THEME_DELIVERY_RESULT_REJECTED', 409);
    return receipt;
}

function stockyUtcDate(value) {
    // Carbon's established UTC wire format is +00:00, whereas the internal
    // document contract uses Z. Validate without rewriting the signed receipt.
    if (typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/u.test(value)) {
        v.fail('THEME_DELIVERY_RECEIPT_DATE',502);
    }
    v.date(value.replace(/\+00:00$/u,'Z').replace(/\.(\d{3})\d+Z$/u,'.$1Z'));
}

const errorCode = error => /^(?:THEME|STOCKY)_[A-Z0-9_]{1,90}$/u.test(error?.code || '')
    ? error.code : 'THEME_DELIVERY_TEMPORARY_FAILURE';

function createThemeDeliveryWorker({ database, runtime, send = transport.createSafeStockyThemeTransport(), maxAttempts=8 }) {
    v.integer(maxAttempts,1,100);
    const claim = () => transaction(database, async client => {
        const row = await one(client, `SELECT o.*,d.connection_id,d.receipt,d.status AS delivery_status
            FROM theme_outbox o JOIN theme_stocky_deliveries d ON d.outbox_id=o.id
            WHERE d.status IN ('DELIVERY_PENDING','DELIVERED') AND o.next_attempt_at<=clock_timestamp()
            AND o.status IN ('PENDING','PROCESSING','DELIVERED')
            ORDER BY o.next_attempt_at,o.id FOR UPDATE OF d SKIP LOCKED LIMIT 1`);
        if (!row) return null;
        const token = crypto.randomUUID();
        await client.query(`UPDATE theme_outbox SET status=CASE WHEN status='DELIVERED' THEN status ELSE 'PROCESSING' END,
            attempts=attempts+1,revision=revision+1,next_attempt_at=clock_timestamp()+INTERVAL '45 seconds',updated_at=clock_timestamp() WHERE id=$1`, [row.id]);
        await client.query('UPDATE theme_stocky_deliveries SET lease_token=$2,updated_at=clock_timestamp() WHERE outbox_id=$1', [row.id,token]);
        return { ...row, token };
    });
    const locked = async (client, item) => {
        const row = await one(client, 'SELECT * FROM theme_stocky_deliveries WHERE outbox_id=$1 FOR UPDATE', [item.id]);
        if (!row || row.lease_token !== item.token) v.fail('THEME_DELIVERY_LEASE_LOST', 409);
        const connection = await one(client, `SELECT c.* FROM stocky_connector_connections c
            JOIN seller_theme_services s ON s.organization_id=c.organization_id AND s.store_id=c.store_id
            WHERE c.id=$1 AND s.id=$2 AND c.organization_id=$3 AND c.store_id=$4 AND c.status='active' FOR SHARE OF c,s`,
        [row.connection_id,row.service_id,row.organization_id,row.store_id]);
        if (!connection) v.fail('THEME_DELIVERY_CONNECTION_UNAVAILABLE', 409);
        const service = f.found(await one(client, 'SELECT * FROM seller_theme_services WHERE id=$1', [row.service_id]));
        await f.activeService(client,service);
        return { row, connection };
    };
    const request = async (connection, method, path, body) => {
        const signed = transport.signStockyThemeRequest({ method,path,body,connection,runtime });
        const response = await send({ url:signed.url,method,headers:signed.headers,body,runtime });
        transport.verifyStockyResponse({ ...response,path,connection,runtime,expectedNonce:signed.nonce,expectedTimestamp:signed.timestamp });
        if (![200,201].includes(response.statusCode)) {
            const permanent=response.statusCode>=400&&response.statusCode<500&&![408,429].includes(response.statusCode);
            throw Object.assign(new Error('Signed Theme delivery HTTP rejection'),{code:'THEME_DELIVERY_HTTP_REJECTED',statusCode:permanent?409:503,permanent});
        }
        let parsed;
        try { parsed=JSON.parse(response.rawBody); } catch { v.fail('THEME_DELIVERY_RESPONSE_INVALID',502); }
        v.keys(parsed,['success','data'],['success','data']);
        if (parsed.success!==true) v.fail('THEME_DELIVERY_RESPONSE_INVALID',502);
        return parsed.data;
    };
    const tick = async () => {
        if (!runtime?.enabled || !runtime?.workerEnabled) return { state:'DISABLED' };
        const item = await claim();
        if (!item) return { state:'IDLE' };
        try {
            const { connection } = await transaction(database, client => locked(client,item));
            const raw = transport.stableStringify(item.payload);
            if (transport.sha256Hex(raw) !== item.payload_hash || item.payload.store_id !== connection.remote_store_id) v.fail('THEME_DELIVERY_IMMUTABLE_MISMATCH',409);
            let receipt = item.receipt;
            if (!receipt) {
                receipt = validateReceipt(await request(connection,'POST',EVENT_PATH,raw), item.payload);
                await transaction(database, async client => {
                    const { row } = await locked(client,item);
                    if (row.receipt && v.digest(row.receipt)!==v.digest(receipt)) v.fail('THEME_DELIVERY_RECEIPT_CONFLICT',409);
                    await client.query(`INSERT INTO theme_inbox(id,service_id,organization_id,store_id,source,event_id,payload_hash,status,processed_at,receipt)
                        VALUES($1,$2,$3,$4,'stocky-theme-v1',$5,$6,'PROCESSED',clock_timestamp(),$7)`,
                    [crypto.randomUUID(),row.service_id,row.organization_id,row.store_id,item.id,v.digest(receipt),receipt]);
                    await client.query(`UPDATE theme_stocky_deliveries SET status='DELIVERED',receipt=$2,receipt_hash=$3,result_id=$4,
                        delivered_at=clock_timestamp(),last_error_code=NULL,updated_at=clock_timestamp() WHERE outbox_id=$1`,
                    [item.id,receipt,v.digest(receipt),receipt.result_id]);
                    await client.query("UPDATE theme_outbox SET status='DELIVERED',updated_at=clock_timestamp() WHERE id=$1",[item.id]);
                });
            }
            validateReceipt(receipt,item.payload);
            const ack = await request(connection,'POST',`${EVENT_PATH}/${item.id}/receipt`,transport.stableStringify({result_id:receipt.result_id}));
            validateReceipt(ack,item.payload);
            if (ack.result_id !== receipt.result_id || ack.receipt_status !== 'acknowledged') v.fail('THEME_DELIVERY_ACK_INVALID',502);
            await transaction(database,async client => {
                await locked(client,item);
                await client.query(`UPDATE theme_stocky_deliveries SET status='RECEIPT_CONFIRMED',acknowledged_at=clock_timestamp(),
                    lease_token=NULL,last_error_code=NULL,updated_at=clock_timestamp() WHERE outbox_id=$1`,[item.id]);
            });
            return { eventId:item.id,state:'RECEIPT_CONFIRMED',resultId:receipt.result_id };
        } catch (error) {
            const terminal=error.permanent===true||Number(item.attempts)+1>=maxAttempts
                ||['THEME_DELIVERY_RESULT_REJECTED','THEME_DELIVERY_IMMUTABLE_MISMATCH','THEME_DELIVERY_RECEIPT_IDENTITY','THEME_DELIVERY_RECEIPT_CONFLICT'].includes(error.code);
            let outcome='LEASE_LOST';
            await transaction(database,async client => {
                const row=await one(client,'SELECT lease_token,receipt FROM theme_stocky_deliveries WHERE outbox_id=$1 FOR UPDATE',[item.id]);
                if (row?.lease_token !== item.token) return;
                outcome=terminal?(row.receipt?'ACK_BLOCKED':'REJECTED'):'RETRY_PENDING';
                await client.query(`UPDATE theme_stocky_deliveries SET lease_token=NULL,last_error_code=$2,
                    status=CASE WHEN $3 AND receipt IS NULL THEN 'REJECTED' ELSE status END,updated_at=clock_timestamp() WHERE outbox_id=$1`,[item.id,errorCode(error),terminal]);
                await client.query(`UPDATE theme_outbox SET status=CASE WHEN $2 THEN 'DEAD' WHEN status='DELIVERED' THEN status ELSE 'PENDING' END,
                    next_attempt_at=clock_timestamp()+($3::integer*INTERVAL '1 second'),updated_at=clock_timestamp() WHERE id=$1`,
                [item.id,terminal,Math.min(3600,30*2**Math.min(Number(item.attempts),7))]);
            });
            return { eventId:item.id,state:outcome,code:errorCode(error) };
        }
    };
    return Object.freeze({tick});
}

module.exports = Object.freeze({ enqueueAssignment,createThemeDeliveryWorker,resolveThemeDeliveryRuntime,validateReceipt });
