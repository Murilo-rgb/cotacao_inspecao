// Valida o modal de qualidade: constantes de Tipo de Apontamento/Amostra → Status
// Uso: node scripts/validar_modal_qualidade.js
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const htmlPath = path.join(__dirname, '..', 'public', 'qualidade.html');
const html = fs.readFileSync(htmlPath, 'utf8');
// Ancora no script principal (React), que vem após <div id="root">
const anchor = html.indexOf('<div id="root">');
const start = html.indexOf('<script>', anchor) + 8;
const end = html.indexOf('</script>', start);
const script = html.slice(start, end);

// 1) Sintaxe geral do script inline
try {
    acorn.parse(script, { ecmaVersion: 2022, allowReturnOutsideFunction: true });
    console.log('✅ Sintaxe do script inline: OK');
} catch (e) {
    console.error('❌ Sintaxe inválida:', e.message);
    process.exit(1);
}

// 2) Extrai e avalia as constantes do mapeamento
const ini = script.indexOf('var TIPO_APONTAMENTO_STATUS');
const fim = script.indexOf('function Toast');
if (ini === -1 || fim === -1 || ini > fim) {
    console.error('❌ Constantes TIPO_APONTAMENTO_* não encontradas no local esperado');
    process.exit(1);
}
eval(script.slice(ini, fim));

let falhas = 0;
const check = (cond, msg) => { console.log((cond ? '✅' : '❌') + ' ' + msg); if (!cond) falhas++; };

// Mapeamento exigido
const esperado = {
    'APROVAÇÃO INDEVIDA': ['Aprovação Indevida - Qualidade'],
    'APROVADO': ['Procedimento Correto', 'Aprovação Indevida - Qualidade'],
    'DEVOLUÇÃO PARCIAL/INDEVIDA': ['Devolução Indevida', 'Procedimento Correto', 'Devolução Parcial'],
    'ERRO INTERNO': ['Erro Interno - Inspeção'],
    'RCV': ['Apontamento RCV']
};
check(JSON.stringify(TIPO_APONTAMENTO_STATUS) === JSON.stringify(esperado), 'Tabela anotação → status conforme especificação');

// Pré-seleção (handleAuditClick): só quando apontamento === tipo E status pertence à lista
const pre = (ap, st) => Object.keys(TIPO_APONTAMENTO_STATUS).find(t => ap === t && TIPO_APONTAMENTO_STATUS[t].indexOf(st) !== -1) || '';
check(pre('RCV', 'Apontamento RCV') === 'RCV', 'Pré-seleção: RCV + status Apontamento RCV');
check(pre('ERRO INTERNO', 'Procedimento Correto') === '', 'Pré-seleção bloqueada quando status não pertence ao tipo');
check(pre('texto livre antigo', '') === '', 'Pré-seleção vazia para apontamento em texto livre (registros antigos)');
check(pre('DEVOLUÇÃO PARCIAL/INDEVIDA', 'Devolução Parcial') === 'DEVOLUÇÃO PARCIAL/INDEVIDA', 'Pré-seleção com status múltiplo (DEVOLUÇÃO PARCIAL/INDEVIDA)');

// Labels e classes para os status filtrados
['Procedimento Correto', 'Aprovação Indevida - Qualidade', 'Devolução Indevida', 'Devolução Parcial', 'Erro Interno - Inspeção', 'Apontamento RCV'].forEach(s => {
    check(!!STATUS_AUDITORIA_LABELS[s], 'Label definido para status: ' + s);
    check(!!STATUS_AUDITORIA_CLASSES[s], 'Classe de cor definida para status: ' + s);
});

// 3) Novos status aceitos no backend
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const listas = server.match(/statusPermitidos = \[[^\]]+\]/g) || [];
check(listas.length === 4, '4 listas statusPermitidos encontradas no server.js (encontradas: ' + listas.length + ')');
listas.forEach((l, i) => {
    check(l.includes("'Erro Interno - Inspeção'"), `Lista ${i + 1} aceita 'Erro Interno - Inspeção'`);
    check(l.includes("'Apontamento RCV'"), `Lista ${i + 1} aceita 'Apontamento RCV'`);
    check(l.includes("'RCV'"), `Lista ${i + 1} aceita 'RCV'`);
});

console.log(falhas === 0 ? '\n🎉 Todas as validações passaram' : `\n⚠️ ${falhas} validação(ões) falharam`);
process.exit(falhas === 0 ? 0 : 1);
