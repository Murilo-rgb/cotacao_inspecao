const { Pool } = require('pg');

const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

async function removeAdminUser() {
    try {
        console.log('=== REMOVENDO USUÁRIO ADMIN DO BANCO ===\n');
        
        // Verificar se usuário admin existe
        const checkResult = await pool.query(
            'SELECT id, login, nome FROM db_automacao.usuarios WHERE login = $1',
            ['admin']
        );
        
        if (checkResult.rows.length === 0) {
            console.log('❌ Usuário admin não encontrado no banco\n');
            return;
        }
        
        console.log(`✅ Usuário admin encontrado: ${checkResult.rows[0].login} (${checkResult.rows[0].nome})`);
        
        // Deletar usuário admin
        const deleteResult = await pool.query(
            'DELETE FROM db_automacao.usuarios WHERE login = $1 RETURNING *',
            ['admin']
        );
        
        console.log(`✅ Usuário admin deletado com sucesso!`);
        console.log(`   ID: ${deleteResult.rows[0].id}`);
        console.log(`   Login: ${deleteResult.rows[0].login}`);
        console.log(`   Nome: ${deleteResult.rows[0].nome}\n`);
        
        // Verificar se foi deletado
        const verifyResult = await pool.query(
            'SELECT COUNT(*) as count FROM db_automacao.usuarios WHERE login = $1',
            ['admin']
        );
        
        console.log(`Verificação: ${verifyResult.rows[0].count} usuários admin encontrados\n`);
        
    } catch (error) {
        console.error('Erro ao remover usuário admin:', error);
    } finally {
        await pool.end();
    }
}

removeAdminUser();
