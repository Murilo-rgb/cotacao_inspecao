const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

async function runMigration() {
    try {
        const sqlPath = path.join(__dirname, 'migrate_auditoria.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        console.log('Executando migração...');
        await pool.query(sql);
        console.log('Migração executada com sucesso!');
        
        // Verificar colunas adicionadas
        const result = await pool.query(
            "SELECT column_name FROM information_schema.columns WHERE table_schema='db_bloco_de_notas' AND table_name='auditoria_qualidade' ORDER BY ordinal_position"
        );
        console.log('\nColunas atuais da tabela auditoria_qualidade:');
        result.rows.forEach(col => console.log('  -', col.column_name));
        
    } catch (error) {
        console.error('Erro na migração:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigration();