# NovaStore Go-Live Checklist (3 Mayis 2026 Hedefi)

## A) Ticari Hazirlik
- [ ] iyzico sozlesmesi imzali, production hesabı aktif.
- [ ] Yurtici Kargo musteri kodu aktif, test barkod basarili.
- [ ] e-Fatura/e-Arsiv test belgeleri basarili, mali musavir onayi alindi.

## B) Teknik Hazirlik
- [ ] Commerce schema migrationlari production veritabaninda uygulandi.
- [ ] Odeme initialize + webhook testleri gecti.
- [ ] Kargo olusturma + takip/ETA akislari gecti.
- [ ] Iade talepleri kullanici ve admin yetki kontrolleri gecti.
- [ ] Checkout kupon/kampanya hesaplamasi backend ile uyumlu.
- [ ] Merchant feed (`/merchant/feed.xml`) dogrulandi.

## C) Operasyonel Hazirlik
- [ ] Destek ekibi icin durum mesaji ve iade scriptleri hazir.
- [ ] Gunluk uzlastirma rutini (odeme/kargo/fatura) sahibi belli.
- [ ] Incident owner ve on-call listesi yazili.

## D) Go/No-Go Metrikleri
- [ ] Odeme basari orani >= %90 (ilk hafta hedef)
- [ ] P0 bug sayisi = 0
- [ ] Siparis-kargo-fatura tutarliligi >= %98
- [ ] Bildirim teslim basarisi >= %99

## E) Rollback Karari Gerektiren Durumlar
- [ ] Webhook dogrulama kesilmesi
- [ ] Stok dusum/geri yukleme tutarsizligi
- [ ] Kargo etiketi veya takip olusturmada toplu hata
- [ ] Fatura servis kesintisi > 60 dk
