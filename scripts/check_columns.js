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
    const r = await pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='db_bloco_de_notas' AND table_name='cotacao' ORDER BY ordinal_position"
    );
    console.log('Colunas da tabela cotacao:');
    r.rows.forEach(c => console.log('  ' + c.column_name + ' (' + c.data_type + ')'));
    await pool.end();
  } catch(e) { 
    console.error('Erro:', e); 
    await pool.end(); 
  }
})();