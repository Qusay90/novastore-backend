const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repositoryRoot = path.join(__dirname, '..');
const previewPath = path.join(repositoryRoot, 'frontend', 'admin-commerce-pro.html');
const adminPath = path.join(repositoryRoot, 'frontend', 'admin.html');
const appPath = path.join(repositoryRoot, 'admin-commerce-pro', 'src', 'App.jsx');
const mainPath = path.join(repositoryRoot, 'admin-commerce-pro', 'src', 'main.jsx');

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

assert.match(previewSource, /<!doctype html>/i, 'önizleme geçerli bir HTML belgesi olmalı');
assert.match(previewSource, /<html\b[^>]*\blang=["']tr["']/i, 'önizleme Türkçe belge dili tanımlamalı');
assert.match(previewSource, /<div\s+id=["']root["']\s*>\s*<\/div>/i, 'React kök elemanı bulunmalı');

const robotsMeta = previewSource.match(/<meta\b[^>]*\bname=["']robots["'][^>]*>/i)?.[0];
assert.ok(robotsMeta, 'önizleme robots meta etiketi içermeli');
assert.match(robotsMeta, /\bcontent=["'][^"']*noindex[^"']*["']/i, 'önizleme noindex olmalı');
assert.match(robotsMeta, /\bcontent=["'][^"']*nofollow[^"']*["']/i, 'önizleme nofollow olmalı');

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

console.log('admin Commerce Pro preview smoke passed');
