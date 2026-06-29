const { Pool } = require('pg');

async function main() {
  const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432
  });

  try {
    // Check if schema db_qualidade exists
    let res = await pool.query(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'db_qualidade'"
    );
    console.log('Schema db_qualidade existe:', res.rows.length > 0);

    if (res.rows.length > 0) {
      res = await pool.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'db_qualidade'"
      );
      console.log('Tabelas existentes em db_qualidade:', res.rows.map(x => x.table_name));
    }

    // Check if db_qualidade database exists
    res = await pool.query(
      "SELECT datname FROM pg_database WHERE datname = 'db_qualidade'"
    );
    console.log('Database db_qualidade existe:', res.rows.length > 0);
    
  } catch(e) {
    console.error('Erro:', e.message);
  } finally {
    await pool.end();
  }
}

main();