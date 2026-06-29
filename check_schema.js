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
    // Check existing tables in db_qualidade
    const tables = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'db_qualidade' ORDER BY table_name"
    );
    console.log('Existing tables in db_qualidade:');
    tables.rows.forEach(r => console.log(' - ' + r.table_name));

    // Check columns of reprovas_padrao if exists
    const cols = await pool.query(
      "SELECT column_name, data_type, character_maximum_length FROM information_schema.columns WHERE table_schema = 'db_qualidade' AND table_name = 'reprovas_padrao' ORDER BY ordinal_position"
    );
    console.log('\nColumns of db_qualidade.reprovas_padrao:');
    cols.rows.forEach(c => console.log(` - ${c.column_name} (${c.data_type})`));

    // Check if reprovas_padrao has data
    const count = await pool.query('SELECT COUNT(*) FROM db_qualidade.reprovas_padrao');
    console.log('\nTotal rows in reprovas_padrao:', count.rows[0].count);

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await pool.end();
  }
}

check();