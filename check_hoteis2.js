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
        // 1. Estrutura da tabela parcial_hoteis_e_hospitais na esteira
        const esteiraCols = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'db_esteira_gross' AND table_name = 'parcial_hoteis_e_hospitais' 
            ORDER BY ordinal_position
        `);
        console.log('=== COLUNAS parcial_hoteis_e_hospitais ===');
        console.log(JSON.stringify(esteiraCols.rows, null, 2));

        // 2. Amostra de dados da esteira
        const esteiraSample = await pool.query('SELECT * FROM db_esteira_gross.parcial_hoteis_e_hospitais LIMIT 3');
        console.log('\n=== AMOSTRA parcial_hoteis_e_hospitais ===');
        console.log(JSON.stringify(esteiraSample.rows, null, 2));

        // 3. Stored procedures relacionadas
        const procs = await pool.query(`
            SELECT routine_name 
            FROM information_schema.routines 
            WHERE routine_schema = 'db_bloco_de_notas' 
              AND (routine_name ILIKE '%hoteis%' OR routine_name ILIKE '%hospitais%' OR routine_name ILIKE '%h_x_h%')
        `);
        console.log('\n=== Stored procedures relacionadas ===');
        console.log(JSON.stringify(procs.rows, null, 2));

        // 4. Origens existentes na cotacao
        const origens = await pool.query(`
            SELECT DISTINCT origem 
            FROM db_bloco_de_notas.cotacao 
            WHERE origem IS NOT NULL AND origem != '' 
            ORDER BY origem
        `);
        console.log('\n=== Origens existentes na cotacao ===');
        console.log(JSON.stringify(origens.rows, null, 2));

        // 5. Estrutura da tabela cotacao_audit
        const auditCols = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'db_bloco_de_notas' AND table_name = 'cotacao_audit' 
            ORDER BY ordinal_position
        `);
        console.log('\n=== COLUNAS cotacao_audit ===');
        console.log(JSON.stringify(auditCols.rows, null, 2));

    } catch (e) {
        console.error('ERRO:', e.message);
    } finally {
        pool.end();
    }
}

main();