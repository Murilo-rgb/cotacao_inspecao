const { Pool } = require('pg');

const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

async function check() {
    // Verificar detalhes completos da cotacao q1231123
    const r = await pool.query("SELECT * FROM db_bloco_de_notas.cotacao WHERE cotacao = 'q1231123' AND validacao = 'Ativo'");
    console.log('Detalhes completos q1231123:', JSON.stringify(r.rows[0], null, 2));
    
    // Verificar se existe tarefa na r_000250
    if (r.rows[0] && r.rows[0].tarefa) {
        const r2 = await pool.query("SELECT cod_tarefa FROM db_bloco_de_notas.r_000250 WHERE cod_tarefa = $1", [r.rows[0].tarefa]);
        console.log('Existe na r_000250?', r2.rows.length > 0 ? 'SIM' : 'NAO');
    }
    
    // Verificar o data_historico_sla
    const r3 = await pool.query("SELECT cotacao, tarefa, status, data_historico, data_historico_sla FROM db_bloco_de_notas.cotacao WHERE cotacao = 'q1231123' AND validacao = 'Ativo'");
    console.log('Campos de data:', JSON.stringify(r3.rows, null, 2));
    
    pool.end();
}

check().catch(e => { console.error(e); pool.end(); });