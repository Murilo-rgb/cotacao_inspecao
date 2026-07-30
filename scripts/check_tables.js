const { Pool } = require('pg');
const pool = new Pool({ user: 'jose_faria', host: '10.230.43.181', database: 'db_operacao', password: 'vXsEha3PYB', port: 5432 });
(async () => {
  try {
    const r = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'db_bloco_de_notas' AND (table_name LIKE '%iw_cpc_975%' OR table_name LIKE '%r_000250%') ORDER BY table_name");
    console.log('Tabelas encontradas:');
    r.rows.forEach(t => console.log('  - ' + t.table_name));
  } catch(e) { console.error(e.message); } finally { await pool.end(); }
})();