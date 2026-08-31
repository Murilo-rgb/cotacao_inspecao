// Verifica: atualizações de status da tabela cotacao restam apenas nas rotas /auditar (legadas)
const fs = require('fs');
const path = require('path');
const s = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

const blocoUPDATEstatus = s.split('UPDATE db_bloco_de_notas.cotacao SET status').length - 1;
const rotaAuditarCompleto = (s.match(/app\.post\('\/(?:pme_notas\/)?api\/qualidade\/auditar-completo'/g) || []);
const rotaAuditarSimples = (s.match(/app\.post\('\/(?:pme_notas\/)?api\/qualidade\/auditar'/g) || []);

console.log('UPDATE db_bloco_de_notas.cotacao SET status (total):', blocoUPDATEstatus);
console.log('Rotas app.post(.../auditar-completo\') > contagem esperada 2:', rotaAuditarCompleto.length === 2 ? 'OK' : rotaAuditarCompleto.length);
console.log('Rotas app.post(.../auditar\') (legadas) > contagem esperada 2:', rotaAuditarSimples.length === 2 ? 'OK' : rotaAuditarSimples.length);

const ok = blocoUPDATEstatus === 0 && rotaAuditarCompleto.length === 2 && rotaAuditarSimples.length === 2;
console.log(ok ? '\n=== NENHUM bloco de status resta: auditoria de qualidade não altera mais cotacao.status ===' : '\n=== ATENÇÃO: contagem inesperada ===');
process.exit(ok ? 0 : 1);