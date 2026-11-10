// Diagnostico: a extracao garante 1 linha por colaborador/dia, mas a chave NAO inclui a origem.
// Este script mede quantos colaboradores/dia tem auditoria em mais de uma origem (e portanto
// perdem uma das origens no CSV) e como anda o Input TOP.
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

const JANELA = { inicio: process.argv[2] || '2026-10-07', fim: process.argv[3] || '2026-11-07' };

function sqlDoArquivo() {
    const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
    const m = src.match(/const SQL_REPORTS_AUDITORIA = `([\s\S]*?)`;/);
    if (!m) throw new Error('SQL_REPORTS_AUDITORIA nao encontrada em server.js');
    return m[1];
}

// Mesmo LATERAL do server.js, porem SEM a deduplicacao (para ver o que existe por tras)
const BASE_SEM_DEDUP = `
  SELECT aq.id_qldd,
         (aq.data_qualidade)::date AS dia,
         o.usuario_id,
         o.origem_codigo
  FROM db_bloco_de_notas.auditoria_qualidade aq
  LEFT JOIN LATERAL (
    SELECT c.usuario_id, c.origem AS origem_codigo
    FROM db_bloco_de_notas.cotacao c
    WHERE c.tarefa = aq.codigo_tarefa
    ORDER BY (c.id_qldd IS NOT NULL AND c.id_qldd = aq.id_qldd) DESC,
             (c.origem IS NOT NULL AND TRIM(c.origem) <> '') DESC,
             c.id_cotacao DESC
    LIMIT 1
  ) o ON TRUE
  WHERE aq.data_qualidade >= $1::date AND aq.data_qualidade < $2::date
`;

async function main() {
    const sqlNovo = sqlDoArquivo();

    console.log(`=== JANELA ${JANELA.inicio} a ${JANELA.fim} ===\n`);

    console.log('1) Colaboradores/dia com auditoria em MAIS DE UMA origem (perdem 1 origem no CSV)');
    const { rows: multi } = await pool.query(
        `SELECT COUNT(*)::int AS colaboradores_dia
         FROM (
             SELECT usuario_id, dia
             FROM (${BASE_SEM_DEDUP}) b
             WHERE usuario_id IS NOT NULL
             GROUP BY usuario_id, dia
             HAVING COUNT(DISTINCT COALESCE(origem_codigo, 'SEM_COTACAO')) > 1
         ) x`,
        [JANELA.inicio, JANELA.fim]
    );
    console.log(`   ${multi[0].colaboradores_dia}\n`);

    console.log('2) Exemplos (3 primeiros), com as origens envolvidas');
    const { rows: exemplos } = await pool.query(
        `SELECT usuario_id, dia,
                COUNT(*)::int AS auditorias,
                STRING_AGG(DISTINCT COALESCE(origem_codigo, 'SEM_COTACAO'), ' + ') AS origens
         FROM (${BASE_SEM_DEDUP}) b
         WHERE usuario_id IS NOT NULL
         GROUP BY usuario_id, dia
         HAVING COUNT(DISTINCT COALESCE(origem_codigo, 'SEM_COTACAO')) > 1
         ORDER BY dia DESC
         LIMIT 3`,
        [JANELA.inicio, JANELA.fim]
    );
    for (const e of exemplos) {
        console.log(`   usuario ${e.usuario_id} em ${e.dia.toISOString().slice(0, 10)}: ${e.auditorias} auditoria(s) -> ${e.origens}`);
    }

    console.log('\n3) Auditorias por origem: atras do CSV x no CSV');
    const { rows: porOrigem } = await pool.query(
        `SELECT COALESCE(origem_codigo, 'SEM_COTACAO') AS origem_codigo,
                COUNT(*)::int AS auditorias,
                COUNT(DISTINCT (usuario_id, dia))::int AS colaboradores_dia
         FROM (${BASE_SEM_DEDUP}) b
         GROUP BY 1 ORDER BY 2 DESC`,
        [JANELA.inicio, JANELA.fim]
    );
    for (const o of porOrigem) {
        console.log(`   ${String(o.auditorias).padStart(4)} auditorias | ${String(o.colaboradores_dia).padStart(4)} colaborador/dia | ${o.origem_codigo}`);
    }
    const { rows: noCsv } = await pool.query(
        `SELECT origem, COUNT(*)::int AS linhas FROM (${sqlNovo}) r GROUP BY origem ORDER BY 2 DESC`,
        [JANELA.inicio, JANELA.fim]
    );
    console.log('   --- no CSV final:');
    for (const o of noCsv) {
        console.log(`   ${String(o.linhas).padStart(4)} linhas | ${o.origem}`);
    }

    console.log('\n4) Input TOP: por que nao aparece');
    const { rows: top } = await pool.query(
        `SELECT COUNT(*)::int AS cotacoes,
                COUNT(*) FILTER (WHERE id_qldd IS NOT NULL)::int AS com_id_qldd,
                COUNT(DISTINCT usuario_id)::int AS colaboradores
         FROM db_bloco_de_notas.cotacao WHERE origem = 'iw_cpc_975_top'`
    );
    console.log(`   cotacoes 'iw_cpc_975_top': ${top[0].cotacoes} | com id_qldd: ${top[0].com_id_qldd} | colaboradores: ${top[0].colaboradores}`);

    const { rows: topAud } = await pool.query(
        `SELECT COUNT(*)::int AS auditorias_ligadas
         FROM db_bloco_de_notas.auditoria_qualidade aq
         JOIN db_bloco_de_notas.cotacao c ON c.id_qldd = aq.id_qldd
         WHERE c.origem = 'iw_cpc_975_top'`
    );
    console.log(`   auditorias ligadas a essas cotacoes: ${topAud[0].auditorias_ligadas}`);

    const { rows: origensCotacao } = await pool.query(
        `SELECT COALESCE(NULLIF(TRIM(origem), ''), '(vazia)') AS origem, COUNT(*)::int AS total
         FROM db_bloco_de_notas.cotacao
         WHERE origem LIKE 'iw_cpc_975%' OR origem LIKE '%top%' OR origem LIKE '%net%'
         GROUP BY 1 ORDER BY 2 DESC`
    );
    console.log('   valores de origem relacionadas:');
    for (const o of origensCotacao) console.log(`     ${String(o.total).padStart(6)}  ${o.origem}`);

    console.log('\n5) Quem e o "usuario" da chave na Inspecao (r_000250)?');
    const { rows: inspecao } = await pool.query(
        `SELECT c.usuario_id, c.usuario_login, COUNT(*)::int AS auditorias
         FROM db_bloco_de_notas.auditoria_qualidade aq
         JOIN db_bloco_de_notas.cotacao c ON c.id_qldd = aq.id_qldd
         WHERE c.origem = 'r_000250'
         GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 8`
    );
    for (const i of inspecao) console.log(`   ${String(i.auditorias).padStart(5)} auditorias | usuario_id ${i.usuario_id} | login ${i.usuario_login}`);
    const { rows: distintos } = await pool.query(
        `SELECT COUNT(DISTINCT c.usuario_id)::int AS ids, COUNT(DISTINCT c.usuario_login)::int AS logins
         FROM db_bloco_de_notas.auditoria_qualidade aq
         JOIN db_bloco_de_notas.cotacao c ON c.id_qldd = aq.id_qldd
         WHERE c.origem = 'r_000250'`
    );
    console.log(`   distintos no historico: ${distintos[0].ids} usuario_id | ${distintos[0].logins} usuario_login`);

    console.log('\n6) Exemplo de colaborador/dia com varias auditorias na Inspecao');
    const { rows: exemplo } = await pool.query(
        `SELECT aq.id_qldd, aq.codigo_tarefa, (aq.data_qualidade)::date AS dia, c.usuario_id, c.usuario_login, c.cotacao
         FROM db_bloco_de_notas.auditoria_qualidade aq
         JOIN db_bloco_de_notas.cotacao c ON c.id_qldd = aq.id_qldd
         WHERE c.origem = 'r_000250'
           AND (c.usuario_id, (aq.data_qualidade)::date) IN (
               SELECT c2.usuario_id, (aq2.data_qualidade)::date
               FROM db_bloco_de_notas.auditoria_qualidade aq2
               JOIN db_bloco_de_notas.cotacao c2 ON c2.id_qldd = aq2.id_qldd
               WHERE c2.origem = 'r_000250'
               GROUP BY 1, 2 HAVING COUNT(*) > 1
               ORDER BY COUNT(*) DESC LIMIT 1
           )
         ORDER BY aq.id_qldd DESC`
    );
    for (const e of exemplo) {
        console.log(`   audit ${e.id_qldd} | tarefa ${e.codigo_tarefa} | ${e.dia.toISOString().slice(0, 10)} | usuario_id ${e.usuario_id} | login ${e.usuario_login} | cotacao ${e.cotacao}`);
    }

    console.log('\n7) Grupos que a dedup junta na Inspecao: mesmo usuario_id, mesmo dia, logins iguais ou diferentes?');
    const { rows: grupos } = await pool.query(
        `SELECT COUNT(*)::int AS grupos_com_varias_auditorias,
                COUNT(*) FILTER (WHERE logins > 1)::int AS grupos_com_logins_distintos,
                SUM(auditorias - 1)::int AS linhas_removidas,
                SUM(auditorias - 1) FILTER (WHERE logins > 1)::int AS removidas_com_logins_distintos
         FROM (
             SELECT c.usuario_id, (aq.data_qualidade)::date AS dia,
                    COUNT(*)::int AS auditorias,
                    COUNT(DISTINCT c.usuario_login)::int AS logins
             FROM db_bloco_de_notas.auditoria_qualidade aq
             JOIN db_bloco_de_notas.cotacao c ON c.id_qldd = aq.id_qldd
             WHERE c.origem = 'r_000250'
               AND aq.data_qualidade >= $1::date AND aq.data_qualidade < $2::date
             GROUP BY 1, 2 HAVING COUNT(*) > 1
         ) x`,
        [JANELA.inicio, JANELA.fim]
    );
    console.log(`   grupos: ${grupos[0].grupos_com_varias_auditorias} (${grupos[0].grupos_com_logins_distintos} com logins diferentes)`);
    console.log(`   linhas removidas: ${grupos[0].linhas_removidas} (${grupos[0].removidas_com_logins_distintos || 0} em grupos com logins diferentes)`);

    await pool.end();
}

main().catch(async (e) => {
    console.error('[erro]', e.message || e);
    await pool.end();
    process.exit(1);
});
