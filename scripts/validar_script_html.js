// Valida os blocos <script> inline de um HTML usando node --check
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const arquivo = process.argv[2];
if (!arquivo) {
    console.error('Uso: node validar_script_html.js <arquivo.html>');
    process.exit(1);
}

const manter = process.argv.includes('--manter');

const conteudo = fs.readFileSync(arquivo, 'utf8');
const blocos = [];
const regex = /<script>([\s\S]*?)<\/script>/g;
let m;
while ((m = regex.exec(conteudo)) !== null) {
    blocos.push(m[1]);
}

console.log(`Blocos <script> inline encontrados: ${blocos.length}`);
let erros = 0;
blocos.forEach((codigo, i) => {
    const tmp = path.join(__dirname, 'tmp_block_' + process.pid + '_' + i + '.js');
    fs.writeFileSync(tmp, codigo, 'utf8');
    try {
        execSync(`node --check "${tmp}"`, { stdio: 'pipe' });
        console.log(`Bloco ${i}: OK (${codigo.split('\n').length} linhas)`);
        if (!manter) { try { fs.unlinkSync(tmp); } catch {} }
    } catch (err) {
        erros++;
        console.log(`Bloco ${i}: ERRO -> salvo em ${tmp}`);
        const saida = err.stderr ? err.stderr.toString() : err.message;
        console.log(saida.split('\n').slice(0, 6).join('\n'));
    }
});

process.exit(erros > 0 ? 1 : 0);