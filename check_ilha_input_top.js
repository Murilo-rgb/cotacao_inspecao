const { Pool } = require('pg');

const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

async function checkIlha() {
    try {
        // Verificar valores distintos da coluna ilha na tabela listafuncionarios
        console.log('Verificando valores da coluna ilha em db_gp.listafuncionarios...\n');
        
        const ilhasResult = await pool.query(`
            SELECT DISTINCT ilha 
            FROM db_gp.listafuncionarios 
            WHERE ativo = true 
            ORDER BY ilha
        `);
        
        console.log('Ilhas encontradas (com ativo=true):');
        ilhasResult.rows.forEach(row => {
            console.log(`- "${row.ilha}"`);
        });
        
        console.log(`\nTotal de ilhas distintas: ${ilhasResult.rows.length}`);
        
        // Verificar especificamente 'INPUT TOP'
        const inputTopResult = await pool.query(`
            SELECT COUNT(*) as total 
            FROM db_gp.listafuncionarios 
            WHERE ilha = 'INPUT TOP' AND ativo = true
        `);
        
        console.log(`\nRegistros com ilha = 'INPUT TOP' e ativo = true: ${inputTopResult.rows[0].total}`);
        
        // Verificar ilhas candidatas: TOP, STAFF INPUT, INPUT NET
        const candidatas = ['TOP', 'STAFF INPUT', 'INPUT NET', 'HOTEIS & HOSPITAIS'];
        for (const ilha of candidatas) {
            const result = await pool.query(`
                SELECT COUNT(*) as total 
                FROM db_gp.listafuncionarios 
                WHERE ilha = $1 AND ativo = true
            `, [ilha]);
            console.log(`Registros com ilha = '${ilha}' e ativo = true: ${result.rows[0].total}`);
        }
        
        // Mostrar amostra de funcionários da ilha TOP
        const topSample = await pool.query(`
            SELECT login, nome, ilha 
            FROM db_gp.listafuncionarios 
            WHERE ilha = 'TOP' AND ativo = true 
            LIMIT 10
        `);
        console.log('\nAmostra de funcionários com ilha TOP:');
        topSample.rows.forEach(row => {
            console.log(`  ${row.login} - ${row.nome}`);
        });
        
        // Mostrar amostra de funcionários da ilha STAFF INPUT
        const staffInputSample = await pool.query(`
            SELECT login, nome, ilha 
            FROM db_gp.listafuncionarios 
            WHERE ilha = 'STAFF INPUT' AND ativo = true 
            LIMIT 10
        `);
        console.log('\nAmostra de funcionários com ilha STAFF INPUT:');
        staffInputSample.rows.forEach(row => {
            console.log(`  ${row.login} - ${row.nome}`);
        });
        
        // Verificar se há cotações com origem iw_cpc_975_top e quais usuários estão vinculados
        const cotacoesTop = await pool.query(`
            SELECT DISTINCT u.login, u.nome, l.ilha
            FROM db_bloco_de_notas.cotacao c
            INNER JOIN db_automacao.usuarios u ON u.id::TEXT = c.usuario_id
            LEFT JOIN db_gp.listafuncionarios l ON l.login = u.login
            WHERE c.origem = 'iw_cpc_975_top' AND c.validacao = 'Ativo'
            ORDER BY u.nome
        `);
        console.log('\nUsuários com cotações de origem iw_cpc_975_top:');
        cotacoesTop.rows.forEach(row => {
            console.log(`  ${row.login} - ${row.nome} (ilha: ${row.ilha || 'N/A'})`);
        });
        
    } catch (error) {
        console.error('Erro:', error);
    } finally {
        await pool.end();
    }
}

checkIlha();