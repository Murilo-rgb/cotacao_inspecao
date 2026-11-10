const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { Pool } = require('pg');

const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

// Extrai a constante SQL_REPORTS_AUDITORIA do proprio server.js: a validacao roda o codigo real,
// nao uma copia que pode divergir do que esta em producao.
function extrairSqlDoArquivo(conteudo, origem) {
    const m = conteudo.match(/const SQL_REPORTS_AUDITORIA = `([\s\S]*?)`;/);
    if (!m) throw new Error(`SQL_REPORTS_AUDITORIA nao encontrada em ${origem}`);
    return m[1];
}

function lerSqlAtual() {
    return extrairSqlDoArquivo(fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8'), 'server.js');
}

// Versao anterior (a que estava no ar) para comparar o antes/depois.
function lerSqlAnterior() {
    try {
        const antigo = execFileSync('git', ['--no-pager', 'show', 'HEAD:server.js'], {
            cwd: __dirname,
            encoding: 'utf8',
            maxBuffer: 64 * 1024 * 1024,
        });
        return extrairSqlDoArquivo(antigo, 'HEAD:server.js');
    } catch (e) {
        console.warn(`[aviso] Nao foi possivel ler a versao anterior do git (${e.message}).`);
        return null;
    }
}

// Replica fiel da query da tela /pme_notas/qualidade (server.js:1640-1703):
// mesma conversao de data, mesmo filtro validacao='Ativo', mesma visao base de status,
// mesmo DISTINCT ON (c.usuario_id, data) com desempate por cotacao auditada + RANDOM().
// "auditadas" = linhas restantes que carregam id_qldd, que e o que a tela exibe por dia.
const TELA_DATA_SQL = `(CASE
    WHEN c.data_de_criacao ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}' THEN TO_DATE(LEFT(c.data_de_criacao, 10), 'DD/MM/YYYY')
    WHEN c.data_de_criacao ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN TO_DATE(LEFT(c.data_de_criacao, 10), 'YYYY-MM-DD')
    ELSE NULL END)`;

const SQL_TELA = `
  SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE s.id_qldd IS NOT NULL)::int AS auditadas
  FROM (
    SELECT DISTINCT ON (c.usuario_id, ${TELA_DATA_SQL})
           c.id_cotacao, c.id_qldd, c.usuario_id
    FROM db_bloco_de_notas.cotacao c
    WHERE c.validacao = 'Ativo'
      AND c.data_de_criacao LIKE $1
      AND (LOWER(c.status) = 'reprovado' OR c.id_qldd IS NOT NULL)
    ORDER BY c.usuario_id, ${TELA_DATA_SQL},
             CASE WHEN c.id_qldd IS NOT NULL THEN 0 ELSE 1 END, RANDOM()
  ) s
`;

const ORIGENS_PERMITIDAS = new Set(['Inspeção', 'Input NET', 'Input TOP', 'HH', 'Cortesia', 'Manual', 'Não identificado']);

const JANELAS = [
    { nome: '31/10/2026 a 06/11/2026 (7 dias)', inicio: '2026-10-31', fim: '2026-11-07' },
    { nome: '07/10/2026 a 06/11/2026 (30 dias)', inicio: '2026-10-07', fim: '2026-11-07' },
    { nome: 'Historico completo', inicio: '2000-01-01', fim: '2100-01-01' },
];

// Dias em que a extracao deve bater com a tela (comparacao calculada, nao numeros fixos)
const PARIDADE_DIAS = [
    '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02',
    '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06',
];

let falhas = 0;
function checar(condicao, mensagem) {
    if (condicao) {
        console.log(`   OK    ${mensagem}`);
    } else {
        falhas++;
        console.log(`   FALHA ${mensagem}`);
    }
}

async function contar(sql, inicio, fim) {
    const consulta = `SELECT COUNT(*)::int AS linhas, COUNT(DISTINCT id_qldd)::int AS auditorias_distintas FROM (${sql}) r`;
    const { rows } = await pool.query(consulta, [inicio, fim]);
    return rows[0];
}

async function main() {
    const sqlNovo = lerSqlAtual();
    const sqlAntigo = lerSqlAnterior();

    console.log('=== VALIDACAO DE SQL_REPORTS_AUDITORIA ===\n');

    console.log('1) Volume por janela (antes -> depois)');
    for (const janela of JANELAS) {
        const novo = await contar(sqlNovo, janela.inicio, janela.fim);
        const repetidasNovo = novo.linhas - novo.auditorias_distintas;
        if (sqlAntigo) {
            const antigo = await contar(sqlAntigo, janela.inicio, janela.fim);
            console.log(
                `   ${janela.nome}: ${antigo.linhas} -> ${novo.linhas} linhas` +
                ` | auditorias distintas: ${antigo.auditorias_distintas} -> ${novo.auditorias_distintas}` +
                ` | linhas repetidas da MESMA auditoria: ${antigo.linhas - antigo.auditorias_distintas} -> ${repetidasNovo}`
            );
            checar(novo.linhas <= antigo.linhas, `[${janela.nome}] volume nao aumentou`);
        } else {
            console.log(`   ${janela.nome}: ${novo.linhas} linhas | ${novo.auditorias_distintas} auditorias distintas`);
        }
        checar(repetidasNovo === 0, `[${janela.nome}] nenhuma auditoria aparece 2x no CSV`);
    }

    console.log('\n2) Paridade com a tela /pme_notas/qualidade (1 amostra por colaborador/dia)');
    const divergentes = [];
    for (const dia of PARIDADE_DIAS) {
        const proximo = new Date(`${dia}T00:00:00Z`);
        proximo.setUTCDate(proximo.getUTCDate() + 1);
        const diaSeguinte = proximo.toISOString().split('T')[0];
        const [ano, mes, dd] = dia.split('-');
        const diaBR = `${dd}/${mes}/${ano}`;

        const extraido = await contar(sqlNovo, dia, diaSeguinte);
        const { rows: tela } = await pool.query(SQL_TELA, [`${diaBR}%`]);
        const telaAuditadas = tela[0].auditadas;
        const bate = extraido.linhas === telaAuditadas;
        if (!bate) divergentes.push({ dia, tela: telaAuditadas, extracao: extraido.linhas });
        checar(bate, `${dia}: tela=${telaAuditadas} auditadas | extracao=${extraido.linhas} ${bate ? '' : '<- divergente'}`);
    }
    if (divergentes.length) {
        console.log('   divergencias:', JSON.stringify(divergentes));
    }

    console.log('\n3) Rotulos de origem (nao devem vazar codigo bruto)');
    const { rows: origens } = await pool.query(
        `SELECT origem, COUNT(*)::int AS total FROM (${sqlNovo}) r GROUP BY origem ORDER BY total DESC`,
        ['2000-01-01', '2100-01-01']
    );
    for (const linha of origens) {
        console.log(`   ${String(linha.total).padStart(6)}  ${linha.origem}`);
    }
    const invalidas = origens.filter((o) => !ORIGENS_PERMITIDAS.has(o.origem));
    checar(invalidas.length === 0, `todas as origens caem em rotulos conhecidos${invalidas.length ? ' -> ' + JSON.stringify(invalidas) : ''}`);

    console.log('\n4) Colunas consumidas por public/reports.html');
    const { rows: amostra } = await pool.query(`SELECT * FROM (${sqlNovo}) r LIMIT 1`, ['2026-10-31', '2026-11-07']);
    const colunas = Object.keys(amostra[0] || {});
    const esperadas = [
        'id_qldd', 'anotacao', 'status', 'data_qualidade', 'analista_qualidade_id', 'reprova_bko',
        'codigo_tarefa', 'data_analise', 'cotacao', 'regional', 'tipo_de_pedido',
        'motivo_1_sistema_documento', 'motivo_2_erro', 'motivo_3_detalhamento', 'apontamento',
        'contestacao', 'obs', 'enviado', 'data_envio', 'semana', 'data_leitura', 'tipo_apontamento',
        'analista', 'auditado_nome', 'origem_codigo', 'origem',
    ];
    const faltando = esperadas.filter((c) => !colunas.includes(c));
    checar(faltando.length === 0, `${colunas.length} colunas retornadas${faltando.length ? ' | faltando: ' + faltando.join(', ') : ''}`);

    console.log('\n5) Cobertura do nome do colaborador auditado (coluna "analista" no CSV)');
    const { rows: preenchido } = await pool.query(
        `SELECT COUNT(*)::int AS total, COUNT(NULLIF(TRIM(analista), ''))::int AS com_nome FROM (${sqlNovo}) r`,
        ['2026-10-31', '2026-11-07']
    );
    console.log(`   ${preenchido[0].com_nome}/${preenchido[0].total} linhas com nome preenchido na janela de 7 dias`);
    checar(preenchido[0].com_nome > 0, 'coluna "analista" continua preenchida');

    console.log('\n6) Tempo de execucao do historico completo');
    const t0 = Date.now();
    await pool.query(sqlNovo, ['2000-01-01', '2100-01-01']);
    console.log(`   ${Date.now() - t0} ms`);

    console.log(`\n=== RESULTADO: ${falhas === 0 ? 'TODAS AS VERIFICACOES PASSARAM' : falhas + ' VERIFICACAO(OES) FALHARAM'} ===`);
    await pool.end();
    process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (erro) => {
    console.error('[erro]', erro);
    await pool.end();
    process.exit(1);
});

