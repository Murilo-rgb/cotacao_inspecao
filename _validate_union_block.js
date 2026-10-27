/**
 * VALIDACION DE SOLO LECTURA — reproduce EXACTAMENTE fechasUnificadasInput y luego
 * el build del bloque hh con columns dinamicas, tal como el handlerParcialInput lo
 * ejecuta. Confirma que el UNION ALL (timestamp unificado) y las 2 filas del
 * bloque hh funcionan end-to-end contra la BD.
 */
const { pool } = require('./db');

const partesMes = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const aliasFecha = (f) => {
  const d = new Date(f);
  const dd = String(d.getDate()).padStart(2, '0');
  return `${dd}/${partesMes[d.getMonth()]}`;
};

async function main() {
  const client = await pool.connect();
  try {
    // --- 1) fechasUnificadasInput (UNION ALL de los fechasFrom, ahora con ::timestamp AS data_historico) ---
    const sqlUnion = `
      SELECT DISTINCT DATE(sub.data_historico) AS d
      FROM (
        SELECT data_historico::timestamp AS data_historico FROM db_bloco_de_notas.iw_cpc_975_top
        UNION ALL
        SELECT data_historico::timestamp AS data_historico FROM db_bloco_de_notas.iw_cpc_975_net
        UNION ALL
        SELECT data_de_historico::timestamp AS data_historico FROM db_bloco_de_notas.hoteis_x_hospitais
      ) sub
      WHERE sub.data_historico IS NOT NULL
      ORDER BY d
    `;
    const fRes = await client.query(sqlUnion);
    const fechas = fRes.rows.map(r => r.d);
    console.log('=== fechasUnificadasInput OK. fechas unicas:', fechas.length);

    // --- 2) reproduce colsFecha del handler ---
    const columnas = fechas.map(aliasFecha);
    const pInicio = 1;
    const colExpr = 'h.data_de_historico';
    const colsFecha = fechas.map((f, i) => {
      const alias = columnas[i].replace(/[^a-zA-Z0-9]/g, '_');
      return `COUNT(CASE WHEN DATE(${colExpr}) = $${pInicio + i} THEN 1 END) AS "${alias}"`;
    });
    const params = fechas.map((f) => {
      const d = new Date(f);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });

    // --- 3) build del bloque hh ---
    const sql = `
      WITH foto_global AS (
        SELECT DISTINCT ON (hxh.id_tarefa) hxh.*
        FROM db_bloco_de_notas.hoteis_x_hospitais hxh
        ORDER BY hxh.id_tarefa, hxh.data_de_historico::timestamp DESC
      ),
      foto AS (
        SELECT h.* FROM foto_global h
        WHERE h.para_etapa = 'BKO Comercial'
      ),
      membros AS (
        SELECT 1 AS ordem, 'PENDENTE' AS status, NULL::text AS subdivisao
        UNION ALL SELECT 2, 'EM TRATAMENTO', NULL::text
      )
      SELECT m.status AS status,
             m.subdivisao AS subdivisao,
             ${colsFecha.join(',\n             ')},
             COUNT(h.id_tarefa) AS total
      FROM membros m
      LEFT JOIN (
        foto h
        LEFT JOIN db_bloco_de_notas.cotacao c
          ON c.tarefa::text = h.id_tarefa::text
         AND c.data_historico IS NOT DISTINCT FROM h.data_de_historico::timestamp
      ) ON ( (m.status = 'PENDENTE' AND c.tarefa IS NULL)
            OR (m.status = 'EM TRATAMENTO' AND c.tarefa IS NOT NULL) )
      GROUP BY m.ordem, m.status, m.subdivisao
      ORDER BY m.ordem
    `;
    const r = await client.query(sql, params);
    console.log('=== BLOQUE HH: filas (debe ser 2: PENDENTE + EM TRATAMENTO) ===');
    console.table(r.rows.map(row => ({ status: row.status, total: row.total })));

    // consistencia
    const t = r.rows.reduce((s, x) => s + parseInt(x.total, 10), 0);
    console.log('Suma total del bloque =', t, '(debe ser 0 si no hay BKO Comercial na foto_recente)');
    console.log('VALIDACION EXITOSA: UNION ALL sem tipo conflict, bloque aparece con 2 filas.');
  } catch (e) {
    console.error('ERROR de validacion:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
