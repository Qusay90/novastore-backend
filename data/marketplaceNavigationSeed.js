const MARKETPLACE_COLLECTIONS = Object.freeze([
    { name: 'Yeni Gelenler', slug: 'yeni-gelenler', collection_type: 'dynamic', rule_code: 'new_arrivals', sort_order: 0, show_on_home: true },
    { name: 'İndirim', slug: 'indirim', collection_type: 'dynamic', rule_code: 'discount', sort_order: 1, show_on_home: true },
    { name: 'Çok Satanlar', slug: 'cok-satanlar', collection_type: 'dynamic', rule_code: 'best_sellers', sort_order: 2, show_on_home: true },
    { name: 'Vitrin', slug: 'vitrin', collection_type: 'manual', rule_code: null, sort_order: 3, show_on_home: true }
]);

const MAIN_MENU_ITEMS = Object.freeze([
    { title: 'Moda', target_type: 'category', target_slug: 'moda-ve-giyim' },
    { title: 'Elektronik', target_type: 'category', target_slug: 'elektronik' },
    { title: 'Ev & Yaşam', target_type: 'category', target_slug: 'ev-ve-yasam' },
    { title: 'Anne, Bebek & Oyuncak', target_type: 'category', target_slug: 'anne-bebek-ve-oyuncak' },
    { title: 'Kozmetik', target_type: 'category', target_slug: 'kozmetik-ve-kisisel-bakim' },
    { title: 'Süpermarket & Petshop', target_type: 'category', target_slug: 'supermarket-ve-petshop' },
    { title: 'Spor & Outdoor', target_type: 'category', target_slug: 'spor-ve-outdoor' },
    { title: 'Oto & Yapı Market', target_type: 'category', target_slug: 'oto-bahce-ve-yapi-market' },
    { title: 'Kitap & Kırtasiye', target_type: 'category', target_slug: 'kitap-kirtasiye-ve-hobi' },
    { title: 'İndirim', target_type: 'collection', target_slug: 'indirim' },
    { title: 'Yeni Gelenler', target_type: 'collection', target_slug: 'yeni-gelenler' },
    { title: 'Çok Satanlar', target_type: 'collection', target_slug: 'cok-satanlar' }
].map((item, sort_order) => ({ ...item, sort_order, is_active: true })));

module.exports = {
    MARKETPLACE_COLLECTIONS,
    MAIN_MENU_ITEMS
};
