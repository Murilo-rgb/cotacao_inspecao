const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const files = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));

let changed = 0;
for (const file of files) {
    const fullPath = path.join(publicDir, file);
    let content = fs.readFileSync(fullPath, 'utf8');
    if (content.includes('unpkg.com/react') || content.includes('unpkg.com/react-dom')) {
        content = content.replace(/https:\/\/unpkg\.com\/react@18\/umd\/react\.development\.js/g, 'https://cdn.jsdelivr.net/npm/react@18/umd/react.development.js');
        content = content.replace(/https:\/\/unpkg\.com\/react-dom@18\/umd\/react-dom\.development\.js/g, 'https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.development.js');
        fs.writeFileSync(fullPath, content);
        changed++;
        console.log('Fixed:', file);
    }
}
console.log(`\nFixed ${changed} files`);