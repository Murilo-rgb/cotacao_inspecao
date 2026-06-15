const { Pool } = require('pg');

const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

async function createUsersTable() {
    try {
        console.log('Conectando ao PostgreSQL...');
        
        // Criar tabela de usuários
        await pool.query(`
            CREATE TABLE IF NOT EXISTS db_bloco_de_notas.users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        `);
        console.log('Tabela users criada/verificada');

        // Criar usuário admin padrão (senha: admin123)
        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash('admin123', 10);
        const now = new Date().toISOString();
        
        try {
            await pool.query(
                'INSERT INTO db_bloco_de_notas.users (username, password, created_at) VALUES ($1, $2, $3)',
                ['admin', hashedPassword, now]
            );
            console.log('Usuário admin criado com sucesso (usuário: admin, senha: admin123)');
        } catch (error) {
            if (error.code === '23505') { // Unique violation
                console.log('Usuário admin já existe');
            } else {
                throw error;
            }
        }

        console.log('Setup de usuários concluído com sucesso!');
    } catch (error) {
        console.error('Erro ao configurar tabela de usuários:', error);
    } finally {
        await pool.end();
    }
}

createUsersTable();
