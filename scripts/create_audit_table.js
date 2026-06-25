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
        await pool.query(`
            CREATE TABLE IF NOT EXISTS db_bloco_de_notas.cotacao_audit (
                id SERIAL PRIMARY KEY,
                tarefa VARCHAR(255) NOT NULL,
                acao VARCHAR(50) NOT NULL,
                usuario_origem_id INTEGER,
                usuario_origem_nome VARCHAR(255),
                usuario_destino_id INTEGER,
                usuario_destino_nome VARCHAR(255),
                status_anterior VARCHAR(50),
                status_novo VARCHAR(50),
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                criado_por VARCHAR(255)
            );
        `);
        console.log('Tabela cotacao_audit criada com sucesso');

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_cotacao_audit_tarefa ON db_bloco_de_notas.cotacao_audit(tarefa);
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_cotacao_audit_data ON db_bloco_de_notas.cotacao_audit(data_criacao);
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_cotacao_audit_destino ON db_bloco_de_notas.cotacao_audit(usuario_destino_id);
        `);
        console.log('Índices criados com sucesso');
    } catch (err) {
        console.error('Erro:', err.message);
    } finally {
        await pool.end();
        process.exit(0);
    }
}
run();