const { Pool } = require('pg');

const pool = new Pool({
  host: '10.230.43.181',
  port: 5432,
  user: 'jose_faria',
  password: 'vXsEha3PYB',
  database: 'db_operacao',
});

async function check() {
  try {
    // Schema da tabela cotacao
    const cotacao = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default 
       FROM information_schema.columns 
       WHERE table_schema = 'db_bloco_de_notas' AND table_name = 'cotacao' 
       ORDER BY ordinal_position`
    );
    console.log('=== Tabela cotacao (db_bloco_de_notas) ===');
    console.log(JSON.stringify(cotacao.rows, null, 2));

    // Schema da tabela auditoria_qualidade
    const audit = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default 
       FROM information_schema.columns 
       WHERE table_schema = 'db_bloco_de_notas' AND table_name = 'auditoria_qualidade' 
       ORDER BY ordinal_position`
    );
    console.log('\n=== Tabela auditoria_qualidade (db_bloco_de_notas) ===');
    console.log(JSON.stringify(audit.rows, null, 2));

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await pool.end();
  }
}

check();