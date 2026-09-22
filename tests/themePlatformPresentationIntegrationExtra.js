'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = async ({ pool, gate, serviceA, imported, reviewedImported, a, request, write, result, ok, serviceRead, configure, ap, sp, reason }) => {
    const input = JSON.parse(await fs.readFile(path.join(__dirname, '../theme-platform/packages/nova-classic-studio-web-v1_1.json'), 'utf8'));
    const presentation = input.renderer.presentation;
    let upgrade;
    await gate('W45 trusted presentation import creates a new immutable version and rejects forged identity', async () => {
        const before = (await pool.query('SELECT document,digest,version FROM theme_versions WHERE id=$1', [imported.id])).rows[0];
        // Real importer ran at W11 before the reviewed edit regressions. Reuse
        // that immutable result instead of issuing a second version creation.
        upgrade = reviewedImported;
        assert.notEqual(upgrade.id, imported.id); assert.equal(upgrade.version, '1.1.0-wave2');
        assert.deepEqual((await pool.query('SELECT document,digest,version FROM theme_versions WHERE id=$1', [imported.id])).rows[0], before);
        const catalog = ok(await request(`${ap}/experience/catalog`)), current = catalog.find(item => item.id === upgrade.id);
        assert.deepEqual(current.presentation, presentation); assert.equal(current.sourceThemeId, '15-nova-classic');
        assert.equal(catalog.find(item => item.id === imported.id).presentation, null);
        for (const patch of [{id:'unknown'}, {version:'9.0.0'}, {digest:'0'.repeat(64)}, {script:'/evil.js'}]) {
            const bad = structuredClone(input); bad.theme.version = `invalid-${crypto.randomUUID().slice(0,8)}`; bad.renderer.presentation = {...presentation,...patch};
            ok(await write(`${ap}/experience/packages`, { package: bad, reason }), 400);
        }
        await assert.rejects(pool.query("UPDATE theme_version_packages SET manifest=manifest || '{\"renderer\":{}}'::jsonb WHERE theme_version_id=$1", [upgrade.id]), {code:'55000'});
        await assert.rejects(pool.query("UPDATE theme_versions SET document='{}'::jsonb WHERE id=$1", [upgrade.id]), {code:'55000'});
    });
    await gate('W46 real reviewed Classic and Atelier prepare normally while unknown renderer remains denied', async () => {
        const current = (await pool.query("SELECT id,revision FROM theme_assignments WHERE service_id=$1 AND status<>'WITHDRAWN'", [serviceA.id])).rows;
        for (const assignment of current) await result(`${ap}/assignments/${assignment.id}/withdraw`, { expectedRevision: assignment.revision, reason });
        const offerFor=async versionId=>result(`${ap}/services/${serviceA.id}/offers`,{themeVersionId:versionId,channel:'web',commerceMode:'SINGLE_STORE',profileCode:'PRO',overrides:{},expectedRevision:Number((await serviceRead(serviceA.id)).policy_revision),reason});
        const unknown=await offerFor(imported.id);
        const counts=async()=>Promise.all(['theme_assignments','theme_drafts','theme_outbox','theme_operations'].map(async table=>Number((await pool.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n)));
        const before=await counts();
        const denied=ok(await write(`${ap}/offers/${unknown.id}/prepare`,{expectedRevision:unknown.revision,reason}),409);
        assert.equal(denied.code,'THEME_PRESENTATION_NOT_READY');assert.deepEqual(await counts(),before);
        // Actual checked-in, byte-verified browser acceptance grants these two
        // WEB identities. No test-only READY override or historical seed is used.
        const atelierPackage=JSON.parse(await fs.readFile(path.join(__dirname,'../theme-platform/packages/nova-atelier-studio-web-v1.json'),'utf8'));
        const atelierVersion=await result(`${ap}/experience/packages`,{package:atelierPackage,reason});
        const catalog=ok(await request(`${ap}/experience/catalog`));
        for(const versionId of [upgrade.id,atelierVersion.id]){const entry=catalog.find(row=>row.id===versionId);assert.equal(entry.assignmentEligible,true);assert.equal(entry.presentationReadiness[0].acceptance.storeActivation,'NOT_ASSERTED');}
        const atelierOffer=await offerFor(atelierVersion.id),atelierPrepared=await result(`${ap}/offers/${atelierOffer.id}/prepare`,{expectedRevision:atelierOffer.revision,reason});
        assert.equal(atelierPrepared.assignment.commerce_mode,'SINGLE_STORE');assert.equal(atelierPrepared.deliveryVerified,false);
        const atelierAccepted=await result(`${sp}/assignments/${atelierPrepared.assignment.id}/accept`,{expectedRevision:atelierPrepared.assignment.revision,reason},a);
        const atelierContext=ok(await request(`${sp}/services/${serviceA.id}/editor-context`,{actor:a}));
        assert.deepEqual(atelierContext.channels.web.presentation,atelierPackage.renderer.presentation);
        assert.deepEqual(atelierContext.channels.web.document.studio.theme,atelierPackage.document.studio.theme);
        await result(`${ap}/assignments/${atelierAccepted.id}/withdraw`,{expectedRevision:atelierAccepted.revision,reason});
        const offer = await result(`${ap}/services/${serviceA.id}/offers`, { themeVersionId: upgrade.id, channel:'web', commerceMode:'SINGLE_STORE', profileCode:'PRO', overrides:{}, expectedRevision:Number((await serviceRead(serviceA.id)).policy_revision), reason });
        const preview = ok(await request(`${ap}/offers/${offer.id}/seller-preview`));
        assert.deepEqual(preview.channels.web.presentation, presentation); assert.deepEqual(preview.channels.web.commerce.presentation, presentation);
        const prepared=await result(`${ap}/offers/${offer.id}/prepare`,{expectedRevision:offer.revision,reason});
        assert.equal(prepared.assignment.commerce_mode,'SINGLE_STORE');assert.equal(prepared.deliveryVerified,false);
        await result(`${sp}/assignments/${prepared.assignment.id}/accept`, { expectedRevision:prepared.assignment.revision, reason }, a);
        const context = ok(await request(`${sp}/services/${serviceA.id}/editor-context`, {actor:a}));
        assert.deepEqual(context.channels.web.presentation, presentation); assert.equal(context.channels.web.document.studio.theme.accent, '#83b735');
        const historyCount = Number((await pool.query('SELECT COUNT(*) AS n FROM theme_draft_revisions WHERE draft_id=$1',[prepared.draft.id])).rows[0].n);
        for (const overrides of [{presentation:{...presentation,id:'unknown'}}, {studio:{presentation}}, {studio:{theme:{demoId:'15-nova-classic'}}}]) {
            ok(await write(`${sp}/drafts/${prepared.draft.id}`, { expectedRevision:1,policyRevision:context.policyRevision,overrides,reason }, a, 'PUT'), 400);
        }
        assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM theme_draft_revisions WHERE draft_id=$1',[prepared.draft.id])).rows[0].n),historyCount);
        assert.deepEqual(ok(await request(`${sp}/services/${serviceA.id}/editor-context`, {actor:a})).channels.web.presentation,presentation);
        // Disposable DB fixture only: the service's existing public Host resolver
        // still supplies authority; no DNS or live binding is created.
        await pool.query(`INSERT INTO theme_domain_bindings(id,hostname,service_id,organization_id,store_id,assignment_id,commerce_mode,status,verified_at,verification_reference)
            VALUES($1,'classic-presentation.test',$2,$3,$4,$5,'SINGLE_STORE','VERIFIED',clock_timestamp(),'owned-disposable-fixture')`,
        [crypto.randomUUID(),serviceA.id,serviceA.organization_id,serviceA.store_id,prepared.assignment.id]);
        const publicContext = await require('../services/themePlatformCommerceService').createThemePlatformCommerceService({database:pool}).context('classic-presentation.test');
        assert.deepEqual(publicContext.presentation,presentation); assert.equal(publicContext.live,false);
    });
    await gate('W47 Classic unsupported edits fail atomically while supported presentation copy saves', async () => {
        const context = ok(await request(`${ap}/services/${serviceA.id}/editor-context`));
        const entry = context.channels.web;
        const snapshot = async () => ({
            draft: (await pool.query('SELECT revision,overrides FROM theme_drafts WHERE id=$1', [entry.draftId])).rows[0],
            revisions: Number((await pool.query('SELECT COUNT(*) AS n FROM theme_draft_revisions WHERE draft_id=$1', [entry.draftId])).rows[0].n),
            audit: Number((await pool.query('SELECT COUNT(*) AS n FROM theme_audit_events WHERE service_id=$1', [serviceA.id])).rows[0].n),
            outbox: Number((await pool.query('SELECT COUNT(*) AS n FROM theme_outbox WHERE service_id=$1', [serviceA.id])).rows[0].n)
        });
        const before = await snapshot();
        const changes = [
            studio => studio.blocks.push({ ...structuredClone(studio.blocks[3]), id:'invisible-campaign' }),
            studio => studio.blocks.reverse(),
            studio => { studio.blocks[2].productSource = { mode:'selected',categoryId:'',productIds:['17'] }; },
            studio => { studio.menus[0].label = 'Görünmeyen menü'; },
            studio => { studio.blocks[0].target = 'cart'; },
            studio => { studio.chrome.footer.description = 'Desteklenmeyen alt bilgi'; }
        ];
        for (const change of changes) {
            const document = structuredClone(entry.document); change(document.studio);
            const response = ok(await write(`${ap}/drafts/${entry.draftId}`, {
                expectedRevision:entry.revision,policyRevision:context.policyRevision,overrides:{studio:document.studio},reason
            }, undefined, 'PUT'),400);
            assert.equal(response.code,'THEME_PRESENTATION_EDIT_UNSUPPORTED');
            assert.deepEqual(await snapshot(),before,'Rejected renderer edits cannot change history, audit or outbox');
        }
        await result(`${ap}/drafts/${entry.draftId}`, { expectedRevision:entry.revision,policyRevision:context.policyRevision,
            overrides:{studio:{blocks:entry.document.studio.blocks.map(block=>block.id==='classic-story'?{...block,title:'Kaydedilen gerçek hikâye'}:block)}},reason }, undefined, 'PUT');
        const updated = ok(await request(`${ap}/services/${serviceA.id}/editor-context`));
        assert.equal(updated.channels.web.document.studio.blocks.find(block=>block.id==='classic-story').title,'Kaydedilen gerçek hikâye');
        assert.equal(updated.channels.web.revision,entry.revision+1);
        assert.deepEqual(updated.channels.web.presentation,presentation);
    });
    await gate('W48 forged canonical visual content cannot change saved draft history or audit', async () => {
        const context = ok(await request(`${ap}/services/${serviceA.id}/editor-context`)), entry = context.channels.web;
        const snapshot = async () => ({
            draft:(await pool.query('SELECT revision,overrides FROM theme_drafts WHERE id=$1',[entry.draftId])).rows[0],
            revisions:Number((await pool.query('SELECT COUNT(*) AS n FROM theme_draft_revisions WHERE draft_id=$1',[entry.draftId])).rows[0].n),
            audit:Number((await pool.query('SELECT COUNT(*) AS n FROM theme_audit_events WHERE service_id=$1',[serviceA.id])).rows[0].n),
            outbox:Number((await pool.query('SELECT COUNT(*) AS n FROM theme_outbox WHERE service_id=$1',[serviceA.id])).rows[0].n)
        });
        const before=await snapshot(),asset=globalThis.NovaStoreVisualAssets.icon('heart');
        const forged = [
            {id:'item:v1-canonical-price:text',content:{text:'1 TL · Gerçek olmayan fiyat'}},
            {id:'category:17:text',content:{text:'Gerçek olmayan kategori'}},
            {id:'item:v1-canonical-photo:image',visual:{asset,size:24}}
        ];
        for (const element of forged) {
            const overrides={studio:{design:{elements:[{...element,desktop:{},tablet:{},mobile:{}}]}}};
            require('../services/themePlatformStudioDocument').validateOverrides(overrides,entry.base);
            const response=ok(await write(`${ap}/drafts/${entry.draftId}`,{expectedRevision:entry.revision,policyRevision:context.policyRevision,overrides,reason},undefined,'PUT'),400);
            assert.equal(response.code,'THEME_PRESENTATION_EDIT_UNSUPPORTED');
            assert.deepEqual(await snapshot(),before);
        }
    });
};
