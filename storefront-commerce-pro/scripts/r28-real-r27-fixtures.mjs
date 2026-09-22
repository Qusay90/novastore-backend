import crypto from "node:crypto";
import path from "node:path";

export async function seedR25Database({ pool, requireR21, r21Root, customerPassword }) {
  const bcrypt = requireR21("bcrypt");
  const passwordHash = await bcrypt.hash(customerPassword, 4);
  const users = await pool.query(
    `INSERT INTO users (full_name,name,email,phone,password,role,auth_enabled)
     VALUES
       ('R25 Real Customer','R25 Real Customer','r25-real@example.test','05550000025',$1,'customer',TRUE),
       ('R25 Seller','R25 Seller','r25-seller@example.test','05550000026','unused','customer',TRUE),
       ('R25 Foreign Seller','R25 Foreign Seller','r25-foreign@example.test','05550000027','unused','customer',TRUE),
       ('R25 Admin','R25 Admin','r25-admin@example.test','05550000028','unused','admin',TRUE)
     RETURNING id,email`,
    [passwordHash],
  );
  const userId = new Map(users.rows.map((row) => [row.email, Number(row.id)]));
  const customerId = userId.get("r25-real@example.test");
  const sellerId = userId.get("r25-seller@example.test");
  const foreignSellerId = userId.get("r25-foreign@example.test");
  const adminId = userId.get("r25-admin@example.test");
  const addressId = Number((await pool.query(
    `INSERT INTO customer_addresses(user_id,title,full_name,phone,city,district,address_line,is_default)
     VALUES($1,'Ev','R25 Real Customer','05550000025','İstanbul','Kadıköy','Yalnız yerel R25 R21 doğrulama adresi No 25',TRUE)
     RETURNING id`, [customerId],
  )).rows[0].id);
  const stores = await pool.query(
    `INSERT INTO stores(name,slug,owner_user_id,is_active)
     VALUES('R25 Canonical Store','r25-canonical-store',$1,TRUE),('R25 Foreign Store','r25-foreign-store',$2,TRUE)
     RETURNING id,slug`, [sellerId, foreignSellerId],
  );
  const storeBySlug = new Map(stores.rows.map((row) => [row.slug, Number(row.id)]));
  const storeId = storeBySlug.get("r25-canonical-store");
  const foreignLegacyStoreId = storeBySlug.get("r25-foreign-store");
  const products = await pool.query(
    `INSERT INTO products(name,price,stock,description,image_url,category,categories,store_id,publication_status,is_customer_visible,sku,normalized_sku,variant_selection_required)
     VALUES
       ('R25 Kanonik Varyantlı Ürün',100.00,7,'Gerçek R21 varyant sözleşmesi ve kalıcı açıklaması.','/r25-product.svg','R25 Yerel Kategori',ARRAY['R25 Yerel Kategori'],$1,'active',TRUE,'R25-VARIANT','R25-VARIANT',TRUE),
       ('R25 Kanonik Basit Ürün',80.00,5,'Gerçek R21 basit ürün sözleşmesi.','/r25-product.svg','R25 Yerel Kategori',ARRAY['R25 Yerel Kategori'],$1,'active',TRUE,'R25-SIMPLE','R25-SIMPLE',FALSE),
       ('R25 Foreign Product',90.00,4,'Yabancı varyant negatif testi.','/r25-product.svg','R25 Yerel Kategori',ARRAY['R25 Yerel Kategori'],$2,'active',TRUE,'R25-FOREIGN','R25-FOREIGN',TRUE)
     RETURNING id,name`, [storeId, foreignLegacyStoreId],
  );
  const productByName = new Map(products.rows.map((row) => [row.name, Number(row.id)]));
  const variantProductId = productByName.get("R25 Kanonik Varyantlı Ürün");
  const simpleProductId = productByName.get("R25 Kanonik Basit Ürün");
  const foreignProductId = productByName.get("R25 Foreign Product");
  const categoryId = Number((await pool.query(
    `INSERT INTO categories(name,slug,path,depth,sort_order,is_active,is_customer_visible,show_in_menu,hide_when_empty)
     VALUES('R25 Yerel Kategori','r25-yerel','r25-yerel',0,1,TRUE,TRUE,TRUE,FALSE) RETURNING id`,
  )).rows[0].id);
  await pool.query(
    `INSERT INTO product_categories(product_id,category_id,is_primary)
     VALUES($1,$4,TRUE),($2,$4,TRUE),($3,$4,TRUE)`,
    [variantProductId, simpleProductId, foreignProductId, categoryId],
  );
  const attributeDefinitions = await pool.query(
    `INSERT INTO attribute_definitions(code,name,type,unit,sort_order,is_active)
     VALUES
       ('r25_malzeme','Malzeme','text',NULL,10,TRUE),
       ('r25_agirlik','Ağırlık','number','g',20,TRUE),
       ('r25_yikanabilir','Makinede Yıkanabilir','boolean',NULL,30,TRUE),
       ('r25_kalip','Kalıp','option',NULL,40,TRUE),
       ('r25_bakim','Bakım Özellikleri','multi_option',NULL,50,TRUE),
       ('r25_sicaklik','Kullanım Sıcaklığı','range','°C',60,TRUE)
     RETURNING id,code`,
  );
  const attributeId = new Map(attributeDefinitions.rows.map((row) => [row.code, Number(row.id)]));
  const attributeOptions = await pool.query(
    `INSERT INTO attribute_options(attribute_id,value,label,sort_order,is_active)
     VALUES
       ($1,'regular','Standart Kalıp',10,TRUE),
       ($2,'easy_iron','Kolay Ütü',10,TRUE),
       ($2,'color_safe','Renk Koruma',20,TRUE)
     RETURNING id,attribute_id,value,label`,
    [attributeId.get("r25_kalip"), attributeId.get("r25_bakim")],
  );
  const optionByValue = new Map(attributeOptions.rows.map((row) => [row.value, { id: Number(row.id), value: row.value, label: row.label }]));
  await pool.query(
    `INSERT INTO product_attribute_values(
       product_id,attribute_id,text_value,number_value,boolean_value,option_id,option_ids,range_min,range_max
     ) VALUES
       ($1,$2,'Organik pamuk',NULL,NULL,NULL,NULL,NULL,NULL),
       ($1,$3,NULL,240,NULL,NULL,NULL,NULL,NULL),
       ($1,$4,NULL,NULL,TRUE,NULL,NULL,NULL,NULL),
       ($1,$5,NULL,NULL,NULL,$8,NULL,NULL,NULL),
       ($1,$6,NULL,NULL,NULL,NULL,$9::INTEGER[],NULL,NULL),
       ($1,$7,NULL,NULL,NULL,NULL,NULL,10,30)`,
    [
      variantProductId,
      attributeId.get("r25_malzeme"),
      attributeId.get("r25_agirlik"),
      attributeId.get("r25_yikanabilir"),
      attributeId.get("r25_kalip"),
      attributeId.get("r25_bakim"),
      attributeId.get("r25_sicaklik"),
      optionByValue.get("regular").id,
      [optionByValue.get("easy_iron").id, optionByValue.get("color_safe").id],
    ],
  );
  const expectedAttributes = Object.freeze([
    Object.freeze({ code: "r25_malzeme", name: "Malzeme", type: "text", unit: null, value: "Organik pamuk" }),
    Object.freeze({ code: "r25_agirlik", name: "Ağırlık", type: "number", unit: "g", value: 240 }),
    Object.freeze({ code: "r25_yikanabilir", name: "Makinede Yıkanabilir", type: "boolean", unit: null, value: true }),
    Object.freeze({ code: "r25_kalip", name: "Kalıp", type: "option", unit: null, value: Object.freeze(optionByValue.get("regular")) }),
    Object.freeze({ code: "r25_bakim", name: "Bakım Özellikleri", type: "multi_option", unit: null, value: Object.freeze([
      Object.freeze(optionByValue.get("easy_iron")),
      Object.freeze(optionByValue.get("color_safe")),
    ]) }),
    Object.freeze({ code: "r25_sicaklik", name: "Kullanım Sıcaklığı", type: "range", unit: "°C", value: Object.freeze({ min: 10, max: 30 }) }),
  ]);
  await requireR21(path.join(r21Root, "services", "categoryStatsService.js")).recalculateAllCategoryStats(pool);
  const orgs = await pool.query(
    `INSERT INTO seller_organizations(external_key,display_name)
     VALUES($1,'R25 Canonical Organization'),($2,'R25 Foreign Organization') RETURNING id,display_name`,
    [crypto.randomUUID(), crypto.randomUUID()],
  );
  const orgByName = new Map(orgs.rows.map((row) => [row.display_name, Number(row.id)]));
  const organizationId = orgByName.get("R25 Canonical Organization");
  const foreignOrganizationId = orgByName.get("R25 Foreign Organization");
  const sellerStores = await pool.query(
    `INSERT INTO seller_stores(organization_id,legacy_store_id,display_name)
     VALUES($1,$2,'R25 Canonical Store'),($3,$4,'R25 Foreign Store') RETURNING id,organization_id`,
    [organizationId, storeId, foreignOrganizationId, foreignLegacyStoreId],
  );
  const sellerStoreId = Number(sellerStores.rows.find((row) => Number(row.organization_id) === organizationId).id);
  const foreignSellerStoreId = Number(sellerStores.rows.find((row) => Number(row.organization_id) === foreignOrganizationId).id);
  const identityService = requireR21(path.join(r21Root, "services", "sellerPublicLegalIdentityService.js"));
  for (const [orgId, suffix] of [[organizationId, "Canonical"], [foreignOrganizationId, "Foreign"]]) {
    const identity = {
      version: "r25-real-v1",
      publicLegalName: `R25 ${suffix} Test Tüzel Kişisi`,
      publicTradeName: `R25 ${suffix} Test`,
      publicDisclosureText: "Yalnız yerel ve tek kullanımlık R25 R21 doğrulaması.",
    };
    const row = await pool.query(
      `INSERT INTO seller_public_legal_identities(organization_id,version,public_legal_name,public_trade_name,public_disclosure_text,content_sha256,status,created_by_admin_user_id)
       VALUES($1,$2,$3,$4,$5,$6,'draft',$7) RETURNING id`,
      [orgId, identity.version, identity.publicLegalName, identity.publicTradeName, identity.publicDisclosureText, identityService.buildSellerPublicLegalIdentityContentSha256(identity), adminId],
    );
    await pool.query(
      "UPDATE seller_public_legal_identities SET status='approved',approved_by_admin_user_id=$2,approved_at=NOW(),revision=revision+1 WHERE id=$1",
      [row.rows[0].id, adminId],
    );
  }
  const offers = await pool.query(
    `INSERT INTO seller_offers(organization_id,store_id,product_id,status,visibility)
     VALUES($1,$2,$3,'active','seller_visible'),($1,$2,$7,'active','seller_visible'),($4,$5,$6,'active','seller_visible') RETURNING id,organization_id,product_id`,
    [organizationId, sellerStoreId, variantProductId, foreignOrganizationId, foreignSellerStoreId, foreignProductId, simpleProductId],
  );
  const offerId = Number(offers.rows.find((row) => Number(row.product_id) === variantProductId).id);
  const simpleOfferId = Number(offers.rows.find((row) => Number(row.product_id) === simpleProductId).id);
  const foreignOfferId = Number(offers.rows.find((row) => Number(row.organization_id) === foreignOrganizationId).id);
  const variants = await pool.query(
    `INSERT INTO seller_offer_variants(organization_id,store_id,offer_id,seller_sku,price_minor,currency,status,product_id,selections,publication_status)
     VALUES
       ($1,$2,$3,'R25-RED-M',10000,'TRY','active',$4,$5::jsonb,'published'),
       ($1,$2,$3,'R25-RED-L',15075,'TRY','active',$4,$6::jsonb,'published'),
       ($1,$2,$3,'R25-BLUE-L',18000,'TRY','active',$4,$7::jsonb,'published'),
       ($1,$2,$3,'R25-DISABLED',19000,'TRY','inactive',$4,$8::jsonb,'published'),
       ($1,$2,$3,'R25-UNPUBLISHED',20000,'TRY','active',$4,$9::jsonb,'draft'),
       ($1,$2,$15,'R25-SIMPLE-OFFER',8000,'TRY','active',NULL,'[]'::jsonb,'draft'),
       ($10,$11,$12,'R25-FOREIGN-M',9000,'TRY','active',$13,$14::jsonb,'published')
     RETURNING id,seller_sku`,
    [organizationId, sellerStoreId, offerId, variantProductId,
      JSON.stringify([{ group: "Renk", value: "Kırmızı" }, { group: "Beden", value: "M" }]),
      JSON.stringify([{ group: "Renk", value: "Kırmızı" }, { group: "Beden", value: "L" }]),
      JSON.stringify([{ group: "Renk", value: "Mavi" }, { group: "Beden", value: "L" }]),
      JSON.stringify([{ group: "Renk", value: "Siyah" }, { group: "Beden", value: "XL" }]),
      JSON.stringify([{ group: "Renk", value: "Sarı" }, { group: "Beden", value: "S" }]),
      foreignOrganizationId, foreignSellerStoreId, foreignOfferId, foreignProductId,
      JSON.stringify([{ group: "Renk", value: "Yeşil" }, { group: "Beden", value: "M" }]), simpleOfferId],
  );
  const variantBySku = new Map(variants.rows.map((row) => [row.seller_sku, Number(row.id)]));
  const deletedVariant = Number((await pool.query(
    `INSERT INTO seller_offer_variants(organization_id,store_id,offer_id,seller_sku,price_minor,currency,status,product_id,selections,publication_status,deleted_at)
     VALUES($1,$2,$3,'R25-DELETED',17000,'TRY','active',$4,$5::jsonb,'published',NOW()) RETURNING id`,
    [organizationId, sellerStoreId, offerId, variantProductId, JSON.stringify([{ group: "Renk", value: "Beyaz" }, { group: "Beden", value: "S" }])],
  )).rows[0].id);
  await pool.query(
    `INSERT INTO seller_inventory_items(organization_id,store_id,variant_id,quantity)
     VALUES($1,$2,$3,4),($1,$2,$4,3),($1,$2,$5,0),($1,$2,$6,2),($1,$2,$7,2),($1,$2,$11,5),($1,$2,$12,2),($8,$9,$10,4)`,
    [organizationId, sellerStoreId, variantBySku.get("R25-RED-M"), variantBySku.get("R25-RED-L"), variantBySku.get("R25-BLUE-L"), variantBySku.get("R25-DISABLED"), variantBySku.get("R25-UNPUBLISHED"), foreignOrganizationId, foreignSellerStoreId, variantBySku.get("R25-FOREIGN-M"), variantBySku.get("R25-SIMPLE-OFFER"), deletedVariant],
  );
  return Object.freeze({
    customerId,
    addressId,
    variantProductId,
    simpleProductId,
    foreignProductId,
    variantM: variantBySku.get("R25-RED-M"),
    variantL: variantBySku.get("R25-RED-L"),
    zeroVariant: variantBySku.get("R25-BLUE-L"),
    disabledVariant: variantBySku.get("R25-DISABLED"),
    unpublishedVariant: variantBySku.get("R25-UNPUBLISHED"),
    foreignVariant: variantBySku.get("R25-FOREIGN-M"),
    deletedVariant,
    simpleOfferVariant: variantBySku.get("R25-SIMPLE-OFFER"),
    expectedAttributes,
    email: "r25-real@example.test",
  });
}
