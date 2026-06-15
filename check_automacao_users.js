const { Pool } = require('pg');

const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

async function checkAutomacaoUsers() {
    try {
        console.log('Verificando tabela db_automacao.usuarios...\n');
        
        // Verificar se a tabela existe
        const tableCheck = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'db_automacao' 
            AND table_name = 'usuarios'
        `);
        
        if (tableCheck.rows.length === 0) {
            console.log('Tabela db_automacao.usuarios não existe');
            return;
        }
        
        console.log('Tabela db_automacao.usuarios existe\n');
        
        // Verificar estrutura da tabela
        const columns = await pool.query(`
            SELECT column_name, data_type, character_maximum_length
            FROM information_schema.columns
            WHERE table_schema = 'db_automacao'
            AND table_name = 'usuarios'
            ORDER BY ordinal_position
        `);
        
        console.log('Estrutura da tabela:');
        columns.rows.forEach(col => {
            console.log(`- ${col.column_name}: ${col.data_type}${col.character_maximum_length ? `(${col.character_maximum_length})` : ''}`);
        });
        
        // Verificar dados existentes
        const data = await pool.query('SELECT * FROM db_automacao.usuarios LIMIT 5');
        console.log(`\nTotal de registros: ${data.rowCount}`);
        
        if (data.rows.length > 0) {
            console.log('\nDados encontrados:');
            data.rows.forEach((row, index) => {
                console.log(`\nRegistro ${index + 1}:`);
                Object.keys(row).forEach(key => {
                    console.log(`  ${key}: ${row[key]}`);
                });
            });
        }
        
    } catch (error) {
        console.error('Erro ao verificar tabela:', error);
    } finally {
        await pool.end();
    }
}

checkAutomacaoUsers();
