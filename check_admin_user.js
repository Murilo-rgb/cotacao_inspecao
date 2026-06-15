const { Pool } = require('pg');

const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

async function checkAdminUser() {
    try {
        console.log('=== VERIFICANDO USUÁRIO ADMIN NO BANCO ===\n');
        
        // Verificar se usuário admin existe em db_automacao.usuarios
        const result = await pool.query(
            'SELECT id, login, nome, email, ativo, deve_trocar_senha FROM db_automacao.usuarios WHERE login = $1',
            ['admin']
        );
        
        if (result.rows.length > 0) {
            console.log('✅ Usuário admin encontrado em db_automacao.usuarios:');
            console.log(`   ID: ${result.rows[0].id}`);
            console.log(`   Login: ${result.rows[0].login}`);
            console.log(`   Nome: ${result.rows[0].nome}`);
            console.log(`   Email: ${result.rows[0].email}`);
            console.log(`   Ativo: ${result.rows[0].ativo}`);
            console.log(`   Deve trocar senha: ${result.rows[0].deve_trocar_senha}\n`);
        } else {
            console.log('❌ Usuário admin NÃO encontrado em db_automacao.usuarios\n');
        }
        
        // Listar todos os usuários em db_automacao.usuarios
        const allUsers = await pool.query('SELECT login, nome, ativo FROM db_automacao.usuarios ORDER BY login');
        console.log('=== TODOS OS USUÁRIOS EM db_automacao.usuarios ===\n');
        allUsers.rows.forEach(user => {
            console.log(`- ${user.login} (${user.nome}) - Ativo: ${user.ativo}`);
        });
        
    } catch (error) {
        console.error('Erro ao verificar usuário admin:', error);
    } finally {
        await pool.end();
    }
}

checkAdminUser();
