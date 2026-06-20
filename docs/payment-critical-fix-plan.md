# NovaStore Kritik Odeme Duzeltme Plani

Bu turda amac tum denetim raporunu kapatmak degil, kalan kullanimla sadece odeme akisindaki en kritik ve dar kapsamli bloklayicilari gidermektir.

## Kapsam

1. NS-01 mobil odeme payload uyumsuzlugu
   - Android tarafinda odeme istegindeki sepet urun kimligi backend sozlesmesine uygun hale getirilecek.
   - Backend fiyatlandirma katmani `id`, `product_id` ve `productId` alanlarini geriye donuk uyumlu sekilde normalize edecek.
   - Sepet/odeme disindaki alanlara dokunulmayacak.

2. Android odeme formu ve `Odemeyi Tamamla` butonu
   - Butonun aktiflik kosullari kart bilgileri, telefon, teslimat bilgileri, adres ve sepet/toplam durumuyla uyumlu hale getirilecek.
   - Eksik alanlarda kullaniciya dogru hata mesaji gosterilecek.
   - Tum gerekli alanlar doluyken odeme baslatma endpointine istek atilmasi korunacak.

3. NS-04 client webhook minimum guvenlik guardi
   - Gercek Iyzico/Stripe/PayTR entegrasyonu yapilmayacak.
   - Production ortaminda client tarafindan imzasiz webhook cagrisi kabul edilmemesi icin backend guard eklenecek.
   - Mock/test akisi development/test ortamiyla sinirlanacak.

## Bilerek Yapilmayacaklar

- Odeme baslatma ile siparis finalization mimarisi bastan yazilmayacak.
- Gercek odeme saglayici entegrasyonu yapilmayacak.
- Adres, favori, sepet server-side senkronizasyonu kurulmayacak.
- Socket auth, token guvenligi, SMS/e-posta/2FA, kupon ve kayitli odeme yontemi konularina girilmeyecek.
- Yeni paket, migration, deploy, gercek odeme, gercek SMS, gercek e-posta veya gercek siparis olusturulmayacak.

## Test Plani

- `.\gradlew.bat testDebugUnitTest --no-daemon`
- `.\gradlew.bat assembleDebug --no-daemon`
- Varsa odeme/checkout ile ilgili backend smoke veya unit testleri
- Backend baslatmak migration/schema hazirlama tetikliyorsa canli endpoint testi yapilmayacak ve raporda belirtilecek.
