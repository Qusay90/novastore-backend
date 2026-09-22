'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const v=require('../../services/themePlatformValidation');

// Historical persisted data only. Never claims current assignment eligibility,
// fabricates READY evidence, or creates delivery/publication/audit receipts.
module.exports=async function seedHistoricalAssignment(pool,{service,versionId,channel='web',status='ASSIGNED',commerceMode='SINGLE_STORE',overrides}){
    assert(/^novastore_theme_wave1_[a-f0-9]{16}_test$/u.test((await pool.query('SELECT current_database() AS name')).rows[0].name));
    assert(['ASSIGNED','ACCEPTED'].includes(status));
    const version=(await pool.query('SELECT document FROM theme_versions WHERE id=$1',[versionId])).rows[0];assert(version);
    const effectiveOverrides=overrides||(version.document.schemaVersion===2?{studio:{}}:{tokens:{},components:[],assetIds:[]});
    const assignment=(await pool.query(`INSERT INTO theme_assignments(id,service_id,organization_id,store_id,theme_version_id,channel,commerce_mode,status,accepted_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $8='ACCEPTED' THEN clock_timestamp() ELSE NULL END) RETURNING *`,
    [crypto.randomUUID(),service.id,service.organization_id,service.store_id,versionId,channel,commerceMode,status])).rows[0];
    const draft=(await pool.query('INSERT INTO theme_drafts(id,service_id,organization_id,store_id,assignment_id,overrides) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
    [crypto.randomUUID(),service.id,service.organization_id,service.store_id,assignment.id,effectiveOverrides])).rows[0];
    await pool.query('INSERT INTO theme_draft_revisions(id,service_id,organization_id,store_id,draft_id,revision,overrides,digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [crypto.randomUUID(),service.id,service.organization_id,service.store_id,draft.id,draft.revision,effectiveOverrides,v.digest(effectiveOverrides)]);
    return {assignment,draft};
};
