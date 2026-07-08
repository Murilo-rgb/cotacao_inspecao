const { Pool } = require('pg');
const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

async function criarTabelaRanking() {
    try {
        // Verificar se a tabela já existe
        const existe = await pool.query(`
            SELECT EXISTS (
                SELECT FROM pg_tables
                WHERE schemaname = 'db_bloco_de_notas'
                AND tablename = 'ranking_colaboradores'
            )
        `);

        if (existe.rows[0].exists) {
            console.log('[INIT_RANKING] Tabela ranking_colaboradores já existe');
            return;
        }

        // Criar tabela
        await pool.query(`
            CREATE TABLE db_bloco_de_notas.ranking_colaboradores (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER,
                usuario_login VARCHAR(100),
                usuario_nome VARCHAR(200),
                periodo VARCHAR(10) NOT NULL CHECK (periodo IN ('dia', 'mes', 'geral')),
                data_referencia DATE,
                total_tratados INTEGER DEFAULT 0,
                posicao INTEGER,
                data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Criar índices
        await pool.query(`
            CREATE INDEX idx_ranking_periodo_data ON db_bloco_de_notas.ranking_colaboradores(periodo, data_referencia)
        `);

        await pool.query(`
            CREATE INDEX idx_ranking_usuario ON db_bloco_de_notas.ranking_colaboradores(usuario_id, periodo)
        `);

        // Criar view
        await pool.query(`
            CREATE OR REPLACE VIEW db_bloco_de_notas.vw_ranking AS
            SELECT 
                usuario_id,
                usuario_login,
                usuario_nome,
                periodo,
                data_referencia,
                total_tratados,
                posicao,
                data_atualizacao
            FROM db_bloco_de_notas.ranking_colaboradores
            ORDER BY periodo, posicao
        `);

        console.log('[INIT_RANKING] Tabela ranking_colaboradores criada com sucesso');
    } catch (error) {
        console.error('[INIT_RANKING] Erro:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

criarTabelaRanking();