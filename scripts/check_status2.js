const { Pool } = require('pg');

const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

async function check() {
    const r = await pool.query("SELECT COUNT(*) as total FROM db_bloco_de_notas.cotacao WHERE status = 'correcao-efetivada'");
    console.log('Total com correcao-efetivada:', r.rows[0].total);
    
    const r2 = await pool.query("SELECT cotacao, status, data_da_ultima_atualizacao FROM db_bloco_de_notas.cotacao WHERE status = 'correcao-efetivada' LIMIT 5");
    console.log('Amostra:', JSON.stringify(r2.rows, null, 2));
    
    pool.end();
}

check().catch(e => { console.error(e); pool.end(); });