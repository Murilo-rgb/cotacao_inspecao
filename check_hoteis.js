const { Pool } = require('pg');
const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

async function main() {
    try {
        // 1. Estrutura da tabela hoteis_x_hospitais
        const cols = await pool.query(`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_schema = 'db_bloco_de_notas' AND table_name = 'hoteis_x_hospitais' 
            ORDER BY ordinal_position
        `);
        console.log('=== COLUNAS hoteis_x_hospitais ===');
        console.log(JSON.stringify(cols.rows, null, 2));

        // 2. Amostra de dados
        const sample = await pool.query('SELECT * FROM db_bloco_de_notas.hoteis_x_hospitais LIMIT 5');
        console.log('\n=== AMOSTRA DE DADOS ===');
        console.log(JSON.stringify(sample.rows, null, 2));

        // 3. Verificar se existe tabela de cotações com origem h_x_h
        const cotacaoCols = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'db_bloco_de_notas' AND table_name = 'cotacao' 
            ORDER BY ordinal_position
        `);
        console.log('\n=== COLUNAS cotacao ===');
        console.log(JSON.stringify(cotacaoCols.rows, null, 2));

        // 4. Verificar se existe tabela de esteira para hoteis
        const esteiraTables = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'db_esteira_gross' 
            ORDER BY table_name
        `);
        console.log('\n=== TABELAS db_esteira_gross ===');
        console.log(JSON.stringify(esteiraTables.rows, null, 2));

        // 5. Verificar se existe tabela de esteira para hoteis
        const blocoTables = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'db_bloco_de_notas' 
            ORDER BY table_name
        `);
        console.log('\n=== TABELAS db_bloco_de_notas ===');
        console.log(JSON.stringify(blocoTables.rows, null, 2));

    } catch (e) {
        console.error('ERRO:', e.message);
    } finally {
        pool.end();
    }
}

main();