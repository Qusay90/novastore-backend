const fs = require('fs');
const path = require('path');

const frontendDir = path.join(__dirname, 'frontend');
const oldUrl = 'http://localhost:5000';
const newUrl = 'https://novastore-backend.onrender.com';

function replaceInDir(dir) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            replaceInDir(filePath);
        } else if (filePath.endsWith('.js') || filePath.endsWith('.html')) {
            let content = fs.readFileSync(filePath, 'utf8');
            if (content.includes(oldUrl)) {
                content = content.replace(new RegExp(oldUrl, 'g'), newUrl);
                fs.writeFileSync(filePath, content, 'utf8');
                console.log(`Updated ${file}`);
            }
        }
    }
}

replaceInDir(frontendDir);
console.log('Update complete.');
