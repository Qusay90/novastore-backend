# NovaStore Ticari ve Operasyonel Partner Playbook

Bu dokuman, canliya cikis oncesinde kiminle ne zaman, hangi hedefle gorusulecegini ve sozlesme kapanis kriterlerini netlestirir.

## 1) Roller ve Sahiplik
- Kurucu: nihai ticari kararlar, fiyat/komisyon pazarligi, sozlesme onayi.
- Teknik Sorumlu: API kapsam ve teknik UAT takibi.
- Operasyon Sorumlusu: kargo SLA, iade operasyonu, destek surecleri.
- Mali Musavir: valör, mutabakat, fatura ve vergi uyumu.
- Avukat: KVKK ekleri, hizmet sozlesmeleri, sorumluluk maddeleri.

## 2) Partner Goruşme Takvimi

### 9-15 Mart - RFP ve Teklif Toplama
1. Odeme partneri (iyzico)
- Talep: MDR/komisyon, taksit maliyeti, valör (T+X), chargeback sureci, 3DS zorunlulugu, iade API.
- Cikis: yazili teklif + test hesap + teknik entegrasyon kisisi.

2. Kargo partneri (Yurtici Kargo)
- Talep: desi tablosu, il/ilce SLA, pickup cutoff, tersine lojistik, hasar/kayip tazmin.
- Cikis: fiyat tablosu + SLA + operasyon akis dokumani.

3. e-Fatura/e-Arsiv partneri
- Talep: API kapsam, kota, belge iptal/iade akislari, saklama sureleri.
- Cikis: test ortami + entegrasyon kiti + SLA.

### 16-22 Mart - Sozlesme Kapanis
1. Odeme sozlesmesi
- Zorunlu maddeler: chargeback sorumluluk matrisi, fraud kurallari, kesinti takvimi, teknik kesinti SLA.
- Cikis kriteri: imzali sozlesme + production onayi sureci baslatildi.

2. Kargo sozlesmesi
- Zorunlu maddeler: gecikme cezasi/SLA, iade kargo ucreti, hasar tutanak sureci.
- Cikis kriteri: musteri kodu aktif + test barkod uretebilir durumda.

3. Fatura sozlesmesi
- Zorunlu maddeler: e-arsiv/e-fatura gecis kosullari, iptal/iade belge sureleri.
- Cikis kriteri: test belgeleri basarili.

## 3) Toplanti Sablonu
Her partner gorusmesinde asagidaki sablon kullanilir:
- Gorusme Amaci:
- Beklenen Hacim (aylik siparis / AOV / iade orani):
- Teknik Gereksinimler:
- SLA Beklentisi:
- Fiyat Beklentisi:
- Risk Notlari:
- Aksiyonlar ve Son Tarih:

## 4) Kirmizi Cizgiler
- Odeme tarafinda callback/webhook olmadan production gecisi yok.
- Kargo tarafinda takip no + iade sureci yazili olmadan canliya cikis yok.
- e-Fatura tarafinda iptal/iade belge akislari dogrulanmadan canliya cikis yok.
