import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import puppeteer from "puppeteer-core";
import { startMediaFixture, ui, expectedBackend, attestBackend } from "./r30-real-media-server.mjs";
import { clickOption, clearOptions, selectCanonicalVariant, clickCentered, optionButton } from "./variant-selector-browser.mjs";
const out=path.resolve(ui,"../artifacts/r30-verification");await fs.mkdir(out,{recursive:true});
const fixture=await startMediaFixture();
const scenario=async mode=>{const r=await fetch(fixture.ready.origin+"/__r30/scenario",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode})});assert(r.ok);};
const browser=await puppeteer.launch({executablePath:process.env.NOVASTORE_TEST_CHROME||"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true,args:["--disable-background-networking","--no-first-run"]});
const page=await browser.newPage();
const checks=[],geometry=[],screenshots=[],errors=[],external=[],responses=[],transition=[];
let held=false;const releases=[];
page.on("pageerror",error=>errors.push(error.message));
await page.setRequestInterception(true);
page.on("request",request=>{
  if(/^(data|blob):/.test(request.url()))return request.continue();
  if(!request.url().startsWith(fixture.base+"/")){external.push(request.url());return request.abort();}
  if(held&&/\/r30-blue(?:-side)?\.svg$/.test(request.url())){releases.push(()=>request.continue().catch(()=>{}));return;}
  return request.continue();
});
page.on("response",response=>{if(response.status()>=400)responses.push({url:new URL(response.url()).pathname,status:response.status()});});
const check=(name,value=true)=>{assert(value,name);checks.push(name);console.log("PASS "+name);};
const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const stage=".runtime-product-media-stage";
const image="[data-gallery-current]";
const selected=()=>page.$eval(".runtime-variant-selection",el=>el.dataset.resolvedVariantId||null);
const gated=()=>page.$$eval(".purchase-row .primary-button,.buy-now-button,.mobile-purchase-bar button",els=>els.length>=2&&els.every(el=>el.disabled));
const src=()=>page.$eval(image,el=>new URL(el.src).pathname);
const source=()=>page.$eval(stage,el=>el.dataset.gallerySource);
const waitImage=async name=>{
  await page.waitForFunction((name)=>{const s=document.querySelector(".runtime-product-media-stage"),i=s?.querySelector("[data-gallery-current]");return s?.getAttribute("aria-busy")==="false"&&i?.src.endsWith(`/r30-${name}.svg`)&&i.complete&&i.naturalWidth>0;},{timeout:10000},name);
  await settle();
};
let navigation=0;
const goto=async name=>{
  await page.goto(`${fixture.base}/?r30-test=${++navigation}#/urun/${fixture.ready.products[name].id}`,{waitUntil:held?"domcontentloaded":"networkidle0"});
  await page.waitForSelector(".purchase-row");if(name!=="simple")await page.waitForSelector(".runtime-variant-options");
  await waitImage("default");
};
const capture=async(name,target=stage)=>{
  await page.$eval(target,el=>el.scrollIntoView({block:"center",behavior:"instant"}));await settle();
  const file=name+".png";await page.screenshot({path:path.join(out,file)});screenshots.push(file);
};
const bounds=()=>page.$eval(".runtime-product-gallery",el=>{const r=el.getBoundingClientRect(),s=el.querySelector(".runtime-product-media-stage").getBoundingClientRect();return{width:r.width,height:r.height,stageWidth:s.width,stageHeight:s.height,top:r.top+scrollY};});
const clearGroup=async label=>clickCentered(page,`.runtime-variant-clear[aria-label="${label} seçimini temizle"]`);
async function measure(name,viewport){
  await settle();const controls=[];
  for(const button of await page.$$(".runtime-variant-selection button")){
    if(!(await button.evaluate(el=>getComputedStyle(el).visibility==="visible"))){await button.dispose();continue;}
    await button.evaluate(el=>el.scrollIntoView({block:"center",behavior:"instant"}));await settle();
    const m=await button.evaluate(el=>{const r=el.getBoundingClientRect();return{label:el.getAttribute("aria-label"),width:r.width,height:r.height,clipped:r.left<0||r.right>innerWidth||el.scrollWidth>el.clientWidth+1,reachable:[[.5,.5],[.1,.1],[.9,.9]].every(([x,y])=>el.contains(document.elementFromPoint(r.left+r.width*x,r.top+r.height*y)))}});
    assert(m.width>=43.99&&m.height>=43.99&&!m.clipped&&m.reachable,JSON.stringify(m));controls.push(m);await button.dispose();
  }
  await page.$eval(stage,el=>el.scrollIntoView({block:"center",behavior:"instant"}));await settle();
  const g=await bounds(),overflow=await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth));
  assert.equal(overflow,0);assert(g.width>0&&g.width<=viewport.width);
  const galleryUnclipped=await page.$eval(stage,el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;});assert(galleryUnclipped);
  geometry.push({name,...viewport,controls,overflow,gallery:g,galleryUnclipped});check(`${name} ${viewport.width}: zero overflow/clipping, all controls reachable and >=44px`);
}
let failure;
try{
  await scenario("normal");await page.setViewport({width:1440,height:1000});await goto("owner");
  check("exact sealed PC1 public DTO supplies version 1 and explicit canonical driver",fixture.state.dtos["/api/products/2"]?.variant_media?.media_driver_option_group==="Color");
  check("no driver selected uses default gallery with all purchase actions gated",await source()==="product_default"&&await selected()===null&&await gated());
  await capture("desktop-default");const before=await bounds();
  await clickOption(page,"Color","Blue");await waitImage("blue");
  check("partial Blue switches real driver gallery without resolving purchase",await source()==="driver_option_value"&&await selected()===null&&await gated());
  await capture("desktop-blue");
  await clickCentered(page,'.runtime-product-thumbnails button[aria-label="2. medyayı göster"]');await waitImage("blue-side");
  await clickOption(page,"Size","M");
  check("complete Blue keeps chosen gallery position and exact server ID",await src()==="/uploads/local-products/r30-blue-side.svg"&&await selected()===String(fixture.ready.products.owner.variants[2].id));
  const disabled=await optionButton(page,"Size","L");
  check("disabled explanation stays available in accessible name and title",await disabled.evaluate(el=>el.getAttribute("aria-disabled")==="true"&&el.title.includes("sunulmuyor")&&el.getAttribute("aria-label").includes("sunulmuyor")&&!el.querySelector("small")));
  await capture("desktop-compact-disabled",".runtime-variant-selection");
  await clearOptions(page);await clickOption(page,"Color","Orange");await waitImage("orange");await capture("desktop-orange");
  await clickOption(page,"Size","L");await waitImage("exact");
  check("exact canonical variant overrides driver gallery",await source()==="exact_variant"&&await selected()===String(fixture.ready.products.owner.variants[1].id));
  await capture("desktop-exact");const after=await bounds();
  for(const key of Object.keys(before))assert(Math.abs(before[key]-after[key])<1,`gallery layout shift ${key}: ${before[key]} vs ${after[key]}`);
  check("different gallery resets to its first image with stable gallery geometry");
  await clickCentered(page,stage);await page.waitForSelector(".runtime-media-lightbox");await page.keyboard.press("Escape");
  check("lightbox opens selected gallery, Escape closes and returns focus",await page.evaluate(()=>!document.querySelector(".runtime-media-lightbox")&&document.activeElement.classList.contains("runtime-product-media-stage")));
  await scenario("no-exact");await goto("owner");await selectCanonicalVariant(page,fixture.ready.products.owner.variants[1]);await waitImage("orange");
  check("fresh canonical removal falls back from exact to driver",await source()==="driver_option_value");
  await scenario("no-blue");await goto("owner");await clickOption(page,"Color","Blue");await waitImage("default");check("missing driver binding uses product default");
  for(const [mode,expected]of [["broken-one","blue"],["broken-all","default"]]){
    await scenario(mode);await goto("owner");await selectCanonicalVariant(page,fixture.ready.products.owner.variants[2]);await waitImage(expected);
    check(`${mode}: valid gallery/default fallback preserves exact canonical purchase ID`,await selected()===String(fixture.ready.products.owner.variants[2].id));await capture(mode);
  }
  await scenario("normal");await goto("three");await clickOption(page,"Color","Blue");await waitImage("blue");
  await clickCentered(page,'.runtime-product-thumbnails button[aria-label="2. medyayı göster"]');await waitImage("blue-side");
  await clickOption(page,"Size","M");await clickOption(page,"Capacity","128 GB");await clearGroup("Beden");await clickOption(page,"Size","L");
  check("three dimensions: non-driver size change preserves Blue gallery and position",await src()==="/uploads/local-products/r30-blue-side.svg"&&await selected()===String(fixture.ready.products.three.variants[1].id));
  await goto("finish");await clickOption(page,"Finish","Matte");await waitImage("matte");check("non-color Finish drives partial gallery with purchase gated",await selected()===null&&await gated());
  await clickOption(page,"Length","Long");await waitImage("matte");check("Finish+Length resolves a canonical purchase without color authority");await capture("finish-generic",".runtime-variant-selection");
  await goto("computer");
  assert.deepEqual((await page.$$eval("[data-variant-group]",els=>els.map(el=>el.dataset.variantGroup))).sort(),["GPU","RAM","Storage"]);
  check("computer descriptions never become purchase controls",await page.$eval(".product-page",el=>["IPS panel","2.1 kg","144 Hz"].every(text=>el.textContent.includes(text))));
  await clickOption(page,"GPU","RTX-A");await waitImage("matte");await clickOption(page,"Storage","512 GB");await clickOption(page,"RAM","16 GB");
  check("GPU driver and RAM/Storage dependent filtering use canonical combinations",await selected()===String(fixture.ready.products.computer.variants[0].id));await capture("computer-desktop",".runtime-variant-selection");
  await goto("simple");check("simple product retains default gallery and no variant selector",!await page.$(".runtime-variant-selection"));
  // Hold actual image responses before preload; option state must still respond.
  await page.setCacheEnabled(false);held=true;await goto("owner");await clickOption(page,"Color","Blue");
  check("slow preload never delays option intent or enables partial purchase",await selected()===null&&await gated()&&await page.$eval('[data-variant-option="Blue"]',el=>el.getAttribute("aria-pressed")==="true"));
  check("loading indicator retains valid previous gallery while preparing next",await page.$eval(stage,el=>el.getAttribute("aria-busy")==="true")&&await src()==="/uploads/local-products/r30-default.svg");
  await clickOption(page,"Color","Orange");await waitImage("orange");held=false;for(const release of releases.splice(0))await release();await settle();
  check("late Blue decode cannot overwrite newer Orange selection",await src()==="/uploads/local-products/r30-orange.svg");
  // Record animation frames from the rendered DOM; test-only observation.
  await page.evaluate(()=>{window.__r30Frames=[];let n=0;function tick(){const el=document.querySelector("[data-gallery-current]"),s=document.querySelector(".runtime-product-media-stage");window.__r30Frames.push({time:performance.now(),src:el?.getAttribute("src"),opacity:el?Number(getComputedStyle(el).opacity):null,width:s?.getBoundingClientRect().width,height:s?.getBoundingClientRect().height});if(n++<60)requestAnimationFrame(tick);}requestAnimationFrame(tick);});
  await clickOption(page,"Color","Blue");await waitImage("blue");await capture("transition-blue-entering");
  await page.waitForFunction(()=>window.__r30Frames?.length>=60);transition.push(...await page.evaluate(()=>window.__r30Frames));
  check("200ms crossfade has observed intermediate opacity with no stage resize",transition.some(f=>f.src?.endsWith("r30-blue.svg")&&f.opacity>0&&f.opacity<1)&&new Set(transition.map(f=>[f.width,f.height].join())).size===1);
  await capture("transition-blue-complete");
  await page.emulateMediaFeatures([{name:"prefers-reduced-motion",value:"reduce"}]);await clickOption(page,"Color","Orange");await waitImage("orange");
  check("reduced motion switches correctly without animated opacity",await page.$eval(image,el=>getComputedStyle(el).transitionProperty==="none"&&getComputedStyle(el).opacity==="1"));await page.emulateMediaFeatures([]);
  for(const viewport of [{width:1440,height:1000},{width:1280,height:720},{width:1024,height:768},{width:768,height:1024},{width:390,height:844},{width:360,height:800}]){
    await page.setViewport({...viewport,isMobile:viewport.width<=390,hasTouch:viewport.width<=768});await goto("owner");await capture(`default-${viewport.width}`);
    const initial=await bounds();await clickOption(page,"Color","Blue");await waitImage("blue");await clickOption(page,"Size","M");
    const current=await bounds();for(const key of Object.keys(initial))assert(Math.abs(initial[key]-current[key])<1,`${viewport.width} geometry ${key}`);
    await measure("owner",viewport);await capture(`blue-${viewport.width}`);await capture(`compact-${viewport.width}`,".runtime-variant-selection");
    if(viewport.width<=390){
      await page.$eval(stage,el=>el.scrollIntoView({block:"center",behavior:"instant"}));await settle();const box=await page.$eval(stage,el=>el.getBoundingClientRect().toJSON());
      const cdp=await page.createCDPSession();await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:box.x+box.width*.8,y:box.y+box.height*.5}]});
      await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:box.x+box.width*.25,y:box.y+box.height*.5}]});await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await cdp.detach();
      await waitImage("blue-side");check(`mobile ${viewport.width} native swipe preserves variant ID`,await selected()===String(fixture.ready.products.owner.variants[2].id));
      await clickCentered(page,".mobile-purchase-bar button");await page.waitForFunction(id=>JSON.parse(localStorage.getItem("novastore_variant_cart_guest")||"[]").some(row=>row.variantId===id),{},fixture.ready.products.owner.variants[2].id);check(`mobile ${viewport.width} cart persists exact identity`);
    }
    await goto("computer");await selectCanonicalVariant(page,fixture.ready.products.computer.variants[2]);await waitImage("gloss");await measure("computer",viewport);await capture(`computer-${viewport.width}`,".runtime-variant-selection");
    await goto("three");await selectCanonicalVariant(page,fixture.ready.products.three.variants[1]);await waitImage("blue");await measure("three",viewport);
  }
  await page.setViewport({width:1440,height:1000});await goto("owner");await selectCanonicalVariant(page,fixture.ready.products.owner.variants[1]);
  const clear=await page.$('.runtime-variant-clear[aria-label="Beden seçimini temizle"]');await clear.focus();await page.keyboard.press("Enter");check("keyboard clear retains driver and removes exact purchase ID",await selected()===null&&await gated());
  check("public media never exposes owner credentials or private upload metadata",Object.values(fixture.state.dtos).every(dto=>!/(upload_credentials|organization_id|moderation_notes|storage_path)/.test(JSON.stringify(dto.variant_media))));
  check("zero browser exceptions, external requests and unknown routes",errors.length===0&&external.length===0&&fixture.state.unknown.length===0);
  check("only intentionally broken image requests fail",responses.every(r=>r.url==="/uploads/local-products/r30-broken.svg"&&r.status===404));
}catch(error){failure=error;console.error(error);await page.screenshot({path:path.join(out,"failure.png"),fullPage:true}).catch(()=>{});}
finally{
  held=false;for(const release of releases)await release();await scenario("normal");attestBackend();
  await fs.writeFile(path.join(out,"media-result.json"),JSON.stringify({result:failure?"FAIL":"PASS",error:failure?.message,checks,geometry,screenshots,transition,errors,external,responses,unknown:fixture.state.unknown,backend:expectedBackend,publicDtos:fixture.state.dtos,bundleSha256:createHash("sha256").update(fixture.html).digest("hex"),productionWrites:0,providerCalls:0},null,2));
  await browser.close();await fixture.close();
}
if(failure)process.exitCode=1;
