const { Pool } = require('pg');

const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

async function verificar() {
    try {
        // Verificar estrutura da tabela auditoria_qualidade
        const result = await pool.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'db_bloco_de_notas' 
              AND table_name = 'auditoria_qualidade'
            ORDER BY ordinal_position
        `);

        console.log('=== ESTRUTURA DA TABELA db_bloco_de_notas.auditoria_qualidade ===\n');
        console.log('Coluna'.padEnd(35) + 'Tipo'.padEnd(30) + 'Nullable'.padEnd(10) + 'Default');
        console.log('-'.repeat(100));

        for (const col of result.rows) {
            console.log(
                col.column_name.padEnd(35) + 
                col.data_type.padEnd(30) + 
                col.is_nullable.padEnd(10) + 
                (col.column_default || '')
            );
        }

        console.log('\nTotal de colunas: ' + result.rows.length);

        // Verificar também a tabela cotacao para referência
        const cotacaoResult = await pool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'db_bloco_de_notas' 
              AND table_name = 'cotacao'
            ORDER BY ordinal_position
        `);

        console.log('\n\n=== ESTRUTURA DA TABELA db_bloco_de_notas.cotacao ===\n');
        console.log('Coluna'.padEnd(35) + 'Tipo'.padEnd(30) + 'Nullable');
        console.log('-'.repeat(80));

        for (const col of cotacaoResult.rows) {
            console.log(
                col.column_name.padEnd(35) + 
                col.data_type.padEnd(30) + 
                col.is_nullable
            );
        }

        console.log('\nTotal de colunas: ' + cotacaoResult.rows.length);

    } catch (e) {
        console.error('ERRO:', e.message);
    } finally {
        await pool.end();
    }
}

verificar();