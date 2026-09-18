'use strict';

// Called by the owned disposable PostgreSQL HTTP suite. This module never opens
// another database, starts Docker, reads environment secrets or commits fixtures.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

module.exports = async ({ pool, fixtures }) => {
    const { serviceA, serviceB, version, draftA, draftB, assignmentA,
        publicationA, publicationB, previewA, assetA, saveOperation } = fixtures;
    for (const [name, value] of Object.entries({ serviceA, serviceB, version, draftA,
        draftB, assignmentA, publicationA, publicationB, previewA, assetA })) {
        assert(value?.id, `Schema proof requires ${name} fixture`);
    }
    assert(saveOperation?.operationId, 'Schema proof requires saved operation fixture');
    const hash = 'a'.repeat(64);
    const checked = [];
    const scopedA = [serviceA.id, serviceA.organization_id, serviceA.store_id];
    const scopedB = [serviceB.id, serviceB.organization_id, serviceB.store_id];
    assert.notEqual(serviceA.organization_id, serviceB.organization_id);

    const rejected = async (name, sql, values, expectedCode, prepare) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query("SET LOCAL statement_timeout='5s'");
            if (prepare) await prepare(client);
            let caught;
            try { await client.query(sql, values); } catch (error) { caught = error; }
            assert(caught, `${name}: database incorrectly accepted mutation`);
            assert.equal(caught.code, expectedCode, `${name}: wrong SQL rejection class`);
            checked.push(name);
        } finally {
            await client.query('ROLLBACK');
            client.release();
        }
    };

    await rejected('service rejects store from another organization',
        `INSERT INTO seller_theme_services(id,organization_id,store_id,plan)
         VALUES($1,$2,$3,'pro')`, [crypto.randomUUID(), serviceA.organization_id, serviceB.store_id], '23503');
    await rejected('asset service scope cannot disagree with organization/store',
        `INSERT INTO theme_assets(id,service_id,organization_id,store_id,detected_mime,byte_size,digest,storage_key)
         VALUES($1,$2,$3,$4,'image/png',10,$5,$6)`,
        [crypto.randomUUID(), serviceA.id, serviceB.organization_id, serviceB.store_id, hash, `proof/${crypto.randomUUID()}`], '23503');
    await rejected('draft snapshot cannot reference another service draft',
        `INSERT INTO theme_draft_revisions(id,service_id,organization_id,store_id,draft_id,revision,overrides,digest)
         VALUES($1,$2,$3,$4,$5,2000000000,'{}'::jsonb,$6)`,
        [crypto.randomUUID(), ...scopedB, draftA.id, hash], '23503');
    await rejected('preview cannot bind a foreign draft snapshot',
        `INSERT INTO theme_previews(id,service_id,organization_id,store_id,draft_id,draft_revision,artifact,digest,expires_at)
         VALUES($1,$2,$3,$4,$5,1,'{}'::jsonb,$6,clock_timestamp()+INTERVAL '1 minute')`,
        [crypto.randomUUID(), ...scopedB, draftA.id, hash], '23503');
    await rejected('preview cannot bind a nonexistent draft revision',
        `INSERT INTO theme_previews(id,service_id,organization_id,store_id,draft_id,draft_revision,artifact,digest,expires_at)
         VALUES($1,$2,$3,$4,$5,2000000000,'{}'::jsonb,$6,clock_timestamp()+INTERVAL '1 minute')`,
        [crypto.randomUUID(), ...scopedA, draftA.id, hash], '23503');

    const foreignOperationId = crypto.randomUUID();
    await rejected('publication cannot bind a foreign scoped operation',
        `INSERT INTO theme_publications(id,service_id,organization_id,store_id,draft_id,draft_revision,operation_id,artifact,digest,policy_revision)
         VALUES($1,$2,$3,$4,$5,1,$6,'{}'::jsonb,$7,1)`,
        [crypto.randomUUID(), ...scopedB, draftB.id, foreignOperationId, hash], '23503',
        (client) => client.query(`INSERT INTO theme_operations(id,service_id,organization_id,store_id,scope_key,actor_id,type,status,idempotency_key,request_hash,correlation_id)
            VALUES($1,$2::uuid,$3,$4,($2::uuid)::text,'proof:actor','proof','REQUESTED',$5,$6,$7)`,
        [foreignOperationId, ...scopedA, crypto.randomUUID(), hash, crypto.randomUUID()]));
    await rejected('deployment cannot bind a foreign publication',
        `INSERT INTO theme_deployments(id,service_id,organization_id,store_id,publication_id,operation_id,digest)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [crypto.randomUUID(), ...scopedB, publicationA.id, publicationB.operation_id, hash], '23503');
    await rejected('outbox cannot bind a foreign operation',
        `INSERT INTO theme_outbox(id,service_id,organization_id,store_id,operation_id,event_type,payload,payload_hash)
         VALUES($1,$2,$3,$4,$5,$6,'{}'::jsonb,$7)`,
        [crypto.randomUUID(), ...scopedB, saveOperation.operationId, `proof.${crypto.randomUUID()}`, hash], '23503');
    await rejected('entitlement cannot bind a foreign service scope',
        `INSERT INTO seller_feature_entitlements(service_id,organization_id,store_id,feature_code,effect)
         VALUES($1,$2,$3,'theme.editor','DENY')`,
        [serviceA.id, serviceB.organization_id, serviceB.store_id], '23503');

    await rejected('global operation rejects partially scoped identity',
        `INSERT INTO theme_operations(id,service_id,scope_key,actor_id,type,status,idempotency_key,request_hash,correlation_id)
         VALUES($1,$2,'global','proof:actor','proof','REQUESTED',$3,$4,$5)`,
        [crypto.randomUUID(), serviceA.id, crypto.randomUUID(), hash, crypto.randomUUID()], '23514');
    await rejected('service operation rejects global scope key',
        `INSERT INTO theme_operations(id,service_id,organization_id,store_id,scope_key,actor_id,type,status,idempotency_key,request_hash,correlation_id)
         VALUES($1,$2,$3,$4,'global','proof:actor','proof','REQUESTED',$5,$6,$7)`,
        [crypto.randomUUID(), ...scopedA, crypto.randomUUID(), hash, crypto.randomUUID()], '23514');
    await rejected('idempotency uniqueness survives distinct operation IDs',
        `INSERT INTO theme_operations(id,service_id,organization_id,store_id,scope_key,actor_id,type,status,idempotency_key,request_hash,correlation_id)
         SELECT $1,service_id,organization_id,store_id,scope_key,actor_id,type,status,idempotency_key,request_hash,correlation_id
         FROM theme_operations WHERE id=$2`, [crypto.randomUUID(), saveOperation.operationId], '23505');

    await rejected('published version update forbidden',
        "UPDATE theme_versions SET document='{}'::jsonb WHERE id=$1", [version.id], '55000');
    await rejected('published version delete forbidden',
        'DELETE FROM theme_versions WHERE id=$1', [version.id], '55000');
    await rejected('draft revision update forbidden',
        "UPDATE theme_draft_revisions SET overrides='{}'::jsonb WHERE draft_id=$1", [draftA.id], '55000');
    await rejected('draft revision delete forbidden',
        'DELETE FROM theme_draft_revisions WHERE draft_id=$1', [draftA.id], '55000');
    await rejected('audit update forbidden',
        "UPDATE theme_audit_events SET reason='tampered' WHERE service_id=$1", [serviceA.id], '55000');
    await rejected('audit delete forbidden',
        'DELETE FROM theme_audit_events WHERE service_id=$1', [serviceA.id], '55000');
    await rejected('audit truncate forbidden', 'TRUNCATE theme_audit_events', [], '55000');
    await rejected('asset ownership cannot be moved even to a valid second service',
        'UPDATE theme_assets SET service_id=$2,organization_id=$3,store_id=$4 WHERE id=$1',
        [assetA.id, ...scopedB], '55000');
    await rejected('operation request hash cannot change under persisted key',
        'UPDATE theme_operations SET request_hash=$2 WHERE id=$1', [saveOperation.operationId, hash], '55000');
    await rejected('operation type cannot change under persisted key',
        "UPDATE theme_operations SET type='tampered' WHERE id=$1", [saveOperation.operationId], '55000');
    await rejected('preview artifact cannot change after issue',
        "UPDATE theme_previews SET artifact='{}'::jsonb WHERE id=$1", [previewA.id], '55000');
    await rejected('publication digest cannot change after request',
        'UPDATE theme_publications SET digest=$2 WHERE id=$1', [publicationA.id, hash], '55000');
    await rejected('publication policy identity cannot change after request',
        'UPDATE theme_publications SET policy_revision=policy_revision+1 WHERE id=$1', [publicationA.id], '55000');
    await rejected('outbox payload cannot change for a logical event',
        "UPDATE theme_outbox SET payload='{}'::jsonb WHERE operation_id=$1", [saveOperation.operationId], '55000');
    await rejected('outbox hash cannot change for a logical event',
        'UPDATE theme_outbox SET payload_hash=$2 WHERE operation_id=$1', [saveOperation.operationId, hash], '55000');
    await rejected('outbox event type cannot change for a logical event',
        "UPDATE theme_outbox SET event_type='proof.tampered' WHERE operation_id=$1", [saveOperation.operationId], '55000');
    const inboxId = crypto.randomUUID();
    await rejected('inbox hash cannot change for a logical event',
        'UPDATE theme_inbox SET payload_hash=$2 WHERE id=$1', [inboxId, 'b'.repeat(64)], '55000',
        (client) => client.query(`INSERT INTO theme_inbox(id,service_id,organization_id,store_id,source,event_id,payload_hash)
            VALUES($1,$2,$3,$4,'proof',$5,$6)`, [inboxId, ...scopedA, crypto.randomUUID(), hash]));
    await rejected('assignment cannot be duplicated in the same active channel',
        `INSERT INTO theme_assignments(id,service_id,organization_id,store_id,theme_version_id,channel)
         SELECT $1,service_id,organization_id,store_id,theme_version_id,channel FROM theme_assignments WHERE id=$2`,
        [crypto.randomUUID(), assignmentA.id], '23505');
    await rejected('publication cannot claim LIVE',
        "UPDATE theme_publications SET status='LIVE' WHERE id=$1", [publicationA.id], '23514');
    await rejected('service expiry must follow start',
        'UPDATE seller_theme_services SET expires_at=starts_at WHERE id=$1', [serviceA.id], '23514');
    await rejected('asset MIME allowlist rejects HTML',
        "UPDATE theme_assets SET detected_mime='text/html' WHERE id=$1", [assetA.id], '23514');

    const actual = await pool.query('SELECT digest,status FROM theme_versions WHERE id=$1', [version.id]);
    assert.equal(actual.rows[0].digest, version.digest);
    assert.equal(actual.rows[0].status, 'PUBLISHED');
    const asset = await pool.query('SELECT service_id,organization_id,store_id FROM theme_assets WHERE id=$1', [assetA.id]);
    assert.deepEqual(asset.rows[0], { service_id: serviceA.id, organization_id: serviceA.organization_id, store_id: serviceA.store_id });
    return { checks: checked.length, names: checked };
};
