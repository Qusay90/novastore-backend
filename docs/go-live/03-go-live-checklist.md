# NovaStore Go-Live Readiness Checklist (14 Temmuz 2026 durumu)

Durum: **NO-GO**. Bu liste production, uzak DB, migration, gercek odeme veya deploy yetkisi vermez.

## A) Ticari Hazirlik
- [ ] iyzico sozlesmesi imzali, production hesabı aktif.
- [ ] Yurtici Kargo musteri kodu aktif, test barkod basarili.
- [ ] e-Fatura/e-Arsiv test belgeleri basarili, mali musavir onayi alindi.

## B) Teknik Hazirlik
- [x] Siparis/payment callback yasam dongusu fake-pool ve statik kontratlarla fail-closed hale getirildi.
- [x] Admin iptali ve manuel kargo devri varsayilan kapali capability/kill-switch arkasinda eklendi.
- [ ] Guncel masaustu/mobil browser, console ve network UAT'i tamamlandi.
- [ ] Commerce Pro legacy parity, feature flag cutover ve rollback provasi tamamlandi.
- [ ] Commerce schema migrationlari production veritabaninda uygulandi.
- [ ] Gercek odeme initialize + imzali webhook testleri onayli staging'de gecti; mock/test-token implementasyonlari kaldirildi.
- [ ] Gercek tasiyici adapteri, label ve tracking callback staging UAT'i gecti. Manuel devir kaydi bu maddeyi karsilamaz.
- [ ] `RETURN_WRITES_DISABLED` ancak iade, provider refund, stok hareketi ve reconciliation zinciri testlerinden sonra kontrollu yeni kontratla degistirildi.
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
