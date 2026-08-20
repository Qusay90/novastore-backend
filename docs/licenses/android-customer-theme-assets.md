# Android müşteri teması varlık ve lisans kaydı

Bu kayıt, Tur 1 ortak müşteri bileşenlerinde kullanılan yerel font ve vektör
ikonların yeniden üretilebilir kaynağını belgeler. Özgün tasarım fontu ve vektör
exportları devir paketinde bulunmadığı için seçimler, kanonik 1080 px PNG üzerinde
aynı viewport ve fiziksel ölçekte yapılan karşılaştırmalı bake-off sonucudur.

## Fontlar

| Kullanım | Aile / sürüm | Yerel dosya | Ağırlık | Lisans | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| Alt bar etiketi ve rozet | Inter 4.001 (`git-9221beed3`, Inter 4.1 dağıtımı) | `inter_regular.ttf` | 400 | SIL OFL 1.1 | `40D692FCE188E4471E2B3CBA937BE967878F631AD3EBBBDCD587687C7EBE0C82` |
| Alt bar etiketi ve rozet | Inter 4.001 (`git-9221beed3`, Inter 4.1 dağıtımı) | `inter_medium.ttf` | 500 | SIL OFL 1.1 | `97AD806F526E41546D46365BB3A393145F75B7B1568913DB74549AD8B8DBA872` |
| Alt bar etiketi ve rozet | Inter 4.001 (`git-9221beed3`, Inter 4.1 dağıtımı) | `inter_semibold.ttf` | 600 | SIL OFL 1.1 | `78A843FADE9D4612A5567302FB595B56976EB5FCEBF4FEA5A5912D638BAFCDE3` |
| Üst bar yedek ağırlığı | Lato 2.015 | `lato_medium.ttf` | 500 | SIL OFL 1.1 | `D3AC182A6833E005745DD75679FBAD081C0B12535DF4E93AD8ED57817A31A338` |
| Üst bar başlığı | Lato 2.015 | `lato_semibold.ttf` | 600 | SIL OFL 1.1 | `71B8B7DECBE75A881ED267BE539D402BD1E9420B799658AADA4E0D1BD5AF803C` |

Kaynaklar:

- Inter: `https://github.com/rsms/inter/releases/tag/v4.1`
- Lato ve karşılaştırma adayları: Google Fonts
  `078cf31696903a69875d49b706b01aa964db93d4`
- İlgili OFL metinleri: `app/src/debug/res/font/licenses`

Kilitli tipografi:

| Bileşen | Aile | Weight | Size | Letter spacing | Line height |
| --- | --- | ---: | ---: | ---: | ---: |
| Alt bar etiketi | Inter | 500 | 7.05 sp | 0.02 sp | 9 sp |
| Sepet rozeti | Inter | 400 | 8.5 sp | 0 sp | 9.5 sp |
| Üst bar başlığı | Lato | 600 | 17.8 sp | 0 sp | 22 sp |

Poppins, Inter, Roboto, Lato, Manrope ve platform sans aynı metinlerle
1080 × 2400 / 420 dpi debug fixture içinde karşılaştırıldı. Alt etiketlerde
Inter; `Siparişlerim` başlığında Lato SemiBold, görünür kutu, ağırlık ve baseline
bakımından en yakın sonucu verdi. Üretim bileşenleri yalnız yerel
`app/src/main/res/font` dosyalarını kullanır; sessiz sistem fontu fallback'i ve
bitmap metin yoktur.

## İkonlar

| Hedef | Resmî kitaplık / ikon / varyant | Commit | Lisans | ViewBox | Fixture ölçek ve optik ofset |
| --- | --- | --- | --- | --- | --- |
| Geri | Phosphor `caret-left` regular | `2b75f3ad12b420c9504ef05df8d2564a28f8500e` | MIT | 256 × 256 | 22 dp; +1.25 dp x, -0.55 dp y |
| Ana Sayfa | Phosphor `house` light | `2b75f3ad12b420c9504ef05df8d2564a28f8500e` | MIT | 256 × 256 | 22 dp; 1.0 / 0,0 |
| Ana Sayfa seçili | Phosphor `house` fill | `2b75f3ad12b420c9504ef05df8d2564a28f8500e` | MIT | 256 × 256 | 22 dp; 1.0 / 0,0 |
| Kategoriler | Phosphor `circles-four` regular | `2b75f3ad12b420c9504ef05df8d2564a28f8500e` | MIT | 256 × 256 | 1.07 / +0.38,+0.38 dp |
| Favoriler | Iconoir `heart` regular | `10a66d02c6e3c94437bbf268352b1652e9eae7e5` | MIT | 24 × 24 | 0.914 / +0.76,+0.76 dp |
| Sepetim | Phosphor `handbag-simple` regular | `2b75f3ad12b420c9504ef05df8d2564a28f8500e` | MIT | 256 × 256 | 0.80 x, 1.0 y / +1.50,+1.51 dp |
| Destek | Phosphor `chat-circle` light | `2b75f3ad12b420c9504ef05df8d2564a28f8500e` | MIT | 256 × 256 | 1.0 / +1.50,+1.14 dp |
| Hesabım | Lucide `user` regular | `75b6ac1969d7fd9c921b88eec63633e42a097ea4` | ISC | 24 × 24 | 0.948 / +1.50,+0.76 dp |
| Hesabım seçili | Tabler `user` filled | `fe319f05d943a17efb29c5089e21364d3975843c` | MIT | 24 × 24 | ikon 1.10 / 0,+3.40 dp; yüzey 1.053 x, 1.079 y / 0,+4.76 dp |

Seçili Ana Sayfa balonu fixture içinde -2.37 dp; seçili Hesabım balonu +5 dp
optik x düzeltmesi kullanır. Hesabım seçili durumunda turuncu gösterge +6.1 dp,
etiket +3.4 dp y düzeltmesine sahiptir. Bunlar vektör asset'i değiştirmez ve aynı
global ikonun ekranlar arasında farklı kopyalarını üretmez.

Kanonik Ana Sayfa 1080 px kırpmasındaki görünür ikon kutuları:

| İkon | Kaynak kutusu (x1,y1–x2,y2) | Uygulama kutusu (x1,y1–x2,y2) |
| --- | --- | --- |
| Ana Sayfa seçili | 133,91–174,132 | 133,89–174,132 |
| Kategoriler | 308,103–348,143 | 308,102–349,143 |
| Favoriler | 459,103–504,144 | 458,103–505,144 |
| Sepetim | 616,101–655,145 | 616,101–655,145 |
| Destek | 766,101–810,145 | 766,102–811,147 |
| Hesabım | 923,101–958,145 | 922,101–957,146 |

Kanonik `Siparişlerim` kırpmasında geri ikonu hem kaynakta hem uygulamada
102,70–122,109 görünür kutusundadır.

Kanonik Hesabım seçili durumunda koyu balon yüzeyinin bağlı bileşen kutusu
kaynakta 855,55–1014,218; uygulamada 854,55–1013,218'dir.

Kaynak kitaplıklar:

- Phosphor Icons: `https://github.com/phosphor-icons/core`
- Iconoir: `https://github.com/iconoir-icons/iconoir`
- Lucide: `https://github.com/lucide-icons/lucide`
- Tabler Icons: `https://github.com/tabler/tabler-icons`

Android vector drawable dosyalarındaki başlık yorumları, kullanılan kitaplık,
varyant, commit ve lisansı ayrıca taşır. Vektörler resmî kitaplık yollarından
türetilmiştir; serbest el çizim veya üretim ekran görüntüsü kullanılmamıştır.
