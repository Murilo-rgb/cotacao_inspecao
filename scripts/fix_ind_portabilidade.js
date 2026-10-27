// ============================================================
// One-off: normaliza db_bloco_de_notas.r_000250.ind_portabilidade
//
// Regra de negócio: o indicador de portabilidade é DERIVADO do tipo do pedido
//   tipo_pedido ILIKE '%port%'  ->  'SIM'
//   caso contrário              ->  'NAO'
//
// O valor vindo da planilha / db_claro não é confiável, por isso esta coluna é
// recalculada. Idempotente: pode ser executado mais de uma vez sem efeito colateral.
//
// Uso: node scripts/fix_ind_portabilidade.js
// ============================================================
const { Pool } = require('pg');
const { PORTABILIDADE_CASE_SQL } = require('../utils/etl_250');

const pool = new Pool({
  user: 'jose_faria',
  host: '10.230.43.181',
  database: 'db_operacao',
  password: 'vXsEha3PYB',
  port: 5432,
});

const TABELA = 'db_bloco_de_notas.r_000250';

(async () => {
  try {
    const antes = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE ind_portabilidade = 'SIM') AS sim,
        COUNT(*) FILTER (WHERE ind_portabilidade = 'NAO') AS nao,
        COUNT(*) FILTER (WHERE ind_portabilidade IS NULL OR ind_portabilidade NOT IN ('SIM','NAO')) AS outros,
        COUNT(*) FILTER (WHERE (tipo_pedido ILIKE '%port%') IS DISTINCT FROM (ind_portabilidade = 'SIM')) AS divergentes
      FROM ${TABELA}
    `);
    console.log('=== ANTES ===');
    console.log(antes.rows[0]);

    const res = await pool.query(`UPDATE ${TABELA} SET ind_portabilidade = ${PORTABILIDADE_CASE_SQL}`);
    console.log(`Registros atualizados: ${res.rowCount}`);

    const depois = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE ind_portabilidade = 'SIM') AS sim,
        COUNT(*) FILTER (WHERE ind_portabilidade = 'NAO') AS nao,
        COUNT(*) FILTER (WHERE (tipo_pedido ILIKE '%port%') IS DISTINCT FROM (ind_portabilidade = 'SIM')) AS divergentes
      FROM ${TABELA}
    `);
    console.log('=== DEPOIS ===');
    console.log(depois.rows[0]);
  } catch (error) {
    console.error('Erro ao normalizar ind_portabilidade:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
