const { Pool } = require('pg');

const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

async function addUsuarioLoginColumn() {
    try {
        console.log('=== ADICIONANDO COLUNA usuario_login À TABELA cotacao ===\n');
        
        // Verificar se a coluna já existe
        const checkColumn = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'db_bloco_de_notas' 
            AND table_name = 'cotacao' 
            AND column_name = 'usuario_login'
        `);
        
        if (checkColumn.rows.length > 0) {
            console.log('✅ Coluna usuario_login já existe na tabela\n');
            return;
        }
        
        // Adicionar coluna usuario_login
        await pool.query(`
            ALTER TABLE db_bloco_de_notas.cotacao 
            ADD COLUMN usuario_login VARCHAR(50)
        `);
        
        console.log('✅ Coluna usuario_login adicionada com sucesso\n');
        
        // Verificar a estrutura da tabela
        const tableStructure = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'db_bloco_de_notas' 
            AND table_name = 'cotacao' 
            ORDER BY ordinal_position
        `);
        
        console.log('=== ESTRUTURA ATUAL DA TABELA cotacao ===\n');
        tableStructure.rows.forEach(col => {
            console.log(`- ${col.column_name}: ${col.data_type}`);
        });
        
    } catch (error) {
        console.error('Erro ao adicionar coluna:', error);
    } finally {
        await pool.end();
    }
}

addUsuarioLoginColumn();
