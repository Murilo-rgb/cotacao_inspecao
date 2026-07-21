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
        // Buscar tabelas que contenham 'devolucao' ou 'reprova' no nome
        const res = await pool.query(`
            SELECT table_schema, table_name 
            FROM information_schema.tables 
            WHERE (LOWER(table_name) LIKE '%devolucao%' OR LOWER(table_name) LIKE '%reprova%')
              AND table_schema NOT IN ('pg_catalog', 'information_schema')
            ORDER BY table_schema, table_name
        `);
        console.log('Tabelas encontradas:');
        res.rows.forEach(r => console.log('  ' + r.table_schema + '.' + r.table_name));
        
        // Se encontrou 'devolucao_padrao_input', descrever a estrutura
        const inputRes = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'db_qualidade' AND table_name = 'devolucao_padrao_input'
        `);
        console.log('\nEstrutura devolucao_padrao_input:');
        inputRes.rows.forEach(r => console.log('  ' + r.column_name + ' (' + r.data_type + ')'));
        
    } catch (err) {
        console.error('Erro:', err.message);
    } finally {
        await pool.end();
    }
})();