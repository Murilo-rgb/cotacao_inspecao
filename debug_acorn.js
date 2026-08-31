const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const htmlPath = path.join(__dirname, 'public', 'qualidade.html');
const html = fs.readFileSync(htmlPath, 'utf8');
// Ancora no script principal (React), que vem após <div id="root">
const anchor = html.indexOf('<div id="root">');
const start = html.indexOf('<script>', anchor) + 8;
const end = html.indexOf('</script>', start);
const script = html.slice(start, end);

try {
    acorn.parse(script, { ecmaVersion: 2022, allowReturnOutsideFunction: true });
    console.log('✅ Script inline de public/qualidade.html: sintaxe válida (acorn, ECMA 2022)');
} catch (e) {
    console.error('❌ Erro de sintaxe no script inline:', e.message);
    const ln = e.loc ? e.loc.line : null;
    if (ln) {
        const lines = script.split('\n');
        console.error(`Linha ${ln}:`, JSON.stringify(lines[ln - 1]));
    }
    process.exit(1);
}
