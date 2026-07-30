const { Pool } = require('pg');

const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

async function check() {
    const r = await pool.query("SELECT DISTINCT status, COUNT(*) as qtd FROM db_bloco_de_notas.cotacao WHERE validacao='Ativo' GROUP BY status ORDER BY status");
    console.log('Status e quantidades:', JSON.stringify(r.rows, null, 2));
    
    // Verificar se a cotacao q1231123 ainda esta com correcao-efetivada
    const r2 = await pool.query("SELECT cotacao, status, data_da_ultima_atualizacao FROM db_bloco_de_notas.cotacao WHERE cotacao = 'q1231123' AND validacao = 'Ativo'");
    console.log('Cotacao q1231123:', JSON.stringify(r2.rows, null, 2));
    
    pool.end();
}

check().catch(e => { console.error(e); pool.end(); });