// Local design fixtures. The original canonical and Android catalogs are never mutated.
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const definitions = {
  tech: { base:861000, name:'Teknoloji', path:'teknoloji-lab', brand:'Volt Lab', categories:[['telefon','Telefonlar','smartphone'],['bilgisayar','Bilgisayarlar','laptop'],['ses','Ses sistemleri','headphones'],['giyilebilir','Giyilebilir teknoloji','watch']], products:[
    ['iphone-15','Apple iPhone 15 128 GB','telefon',51999,55999,18,'/media/phone-iphone.webp',['6,1 inç ekran','128 GB depolama','USB-C bağlantı'],{brand:'Apple',color:'Siyah',storage:'128 GB',specs:[['Ekran','6,1 inç'],['Depolama','128 GB'],['Bağlantı','USB-C']]}],
    ['galaxy-s24','Samsung Galaxy S24 256 GB','telefon',38999,42999,9,'/media/phone-samsung.webp',['6,2 inç AMOLED ekran','256 GB depolama','Kompakt gövde'],{brand:'Samsung',color:'Mor',storage:'256 GB',specs:[['Ekran','6,2 inç AMOLED'],['Depolama','256 GB'],['Koruma','IP68']]}],
    ['redmi-note-13-pro','Xiaomi Redmi Note 13 Pro 256 GB','telefon',16999,18999,12,'/media/phone-xiaomi.webp',['120 Hz AMOLED ekran','256 GB depolama','67 W hızlı şarj'],{brand:'Xiaomi',color:'Siyah',storage:'256 GB',specs:[['Ekran','120 Hz AMOLED'],['Depolama','256 GB'],['Şarj','67 W']]}],
    ['macbook-air-m3','Apple MacBook Air M3 13 inç','bilgisayar',46999,49999,6,'/media/product-laptop.webp',['Apple M3 işlemci','13,6 inç ekran','256 GB SSD'],{brand:'Apple',color:'Gece Yarısı',storage:'256 GB',specs:[['İşlemci','Apple M3'],['Bellek','8 GB'],['SSD','256 GB']]}],
    ['sony-wh-1000xm5','Sony WH-1000XM5 Kulaklık','ses',13999,15999,14,'/media/product-headphones.webp',['Aktif gürültü engelleme','Kablosuz bağlantı','Kulak üstü tasarım'],{brand:'Sony',color:'Siyah',specs:[['Tip','Kulak üstü'],['Bağlantı','Bluetooth'],['Gürültü engelleme','Aktif']]}],
    ['apple-watch-series-9','Apple Watch Series 9','giyilebilir',14999,16999,8,'/media/product-watch.webp',['Günlük aktivite takibi','Dokunmatik ekran','Değiştirilebilir kordon'],{brand:'Apple',color:'Gece Yarısı',specs:[['Ekran','Dokunmatik'],['Takip','Aktivite ve antrenman'],['Kordon','Değiştirilebilir']]}],
  ]},
  living: { base:862000, name:'Yaşam', path:'yasam-atolyesi', brand:'Mora Living', categories:[['oturma','Oturma alanı','armchair'],['masa-sehpa','Masa & sehpa','table'],['aydinlatma','Aydınlatma','lamp'],['tamamlayicilar','Tamamlayıcılar','layers']], products:[
    ['kavis-koltuk','Kavis Üçlü Koltuk','oturma',28900,31900,4,null,['Yumuşak kıvrımlı form','Dokulu açık renk kumaş','Geniş oturma alanı'],{color:'Kum',specs:[['Ölçü','220 × 95 × 78 cm'],['Kumaş','Dokulu dokuma'],['Kapasite','3 kişilik']]}],
    ['keten-berjer','Keten Tekli Berjer','oturma',12400,null,7,null,['Doğal keten dokusu','Masif ahşap ayak','Okuma köşesine uygun'],{color:'Keten',specs:[['Ölçü','78 × 82 × 86 cm'],['Ayak','Masif ahşap'],['Kumaş','Keten karışımı']]}],
    ['mese-sehpa','Meşe Yuvarlak Sehpa','masa-sehpa',6900,7900,9,null,['Yuvarlak masif yüzey','Doğal ahşap damarı','Mat koruyucu bitiş'],{color:'Doğal meşe',specs:[['Çap','80 cm'],['Yükseklik','38 cm'],['Malzeme','Meşe kaplama']]}],
    ['kemer-lambader','Kemer Lambader','aydinlatma',4200,null,12,null,['Heykelsi kavisli gövde','Keten başlık','Sıcak okuma ışığı'],{color:'Kırık beyaz',specs:[['Yükseklik','155 cm'],['Duy','E27'],['Başlık','Keten dokuma']]}],
    ['ceviz-konsol','Ceviz Alçak Konsol','tamamlayicilar',18900,null,3,null,['Kapaklı depolama','Sade yatay form','Ceviz dokulu yüzey'],{color:'Ceviz',specs:[['Ölçü','160 × 42 × 68 cm'],['Kapak','3 adet'],['Yüzey','Ceviz kaplama']]}],
    ['yun-hali','Yün Dokulu Halı','tamamlayicilar',7400,8200,10,null,['Yumuşak doğal doku','Nötr tonlar','Salon ve oturma alanı için'],{color:'Taş',specs:[['Ölçü','160 × 230 cm'],['Dokuma','Yün karışımı'],['Desen','Düz dokulu']]}],
  ]},
  fashion: { base:863000, name:'Moda', path:'stil-studyosu', brand:'Forma Studio', categories:[['ust-giyim','Üst giyim','shirt'],['alt-giyim','Alt giyim','layers'],['dis-giyim','Dış giyim','jacket'],['triko','Triko','sparkles']], products:[
    ['keten-gomlek','Rahat Kesim Keten Gömlek','ust-giyim',1290,1490,0,null,['Nefes alan keten karışımı','Rahat kesim','Günlük kombinlere uygun'],{color:'Kırık beyaz',sizes:['S','M','L'],specs:[['Kalıp','Rahat'],['Kumaş','Keten karışımı'],['Bakım','30 °C hassas yıkama']]}],
    ['duz-kesim-pantolon','Düz Kesim Pantolon','alt-giyim',1590,null,0,null,['Düz paça','Yüksek bel','Gün boyu rahat hareket'],{color:'Kömür',sizes:['S','M','L'],specs:[['Kalıp','Düz'],['Bel','Yüksek'],['Paça','Tam boy']]}],
    ['pamuk-tisort','Ağır Pamuk Tişört','ust-giyim',690,null,0,null,['Tok pamuk dokusu','Bisiklet yaka','Kapsül gardırop parçası'],{color:'Ekru',sizes:['S','M','L'],specs:[['Kumaş','Pamuk'],['Yaka','Bisiklet'],['Kalıp','Rahat']]}],
    ['pileli-etek','Akışkan Pileli Etek','alt-giyim',1790,1990,0,null,['Midi boy','Hafif ve akışkan','Belden oturan form'],{color:'Kum',sizes:['S','M','L'],specs:[['Boy','Midi'],['Detay','Pileli'],['Kalıp','Belden oturan']]}],
    ['ince-triko','İnce Dokulu Triko','triko',1190,null,0,null,['Yumuşak ince örgü','Katmanlı giyime uygun','Sade bisiklet yaka'],{color:'Taş',sizes:['S','M','L'],specs:[['Doku','İnce örgü'],['Yaka','Bisiklet'],['Kol','Uzun']]}],
    ['oversize-ceket','Yapılı Oversize Ceket','dis-giyim',2490,2790,0,null,['Düşük omuz','Yapılı kumaş','Astarlı iç yüzey'],{color:'Koyu lacivert',sizes:['S','M','L'],specs:[['Kalıp','Oversize'],['Astar','Var'],['Kapanış','Düğmeli']]}],
  ]},
  market: { base:864000, name:'Günlük market', path:'gunluk-market', brand:'Taze', categories:[['sut-kahvalti','Süt & kahvaltı','milk'],['firindan','Fırından','wheat'],['meyve-sebze','Meyve & sebze','apple'],['icecek','Kahve & içecek','coffee']], products:[
    ['gunluk-sut','Günlük Tam Yağlı Süt','sut-kahvalti',54.9,null,36,null,['1 litrelik ambalaj','Kahvaltı ve tarifler için','Soğukta saklanır'],{unit:'1 L',specs:[['Paket','1 litre'],['Tür','Tam yağlı süt'],['Saklama','Soğukta']]}],
    ['tam-bugday-ekmek','Tam Buğday Ekmeği','firindan',69.9,null,20,null,['Dilimlenmiş somun','Kahvaltı ve sandviç için','Tam buğday unlu'],{unit:'500 g',specs:[['Paket','500 g'],['İçerik','Tam buğday unu'],['Sunum','Dilimli']]}],
    ['serbest-gezen-yumurta','Serbest Gezen Tavuk Yumurtası','sut-kahvalti',94.9,109.9,24,null,['6 adet yumurta','Korumalı karton ambalaj','Kahvaltı ve tarifler için'],{unit:'6 adet',specs:[['Paket','6 adet'],['Ambalaj','Karton'],['Saklama','Serin yerde']]}],
    ['domates','Salkım Domates','meyve-sebze',64.9,null,28,null,['1 kilogramlık paket','Salata ve yemekler için','Taze ürün seçkisi'],{unit:'1 kg',specs:[['Paket','1 kg'],['Tür','Salkım'],['Kullanım','Salata ve yemek']]}],
    ['yesil-elma','Yeşil Elma','meyve-sebze',74.9,null,30,null,['1 kilogramlık paket','Günlük meyve seçkisi','Taze ve çıtır doku'],{unit:'1 kg',specs:[['Paket','1 kg'],['Renk','Yeşil'],['Kullanım','Taze tüketim']]}],
    ['filtre-kahve','Orta Kavrum Filtre Kahve','icecek',249.9,279.9,16,null,['250 gram öğütülmüş kahve','Filtre demlemeye uygun','Orta kavrum'],{unit:'250 g',specs:[['Paket','250 g'],['Kavrum','Orta'],['Öğütüm','Filtre']]}],
  ]},
  workspace: { base:865000, name:'Çalışma alanı', path:'calisma-alani', brand:'Desk Room', categories:[['mobilya','Çalışma mobilyası','armchair'],['ekran','Ekran aksesuarları','monitor'],['aydinlatma','Masa aydınlatması','lamp'],['duzen','Masa düzeni','layout']], products:[
    ['ergonomik-sandalye','Ergonomik Çalışma Sandalyesi','mobilya',8900,9900,8,null,['Ayarlanabilir bel desteği','Nefes alan sırt yüzeyi','Yükseklik ayarı'],{color:'Antrasit',specs:[['Oturma','Yükseklik ayarlı'],['Sırt','File'],['Kolçak','Ayarlanabilir']]}],
    ['ayarlanabilir-masa','Yüksekliği Ayarlanabilir Masa','mobilya',16900,null,5,null,['Oturma ve ayakta çalışma','Geniş çalışma yüzeyi','Düzenli kablo geçişi'],{color:'Meşe / beyaz',specs:[['Tabla','140 × 70 cm'],['Yükseklik','Ayarlanabilir'],['Kablo geçişi','Var']]}],
    ['monitor-kolu','Tekli Monitör Kolu','ekran',1890,2190,16,null,['Masa kenarına sabitleme','Yükseklik ve açı ayarı','Ekranı göz hizasına taşır'],{color:'Mat siyah',specs:[['Uyum','VESA 75 / 100'],['Ekran','Tekli'],['Montaj','Masa kenarı']]}],
    ['masa-lambasi','Ayarlanabilir Masa Lambası','aydinlatma',1490,null,18,null,['Yönlendirilebilir başlık','Kompakt taban','Odaklı çalışma ışığı'],{color:'Mat beyaz',specs:[['Başlık','Ayarlanabilir'],['Tip','Masa üstü'],['Kullanım','Çalışma ışığı']]}],
    ['masa-duzenleyici','Modüler Masa Düzenleyici','duzen',790,null,22,null,['Kalem ve küçük eşya bölmeleri','Birlikte kullanılabilen parçalar','Temiz bir çalışma yüzeyi'],{color:'Taş',specs:[['Parça','3'],['Yerleşim','Modüler'],['Yüzey','Mat']]}],
    ['kece-masa-pedi','Keçe Masa Pedi','duzen',590,690,25,null,['Yumuşak keçe yüzey','Klavye ve fare alanı','Masa yüzeyini korur'],{color:'Gri',specs:[['Ölçü','80 × 40 cm'],['Malzeme','Keçe'],['Kenar','Düz kesim']]}],
  ]},
  gallery: { base:866000, name:'Tasarım objeleri', path:'obje-galerisi', brand:'Obje', categories:[['seramik','Seramik','vase'],['sofra','Sofra objeleri','cup'],['dogal-malzeme','Doğal malzemeler','gem'],['tekstil','Ev tekstili','layers']], products:[
    ['seramik-vazo','Doku Seramik Vazo','seramik',890,null,12,null,['Organik siluet','Mat seramik yüzey','Tek dal ve kuru çiçekler için'],{color:'Kum',specs:[['Yükseklik','24 cm'],['Malzeme','Seramik'],['Yüzey','Mat dokulu']]}],
    ['cam-karaf','İnce Cam Karaf','sofra',690,790,16,null,['Hafif cam form','Sade masa sunumu','Kolay kavranan boyun'],{color:'Şeffaf',specs:[['Hacim','1 litre'],['Malzeme','Cam'],['Yıkama','Elde yıkama']]}],
    ['traverten-tepsi','Traverten Oval Tepsi','dogal-malzeme',1190,null,8,null,['Doğal taş dokusu','Oval form','Küçük objeler için'],{color:'Bej',specs:[['Ölçü','28 × 14 cm'],['Malzeme','Traverten'],['Form','Oval']]}],
    ['ahsap-obje','Denge Ahşap Obje','dogal-malzeme',990,null,10,null,['Heykelsi doğal form','Sıcak ahşap dokusu','Raf ve masa üstü için'],{color:'Doğal ahşap',specs:[['Yükseklik','20 cm'],['Malzeme','Ahşap'],['Kullanım','Dekoratif']]}],
    ['seramik-kupa','Sabah Seramik Kupa','seramik',390,450,24,null,['Elde rahat tutulan form','Mat dış yüzey','Günlük kahve ritüeli için'],{color:'Kırık beyaz',specs:[['Hacim','300 ml'],['Malzeme','Seramik'],['Kulp','Tekli']]}],
    ['keten-kirlent','Dokuma Keten Kırlent','tekstil',790,null,14,null,['Doğal keten dokusu','Çıkarılabilir kılıf','Nötr tonlarla kolay uyum'],{color:'Taş',specs:[['Ölçü','45 × 45 cm'],['Kılıf','Keten karışımı'],['Kapanış','Fermuarlı']]}],
  ]},
  beauty: { base:867000, name:'Bakım & kozmetik', path:'bakim-ritueli', brand:'Ritual', categories:[['temizleme','Temizleme','droplets'],['bakim','Yüz bakımı','sparkles'],['dudak-el','Dudak & el','heart'],['aksesuar','Rutin aksesuarları','bag']], products:[
    ['nazik-temizleyici','Nazik Yüz Temizleyici','temizleme',349,399,24,null,['Krem renk pompalı şişe','Günlük temizleme rutini','150 ml ambalaj'],{color:'Krem',unit:'150 ml',routineStep:'Temizle',skinType:'Günlük bakım',specs:[['Rutin adımı','Temizleme'],['Doku','Jel'],['Ambalaj','150 ml pompalı şişe']]}],
    ['nemlendirici','Günlük Nemlendirici','bakim',429,null,20,null,['Yumuşak krem dokusu','Mat kapaklı kavanoz','Günlük bakım seçkisi'],{color:'Kırık beyaz',unit:'50 ml',routineStep:'Nemlendir',skinType:'Günlük bakım',specs:[['Rutin adımı','Nemlendirme'],['Doku','Krem'],['Ambalaj','50 ml kavanoz']]}],
    ['yuz-yagi','Botanik Yüz Yağı','bakim',549,629,16,null,['Damlalıklı amber şişe','Yağ dokulu bakım ürünü','Az yer kaplayan 30 ml ambalaj'],{color:'Amber',unit:'30 ml',routineStep:'Tamamla',skinType:'Günlük bakım',specs:[['Rutin adımı','Tamamlayıcı bakım'],['Doku','Yağ'],['Ambalaj','30 ml damlalıklı şişe']]}],
    ['dudak-balmi','Dudak Balmı','dudak-el',179,null,35,null,['Küçük metal kutu','Çantada taşımaya uygun','Balm dokusu'],{color:'Açık pembe',unit:'15 ml',routineStep:'Tamamla',skinType:'Dudak bakımı',specs:[['Kullanım alanı','Dudak'],['Doku','Balm'],['Ambalaj','15 ml metal kutu']]}],
    ['el-kremi','Yumuşak Dokulu El Kremi','dudak-el',219,249,28,null,['Kompakt tüp ambalaj','Günlük el bakımına eşlik eder','Krem dokusu'],{color:'Krem',unit:'50 ml',routineStep:'Tamamla',skinType:'El bakımı',specs:[['Kullanım alanı','El'],['Doku','Krem'],['Ambalaj','50 ml tüp']]}],
    ['bakim-cantasi','Keten Bakım Çantası','aksesuar',390,null,18,null,['Fermuarlı ana göz','Keten dokulu kumaş','Küçük rutin ürünleri için'],{color:'Doğal keten',routineStep:'Düzenle',skinType:'Rutin aksesuarı',specs:[['Ölçü','22 × 14 × 9 cm'],['Malzeme','Keten karışımı'],['Kapanış','Fermuar']]}],
  ]},
  sport: { base:868000, name:'Spor & açık hava', path:'acik-hava-rotasi', brand:'Trail', categories:[['yuruyus','Yürüyüş','backpack'],['antrenman','Antrenman','activity'],['kamp','Kamp','tent'],['aksesuar','Aktif yaşam aksesuarları','bottle']], products:[
    ['sirt-cantasi','Rota 20 L Sırt Çantası','yuruyus',1490,1690,14,null,['20 litre ana hacim','Dışta matara cebi','Ayarlanabilir omuz askıları'],{color:'Orman yeşili',unit:'20 L',activity:'Yürüyüş',specs:[['Hacim','20 litre'],['Malzeme','Dokuma polyester'],['Askı','Ayarlanabilir']]}],
    ['yoga-mati','Denge Yoga Matı','antrenman',790,null,22,null,['Rulo yapılabilen form','Taşıma askısı','Günlük esneme alanı'],{color:'Adaçayı',activity:'Antrenman',specs:[['Ölçü','183 × 61 cm'],['Kalınlık','6 mm'],['Kullanım','Yer egzersizi']]}],
    ['celik-matara','Çelik Matara 750 ml','aksesuar',690,790,30,null,['Paslanmaz çelik gövde','Vidalı kapak','Yanında taşımaya uygun'],{color:'Mat siyah',unit:'750 ml',activity:'Günlük hareket',specs:[['Hacim','750 ml'],['Malzeme','Paslanmaz çelik'],['Kapak','Vidalı']]}],
    ['antrenman-havlusu','Mikrofiber Antrenman Havlusu','aksesuar',290,null,28,null,['Kompakt katlanan doku','Çantada az yer kaplar','Antrenman çantasına eşlik eder'],{color:'Gri',activity:'Antrenman',specs:[['Ölçü','80 × 40 cm'],['Malzeme','Mikrofiber'],['Sunum','Katlanabilir']]}],
    ['kamp-sandalyesi','Katlanır Kamp Sandalyesi','kamp',1890,2190,12,null,['Katlanır çerçeve','Kumaş oturma yüzeyi','Taşıma kılıfı'],{color:'Kum / siyah',activity:'Kamp',specs:[['Oturma yüksekliği','38 cm'],['Gövde','Metal'],['Aksesuar','Taşıma kılıfı']]}],
    ['kamp-feneri','Taşınabilir Kamp Feneri','kamp',890,null,20,null,['Tutma saplı gövde','Masa üstünde kullanım','Ayarlanabilir ışık kademesi'],{color:'Koyu yeşil',activity:'Kamp',specs:[['Işık','LED'],['Kullanım','Taşınabilir'],['Gövde','Tutma saplı']]}],
  ]},
  kids: { base:869000, name:'Çocuk & oyun', path:'kucuk-kesifler', brand:'Little Wonder', categories:[['oyun','Oyun arkadaşları','blocks'],['uretim','Üret & keşfet','palette'],['gundelik','Günlük eşlikçiler','backpack'],['oda','Çocuk odası','cloud']], products:[
    ['pelus-ayi','Yumuşak Peluş Ayı','oyun',590,690,20,null,['Yumuşak pelüş doku','Oturabilen ayıcık formu','Oyun köşesine bir arkadaş'],{color:'Bal rengi',ageGroup:'4–6 yaş',learningArea:'Hikâye kurma',specs:[['Boy','30 cm'],['Doku','Pelüş'],['Oyun alanı','Hikâye kurma']]}],
    ['yapboz','Renkli Şehir Yapbozu','uretim',390,null,24,null,['48 parçalık şehir sahnesi','Renkli taşıtlar ve evler','Kutulu sunum'],{color:'Çok renkli',unit:'48 parça',ageGroup:'6–8 yaş',learningArea:'Parça & bütün',specs:[['Parça','48'],['Tema','Şehir'],['Sunum','Karton kutu']]}],
    ['ahsap-bloklar','Renkli Ahşap Bloklar','oyun',690,790,18,null,['30 farklı renk ve biçim','Üst üste kurma oyunları','Saklama kutusu'],{color:'Çok renkli',unit:'30 parça',ageGroup:'4–6 yaş',learningArea:'Şekiller & kurma',specs:[['Parça','30'],['Malzeme','Ahşap'],['Oyun alanı','Kurma ve dizme']]}],
    ['mini-sirt-cantasi','Mini Keşif Sırt Çantası','gundelik',790,null,16,null,['Küçük eşyalara ana göz','Ayarlanabilir askılar','Hafif dokuma kumaş'],{color:'Gök mavisi',ageGroup:'4–6 yaş',learningArea:'Günlük düzen',specs:[['Hacim','8 litre'],['Malzeme','Dokuma kumaş'],['Askı','Ayarlanabilir']]}],
    ['desenli-battaniye','Bulut Desenli Battaniye','oda',890,990,14,null,['Bulut desenli yumuşak dokuma','Okuma köşesine eşlik eder','Katlanabilir hafif yapı'],{color:'Krem / mavi',ageGroup:'Oda aksesuarı',learningArea:'Dinlenme köşesi',specs:[['Ölçü','100 × 140 cm'],['Doku','Pamuk karışımı'],['Desen','Bulut']]}],
    ['boya-seti','Renk Atölyesi Boya Seti','uretim',490,null,26,null,['12 renk boya','Fırçalı kutu düzeni','Resim ve renk oyunları'],{color:'Çok renkli',unit:'12 renk',ageGroup:'6–8 yaş',learningArea:'Renklerle anlatım',specs:[['Renk','12'],['İçerik','Boya ve fırça'],['Oyun alanı','Resim']]}],
  ]},
};

function makeCatalog(family, definition) {
  const products = definition.products.map(([slug,name,category,price,oldPrice,stock,imageUrl,features,extra = {}],index) => {
    const id = definition.base + index + 1;
    const sizes = extra.sizes || [];
    const variants = sizes.map((size,variantIndex) => ({id:id * 10 + variantIndex + 1,size,stock:[5,8,4][variantIndex] || 3,price}));
    const image = imageUrl || `/media/sectors/${family}/${slug}.png`;
    return {
      id,slug:`${family}-${slug}`,name,categoryId:`sector-${family}-${category}`,categoryIds:[`sector-${family}-${category}`],department:definition.categories.find(item => item[0] === category)?.[1] || definition.name,
      family,brand:extra.brand || definition.brand,price,oldPrice,stock:variants.length ? variants.reduce((sum,variant) => sum + variant.stock,0) : stock,
      imageUrl:image,image:image,media:[{id:`${id}-main`,url:image,type:'image',isMain:true,sortOrder:0}],features,
      description:features.join('. ') + '.',specs:(extra.specs || []).map(([label,value]) => ({label,value})),color:extra.color || '',storage:extra.storage || null,unit:extra.unit || 'adet',
      choices:{sizes},variants,rating:0,reviews:0,badge:oldPrice ? 'Seçki fırsatı' : 'Yeni seçki',featuredRank:index+1,
      ...Object.fromEntries(['routineStep','skinType','activity','ageGroup','learningArea'].filter(key=>extra[key]).map(key=>[key,extra[key]])),
      collectionSlugs:oldPrice ? ['firsatlar','yeni-sezon'] : ['yeni-sezon'],active:true,customerVisible:true,deletedAt:null,fastDelivery:false,
    };
  });
  const categories = definition.categories.map(([slug,name,icon],index) => ({
    id:`sector-${family}-${slug}`,name,slug,parentId:null,path:`${definition.path}/${slug}`,canonicalPath:`${definition.path}/${slug}`,depth:1,sortOrder:index+1,
    imageUrl:products.find(product => product.categoryId === `sector-${family}-${slug}`)?.imageUrl || '',icon,active:true,customerVisible:true,archived:false,
    attributes:Object.fromEntries(['routineStep','skinType','activity','ageGroup','learningArea'].map(key=>[key,[...new Set(products.filter(product=>product.categoryId===`sector-${family}-${slug}`).map(product=>product[key]).filter(Boolean))]]).filter(([,values])=>values.length)),
  }));
  const variants = products.flatMap(product => product.variants.map(variant => ({
    ...product,...variant,parentId:product.id,parentSlug:product.slug,parentName:product.name,slug:`${product.slug}-${variant.size.toLowerCase()}`,name:`${product.name} · ${variant.size} beden`,
    customerVisible:false,isVariant:true,choices:{sizes:[]},variants:[],options:{Beden:variant.size},
  })));
  return freeze({family,name:definition.name,products,categories,variants});
}
export const SECTOR_CATALOGS = freeze(Object.fromEntries(Object.entries(definitions).map(([family,definition]) => [family,makeCatalog(family,definition)])));
export const SECTOR_FAMILIES = freeze(Object.keys(SECTOR_CATALOGS));
export function getSectorCatalog(family) { return SECTOR_CATALOGS[family] || null; }
export function getSectorProducts(family, {includeVariants = false} = {}) { const catalog=getSectorCatalog(family);return catalog ? includeVariants ? [...catalog.products,...catalog.variants] : catalog.products : []; }
export const SECTOR_ASSET_REQUIREMENTS = freeze(Object.values(SECTOR_CATALOGS).flatMap(catalog => catalog.products.filter(product => product.imageUrl.startsWith('/media/sectors/')).map(product => ({family:catalog.family,productId:product.id,name:product.name,path:product.imageUrl,color:product.color}))));
