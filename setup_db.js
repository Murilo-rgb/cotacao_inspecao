const { Pool } = require('pg');

const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

async function setupDatabase() {
    try {
        console.log('Conectando ao PostgreSQL...');
        
        // Criar esquema
        await pool.query(`
            CREATE SCHEMA IF NOT EXISTS db_bloco_de_notas
        `);
        console.log('Esquema db_bloco_de_notas criado/verificado');

        // Deletar tabela antiga se existir
        await pool.query(`
            DROP TABLE IF EXISTS db_bloco_de_notas.quotations
        `);
        console.log('Tabela antiga deletada');

        // Criar tabela sem id e com novos nomes de colunas
        await pool.query(`
            CREATE TABLE db_bloco_de_notas.quotations (
                cotacao TEXT PRIMARY KEY,
                anotacao TEXT,
                status TEXT DEFAULT 'pendente',
                data_de_criacao TEXT,
                data_da_ultima_atualizacao TEXT
            )
        `);
        console.log('Tabela quotations criada com novos nomes de colunas');

        // Criar índice para busca
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_quotations_anotacao 
            ON db_bloco_de_notas.quotations(anotacao)
        `);
        console.log('Índice criado/verificado');

        console.log('Setup do banco de dados concluído com sucesso!');
    } catch (error) {
        console.error('Erro ao configurar banco de dados:', error);
    } finally {
        await pool.end();
    }
}

setupDatabase();
