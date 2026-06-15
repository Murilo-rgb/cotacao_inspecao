const { Pool } = require('pg');

const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

async function checkPasswordFormat() {
    try {
        console.log('=== VERIFICANDO FORMATO DAS SENHAS NO BANCO ===\n');
        
        // Verificar senhas dos usuários mencionados
        const users = ['jonathan.silva', 'victor.queiroz', 'dannyta.bezerra', 'fabio.souza'];
        
        for (const username of users) {
            const result = await pool.query(
                'SELECT login, senha, ativo, deve_trocar_senha FROM db_automacao.usuarios WHERE login = $1',
                [username]
            );
            
            if (result.rows.length > 0) {
                const user = result.rows[0];
                console.log(`Usuário: ${user.login}`);
                console.log(`Senha: ${user.senha.substring(0, 50)}${user.senha.length > 50 ? '...' : ''}`);
                console.log(`Tipo: ${user.senha.startsWith('$2') ? 'Bcrypt' : 'Texto plano/Hash'}`);
                console.log(`Ativo: ${user.ativo}`);
                console.log(`Deve trocar senha: ${user.deve_trocar_senha}\n`);
            }
        }
        
    } catch (error) {
        console.error('Erro ao verificar senhas:', error);
    } finally {
        await pool.end();
    }
}

checkPasswordFormat();
