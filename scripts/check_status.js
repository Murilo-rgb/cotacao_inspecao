const { Pool } = require('pg');

const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

pool.query("SELECT DISTINCT status FROM db_bloco_de_notas.cotacao WHERE status LIKE '%correcao%' OR status LIKE '%correção%' OR status LIKE '%efetiv%' OR status LIKE '%efetu%' ORDER BY status")
    .then(r => { 
        console.log('Status encontrados:', JSON.stringify(r.rows, null, 2)); 
        pool.end(); 
    })
    .catch(e => { 
        console.error(e); 
        pool.end(); 
    });