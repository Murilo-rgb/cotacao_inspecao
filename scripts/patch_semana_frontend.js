const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'public', 'qualidade.html');
let content = fs.readFileSync(htmlPath, 'utf8');

// O código atual no frontend está com o cálculo antigo. Vamos encontrar e substituir.
// O padrão que estamos procurando é a linha que calcula a semana no handleAuditClick
const searchPattern = /const now = new Date\(\);\s+const semana = Math\.ceil\(.*\);\s+const dataQualidade = now\.toLocaleString\('pt-BR'\);/;

const replacement = `const now = new Date();
                const day = now.getDate();
                const month = now.getMonth();
                const year = now.getFullYear();
                const firstDay = new Date(year, month, 1);
                const firstDayWeek = firstDay.getDay();
                const startDay = firstDayWeek === 0 ? 0 : firstDayWeek;
                const semana = Math.ceil((day + startDay) / 7);
                const dataQualidade = now.toLocaleString('pt-BR');`;

const found = searchPattern.test(content);
console.log('[PATCH] Padrão encontrado:', found);

if (found) {
    content = content.replace(searchPattern, replacement);
    fs.writeFileSync(htmlPath, content, 'utf8');
    console.log('[PATCH] Cálculo da semana do mês aplicado no frontend');
} else {
    console.log('[PATCH] Padrão não encontrado, tentando abordagem alternativa...');
    
    // Procurar por qualquer linha com "const semana"
    const semanaRegex = /const semana = [^;]+;/g;
    const matches = content.match(semanaRegex);
    console.log('[PATCH] Linhas com "const semana":', matches);
    
    if (matches) {
        for (const match of matches) {
            console.log('[PATCH] Substituindo:', match.substring(0, 100));
            content = content.replace(match, 'const semana = Math.ceil((new Date().getDate() + (new Date(new Date().getFullYear(), new Date().getMonth(), 1).getDay() === 0 ? 0 : new Date(new Date().getFullYear(), new Date().getMonth(), 1).getDay())) / 7);');
        }
        fs.writeFileSync(htmlPath, content, 'utf8');
        console.log('[PATCH] Cálculo aplicado (abordagem alternativa)');
    }
}

console.log('\n[PATCH] Concluído!');