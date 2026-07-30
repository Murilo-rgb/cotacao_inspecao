const { Pool } = require('pg');
const pool = new Pool({ user: 'jose_faria', host: '10.230.43.181', database: 'db_operacao', password: 'vXsEha3PYB', port: 5432 });
(async () => {
  try {
    const r = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'db_bloco_de_notas' AND table_name = 'iw_cpc_975_top' ORDER BY ordinal_position");
    console.log('Colunas iw_cpc_975_top:');
    r.rows.forEach(c => console.log('  - ' + c.column_name + ' (' + c.data_type + ')'));
    console.log('\n---');
    const r2 = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'db_bloco_de_notas' AND table_name = 'iw_cpc_975_net' ORDER BY ordinal_position");
    console.log('Colunas iw_cpc_975_net:');
    r2.rows.forEach(c => console.log('  - ' + c.column_name + ' (' + c.data_type + ')'));
  } catch(e) { console.error(e.message); } finally { await pool.end(); }
})();