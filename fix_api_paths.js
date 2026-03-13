const fs = require('fs');
const path = require('path');

const frontendDir = path.join(__dirname, 'frontend');

function fixFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // 1. Hardcoded backend fetch calls -> same-origin /api/...
    const absoluteFetchRegex = /fetch\((['"])https:\/\/novastore-backend\.onrender\.com\/api\//g;
    if (absoluteFetchRegex.test(content)) {
        content = content.replace(absoluteFetchRegex, 'fetch($1/api/');
        changed = true;
    }

    // 2. Hardcoded Socket.io connections -> same-origin
    const ioRegex1 = /io\(['"]https:\/\/novastore-backend\.onrender\.com['"]\)/g;
    if (ioRegex1.test(content)) {
        content = content.replace(ioRegex1, 'io()');
        changed = true;
    }

    const ioRegex2 = /io\(['"]https:\/\/novastore-backend\.onrender\.com['"],\s*\{/g;
    if (ioRegex2.test(content)) {
        content = content.replace(ioRegex2, 'io(undefined, {');
        changed = true;
    }

    // 3. API_BASE constants -> same-origin
    const apiBaseRegex = /const API_BASE = ['"]https:\/\/novastore-backend\.onrender\.com['"];/g;
    if (apiBaseRegex.test(content)) {
        content = content.replace(apiBaseRegex, `const API_BASE = '';`);
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Fixed: ${path.relative(__dirname, filePath)}`);
    }
}

function processDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            processDir(fullPath);
        } else if (fullPath.endsWith('.js') || fullPath.endsWith('.html')) {
            fixFile(fullPath);
        }
    }
}

processDir(frontendDir);
console.log('Frontend API paths normalized to same-origin successfully.');
