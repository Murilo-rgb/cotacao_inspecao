const fs = require('fs');
const path = require('path');

// Patch server.js - corrigir função calcularSemana
const serverPath = path.join(__dirname, '..', 'server.js');
let serverContent = fs.readFileSync(serverPath, 'utf8');

const oldCalcularSemana = `function calcularSemana(date) {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((((d - onejan) / 86400000) + 1) / 7);
    return week;
}`;

const newCalcularSemana = `function calcularSemana(date) {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    const day = d.getDate();
    const month = d.getMonth();
    const year = d.getFullYear();
    // Primeiro dia do mês
    const firstDay = new Date(year, month, 1);
    // Dia da semana do primeiro dia (0-6)
    const firstDayWeek = firstDay.getDay();
    // Ajuste para iniciar a semana no domingo
    const startDay = firstDayWeek === 0 ? 0 : firstDayWeek;
    // Calcular semana do mês (1-5)
    const weekOfMonth = Math.ceil((day + startDay) / 7);
    return weekOfMonth;
}`;

if (serverContent.includes(oldCalcularSemana)) {
    serverContent = serverContent.replace(oldCalcularSemana, newCalcularSemana);
    fs.writeFileSync(serverPath, serverContent, 'utf8');
    console.log('[PATCH] Função calcularSemana atualizada para semana do mês (1-5)');
} else {
    console.log('[PATCH] Função calcularSemana não encontrada, criando nova...');
    // Se não encontrou, adicionar antes do PostgreSQL connection
    const insertBefore = '// PostgreSQL connection';
    const newFunction = `// Calcular semana do mês (1-5)
function calcularSemana(date) {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    const day = d.getDate();
    const month = d.getMonth();
    const year = d.getFullYear();
    const firstDay = new Date(year, month, 1);
    const firstDayWeek = firstDay.getDay();
    const startDay = firstDayWeek === 0 ? 0 : firstDayWeek;
    const weekOfMonth = Math.ceil((day + startDay) / 7);
    return weekOfMonth;
}

`;
    serverContent = serverContent.replace(insertBefore, newFunction + insertBefore);
    fs.writeFileSync(serverPath, serverContent, 'utf8');
    console.log('[PATCH] Função calcularSemana criada com sucesso');
}

// Patch frontend - corrigir cálculo da semana no handleAuditClick
const htmlPath = path.join(__dirname, '..', 'public', 'qualidade.html');
let htmlContent = fs.readFileSync(htmlPath, 'utf8');

const oldCalcSemana = `const now = new Date();
                const semana = Math.ceil((((now - new Date(now.getFullYear(), 0, 1)) / 86400000) + 1) / 7);
                const dataQualidade = now.toLocaleString('pt-BR');`;

const newCalcSemana = `const now = new Date();
                const day = now.getDate();
                const month = now.getMonth();
                const year = now.getFullYear();
                const firstDay = new Date(year, month, 1);
                const firstDayWeek = firstDay.getDay();
                const startDay = firstDayWeek === 0 ? 0 : firstDayWeek;
                const semana = Math.ceil((day + startDay) / 7);
                const dataQualidade = now.toLocaleString('pt-BR');`;

if (htmlContent.includes(oldCalcSemana)) {
    htmlContent = htmlContent.replace(oldCalcSemana, newCalcSemana);
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
    console.log('[PATCH] Cálculo da semana do mês atualizado no frontend');
} else {
    console.log('[PATCH] Cálculo da semana não encontrado no frontend');
}

console.log('\n[PATCH] Concluído!');
console.log('A semana agora é calculada como semana do mês (1-5)');