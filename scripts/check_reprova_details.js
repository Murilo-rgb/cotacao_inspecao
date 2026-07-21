const { Pool } = require('pg');
const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});
(async () => {
    try {
        const tables = ['db_qualidade.reprovas_padrao', 'db_qualidade.reprovas_padrao_input', 'db_qualidade.devolucao_padrao'];
        for (const table of tables) {
            const cols = await pool.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_schema || '.' || table_name = $1
                ORDER BY ordinal_position
            `, [table]);
            console.log('\n=== ' + table + ' ===');
            cols.rows.forEach(r => console.log('  ' + r.column_name + ' (' + r.data_type + ')'));

            const sample = await pool.query('SELECT * FROM ' + table + ' LIMIT 3');
            console.log('  Amostra (' + sample.rows.length + ' linhas):');
            sample.rows.forEach((r, i) => console.log('    [' + i + '] ' + JSON.stringify(r)));
        }
    } catch (err) {
        console.error('Erro:', err.message);
    } finally {
        await pool.end();
    }
})();