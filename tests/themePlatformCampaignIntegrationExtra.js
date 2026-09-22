'use strict';
// Invoked only by the owned disposable Experience HTTP/PostgreSQL harness.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
module.exports=async function campaignIntegration({pool,gate,fixture,serviceA,serviceB,draftA,request,write,result,ok,configure,ap,sp,reason}){
  assert(/^novastore_theme_wave1_[a-f0-9]{16}_test$/.test((await pool.query('SELECT current_database() AS name')).rows[0].name));
  const {admin,a,storeA,storeB}=fixture;
  require('../studio-core/src/sandbox/visual/visualAssets.js');
  const {CAMPAIGN_PACKS,createCampaignBlocks}=require('../studio-core/src/sandbox/campaignLibrary.js');
  const {defaultCampaign}=require('../studio-core/src/sandbox/campaignModel.js');
  const {prepareCampaignSection}=require('../studio-core/src/studio-integration/campaign-import.js');
  const provenance=JSON.parse(await fs.readFile(path.join(__dirname,'../studio-core/bundled-assets-provenance.json'),'utf8'));
  const manifest=new Map(provenance.files.map(file=>[file.sourcePath.replace(/^public/,''),file]));
  let ownProduct,foreignProduct,section;
  const context=()=>request(`${ap}/services/${serviceA.id}/editor-context`).then(ok);
  const draft=()=>request(`${sp}/drafts/${draftA.id}`,{actor:a}).then(ok);
  const body=async blocks=>{const current=await draft(),ctx=await context();return {expectedRevision:Number(current.revision),policyRevision:ctx.policyRevision,overrides:{...current.overrides,studio:{...current.overrides.studio,blocks}},reason};};
  await gate('W42 original campaign assets save in reviewed slots; unsupported section insertion is atomic denied',async()=>{
    await configure(serviceA.id,'PRO');
    for(const store of [storeA,storeB]){
      const row=(await pool.query("INSERT INTO products(name,price,stock,store_id,publication_status,is_customer_visible) VALUES($1,125.50,9,$2,'active',TRUE) RETURNING id",['Owned campaign verification '+store.id,store.legacyId])).rows[0];
      if(store===storeA)ownProduct=Number(row.id);else foreignProduct=Number(row.id);
    }
    const ctx=await context(),catalog=ctx.channels.web.catalog;
    assert(catalog.products.some(product=>Number(product.id)===ownProduct));
    assert(!catalog.products.some(product=>Number(product.id)===foreignProduct));
    const pack=CAMPAIGN_PACKS.find(item=>item.id==='ramadan');
    const authored={id:crypto.randomUUID(),name:pack.name,blocks:createCampaignBlocks(pack.id,'web',{catalog}),campaign:defaultCampaign(pack,'web')};
    authored.blocks.find(block=>block.type==='products').productSource={mode:'selected',categoryId:'',productIds:[String(ownProduct)]};
    const uploaded=[];
    section=await prepareCampaignSection(authored,{channel:'web',catalog,targets:['home','categories','search','cart','account','support','favorites'],resolveBundled:ref=>manifest.has(ref)?ref:'',readBytes:async ref=>{
      const entry=manifest.get(ref),bytes=await fs.readFile(path.join(__dirname,'../studio-core',entry.targetPath));
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),entry.sha256);return bytes.toString('base64');
    },uploadAsset:async bytesBase64=>{
      const asset=await result(`${ap}/services/${serviceA.id}/stored-assets`,{bytesBase64,reason});
      assert.equal(asset.status,'READY');uploaded.push(asset);
      const stored=ok(await request(`${sp}/assets/${asset.id}/content`,{actor:a}));
      assert(Buffer.isBuffer(stored));assert.equal(crypto.createHash('sha256').update(stored).digest('hex'),asset.digest);
      return `asset:${asset.id}`;
    }});
    assert(uploaded.length>=2);assert(!JSON.stringify(section).includes('/media/'));
    const before=await draft(),baseBlocks=(await context()).channels.web.document.studio.blocks;
    assert.equal(ctx.capabilities['theme.campaign_canvas'].state,'HIDDEN');
    const denied=ok(await write(`${ap}/drafts/${draftA.id}`,await body([...baseBlocks,...section.blocks]),admin,'PUT'),403);
    assert.equal(denied.code,'THEME_CAPABILITY_DENIED');assert.deepEqual(await draft(),before);
    const blocks=baseBlocks.map(block=>block.id==='classic-hero'?{...block,image:`asset:${uploaded[0].id}`,title:pack.name,target:`product:${ownProduct}`,buttonText:'Ürünü keşfet'}:block.id==='classic-story'?{...block,image:`asset:${uploaded[1].id}`}:block);
    const saved=ok(await write(`${ap}/drafts/${draftA.id}`,await body(blocks),admin,'PUT')).result;
    assert.equal(Number(saved.revision),Number(before.revision)+1);
    const reloaded=await context();
    assert.deepEqual(reloaded.channels.web.document.studio.blocks,blocks);
    assert.equal(reloaded.channels.web.catalog.products.find(product=>Number(product.id)===ownProduct).price,125.5);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM theme_draft_revisions WHERE draft_id=$1 AND revision=$2',[draftA.id,saved.revision])).rows[0].n,1);
  });
  await gate('W43 campaign save rejects foreign store asset and product without draft or history mutation',async()=>{
    await configure(serviceB.id,'PRO');
    const entry=manifest.values().next().value,bytes=await fs.readFile(path.join(__dirname,'../studio-core',entry.targetPath));
    const foreignAsset=await result(`${ap}/services/${serviceB.id}/stored-assets`,{bytesBase64:bytes.toString('base64'),reason});
    ok(await request(`${sp}/assets/${foreignAsset.id}/content`,{actor:a}),404);
    const before=await draft(),ctx=await context(),rows=Number((await pool.query('SELECT COUNT(*) AS n FROM theme_draft_revisions WHERE draft_id=$1',[draftA.id])).rows[0].n);
    const foreignImage=structuredClone(ctx.channels.web.document.studio.blocks);foreignImage.find(block=>block.id==='classic-story').image=`asset:${foreignAsset.id}`;
    ok(await write(`${ap}/drafts/${draftA.id}`,await body(foreignImage),admin,'PUT'),404);
    const foreignSelection=structuredClone(ctx.channels.web.document.studio.blocks);foreignSelection.find(block=>block.id==='classic-hero').target=`product:${foreignProduct}`;
    ok(await write(`${ap}/drafts/${draftA.id}`,await body(foreignSelection),admin,'PUT'),404);
    const after=await draft();assert.equal(after.revision,before.revision);assert.deepEqual(after.overrides,before.overrides);
    assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM theme_draft_revisions WHERE draft_id=$1',[draftA.id])).rows[0].n),rows);
  });
};
