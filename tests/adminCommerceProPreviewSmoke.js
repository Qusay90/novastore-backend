const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repositoryRoot = path.join(__dirname, '..');
const previewPath = path.join(repositoryRoot, 'frontend', 'admin-commerce-pro.html');
const adminPath = path.join(repositoryRoot, 'frontend', 'admin.html');
const appPath = path.join(repositoryRoot, 'admin-commerce-pro', 'src', 'App.jsx');
const mainPath = path.join(repositoryRoot, 'admin-commerce-pro', 'src', 'main.jsx');
const stylesPath = path.join(repositoryRoot, 'admin-commerce-pro', 'src', 'styles.css');
const designQaPath = path.join(repositoryRoot, 'admin-commerce-pro', 'design-qa.md');

assert.ok(
    fs.existsSync(previewPath),
    [
        'frontend/admin-commerce-pro.html bulunamadı.',
        'Önce bağımsız Commerce Pro çıktısını oluşturun:',
        '  cd admin-commerce-pro && npm run build:integrated'
    ].join('\n')
);

assert.ok(fs.existsSync(adminPath), 'frontend/admin.html bulunamadı');

const previewSource = fs.readFileSync(previewPath, 'utf8');
const adminSource = fs.readFileSync(adminPath, 'utf8');
const applicationSource = [appPath, mainPath].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const stylesSource = fs.readFileSync(stylesPath, 'utf8');
const designQaSource = fs.readFileSync(designQaPath, 'utf8');
const fingerprintFiles = [
    'index.html',
    'package.json',
    'package-lock.json',
    'vite.config.mjs',
    'scripts/build-standalone.mjs',
    'src/App.jsx',
    'src/main.jsx',
    'src/styles.css',
    'public/icons.js',
    'public/favicon-96x96.png',
    'public/assets/category-home.webp',
    'public/assets/phone-iphone.webp',
    'public/assets/phone-samsung.webp',
    'public/assets/product-bedding.webp',
    'public/assets/product-headphones.webp',
    'public/assets/product-laptop.webp',
    'public/assets/product-vacuum.webp',
    'public/assets/product-watch.webp',
    'public/assets/fonts/inter-latin-ext-400-normal.woff2',
    'public/assets/fonts/inter-latin-ext-600-normal.woff2',
    'public/assets/fonts/inter-latin-ext-700-normal.woff2',
    'public/assets/fonts/inter-latin-ext-800-normal.woff2'
];
const fingerprint = createHash('sha256');
for (const relativePath of fingerprintFiles) {
    fingerprint.update(relativePath);
    fingerprint.update(fs.readFileSync(path.join(repositoryRoot, 'admin-commerce-pro', relativePath)));
}
const expectedFingerprint = fingerprint.digest('hex');

assert.match(previewSource, /<!doctype html>/i, 'önizleme geçerli bir HTML belgesi olmalı');
assert.match(previewSource, /<html\b[^>]*\blang=["']tr["']/i, 'önizleme Türkçe belge dili tanımlamalı');
assert.match(previewSource, /<div\s+id=["']root["']\s*>\s*<\/div>/i, 'React kök elemanı bulunmalı');
assert.match(
    previewSource,
    /<link\b[^>]*\brel=["']icon["'][^>]*\bhref=["']data:image\/png;base64,/i,
    'önizleme favicon isteği için haricî veya eksik bir dosyaya bağlı olmamalı'
);

const robotsMeta = previewSource.match(/<meta\b[^>]*\bname=["']robots["'][^>]*>/i)?.[0];
assert.ok(robotsMeta, 'önizleme robots meta etiketi içermeli');
assert.match(robotsMeta, /\bcontent=["'][^"']*noindex[^"']*["']/i, 'önizleme noindex olmalı');
assert.match(robotsMeta, /\bcontent=["'][^"']*nofollow[^"']*["']/i, 'önizleme nofollow olmalı');

const fingerprintMeta = previewSource.match(/<meta\b[^>]*\bname=["']novastore-source-fingerprint["'][^>]*>/i)?.[0];
assert.ok(fingerprintMeta, 'önizleme kaynak parmak izi içermeli');
assert.match(
    fingerprintMeta,
    new RegExp(`\\bcontent=["']${expectedFingerprint}["']`, 'i'),
    'frontend/admin-commerce-pro.html kaynak kod ve assetlerle aynı build’den üretilmiş olmalı'
);

for (const marker of [
    'Commerce Pro önizlemesi',
    'Örnek veriler kullanılır',
    'hiçbir işlem kaydedilmez',
    'ödeme isteği gönderilmez'
]) {
    assert.ok(
        previewSource.includes(marker),
        `önizleme güvenlik sınırı metni eksik: ${marker}`
    );
}

assert.ok(
    /data-testid["']?\s*(?:=|:)\s*["']admin-shell["']/.test(previewSource),
    'Commerce Pro uygulama kabuğu build çıktısında bulunmalı'
);
assert.ok(
    /data-testid["']?\s*(?:=|:)\s*["']preview-banner["']/.test(previewSource),
    'kalıcı önizleme uyarısı build çıktısında bulunmalı'
);

assert.doesNotMatch(previewSource, /<script\b[^>]*\bsrc\s*=/i, 'harici script kaynağı kullanılamaz');
assert.doesNotMatch(previewSource, /<script\b[^>]*\btype=["']module["']/i, 'build çıktısı modül yükleyicisine bağlı olmamalı');
assert.doesNotMatch(
    previewSource,
    /<link\b[^>]*\brel=["'][^"']*stylesheet[^"']*["'][^>]*>/i,
    'harici stylesheet bağlantısı kullanılamaz'
);
assert.doesNotMatch(
    previewSource,
    /<(?:img|script|link|source)\b[^>]*\b(?:src|href|srcset)=["'](?:https?:)?\/\//i,
    'önizleme aktif bir harici kaynağa bağlanamaz'
);
assert.doesNotMatch(previewSource, /(?:src|href)=["']\/assets\//i, 'çözümlenmemiş /assets yolu kalmamalı');
assert.doesNotMatch(previewSource, /(?:src|href)=["']\/src\//i, 'çözümlenmemiş /src yolu kalmamalı');
assert.doesNotMatch(previewSource, /(?:src|href)=["'][^"']*icons\.js/i, 'ikon paketi HTML içine gömülmeli');
assert.match(previewSource, /data:image\/webp;base64,/i, 'ürün görselleri HTML içine gömülmeli');
assert.match(previewSource, /data:font\/woff2;base64,/i, 'font dosyaları HTML içine gömülmeli');

const forbiddenRuntimePatterns = [
    [/\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/, 'XMLHttpRequest çağrısı'],
    [/\bnew\s+WebSocket\b|\bWebSocket\s*\(/, 'WebSocket bağlantısı'],
    [/\bnew\s+EventSource\b|\bEventSource\s*\(/, 'EventSource bağlantısı'],
    [/\bsendBeacon\s*\(/, 'sendBeacon çağrısı'],
    [/\bsocket\.io\b|\/socket\.io\//i, 'Socket.IO bağlantısı'],
    [/["'`]\/api(?:\/|["'`])/, '/api endpoint referansı'],
    [/\bpaytr\b/i, 'PayTR referansı'],
    [/\biyzico\b/i, 'iyzico referansı']
];

assert.doesNotMatch(
    applicationSource,
    /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bsendBeacon\s*\(/,
    'uygulama kaynak kodu ağ çağrısı içeremez'
);

assert.match(
    applicationSource,
    /domain === "operations" && <section className="saved-views"/,
    'sipariş kaydedilmiş görünümleri yalnız operasyon alanında sunulmalı'
);
assert.doesNotMatch(
    applicationSource,
    /domain === "operations" \|\| domain === "catalog"/,
    'sipariş kaydedilmiş görünümleri katalog alanına sızmamalı'
);
assert.match(
    applicationSource,
    /const visibleSelected = visible\.filter/,
    'toplu işlem sayacı yalnız görünür sipariş seçimlerini kullanmalı'
);
assert.match(
    applicationSource,
    /visibleIds\.has\(row\.id\)/,
    'toplu durum güncellemesi görünmeyen siparişleri değiştirmemeli'
);
assert.match(
    applicationSource,
    /<select aria-label="Örnek kapsam" value=\{store\}/,
    'bağlamsal kapsam seçicisi ortak mağaza durumuna bağlı olmalı'
);
assert.match(
    applicationSource,
    /toastTimerRef/,
    'bildirim zamanlayıcısı renderlar arasında kalıcı bir ref kullanmalı'
);
assert.match(
    applicationSource,
    /className="row-entity-button"[\s\S]{0,300}aria-label=/,
    'satıcı satırları klavye ve ekran okuyucu için adlandırılmış kontrol içermeli'
);
assert.match(
    stylesSource,
    /@media \(max-width: 760px\)[\s\S]*?\.command-trigger \{ display: grid;/,
    'mobil görünüm komut paleti için dokunmatik tetikleyiciyi korumalı'
);
assert.match(
    applicationSource,
    /className="command-trigger"[^>]*aria-label="Komut paletini aç"/,
    'mobil komut paleti tetikleyicisi görünür metin saklandığında da erişilebilir ada sahip olmalı'
);
assert.match(
    applicationSource,
    /setFilter\(\{ status: view\.status, query: view\.query \|\| "" \}\)/,
    'kaydedilmiş görünüm uygulanırken arama sorgusu geri yüklenmeli'
);
assert.match(
    applicationSource,
    /\{ name, status: filter\.status, query: filter\.query \}/,
    'kaydedilmiş görünüm etkin arama sorgusunu saklamalı'
);
assert.match(
    applicationSource,
    /savedViews\.some\(\(view\) => view\.name\.toLocaleLowerCase\("tr-TR"\) === normalizedName\)/,
    'yinelenen kaydedilmiş görünüm adları büyük-küçük harf duyarsız engellenmeli'
);
assert.match(
    applicationSource,
    /className="modal-error"[^>]*id="save-view-error"[^>]*role="alert"/,
    'kaydedilmiş görünüm doğrulama hatası modal içinde erişilebilir biçimde açıklanmalı'
);
assert.match(
    applicationSource,
    /aria-invalid=\{saveViewError \? "true" : undefined\}[\s\S]{0,160}aria-describedby=\{saveViewError \? "save-view-error" : undefined\}/,
    'kaydedilmiş görünüm adı alanı modal doğrulama mesajına bağlanmalı'
);
assert.match(
    applicationSource,
    /event\.preventDefault\(\); if \(!dialog && !document\.querySelector\("dialog\[open\]"\)\) openDialog\("command"\)/,
    'komut paleti kısayolu açık bir modalı ve odak geri dönüş hedefini değiştirmemeli'
);

for (const [pattern, label] of forbiddenRuntimePatterns) {
    assert.doesNotMatch(previewSource, pattern, `önizleme ${label} içeremez`);
}

const inlineScripts = Array.from(
    previewSource.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi),
    (match) => match[1]
);
assert.ok(inlineScripts.length >= 1, 'bağımsız build en az bir gömülü script içermeli');
inlineScripts.forEach((script, index) => {
    assert.doesNotThrow(
        () => new vm.Script(script, { filename: `admin-commerce-pro.inline-${index + 1}.js` }),
        `gömülü script ${index + 1} sözdizimi geçerli olmalı`
    );
});

const previewLink = adminSource.match(
    /<a\b(?=[^>]*\bhref=["'](?:\.\/|\/)?admin-commerce-pro\.html["'])[^>]*>/i
)?.[0];
assert.ok(previewLink, 'frontend/admin.html Commerce Pro önizlemesine bağlantı vermeli');
assert.match(previewLink, /\btarget=["']_blank["']/i, 'önizleme bağlantısı yeni sekmede açılmalı');
assert.match(previewLink, /\brel=["'][^"']*noopener[^"']*["']/i, 'yeni sekme bağlantısı noopener kullanmalı');

assert.match(
    designQaSource,
    /^final result:\s*blocked\s*$/im,
    'düzeltme sonrası masaüstü/mobil browser kanıtı tamamlanana kadar tasarım QA sonucu blocked kalmalı'
);

console.log('admin Commerce Pro preview smoke passed');
