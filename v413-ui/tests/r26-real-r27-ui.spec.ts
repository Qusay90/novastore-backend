import { expect, test, type Page } from "@playwright/test";
const cards=(page:Page)=>page.locator("[data-testid=marketplace-discovery] .product-card");
const fixture=async(page:Page)=>(await page.request.get("/__r26/fixture")).json();
const navigate=async(page:Page,query="")=>{await page.goto("/"+query);};
test.beforeEach(async({page})=>{
  await page.route("**/*",route=>new URL(route.request().url()).origin==="http://127.0.0.1:4177"?route.continue():route.abort("blockedbyclient"));
});
test("real two-store discovery reaches positions 21 and 101, refresh starts a fresh traversal",async({page})=>{
 await navigate(page);await expect(cards(page)).toHaveCount(20);
 await page.getByRole("button",{name:"Daha fazla göster",exact:true}).click();await expect(cards(page)).toHaveCount(40);
 expect(await cards(page).nth(20).getAttribute("data-product-id")).toBeTruthy();
 for(const size of [60,80,100,108]){await page.getByRole("button",{name:"Daha fazla göster",exact:true}).click();await expect(cards(page)).toHaveCount(size);}
 const ids=await cards(page).evaluateAll(nodes=>nodes.map(n=>n.getAttribute("data-product-id")));
 expect(new Set(ids).size).toBe(108);expect(ids[100]).toBeTruthy();
 await expect(page.getByRole("button",{name:"Daha fazla göster",exact:true})).toHaveCount(0);
 await page.getByLabel("Ürünleri yenile",{exact:true}).click();await expect(cards(page)).toHaveCount(20);
 await page.screenshot({path:"artifacts/r26-verification/browser-home.png"});
 for(const name of ["R26 Ortak Ürün 104","R26 Ortak Ürün 105"]){
   await page.getByRole("button",{name,exact:true}).click();
   await expect(page.getByTestId("product-detail-screen")).toBeVisible();
   await page.getByRole("button",{name:"Mağazaya Git",exact:true}).click();
   await expect(page.locator("#store-name")).toContainText(name.endsWith("104")?"R25 Canonical Store":"R25 Foreign Store");
   await page.getByRole("button",{name:"Ana Sayfa",exact:true}).click();await expect(cards(page)).toHaveCount(20);
 }
});
test("real server search continues all 105 rows; delayed previous query cannot replace current results",async({page})=>{
 await navigate(page);await page.getByRole("button",{name:"Ara",exact:true}).click();
 const input=page.getByRole("textbox",{name:"Ürün ara",exact:true});await input.fill("R26 Ortak");await input.press("Enter");
 await expect(cards(page)).toHaveCount(20);
 for(const size of [40,60,80,100,105]){await page.getByRole("button",{name:"Daha fazla göster",exact:true}).click();await expect(cards(page)).toHaveCount(size);}
 let release!:()=>void;const held=new Promise<void>(r=>release=r);let intercepted=false;
 await page.route("**/api/products?**",async route=>{const url=new URL(route.request().url());if(url.searchParams.get("q")==="R26 Ortak Ürün 10"){const response=await route.fetch();intercepted=true;await held;await route.fulfill({response});}else await route.continue();});
 await input.fill("R26 Ortak Ürün 10");await expect.poll(()=>intercepted).toBe(true);
 await input.fill("R26 Ortak Ürün 001");await input.press("Enter");await expect(cards(page)).toHaveCount(1);
 release();await expect(cards(page).first()).toContainText("R26 Ortak Ürün 001");
 await expect.poll(async()=>page.locator("[data-testid=marketplace-discovery] h1").evaluate(n=>n.getBoundingClientRect().top-document.querySelector(".search-field")!.getBoundingClientRect().bottom)).toBeGreaterThan(8);
 await page.screenshot({path:"artifacts/r26-verification/browser-search.png"});
});
test("canonical nested categories use server descendants and runtime refresh",async({page})=>{
 const data=await fixture(page);await navigate(page);await page.getByRole("button",{name:"Kategoriler",exact:true}).click();
 const tree=page.getByTestId("public-category-tree");await tree.getByRole("tab",{name:"R26 Teknoloji",exact:true}).click();
 await expect(tree.locator("[data-category-id='"+data.nestedCategory+"']")).toBeVisible();
 await tree.locator("[data-category-id='"+data.childCategory+"']").click();await expect(cards(page)).toHaveCount(20);
 const response=await page.request.get("/api/products?pagination=cursor&limit=20&categoryId="+data.childCategory+"&includeDescendants=true");
 const allowed=(await response.json()).items.map((r:any)=>String(r.id));
 expect(await cards(page).evaluateAll(nodes=>nodes.map(n=>n.getAttribute("data-product-id")))).toEqual(allowed);
 await page.getByRole("button",{name:"Daha fazla göster",exact:true}).click();await expect(cards(page)).toHaveCount(40);
 await page.getByRole("button",{name:"Kategoriler",exact:true}).click();await tree.getByRole("tab",{name:"R26 Teknoloji",exact:true}).click();
 await page.request.post("/__r26/rename-category");await tree.getByLabel("Kategorileri yenile").click();
 await expect(tree.locator("[data-category-id='"+data.childCategory+"']")).toHaveText("R26 Alt Güncellendi");
 await page.screenshot({path:"artifacts/r26-verification/browser-categories.png"});
});
test("store products continue without losing server total or crossing store identity",async({page})=>{
 const data=await fixture(page);await navigate(page,"?cal=CAL-04&tab=home&view=store&storeSlug="+data.storeB);
 const rows=page.locator(".store-products-grid .product-card");await expect(rows).toHaveCount(20);
 await expect(page.locator(".store-stats")).toContainText("54");
 await page.getByRole("button",{name:"Daha fazla mağaza ürünü göster"}).click();await expect(rows).toHaveCount(40);
 await page.getByRole("button",{name:"Daha fazla mağaza ürünü göster"}).click();await expect(rows).toHaveCount(54);
 for(const row of await rows.all())await expect(row).toContainText("R25 Foreign Store");
 await page.screenshot({path:"artifacts/r26-verification/browser-store.png"});
});
test("public Q&A and published reviews reach page two; plain text and global summaries stay authoritative",async({page})=>{
 const data=await fixture(page);await navigate(page,"?cal=CAL-06&tab=home&productId="+data.reputationProductId);
 const qa=page.getByTestId("public-questions"),reviews=page.getByTestId("public-reviews");
 await expect(qa.locator(".question-thread")).toHaveCount(20);await expect(reviews.locator(".review-preview")).toHaveCount(20);
 await expect(reviews.locator("time")).toHaveCount(20);
 await expect(reviews.getByAltText("Değerlendirme görseli")).toHaveCount(1);
 await reviews.getByAltText("Değerlendirme görseli").scrollIntoViewIfNeeded();
 await expect.poll(()=>reviews.getByAltText("Değerlendirme görseli").evaluate((n: HTMLImageElement)=>n.complete&&n.naturalWidth>0)).toBe(true);
 const summary=await page.getByTestId("public-review-summary").innerText();expect(summary).toContain("27 değerlendirme");
 await qa.getByRole("button",{name:"Daha fazla soru göster"}).click();await expect(qa.locator(".question-thread")).toHaveCount(27);
 await reviews.getByRole("button",{name:"Daha fazla değerlendirme göster"}).click();await expect(reviews.locator(".review-preview")).toHaveCount(27);
 await expect(page.getByTestId("public-review-summary")).toHaveText(summary);
 await expect(qa).toContainText("<img src=x onerror=globalThis.__r26Injected=true>");
 await expect(qa.locator("script,img")).toHaveCount(0);await expect(reviews.locator("script")).toHaveCount(0);
 const text=(await qa.innerText())+(await reviews.innerText());
 for(const privateField of ["PRIVATE","example.test","05555555555","Özel Müşteri","user_id","answered_by","organization_id"])expect(text).not.toContain(privateField);
 expect(await page.evaluate(()=>(window as any).__r26Injected)).toBeUndefined();
 await qa.scrollIntoViewIfNeeded();await page.screenshot({path:"artifacts/r26-verification/browser-questions.png"});
 await reviews.scrollIntoViewIfNeeded();await page.screenshot({path:"artifacts/r26-verification/browser-reviews.png"});
});
test("append failure retains content and retry; offline initial/empty/refresh finish truthfully",async({page,context})=>{
 let fail=true;await page.route("**/api/products?**",async route=>{if(new URL(route.request().url()).searchParams.has("cursor")&&fail)await route.fulfill({status:503,json:{code:"UNAVAILABLE"}});else await route.continue();});
 await navigate(page);await expect(cards(page)).toHaveCount(20);await page.getByRole("button",{name:"Daha fazla göster",exact:true}).click();
 await expect(page.getByRole("alert")).toContainText("kullanılamıyor");await expect(cards(page)).toHaveCount(20);
 fail=false;await page.getByRole("button",{name:"Yeniden Dene",exact:true}).click();await expect(cards(page)).toHaveCount(40);
 await context.setOffline(true);await page.getByLabel("Ürünleri yenile",{exact:true}).click();await expect(page.getByRole("alert")).toContainText("İnternet bağlantısı yok");
 await context.setOffline(false);await page.getByRole("button",{name:"Yeniden Dene",exact:true}).click();await expect(cards(page)).toHaveCount(20);
 await page.getByRole("button",{name:"Ara",exact:true}).click();await page.getByLabel("Ürün ara",{exact:true}).fill("R26 no matching result");await page.getByLabel("Ürün ara",{exact:true}).press("Enter");
 await expect(cards(page)).toHaveCount(0);await expect(page.getByText("Henüz gösterilecek içerik yok.",{exact:true})).toBeVisible();
});
test("closed store is excluded by real R27 on refresh and every continuation page",async({page})=>{
 const data=await fixture(page);await navigate(page);await expect(cards(page)).toHaveCount(20);
 expect((await page.request.post("/__r26/store-b-operational",{data:{open:false}})).ok()).toBe(true);
 try {
  await page.getByLabel("Ürünleri yenile",{exact:true}).click();
  await expect(cards(page).filter({hasText:"R25 Foreign Store"})).toHaveCount(0);
  await expect(cards(page)).toHaveCount(20);
  for(const size of [40,54]){await page.getByRole("button",{name:"Daha fazla göster",exact:true}).click();await expect(cards(page)).toHaveCount(size);}
  expect((await cards(page).allTextContents()).every(text=>text.includes("R25 Canonical Store"))).toBe(true);
  for(const path of ["/api/public/stores/"+data.storeB,"/api/questions/product/"+data.reputationProductId+"?pagination=cursor","/api/reviews/product/"+data.reputationProductId+"?pagination=cursor"]){expect((await page.request.get(path)).status()).toBe(404);}
 } finally {expect((await page.request.post("/__r26/store-b-operational",{data:{open:true}})).ok()).toBe(true);}
});
test("real login restores remote favorite and discovers canonical variant through marketplace, cart and real checkout preview",async({page})=>{
 const data=await fixture(page);await navigate(page,"?cal=CAL-01&tab=account&view=login");
 await page.getByRole("textbox",{name:"E-posta",exact:true}).fill("r25-real@example.test");await page.getByPlaceholder("Şifreni gir").fill("R26LocalOnly!2026");
 await page.getByRole("button",{name:"Giriş Yap",exact:true}).click();await expect(page.locator(".login-layout")).toHaveCount(0);
 const target=data.marketplaceIds[0];
 const favoritesLoaded=page.waitForResponse(response=>new URL(response.url()).pathname==="/api/favorites" && response.status()===200);
 await navigate(page,"?cal=CAL-06&tab=home&productId="+target);
 const alreadyFavorite=(await (await favoritesLoaded).json()).productIds.map(String).includes(String(target));
 await expect(page.getByTestId("product-detail-screen")).toHaveAttribute("data-product-id",String(target));
 if(!alreadyFavorite)await page.getByRole("button",{name:"Favoriye ekle",exact:true}).first().click();
 await expect(page.getByRole("button",{name:"Favoriden çıkar",exact:true}).first()).toBeVisible();
 await navigate(page,"?cal=CAL-04&tab=favorites");
 await expect(page.locator("[data-testid=public-favorites] [data-product-id='"+target+"']")).toBeVisible();
 await page.reload();await expect(page.locator("[data-testid=public-favorites] [data-product-id='"+target+"']")).toBeVisible();
 await navigate(page,"?cal=CAL-06&tab=home&productId="+target);await expect(page.locator(".pdp-seller-identity")).toContainText("R25 Foreign Store");
 await navigate(page);await expect(cards(page)).toHaveCount(20);
 await page.locator(`[data-testid=marketplace-discovery] [data-product-id="${data.variantProductId}"]`).getByRole("button",{name:"R25 Kanonik Varyantlı Ürün",exact:true}).click();
 await expect(page.getByTestId("canonical-variant-selector")).toBeVisible();await expect(page.locator(".pdp-add-to-cart")).toBeDisabled();
 await page.getByTestId("canonical-variant-"+data.variantM).click();await expect(page.locator(".pdp-add-to-cart")).toBeEnabled();
 await expect(page.locator(".pdp-info .price.large strong")).toContainText("100");
 await page.screenshot({path:"artifacts/r26-verification/browser-variant.png"});
 await page.locator(".pdp-add-to-cart").click();
 await expect(page.locator(".pdp-add-to-cart")).toHaveAttribute("aria-pressed","true");
 await navigate(page,"?cal=CAL-07&tab=cart");
 await expect(page.locator(`.cart-item[data-product-id="${data.variantProductId}"]`)).toHaveAttribute("data-variant-id",String(data.variantM));
 const previewResponse=page.waitForResponse(response=>new URL(response.url()).pathname==="/api/payments/agreements/preview");
 await page.getByRole("button",{name:"Sunucuda Doğrula",exact:true}).click();
 const response=await previewResponse;expect(response.status()).toBe(200);
 expect(response.request().postDataJSON().cartItems).toEqual([{product_id:data.variantProductId,variant_id:data.variantM,quantity:1}]);
 await expect(page.locator(".summary-product")).toHaveAttribute("data-variant-id",String(data.variantM));
 await expect(page.getByTestId("checkout-legal-checkbox-distance-sale")).toBeVisible();
 expect((await (await page.request.get("/__r26/requests")).json()).some((r:any)=>r.path==="/api/payments/initialize")).toBe(false);
 await page.screenshot({path:"artifacts/r26-verification/browser-checkout.png"});
});
