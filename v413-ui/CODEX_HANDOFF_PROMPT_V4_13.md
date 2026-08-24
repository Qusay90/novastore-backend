> **TARİHSEL / SUPERSEDED:** Bu prompt güncel değildir. `CODEX_CONTINUATION_PROMPT_AFTER_V4_12_13_2026-08-13.md` kullanılmalıdır.

# Codex’e verilecek prompt

```text
NOVASTORE CUSTOMER APP — A’DAN Z’YE PRODUCTION RECONCILIATION, INTEGRATION VE RELEASE-GATE PROGRAMI

AMAÇ
NovaStore müşteri uygulamasındaki V4.13 görsel/etkileşim sözleşmesini koruyarak bütün local/mock/demo davranışları gerçek NovaStore altyapısıyla uzlaştır. Çalışmayan/no-op kontrolleri ve yanlış route/domain bağlarını düzelt; eksik auth, backend, veri, güvenlik, ödeme, stok, sipariş, mağaza, UGC, bildirim ve destek katmanlarını fazlı ve fail-closed biçimde tamamla.

ÖNCE OKU
- android-customer-visual-calibration-v4_1/AGENTS.md
- android-customer-visual-calibration-v4_1/NOVASTORE_A_Z_AUDIT_V4_13.md
- android-customer-visual-calibration-v4_1/src/Prototype.tsx
- android-customer-visual-calibration-v4_1/src/prototype.css
- android-customer-visual-calibration-v4_1/tests/
- Ana repository’deki AGENTS.md / SECURITY.md / migration / connector talimatları

KRİTİK SINIR
Bu prototip production domain katmanı değildir. Favori, sepet, adres, kart metadata’sı, review, soru, bildirim, filtre, store follow ve checkout burada React state’tedir. Ana backend’de hiçbir yetenek olmadığını varsayma. Önce gerçek repository, servis, endpoint, tablo, migration, auth ve PSP altyapısını kanıtla. Mevcut sistemi kopyalama; paralel ikinci auth/order/payment sistemi kurma. Stocky/vendor core varsa mümkün olduğunca değiştirme; NovaStore’u mevcut güvenli connector/BFF sınırı üzerinden bağla.

FAZ 0 — ZORUNLU SALT OKUNUR UZLAŞTIRMA
1. Repo, branch, HEAD, worktree, remote, AGENTS ve SECURITY talimatlarını raporla.
2. Gerçek Android müşteri uygulaması, backend/BFF, auth, DB migrations, seller/admin connector, PSP, search ve event altyapısını bul.
3. Şu alanları kaynak dosya + endpoint + migration + test kanıtıyla EXISTS / PARTIAL / ABSENT / CONFLICTING sınıflandır:
   auth/session/MFA/consent;
   profile/address;
   catalog/product/variant/offer/store;
   seller isolation;
   search/filter/sort;
   favorites/cart/guest merge;
   quote/price/coupon/shipping;
   inventory/reservation;
   PSP tokenization/3DS/webhooks;
   orders/state machine;
   shipment/invoice/return/refund;
   reviews/purchase eligibility;
   private pending questions/seller answers;
   notifications/device tokens;
   support/chat/attachments/NovaBot;
   audit/idempotency/outbox/inbox/observability.
4. Gerçek servis veya repo erişimi yoksa implementation yapma; BLOCKED raporu ver.

KORUNACAK V4.13 UI SÖZLEŞMESİ
- Favorites referanslı ortak ProductCard bütün yüzeylerde aynı geometriyi kullanır.
- Store hero alt sınırı logo merkezine ulaşır; store adı yanında/arkasında çizgi yoktur.
- Store search raw input focus ring çizmez; placeholder focus’ta kaybolur, caret kalır, yalnız rounded shell hafif değişir.
- Store filter/sort kompakt ikon kontrolleridir; erişilebilir ad, aktif count ve sheet davranışı korunur.
- PDP media/detail aynı x-width çizgisindedir; boş seam yoktur; beyaz cap tek sürekli responsive Bézier dalgadır.
- Viewer 1× drag-release sonrası tam merkez baseline’a döner; page change stale transformu temizler; 1×–4× zoom ve bounds içi pan çalışır; açılırken klavye kapanır.
- Review yalnız verified-purchase etiketi yeşil olacak şekilde avatar + maskeli koyu ad kullanır.
- Verified buyer review anında yayınlanır; “incelemeye alındı” metni yoktur.
- Pending soru yalnız sahibi ve seller’a görünür; yanıtlanınca public Q&A olur.
- Checkout yalnız kart ödeme UI’sı gösterir; neutral selected state ve çalışan CVV eye korunur. CVV saklanmaz.

İLK İŞLEVSEL DÜZELTME BACKLOG’U
1. CAL bazlı route/tab/view allowlist kur; geçersiz kombinasyonları kanonik URL’ye replace et.
2. Görünür enabled no-op bırakma; modal/sheet arkasını inert yap.
3. Product detayını productId/SKU’ya göre gerçek kategori, variant, specs, policy, seller ve store verisiyle ayır.
4. Store route’una storeId ekle; yalnız o seller’ın profil ve ürünlerini göster; PDP→Store→PDP geri dönüş state’ini koru.
5. Order/notification/account activity → doğru product/order/store kimliğini taşı.
6. Search vaadini gerçek ürün/kategori/marka/facet davranışıyla eşleştir.
7. Hesabım reviews/questions ekranlarını ortak gerçek state/API’ye bağla.
8. Share ve clipboard eylemlerini gerçek platform API’siyle, hata/fallback ile tamamla.
9. Demo kalacak yüzeyleri production build’inde feature flag veya açık demo etiketiyle ayır.

BAĞLAYICI GÜVENLİK KURALLARI
- Kimlik yalnız doğrulanmış token subject’inden gelir; client userId/ownerId güvenilir değildir.
- Her object endpoint deny-by-default owner/tenant/store scope uygular.
- Customer, seller, admin ve service-principal yetkileri ayrıdır.
- Client price, discount, stock, total, verified, seller score veya payment success kabul edilmez.
- Pending soru başka müşteriye API body/cache/client state olarak serialize edilmez.
- PAN/CVV/parola/access-refresh token backend, DB, log, analytics, crash, support veya bot bağlamına girmez.
- Saved card yalnız PSP token + brand + last4 + expiry + nickname saklar.
- Para integer minor unit + ISO-4217 currency’dir.
- Quote server-authoritative, süreli ve user/cart/address bağlamına kilitlidir.
- Order aynı quote’u bir kez tüketir.
- Payment/order/inventory ve miktar değiştiren mutasyonlar idempotenttir.
- PSP/carrier webhook imzası doğrulanır; provider event ID ile dedupe edilir.
- Transaction + outbox/inbox ile order/payment/stock/notification uzlaştırılır.
- Production secret, migration apply, deploy, merge veya gerçek tahsilat ayrı açık yetki olmadan yapılmaz.

UYGULAMA FAZLARI
F1 identity/authz/platform foundation.
F2 catalog/store/search read path.
F3 profile/address/favorite/cart/follow/notification persistence.
F4 quote/promotion/inventory/payment/order critical path.
F5 shipment/invoice/return/refund.
F6 review/question privacy + notification delivery.
F7 support/chat/attachment/NovaBot.
F8 mobile adapters, de-mocking, loading/error/offline states, observability, rollout and rollback.

HER FAZDA ZORUNLU
- Önce plan ve risk; sonra yalnız o fazın küçük, geri alınabilir patch’i.
- API/OpenAPI DTO + error envelope.
- Migration + rollback.
- Authorization invariants ve IDOR testleri.
- Idempotency/retry/event semantics.
- Unit/integration/contract/E2E/security test kanıtı.
- Loading/error/empty/offline UI.
- Exact changed files, remaining blockers, commit/push/deploy durumu.
- Her faz sonunda build/runtime/UI regression.

KRİTİK KABUL TESTLERİ
- Invalid route canonicalization ve screen/header/bottom-tab eşleşmesi.
- Her enabled control için beklenen outcome; no-op sayısı 0.
- Correct productId/storeId/orderId propagation.
- Cross-user/cross-seller IDOR matrix.
- Expired/revoked session ve logout sonrası refresh reddi.
- Guest cart merge ve multi-device concurrency.
- Client price/total/coupon tampering.
- Last-stock concurrency ve oversell önleme.
- 3DS success/fail/cancel/timeout; webhook replay/dedupe.
- PAN/CVV log/DB/analytics scan temiz.
- Payment/order/cart/stock consistency.
- Non-buyer review 403; verified buyer review immediate public; retry duplicate yok.
- Pending question body/cache leak yok; seller A seller B thread’e erişemez.
- Tek event → tek notification.
- Support reconnect/dedupe, upload security, cross-account isolation.
- 320–480 px visual regression, Android E2E ve native accessibility.

ÇIKTI FORMATIN
RESULT:
BASELINE_REPO_BRANCH_HEAD_WORKTREE:
ACTUAL_EXISTING_CAPABILITIES:
ABSENT_PARTIAL_CONFLICTING:
ROUTE_CONTROL_MANIFEST:
AUTHORIZATION_MATRIX:
DATA_MODEL_AND_MIGRATIONS:
API_CONTRACTS:
IDEMPOTENCY_AND_EVENTING:
PAYMENT_PCI_BOUNDARY:
IMPLEMENTED_THIS_PHASE:
TEST_EVIDENCE:
SECURITY_FINDINGS:
OBSERVABILITY:
REMAINING_BLOCKERS:
NEXT_PHASE:
CHANGED_FILES:
COMMIT:
PUSH:
DEPLOY:

Şimdi yalnız Faz 0’ı tamamla. Kanıtlı uzlaştırma raporunu vermeden implementation’a geçme.
```
