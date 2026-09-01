# First-Sale External Gate Ledger

Tarih: 1 Eylül 2026

Bu ledger kod hazırlığını dış gerçeklikten ayırır. Yalnız aşağıdaki kategori
değerleri kullanılır:

- CODE_READY
- OWNER_COMPANY_DATA_REQUIRED
- OWNER_LEGAL_REVIEW_REQUIRED
- PUBLIC_DEPLOYMENT_REQUIRED
- EXTERNAL_PAYTR_APPLICATION
- EXTERNAL_PAYTR_CREDENTIAL
- EXTERNAL_PAYMENT_UAT
- POST_LAUNCH_ALLOWED

## Aktif ledger

| Gate | Kategori | Durum | Sorumlu kaynak | Kapanış kanıtı |
|---|---|---|---|---|
| Customer auth/account/address ownership | CODE_READY | READY_IN_CODE | Customer/backend | Targeted auth ve IDOR regression |
| Server-authoritative fiyat/stok/kupon | CODE_READY | READY_IN_CODE | Backend | Checkout pricing/stock regression |
| Agreement version/hash acceptance | CODE_READY | READY_IN_CODE | Backend | Preview/acceptance/initialize hash regression |
| PayTR config absent fail-closed | CODE_READY | READY_IN_CODE | Backend | Capability false, init 503, DB mutation 0 |
| Callback signature/tutar/ref/idempotency | CODE_READY | READY_IN_CODE | Backend | Mock security regression; provider UAT ayrı |
| Browser return payment authority | CODE_READY | READY_IN_CODE | Customer/backend | PAID yalnız callback sonrası |
| BusinessIdentity single source/placeholder allowlist | CODE_READY | READY_IN_CODE | Backend | Unknown/unresolved placeholder publication failure |
| Approved seller public legal identity snapshot | CODE_READY | READY_IN_CODE | Backend/Admin contract | Organization-bound seller identity regression |
| Production artifact forbidden-reference gate | CODE_READY | READY_IN_CODE | Customer build | Deterministic cutover build; HTML + served runtime closure için 16 rule ailesinde exact zero ve negatif mutation kanıtı |
| Gerçek platform şirket kimliği | OWNER_COMPANY_DATA_REQUIRED | OPEN | Owner/company registry | OWNER-BUSINESS-IDENTITY-INPUT alanları doğrulandı ve runtime'a sağlandı |
| Seller public legal identity owner data | OWNER_COMPANY_DATA_REQUIRED | OPEN | Seller + Admin approval owner | Her aktif seller organization için approved/versioned public identity |
| 12 public legal metin | OWNER_LEGAL_REVIEW_REQUIRED | OPEN | Owner/profesyonel hukuk | Her rota için onaylı TEXT, VERSION ve exact APPROVED=true |
| Marketplace/aracı hizmet sağlayıcı rol metni | OWNER_LEGAL_REVIEW_REQUIRED | OPEN | Owner/profesyonel hukuk | Onaylı marketplace disclosure |
| Seller Agreement kapsamı | OWNER_LEGAL_REVIEW_REQUIRED | OPEN | Owner/profesyonel hukuk/Seller operations | Seller-facing onay, sürüm ve yayın kararı |
| İade/cayma/teslimat süreleri ve istisnalar | OWNER_LEGAL_REVIEW_REQUIRED | OPEN | Owner/profesyonel hukuk/operations | Onaylı politika ve operasyon eşleşmesi |
| novastore.tr Customer/backend yayını | PUBLIC_DEPLOYMENT_REQUIRED | OPEN | Domain/deployment owner | HTTPS, DNS, certificate, health ve browsing kanıtı |
| Production database ve migration | PUBLIC_DEPLOYMENT_REQUIRED | OPEN | Database/release owner | Backup, target attestation, TLS, migration ve rollback onayı |
| Public logging/metrics/alerts | PUBLIC_DEPLOYMENT_REQUIRED | OPEN | Operations/security | Redaction, retention, alarm ve incident test kanıtı |
| PayTR Pazaryeri başvurusu/ürün modeli | EXTERNAL_PAYTR_APPLICATION | OPEN | Owner + PayTR | Provider yetkili başvuru/onay kaydı |
| Seller/komisyon/transfer/settlement contract | EXTERNAL_PAYTR_APPLICATION | OPEN | Owner/finance + PayTR | Yazılı provider ürün/sözleşme doğrulaması |
| Merchant ID/key/salt ve panel URL kaydı | EXTERNAL_PAYTR_CREDENTIAL | OPEN | PayTR + secret/deployment owner | Secret değeri göstermeyen injection/panel eşleşme kanıtı |
| Provider success/fail/security UAT | EXTERNAL_PAYMENT_UAT | OPEN | PayTR UAT + release/security | FIRST-REAL-PAYMENT-UAT-RUNBOOK redakte edilmiş sonuçları |
| Refund/partial refund/chargeback UAT | EXTERNAL_PAYMENT_UAT | OPEN | PayTR/finance/operations | Provider contract ve yetkili UAT sonucu |
| Düşük tutarlı ilk gerçek ödeme | EXTERNAL_PAYMENT_UAT | NOT_AUTHORIZED | Owner/finance/release/security | Ayrı açık owner go/no-go; test-mode başarısı yeterli değil |
| Web Push aktivasyonu | POST_LAUNCH_ALLOWED | DEFERRED_BY_DEFAULT | Notification owner | Ayrı launch kararı, VAPID secret ve worker operations |
| Production havale/EFT | POST_LAUNCH_ALLOWED | DISABLED_FAIL_CLOSED | Finance/owner | Gerçek hesap, mutabakat, reconciliation ve ayrı release |
| Gelişmiş observability entegrasyonu | POST_LAUNCH_ALLOWED | PLANNED | Operations/security | Vendor/retention/alerting kararı |

## Açık kapı özeti

| Kategori | Açık/ayrı onay bekleyen satır |
|---|---:|
| CODE_READY | 9 kaynak sözleşmesi final doğrulandı |
| OWNER_COMPANY_DATA_REQUIRED | 2 |
| OWNER_LEGAL_REVIEW_REQUIRED | 4 |
| PUBLIC_DEPLOYMENT_REQUIRED | 3 |
| EXTERNAL_PAYTR_APPLICATION | 2 |
| EXTERNAL_PAYTR_CREDENTIAL | 1 |
| EXTERNAL_PAYMENT_UAT | 3 |
| POST_LAUNCH_ALLOWED | 3 |

Bu sayımlar operasyon takip satırlarıdır; örneğin 12 hukuk belgesi tek gate
satırında gruplanmıştır. Final rapordaki owner/external gate sayımı farklı bir
sayım kuralı kullanıyorsa kural açıkça belirtilmelidir.

Bu R3 final raporu ledger-satırı kuralını kullanır: şirket kimliği `2`, owner
hukuk `4`, PayTR/application/credential/provider-UAT toplamı `6` satırdır.
Hukuk belge sayısı ayrıca `12`, zorunlu platform BusinessIdentity alan sayısı
ayrıca `9` olarak raporlanır.

## İlk satış karar kuralı

FIRST_SALE_CODE_READINESS ancak bütün CODE_READY satırları final testte
doğrulandığında GO_WITH_EXTERNAL_GATES olabilir. Bu ifade gerçek satışa izin
vermez.

Gerçek ilk satış için aşağıdakilerin tamamı kapanmalıdır:

1. Owner şirket ve seller kimliği,
2. owner/profesyonel hukuk onayı,
3. public deployment ve operations,
4. PayTR application/product contract,
5. credential injection,
6. provider UAT,
7. ayrı açık owner gerçek ödeme yetkisi.

Mevcut dış durum:

- PUBLIC_NOVASTORE_TR_DEPLOYMENT: NOT_DONE
- PAYTR_APPLICATION: NOT_SUBMITTED
- PAYTR_CREDENTIAL: NOT_PROVIDED
- PROVIDER_UAT: NOT_DONE
- REAL_PAYMENT: NOT_AUTHORIZED
