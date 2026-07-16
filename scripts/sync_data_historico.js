const { Pool } = require('pg');

const pool = new Pool({
  user: 'jose_faria',
  host: '10.230.43.181',
  database: 'db_operacao',
  password: 'vXsEha3PYB',
  port: 5432,
});

(async () => {
  try {
    // 1. Popular data_historico na cotacao a partir de r_000250 (origem inspeção)
    const res = await pool.query(`
      UPDATE db_bloco_de_notas.cotacao c
      SET data_historico = r.dat_historico::timestamp
      FROM db_bloco_de_notas.r_000250 r
      WHERE c.tarefa = r.cod_tarefa
        AND (c.origem IS NULL OR c.origem = '' OR c.origem = 'r_000250')
        AND c.data_historico IS NULL
    `);
    console.log('Registros atualizados a partir de r_000250:', res.rowCount);

    // 2. Popular data_historico na cotacao a partir de iw_cpc_975_net (origem input_net)
    const res2 = await pool.query(`
      UPDATE db_bloco_de_notas.cotacao c
      SET data_historico = iw.data_historico::timestamp
      FROM db_bloco_de_notas.iw_cpc_975_net iw
      WHERE c.tarefa = iw.codigo_da_tarefa
        AND c.origem = 'iw_cpc_975_net'
        AND c.data_historico IS NULL
    `);
    console.log('Registros atualizados a partir de iw_cpc_975_net:', res2.rowCount);

    await pool.end();
    console.log('Script concluido!');
  } catch(e) { 
    console.error('Erro:', e); 
    await pool.end(); 
  }
})();