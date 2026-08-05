const { Pool } = require('pg');

const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

async function run() {
    try {
        await pool.query('ALTER TABLE db_bloco_de_notas.auditoria_qualidade ADD COLUMN IF NOT EXISTS data_leitura TIMESTAMP DEFAULT NULL');
        console.log('COLUNA data_leitura CRIADA COM SUCESSO');
    } catch (err) {
        console.error('ERRO:', err.message);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

run();