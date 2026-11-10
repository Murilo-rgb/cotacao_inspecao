// Teste end-to-end da extracao de relatorios: sobe o server.js real, autentica e baixa o JSON
// da rota /pme_notas/api/reports (a mesma que public/reports.html consome para montar o CSV).
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const JWT_SECRET = 'Lenovo!Hitss!Global';
const PORT = 3016;
const BASE = `http://127.0.0.1:${PORT}`;
const JANELA = { inicio: '2026-10-31', fim: '2026-11-06' };

const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

let falhas = 0;
function checar(condicao, mensagem) {
    if (condicao) {
        console.log(`   OK    ${mensagem}`);
    } else {
        falhas++;
        console.log(`   FALHA ${mensagem}`);
    }
}

function sqlDoArquivo() {
    const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
    const m = src.match(/const SQL_REPORTS_AUDITORIA = `([\s\S]*?)`;/);
    if (!m) throw new Error('SQL_REPORTS_AUDITORIA nao encontrada em server.js');
    return m[1];
}

function subirServidor() {
    const child = spawn(process.execPath, ['server.js'], { cwd: __dirname });
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout aguardando o servidor subir')), 90000);
        let saida = '';
        child.stdout.on('data', (d) => {
            saida += d.toString();
            if (saida.includes('Servidor rodando')) {
                clearTimeout(timer);
                resolve(child);
            }
        });
        child.stderr.on('data', (d) => { saida += d.toString(); });
        child.on('exit', (code) => {
            clearTimeout(timer);
            reject(new Error(`Servidor encerrou antes de responder (code ${code}):\n${saida.slice(-800)}`));
        });
    });
}

async function main() {
    console.log('=== TESTE E2E DAS ROTAS DE RELATORIO ===\n');

    const { rows: perm } = await pool.query(
        `SELECT usuario_id FROM db_automacao.usuario_permissoes
          WHERE rota = '/pme_notas/qualidade' AND tem_acesso LIMIT 1`
    );
    if (!perm.length) throw new Error('Nenhum usuario com permissao em /pme_notas/qualidade');
    const { rows: usuario } = await pool.query('SELECT login, nome FROM db_automacao.usuarios WHERE id = $1', [perm[0].usuario_id]);
    const token = jwt.sign(
        { username: usuario[0].login, id: perm[0].usuario_id, nome: usuario[0].nome },
        JWT_SECRET,
        { expiresIn: '1h' }
    );
    console.log(`   usuario de teste: ${usuario[0].login} (id ${perm[0].usuario_id})`);

    console.log('\n0) Contagem esperada direto no banco (mesmo SQL do server.js)');
    const fimExclusivoDate = new Date(`${JANELA.fim}T00:00:00Z`);
    fimExclusivoDate.setUTCDate(fimExclusivoDate.getUTCDate() + 1);
    const fimExclusivo = fimExclusivoDate.toISOString().split('T')[0];
    const { rows: contagem } = await pool.query(
        `SELECT COUNT(*)::int AS linhas FROM (${sqlDoArquivo()}) r`,
        [JANELA.inicio, fimExclusivo]
    );
    const esperado = contagem[0].linhas;
    console.log(`   ${JANELA.inicio} a ${JANELA.fim}: ${esperado} linhas`);

    const child = await subirServidor();
    console.log(`\n   servidor no ar em ${BASE}`);

    try {
        console.log('\n1) Rota sem token deve ser bloqueada');
        const semToken = await fetch(`${BASE}/pme_notas/api/reports?dataInicio=${JANELA.inicio}&dataFim=${JANELA.fim}`);
        checar(semToken.status === 401 || semToken.status === 403, `status ${semToken.status} sem token`);

        console.log('\n2) /pme_notas/api/reports (consumida por reports.html)');
        const resp = await fetch(
            `${BASE}/pme_notas/api/reports?dataInicio=${JANELA.inicio}&dataFim=${JANELA.fim}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        checar(resp.status === 200, `status ${resp.status}`);
        const linhas = await resp.json();
        checar(Array.isArray(linhas), 'resposta e uma lista de registros');
        checar(linhas.length === esperado, `${linhas.length} registros (banco: ${esperado})`);

        const ids = linhas.map((r) => r.id_qldd);
        checar(new Set(ids).size === ids.length, 'nenhuma auditoria repetida no JSON');
        checar(
            linhas.every((r) => String(r.data_qualidade).slice(0, 10) >= JANELA.inicio && String(r.data_qualidade).slice(0, 10) <= JANELA.fim),
            'todas as datas dentro da janela pedida'
        );

        console.log('\n3) Colunas que o CSV de reports.html le');
        const camposCsv = [
            'codigo_tarefa', 'origem', 'cotacao', 'status', 'data_qualidade', 'analista', 'auditado_nome',
            'regional', 'tipo_de_pedido', 'motivo_1_sistema_documento', 'motivo_2_erro', 'motivo_3_detalhamento',
            'reprova_bko', 'tipo_apontamento', 'apontamento', 'contestacao', 'obs', 'enviado', 'data_envio',
            'semana', 'data_leitura',
        ];
        const primeiro = linhas[0] || {};
        const faltando = camposCsv.filter((c) => !(c in primeiro));
        checar(faltando.length === 0, `${camposCsv.length} campos do CSV presentes${faltando.length ? ' | faltando: ' + faltando.join(', ') : ''}`);
        checar(linhas.every((r) => r.origem), 'toda linha tem rotulo de origem');

        console.log('\n4) Rota legada /api/reports devolve o mesmo conjunto');
        const respLegado = await fetch(
            `${BASE}/api/reports?dataInicio=${JANELA.inicio}&dataFim=${JANELA.fim}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        const linhasLegado = await respLegado.json();
        checar(respLegado.status === 200 && linhasLegado.length === linhas.length, `status ${respLegado.status} | ${linhasLegado.length} registros`);
        const idsLegado = new Set(linhasLegado.map((r) => r.id_qldd));
        checar(idsLegado.size === new Set(ids).size && ids.every((id) => idsLegado.has(id)), 'mesmos id_qldd nas duas rotas');
    } finally {
        child.kill();
    }

    console.log(`\n=== RESULTADO: ${falhas === 0 ? 'TODAS AS VERIFICACOES PASSARAM' : falhas + ' VERIFICACAO(OES) FALHARAM'} ===`);
    await pool.end();
    process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (erro) => {
    console.error('[erro]', erro.message || erro);
    await pool.end();
    process.exit(1);
});

