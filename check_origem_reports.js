const { Pool } = require('pg');

const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

// Query NOVA (a que sera colocada em server.js)
const SQL_NOVO = `
  SELECT aq.id_qldd, aq.anotacao, aq.status, aq.data_qualidade, aq.analista_qualidade_id, aq.reprova_bko,
         aq.codigo_tarefa, aq.data_analise, aq.cotacao, aq.regional, aq.tipo_de_pedido,
         aq.motivo_1_sistema_documento, aq.motivo_2_erro, aq.motivo_3_detalhamento, aq.apontamento,
         aq.contestacao, aq.obs, aq.enviado, aq.data_envio, aq.semana, aq.data_leitura, aq.tipo_apontamento,
         TRIM(COALESCE(u_analista.nome, '') || ' ' || COALESCE(u_analista.sobrenome, '')) AS analista,
         TRIM(COALESCE(u_auditado.nome, '') || ' ' || COALESCE(u_auditado.sobrenome, '')) AS auditado_nome,
         o.origem_codigo,
         COALESCE(o.origem, 'Nao identificado') AS origem
  FROM db_bloco_de_notas.auditoria_qualidade aq
  LEFT JOIN db_bloco_de_notas.cotacao c ON c.tarefa = aq.codigo_tarefa
  LEFT JOIN db_automacao.usuarios u_analista ON u_analista.id::TEXT = c.usuario_id::TEXT
  LEFT JOIN db_automacao.usuarios u_auditado ON u_auditado.id::TEXT = aq.analista_qualidade_id::TEXT
  LEFT JOIN LATERAL (
    SELECT c2.origem AS origem_codigo,
           CASE
             WHEN EXISTS (SELECT 1 FROM db_bloco_de_notas.hoteis_x_hospitais hh WHERE hh.id_tarefa = aq.codigo_tarefa) THEN 'HH'
             WHEN c2.origem = 'r_000250' THEN 'Inspecao'
             WHEN c2.origem = 'iw_cpc_975_net' THEN 'Input NET'
             WHEN c2.origem = 'iw_cpc_975_top' THEN 'Input TOP'
             WHEN c2.origem IN ('h_x_h', 'hoteis_x_hospitais') THEN 'HH'
             WHEN c2.origem = 'cortesia' THEN 'Cortesia'
             WHEN c2.origem = 'manual' THEN 'Manual'
             WHEN c2.origem IS NULL OR TRIM(c2.origem) = '' THEN 'Inspecao'
             ELSE c2.origem
           END AS origem
    FROM db_bloco_de_notas.cotacao c2
    WHERE c2.tarefa = aq.codigo_tarefa
    ORDER BY (c2.origem IS NOT NULL AND TRIM(c2.origem) <> '') DESC,
             (c2.id_qldd IS NOT NULL AND c2.id_qldd = aq.id_qldd) DESC,
             c2.id_cotacao DESC
    LIMIT 1
  ) o ON TRUE
  WHERE aq.data_qualidade >= $1::date AND aq.data_qualidade < $2::date
  ORDER BY aq.data_qualidade DESC
`;

// Query ANTIGA (a que esta hoje em server.js)
const SQL_ANTIGO = `
  SELECT aq.id_qldd, aq.anotacao, aq.status, aq.data_qualidade, aq.analista_qualidade_id, aq.reprova_bko,
         aq.codigo_tarefa, aq.data_analise, aq.cotacao, aq.regional, aq.tipo_de_pedido,
         aq.motivo_1_sistema_documento, aq.motivo_2_erro, aq.motivo_3_detalhamento, aq.apontamento,
         aq.contestacao, aq.obs, aq.enviado, aq.data_envio, aq.semana, aq.data_leitura,
         TRIM(COALESCE(u_analista.nome, '') || ' ' || COALESCE(u_analista.sobrenome, '')) AS analista,
         TRIM(COALESCE(u_auditado.nome, '') || ' ' || COALESCE(u_auditado.sobrenome, '')) AS auditado_nome
  FROM db_bloco_de_notas.auditoria_qualidade aq
  LEFT JOIN db_bloco_de_notas.cotacao c ON c.tarefa = aq.codigo_tarefa
  LEFT JOIN db_automacao.usuarios u_analista ON u_analista.id::TEXT = c.usuario_id::TEXT
  LEFT JOIN db_automacao.usuarios u_auditado ON u_auditado.id::TEXT = aq.analista_qualidade_id::TEXT
  WHERE aq.data_qualidade >= $1::date AND aq.data_qualidade < $2::date
  ORDER BY aq.data_qualidade DESC
`;

async function main() {
    try {
        // 1) Tipos das colunas usadas no join
        const cols = await pool.query(
            `SELECT table_name, column_name, data_type
               FROM information_schema.columns
              WHERE table_schema = 'db_bloco_de_notas'
                AND table_name IN ('cotacao', 'hoteis_x_hospitais', 'auditoria_qualidade')
                AND column_name IN ('id_cotacao', 'id_qldd', 'tarefa', 'origem', 'usuario_id', 'id_tarefa', 'codigo_tarefa')
              ORDER BY table_name, column_name`
        );
        console.log('=== COLUNAS USADAS NO JOIN ===');
        for (const r of cols.rows) {
            console.log(`  ${r.table_name}.${r.column_name} : ${r.data_type}`);
        }

        // 2) Periodo de teste: ultimos 180 dias
        const hoje = new Date();
        const fim = new Date(hoje);
        fim.setDate(fim.getDate() + 1);
        const ini = new Date(hoje);
        ini.setDate(ini.getDate() - 180);
        const p1 = ini.toISOString().split('T')[0];
        const p2 = fim.toISOString().split('T')[0];
        console.log(`\n=== PERIODO: ${p1} ate ${p2} ===`);

        const cntAntigo = await pool.query(`SELECT COUNT(*)::int AS qtd FROM (${SQL_ANTIGO}) x`, [p1, p2]);
        const cntNovo = await pool.query(`SELECT COUNT(*)::int AS qtd FROM (${SQL_NOVO}) x`, [p1, p2]);
        console.log(`Linhas query ANTIGA : ${cntAntigo.rows[0].qtd}`);
        console.log(`Linhas query NOVA   : ${cntNovo.rows[0].qtd}`);
        console.log(`Iguais? ${cntAntigo.rows[0].qtd === cntNovo.rows[0].qtd ? 'SIM [OK]' : 'NAO [FALHOU]'}`);

        // 3) Distribuicao de origem
        const dist = await pool.query(
            `SELECT origem, COUNT(*)::int AS qtd
               FROM (${SQL_NOVO}) x
              GROUP BY origem
              ORDER BY qtd DESC`,
            [p1, p2]
        );
        console.log('\n=== DISTRIBUICAO DE ORIGEM (180 dias) ===');
        for (const r of dist.rows) {
            console.log(`  ${String(r.origem).padEnd(20)} ${r.qtd}`);
        }

        // 4) Amostra conhecida
        const amostra = await pool.query(
            `SELECT codigo_tarefa, origem, origem_codigo, data_qualidade::date AS data
               FROM (${SQL_NOVO}) x
              WHERE codigo_tarefa = $3
              LIMIT 5`,
            [p1, p2, '23223417']
        );
        console.log('\n=== AMOSTRA tarefa 23223417 ===');
        console.log(amostra.rows.length ? JSON.stringify(amostra.rows, null, 2) : '  (sem registro no periodo)');

        // 5) Sanidade: origem nula/vazia e duplicidade por tarefa+data
        const nulos = await pool.query(
            `SELECT COUNT(*)::int AS qtd FROM (${SQL_NOVO}) x WHERE origem IS NULL OR TRIM(origem) = ''`,
            [p1, p2]
        );
        console.log(`\nOrigens nulas/vazias: ${nulos.rows[0].qtd} (esperado 0)`);

        const dup = await pool.query(
            `SELECT COUNT(*)::int AS qtd FROM (
                SELECT codigo_tarefa, data_qualidade, COUNT(*) c
                  FROM (${SQL_ANTIGO}) x
                 GROUP BY 1, 2 HAVING COUNT(*) > 1
             ) y`,
            [p1, p2]
        );
        console.log(`Grupos (tarefa+data) duplicados na query ANTIGA: ${dup.rows[0].qtd}`);
    } catch (e) {
        console.error('ERRO:', e.message);
        if (e.position) console.error('Posicao no SQL:', e.position);
    } finally {
        await pool.end();
    }
}

main();

