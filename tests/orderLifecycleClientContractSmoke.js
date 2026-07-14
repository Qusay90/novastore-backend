const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

const adminSource = read('frontend', 'admin.html');
const apiSource = read('app', 'src', 'main', 'java', 'com', 'novastore', 'app', 'core', 'network', 'NovaStoreApi.kt');
const modelSource = read('app', 'src', 'main', 'java', 'com', 'novastore', 'app', 'data', 'model', 'AccountModels.kt');
const repositorySource = read('app', 'src', 'main', 'java', 'com', 'novastore', 'app', 'data', 'repository', 'AccountRepository.kt');
const accountScreenSource = read('app', 'src', 'main', 'java', 'com', 'novastore', 'app', 'feature', 'notifications', 'NotificationsScreen.kt');
const accountViewModelSource = read('app', 'src', 'main', 'java', 'com', 'novastore', 'app', 'feature', 'notifications', 'NotificationsViewModel.kt');
const profileSource = read('frontend', 'profile.html');

assert.doesNotMatch(adminSource, /onclick="deleteOrder\(/, 'admin sipariş tablosu hard-delete sunmamalı');
assert.doesNotMatch(adminSource, /async function deleteOrder\(/, 'admin hard-delete istemcisi bulunmamalı');
assert.doesNotMatch(
    adminSource,
    /adminApiFetch\('\/api\/orders\/' \+ orderId, \{ method: 'DELETE' \}\)/,
    'admin sipariş hard-delete isteği göndermemeli'
);
assert.doesNotMatch(adminSource, /id="status-select"/, 'generic sipariş durum seçicisi bulunmamalı');
assert.doesNotMatch(adminSource, /async function updateOrderStatus\(/, 'generic sipariş durum mutation istemcisi bulunmamalı');
assert.doesNotMatch(adminSource, /\/api\/orders\/' \+ orderId \+ '\/status'/, 'admin generic status endpointine istek göndermemeli');
assert.match(adminSource, /Bu alan salt okunurdur\./, 'sipariş detayında salt-okunur sınırı açıklanmalı');
assert.match(adminSource, />İncele<\/button>/, 'sipariş CTA metni İncele olmalı');
assert.doesNotMatch(adminSource, />Kargola<\/button>/, 'sahte Kargola CTA kalmamalı');
assert.doesNotMatch(adminSource, /getReturnStatusOptionsHtml/, 'admin iade durum seçenekleri sunmamalı');
assert.doesNotMatch(adminSource, /updateReturnStatus/, 'admin iade durum mutation istemcisi bulunmamalı');
assert.doesNotMatch(adminSource, /return-status-select-/, 'admin iade durum select kontrolü bulunmamalı');
assert.doesNotMatch(adminSource, /\/api\/returns\/\$\{returnId\}\/status/, 'admin iade PATCH endpointine istek göndermemeli');
assert.match(adminSource, /İade durum değişiklikleri güvenli geri ödeme ve stok akışı tamamlanana kadar kapalıdır\./);
assert.match(adminSource, />İadeyi İncele<\/button>/);
assert.doesNotMatch(adminSource, />İadeyi Yönet<\/button>/);

assert.match(modelSource, /data class CancelOrderRequestBody\(/);
assert.match(modelSource, /@SerializedName\("reason_code"\) val reasonCode: String/);
assert.match(modelSource, /val note: String\? = null/);
assert.match(
    apiSource,
    /@POST\("api\/orders\/\{id\}\/cancel"\)[\s\S]*?@Path\("id"\) orderId: Int,[\s\S]*?@Body body: CancelOrderRequestBody/
);
assert.match(repositorySource, /reasonCode: String = "CUSTOMER_REQUEST"/);
assert.match(repositorySource, /note: String\? = null/);
assert.match(repositorySource, /CancelOrderRequestBody\(reasonCode = reasonCode, note = note\)/);
assert.match(
    accountScreenSource,
    /private fun AccountOrder\.canCancel\(\): Boolean \{[\s\S]*?normalized\.contains\("onay bekliyor"\)[\s\S]*?normalized\.contains\("hazırlanıyor"\)/,
    'Android iptal CTA yalnız backend tarafından iptal edilebilir hazırlık durumlarında görünmeli'
);
assert.doesNotMatch(
    accountScreenSource,
    /private fun AccountOrder\.canCancel\(\): Boolean \{[\s\S]*?normalized\.contains\("onaylan(?:dı|di)"\)/,
    'Android backend matrisinde olmayan Onaylandı durumunu iptal edilebilir saymamalı'
);
assert.doesNotMatch(
    accountScreenSource,
    /private fun AccountOrder\.canCancel\(\): Boolean \{[\s\S]*?!normalized\.contains\("teslim"\)/,
    'Android iptal uygunluğunu geniş bir engel listesiyle hesaplamamalı'
);

assert.match(accountScreenSource, /Text\("İade Talebi Yakında"/);
assert.match(accountScreenSource, /Yeni iade akışı güvenlik doğrulamaları tamamlanana kadar kapalıdır\./);
assert.doesNotMatch(accountScreenSource, /viewModel\.requestReturn/);
assert.doesNotMatch(accountScreenSource, /onReturn\s*=/);
assert.doesNotMatch(accountScreenSource, /Text\("İade Talebi Oluştur"/);
assert.doesNotMatch(accountViewModelSource, /accountRepository\.requestReturn/);

assert.doesNotMatch(profileSource, /fetch\(\s*['"]\/api\/returns['"]/, 'web profil iade POST isteği göndermemeli');
assert.doesNotMatch(profileSource, /submitReturnRequest|openReturnModal|return-modal-overlay/, 'web profil aktif iade modalı sunmamalı');
assert.doesNotMatch(profileSource, />\s*İade Talebi Oluştur\s*</, 'web profil aktif iade CTA metni sunmamalı');
assert.match(profileSource, />\s*İade Talebi Yakında\s*</, 'web profil kapalı iade durumunu dürüstçe belirtmeli');
assert.match(profileSource, /Yeni iade talepleri güvenli geri ödeme ve stok akışı tamamlanana kadar geçici olarak kapalıdır\./);
assert.match(profileSource, /Canlı Destek üzerinden yardım alabilirsiniz\./);

console.log('order lifecycle client contract smoke passed');
