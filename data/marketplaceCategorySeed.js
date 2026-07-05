const node = (name, children = []) => ({ name, children });

const root = (name, icon, accentColor, children) => ({
    name,
    icon,
    accentColor,
    children
});

const MARKETPLACE_CATEGORY_TREE = Object.freeze([
    root('Moda & Giyim', 'shirt', '#7C3AED', [
        node('Kadın', [
            node('Giyim', [
                node('Üst Giyim', [
                    node('Tişört'), node('Gömlek'), node('Bluz'), node('Sweatshirt'),
                    node('Kazak'), node('Hırka'), node('Body')
                ]),
                node('Alt Giyim', [
                    node('Pantolon'), node('Jean'), node('Etek'), node('Şort'),
                    node('Tayt'), node('Eşofman Altı')
                ]),
                node('Elbise & Tulum', [
                    node('Elbise'), node('Gömlek Elbise'), node('Tulum')
                ]),
                node('Takım', [
                    node('İkili Takım'), node('Eşofman Takımı'), node('Ceketli Takım')
                ]),
                node('Dış Giyim', [
                    node('Ceket'), node('Mont'), node('Kaban'), node('Trençkot'), node('Yelek')
                ])
            ]),
            node('İç Giyim & Ev Giyim', [
                node('Sütyen'), node('Külot'), node('Atlet'), node('Pijama'),
                node('Gecelik'), node('Çorap'), node('Termal İçlik')
            ]),
            node('Ayakkabı'),
            node('Aksesuar')
        ]),
        node('Erkek', [
            node('Giyim', [
                node('Üst Giyim', [
                    node('Tişört'), node('Polo Yaka'), node('Gömlek'),
                    node('Sweatshirt'), node('Kazak'), node('Hırka')
                ]),
                node('Alt Giyim', [
                    node('Pantolon'), node('Jean'), node('Şort'), node('Eşofman Altı')
                ]),
                node('Takım', [
                    node('Eşofman Takımı'), node('Alt-Üst Takım'), node('Takım Elbise')
                ]),
                node('Dış Giyim', [
                    node('Ceket'), node('Mont'), node('Kaban'), node('Yelek')
                ])
            ]),
            node('İç Giyim & Ev Giyim', [
                node('Boxer'), node('Slip'), node('Atlet'), node('Pijama'),
                node('Çorap'), node('Termal İçlik')
            ]),
            node('Ayakkabı'),
            node('Aksesuar')
        ]),
        node('Çocuk', [
            node('Kız Çocuk', [
                node('Üst Giyim'), node('Alt Giyim'), node('Elbise'), node('Takım'),
                node('Dış Giyim'), node('İç Giyim & Pijama'), node('Çorap')
            ]),
            node('Erkek Çocuk', [
                node('Üst Giyim'), node('Alt Giyim'), node('Takım'),
                node('Dış Giyim'), node('İç Giyim & Pijama'), node('Çorap')
            ]),
            node('Unisex Çocuk', [
                node('Üst Giyim'), node('Alt Giyim'), node('Takım'), node('Aksesuar')
            ]),
            node('Çocuk Ayakkabı'),
            node('Çocuk Aksesuar')
        ]),
        node('Bebek', [
            node('Kız Bebek', [
                node('Zıbın & Body'), node('Tulum'), node('Takım'), node('Üst Giyim'),
                node('Alt Giyim'), node('Dış Giyim'), node('Pijama'), node('Çorap')
            ]),
            node('Erkek Bebek', [
                node('Zıbın & Body'), node('Tulum'), node('Takım'), node('Üst Giyim'),
                node('Alt Giyim'), node('Dış Giyim'), node('Pijama'), node('Çorap')
            ]),
            node('Yenidoğan', [
                node('Hastane Çıkışı'), node('Zıbın & Body'), node('Tulum'),
                node('Battaniye'), node('Setler')
            ])
        ])
    ]),
    root('Elektronik', 'laptop', '#2563EB', [
        node('Telefon & Aksesuar', [
            node('Cep Telefonu'), node('Akıllı Telefon'), node('İş Telefonu'),
            node('Telefon Kılıfı'), node('Şarj Cihazı'), node('Powerbank'),
            node('Kulaklık'), node('Akıllı Saat & Bileklik')
        ]),
        node('Bilgisayar & Tablet', [
            node('Laptop'), node('Masaüstü Bilgisayar'), node('Tablet'), node('Monitör'),
            node('Klavye'), node('Mouse'), node('Bilgisayar Bileşenleri'), node('Veri Depolama')
        ]),
        node('TV, Görüntü & Ses', [
            node('Televizyon'), node('Hoparlör'), node('Soundbar'),
            node('Ev Sinema Sistemi'), node('TV Aksesuarı')
        ]),
        node('Fotoğraf & Kamera', [
            node('Fotoğraf Makinesi'), node('Aksiyon Kamera'),
            node('Kamera Aksesuarı'), node('Tripod')
        ]),
        node('Oyun & Konsol', [
            node('Oyun Konsolu'), node('Oyun'), node('Konsol Aksesuarı')
        ]),
        node('Ağ & Akıllı Ev', [
            node('Modem'), node('Router'), node('Güvenlik Kamerası'), node('Akıllı Ev Ürünleri')
        ])
    ]),
    root('Beyaz Eşya & Elektrikli Ev Aletleri', 'washing-machine', '#0891B2', [
        node('Beyaz Eşya', [
            node('Buzdolabı'), node('Çamaşır Makinesi'), node('Bulaşık Makinesi'),
            node('Derin Dondurucu'), node('Kurutma Makinesi')
        ]),
        node('Elektrikli Mutfak Aletleri', [
            node('Blender'), node('Tost Makinesi'), node('Çay Makinesi'),
            node('Kahve Makinesi'), node('Airfryer & Fritöz'),
            node('Mikrodalga Fırın'), node('Mutfak Robotu')
        ]),
        node('Süpürge & Temizlik Cihazları', [
            node('Elektrikli Süpürge'), node('Robot Süpürge'),
            node('Şarjlı Süpürge'), node('Buharlı Temizleyici')
        ]),
        node('Isıtma & Soğutma', [
            node('Klima'), node('Vantilatör'), node('Isıtıcı'), node('Hava Temizleyici')
        ]),
        node('Kişisel Bakım Aletleri', [
            node('Tıraş Makinesi'), node('Saç Kurutma Makinesi'),
            node('Saç Şekillendirici'), node('Epilatör')
        ])
    ]),
    root('Ev & Yaşam', 'house', '#EA580C', [
        node('Mobilya', [
            node('Oturma Odası'), node('Yatak Odası'), node('Çalışma Odası'),
            node('Mutfak Mobilyası'), node('Bebek & Genç Odası')
        ]),
        node('Ev Tekstili', [
            node('Nevresim'), node('Yorgan'), node('Yastık'),
            node('Halı'), node('Perde'), node('Havlu')
        ]),
        node('Ev Dekorasyon', [
            node('Aydınlatma'), node('Tablo'), node('Ayna'),
            node('Dekoratif Obje'), node('Duvar Dekorasyonu')
        ]),
        node('Mutfak', [
            node('Tencere & Tava'), node('Sofra & Servis'),
            node('Saklama Kabı'), node('Mutfak Gereçleri')
        ]),
        node('Banyo', [
            node('Banyo Aksesuarı'), node('Duş Sistemleri'), node('Banyo Tekstili')
        ])
    ]),
    root('Anne, Bebek & Oyuncak', 'baby-carriage', '#DB2777', [
        node('Bebek Bakım'),
        node('Bebek Bezi & Islak Mendil'),
        node('Bebek Arabası & Oto Koltuğu'),
        node('Bebek Odası'),
        node('Hamile Giyim & Ürünleri'),
        node('Oyuncak', [
            node('Eğitici Oyuncak'), node('Bebek Oyuncağı'),
            node('Oyun Seti'), node('Puzzle'), node('Akülü Araç')
        ])
    ]),
    root('Kozmetik & Kişisel Bakım', 'sparkles', '#E11D48', [
        node('Parfüm & Deodorant'),
        node('Cilt Bakımı'),
        node('Saç Bakımı'),
        node('Makyaj'),
        node('Ağız Bakımı'),
        node('Erkek Bakım'),
        node('Kişisel Bakım Cihazları')
    ]),
    root('Süpermarket & Petshop', 'basket-shopping', '#16A34A', [
        node('Temizlik Ürünleri'),
        node('Kağıt Ürünleri'),
        node('Gıda'),
        node('İçecek'),
        node('Ev Sarf Malzemeleri'),
        node('Petshop', [
            node('Kedi'), node('Köpek'), node('Kuş'), node('Akvaryum')
        ])
    ]),
    root('Spor & Outdoor', 'person-running', '#059669', [
        node('Spor Giyim'),
        node('Spor Ayakkabı'),
        node('Fitness & Kondisyon'),
        node('Futbol'),
        node('Basketbol'),
        node('Kamp & Outdoor'),
        node('Bisiklet'),
        node('Deniz & Plaj')
    ]),
    root('Oto, Bahçe & Yapı Market', 'screwdriver-wrench', '#475569', [
        node('Oto Aksesuar'),
        node('Motosiklet Ürünleri'),
        node('Bahçe'),
        node('Yapı Market'),
        node('Hırdavat'),
        node('Elektrik & Tesisat'),
        node('Banyo & Mutfak Tadilat'),
        node('İş Güvenliği')
    ]),
    root('Kitap, Kırtasiye & Hobi', 'book-open', '#9333EA', [
        node('Kitap', [
            node('Roman'), node('Çocuk Kitapları'), node('Ders & Sınav Kitapları'),
            node('Yabancı Dil Kitapları')
        ]),
        node('Kırtasiye'),
        node('Ofis Ürünleri'),
        node('Müzik Enstrümanları'),
        node('Hobi & Oyun')
    ])
]);

module.exports = {
    MARKETPLACE_CATEGORY_TREE
};
