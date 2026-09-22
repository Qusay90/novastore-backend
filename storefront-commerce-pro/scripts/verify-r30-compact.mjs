import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import puppeteer from "puppeteer-core";
import { startSelectorFixture } from "./r29-selector-server.mjs";
import { selectCanonicalVariant } from "./variant-selector-browser.mjs";
import { ownerVariants, threeDimensionVariants } from "./r29-variant-fixtures.mjs";
const ui=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const baseline=path.resolve(ui,"../../customer-web-r29-dependent-variant-selector");
const git=(args)=>{const r=spawnSync("git",args,{cwd:baseline,encoding:"utf8",windowsHide:true});assert.equal(r.status,0);return r.stdout.trim();};
const attest=()=>{assert.equal(git(["rev-parse","HEAD"]),"3684ddea79548af8176b4eada47b78e8ab9ab0ae");assert.equal(git(["rev-parse","HEAD^{tree}"]),"92cf0767686a710262578f2e1aed6d089e38f771");assert.equal(git(["status","--porcelain"]),"");};
attest();
const previous=await import(pathToFileURL(path.join(baseline,"storefront-commerce-pro/scripts/r29-selector-server.mjs")));
const servers=[await previous.startSelectorFixture(),await startSelectorFixture()];
const out=path.resolve(ui,"../artifacts/r30-verification");await fs.mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.NOVASTORE_TEST_CHROME||"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true,args:["--disable-background-networking"]});
const page=await browser.newPage(),measurements=[],contrast=[];
await page.setRequestInterception(true);page.on("request",r=>servers.some(s=>r.url().startsWith(s.base+"/"))||/^(data|blob):/.test(r.url())?r.continue():r.abort());
let failure;
try{
  for(const [width,height]of [[1440,1000],[1280,720],[1024,768],[768,1024],[390,844],[360,800]]){
    await page.setViewport({width,height});
    for(const [id,row]of [[42,ownerVariants[2]],[43,threeDimensionVariants[2]]]){
      const sizes=[];
      for(const [index,server]of servers.entries()){
        await page.goto(`${server.base}/#/urun/r29-${id}`,{waitUntil:"networkidle0"});await selectCanonicalVariant(page,row);
        await page.$eval(".runtime-variant-selection",el=>el.scrollIntoView({block:"center",behavior:"instant"}));
        sizes.push(await page.$eval(".runtime-variant-selection",el=>el.getBoundingClientRect().height));
        if(id===42)await page.screenshot({path:path.join(out,`compact-${index?"r30":"r29"}-${width}.png`)});
        if(index&&width===1440){
          contrast.push(...await page.$$eval(".runtime-variant-selection bdi,.runtime-variant-selection p,.runtime-variant-clear[aria-disabled=false]",els=>els.map(el=>{
            let node=el,bg;while(node){const c=getComputedStyle(node).backgroundColor;if(c!=="rgba(0, 0, 0, 0)"&&c!=="transparent"){bg=c;break;}node=node.parentElement;}
            return{text:el.textContent,color:getComputedStyle(el).color,background:bg||"rgb(255, 255, 255)"};
          })));
        }
      }
      assert(sizes[1]<sizes[0],`compact ${width} ${id}: ${sizes}`);measurements.push({width,height,id,r29Height:sizes[0],r30Height:sizes[1],savedPx:sizes[0]-sizes[1],savedPercent:100*(sizes[0]-sizes[1])/sizes[0]});
    }
  }
  const luminance=rgb=>rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  for(const row of contrast){const a=luminance(row.color),b=luminance(row.background);row.ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert(row.ratio>=4.5,JSON.stringify(row));}
  attest();console.log(JSON.stringify({result:"PASS",measurements,minimumContrast:Math.min(...contrast.map(r=>r.ratio))}));
}catch(error){failure=error;console.error(error);}
finally{await fs.writeFile(path.join(out,"compact-result.json"),JSON.stringify({result:failure?"FAIL":"PASS",error:failure?.message,measurements,contrast},null,2));await browser.close();for(const server of servers)await server.close();}
if(failure)process.exitCode=1;
