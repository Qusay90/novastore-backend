const option = (value, label = value) => ({ value, label });
const attribute = (code, name, type, extra = {}) => ({
    code, name, type, is_filterable: true, is_required: false, is_active: true, ...extra
});

const MARKETPLACE_ATTRIBUTES = Object.freeze([
    attribute('beden', 'Beden', 'option', {
        is_variant_relevant: true,
        options: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'].map((value) => option(value.toLowerCase(), value))
    }),
    attribute('renk', 'Renk', 'option', {
        is_variant_relevant: true,
        options: [
            ['siyah', 'Siyah'], ['beyaz', 'Beyaz'], ['gri', 'Gri'], ['mavi', 'Mavi'],
            ['kirmizi', 'Kırmızı'], ['yesil', 'Yeşil'], ['bej', 'Bej'], ['kahverengi', 'Kahverengi'],
            ['pembe', 'Pembe'], ['mor', 'Mor'], ['sari', 'Sarı'], ['turuncu', 'Turuncu']
        ].map(([value, label]) => option(value, label))
    }),
    attribute('kumas', 'Kumaş', 'text'),
    attribute('kalip', 'Kalıp', 'text'),
    attribute('bel_tipi', 'Bel Tipi', 'text'),
    attribute('paca_tipi', 'Paça Tipi', 'text'),
    attribute('yaka_tipi', 'Yaka Tipi', 'text'),
    attribute('kol_tipi', 'Kol Tipi', 'text'),
    attribute('elbise_boyu', 'Elbise Boyu', 'text'),
    attribute('cinsiyet', 'Cinsiyet', 'option', {
        options: [
            option('kadin', 'Kadın'), option('erkek', 'Erkek'), option('unisex', 'Unisex')
        ]
    }),
    attribute('yas_grubu', 'Yaş Grubu', 'option', {
        options: [
            ['0_3_ay', '0-3 Ay'], ['3_6_ay', '3-6 Ay'], ['6_9_ay', '6-9 Ay'],
            ['9_12_ay', '9-12 Ay'], ['1_2_yas', '1-2 Yaş'], ['3_4_yas', '3-4 Yaş'],
            ['5_6_yas', '5-6 Yaş'], ['7_8_yas', '7-8 Yaş'], ['9_10_yas', '9-10 Yaş'],
            ['11_12_yas', '11-12 Yaş'], ['13_14_yas', '13-14 Yaş']
        ].map(([value, label]) => option(value, label))
    }),
    attribute('marka', 'Marka', 'text'),
    attribute('model', 'Model', 'text'),
    attribute('depolama', 'Depolama', 'number', { unit: 'GB', validation_metadata: { min: 0 } }),
    attribute('ram', 'RAM', 'number', { unit: 'GB', validation_metadata: { min: 0 } }),
    attribute('ekran_boyutu', 'Ekran Boyutu', 'number', { unit: 'inç', validation_metadata: { min: 0 } }),
    attribute('kamera', 'Kamera', 'text'),
    attribute('garanti_suresi', 'Garanti Süresi', 'option', {
        options: [
            option('1_yil', '1 Yıl'), option('2_yil', '2 Yıl'), option('3_yil', '3 Yıl')
        ]
    }),
    attribute('islemci', 'İşlemci', 'text'),
    attribute('ekran_karti', 'Ekran Kartı', 'text'),
    attribute('isletim_sistemi', 'İşletim Sistemi', 'text'),
    attribute('suya_dayanikli', 'Suya Dayanıklı', 'boolean'),
    attribute('guc', 'Güç', 'number', { unit: 'W', validation_metadata: { min: 0 } }),
    attribute('kapasite', 'Kapasite', 'text'),
    attribute('hazne_kapasitesi', 'Hazne Kapasitesi', 'text'),
    attribute('hiz_ayari', 'Hız Ayarı', 'number', { validation_metadata: { min: 0 } }),
    attribute('materyal', 'Materyal', 'text'),
    attribute('yazar', 'Yazar', 'text'),
    attribute('yayinevi', 'Yayınevi', 'text'),
    attribute('dil', 'Dil', 'option', {
        options: [
            option('turkce', 'Türkçe'), option('ingilizce', 'İngilizce'), option('arapca', 'Arapça')
        ]
    }),
    attribute('sayfa_sayisi', 'Sayfa Sayısı', 'number', { validation_metadata: { min: 1 } }),
    attribute('kapak_tipi', 'Kapak Tipi', 'option', {
        options: [option('karton_kapak', 'Karton Kapak'), option('ciltli', 'Ciltli')]
    }),
    attribute('cilt_tipi', 'Cilt Tipi', 'option', {
        options: [
            option('kuru', 'Kuru'), option('yagli', 'Yağlı'), option('karma', 'Karma'),
            option('hassas', 'Hassas'), option('normal', 'Normal')
        ]
    }),
    attribute('hacim', 'Hacim', 'text'),
    attribute('kullanim_alani', 'Kullanım Alanı', 'text'),
    attribute('oyuncak_tipi', 'Oyuncak Tipi', 'text'),
    attribute('malzeme', 'Malzeme', 'text'),
    attribute('hayvan_turu', 'Hayvan Türü', 'option', {
        options: [
            option('kedi', 'Kedi'), option('kopek', 'Köpek'),
            option('kus', 'Kuş'), option('balik', 'Balık')
        ]
    }),
    attribute('urun_tipi', 'Ürün Tipi', 'text'),
    attribute('agirlik_hacim', 'Ağırlık / Hacim', 'text')
]);

const MARKETPLACE_TEMPLATE_SPECS = Object.freeze([
    {
        name: 'Moda Alt Giyim',
        selector: { root: 'Moda & Giyim', subtrees: ['Alt Giyim'] },
        attributes: ['beden', 'renk', 'kumas', 'kalip', 'bel_tipi', 'paca_tipi']
    },
    {
        name: 'Moda Üst Giyim',
        selector: { root: 'Moda & Giyim', subtrees: ['Üst Giyim'] },
        attributes: ['beden', 'renk', 'kumas', 'kalip', 'yaka_tipi', 'kol_tipi']
    },
    {
        name: 'Elbise & Tulum',
        selector: { root: 'Moda & Giyim', subtrees: ['Elbise & Tulum'] },
        attributes: ['beden', 'renk', 'kumas', 'elbise_boyu', 'kol_tipi', 'yaka_tipi']
    },
    {
        name: 'Moda Ayakkabı',
        selector: { root: 'Moda & Giyim', nameIncludes: ['Ayakkabı'] },
        attributes: ['beden', 'renk', 'materyal', 'marka']
    },
    {
        name: 'Moda İç Giyim',
        selector: { root: 'Moda & Giyim', subtrees: ['İç Giyim & Ev Giyim', 'İç Giyim & Pijama'] },
        attributes: ['beden', 'renk', 'kumas']
    },
    {
        name: 'Telefon',
        selector: { root: 'Elektronik', exact: ['Cep Telefonu', 'Akıllı Telefon', 'İş Telefonu'] },
        attributes: [
            'marka', 'model', 'depolama', 'ram', 'ekran_boyutu',
            'kamera', 'renk', 'garanti_suresi', 'suya_dayanikli'
        ]
    },
    {
        name: 'Bilgisayar',
        selector: { root: 'Elektronik', exact: ['Laptop', 'Masaüstü Bilgisayar', 'Tablet'] },
        attributes: [
            'marka', 'islemci', 'ram', 'depolama', 'ekran_boyutu',
            'ekran_karti', 'isletim_sistemi', 'garanti_suresi'
        ]
    },
    {
        name: 'Elektrikli Mutfak Aletleri',
        selector: { root: 'Beyaz Eşya & Elektrikli Ev Aletleri', subtrees: ['Elektrikli Mutfak Aletleri'] },
        attributes: ['marka', 'guc', 'kapasite', 'hazne_kapasitesi', 'hiz_ayari', 'materyal', 'garanti_suresi']
    },
    {
        name: 'Beyaz Eşya',
        selector: { root: 'Beyaz Eşya & Elektrikli Ev Aletleri', subtrees: ['Beyaz Eşya'] },
        attributes: ['marka', 'kapasite', 'guc', 'garanti_suresi']
    },
    {
        name: 'Kitap',
        selector: { root: 'Kitap, Kırtasiye & Hobi', subtrees: ['Kitap'] },
        attributes: ['yazar', 'yayinevi', 'dil', 'sayfa_sayisi', 'kapak_tipi']
    },
    {
        name: 'Kozmetik',
        selector: { root: 'Kozmetik & Kişisel Bakım', directChildren: true },
        attributes: ['marka', 'cilt_tipi', 'hacim', 'kullanim_alani']
    },
    {
        name: 'Oyuncak',
        selector: { root: 'Anne, Bebek & Oyuncak', subtrees: ['Oyuncak'] },
        attributes: ['yas_grubu', 'oyuncak_tipi', 'malzeme']
    },
    {
        name: 'Petshop',
        selector: { root: 'Süpermarket & Petshop', subtrees: ['Petshop'] },
        attributes: ['hayvan_turu', 'urun_tipi', 'agirlik_hacim']
    }
]);

module.exports = {
    MARKETPLACE_ATTRIBUTES,
    MARKETPLACE_TEMPLATE_SPECS
};
