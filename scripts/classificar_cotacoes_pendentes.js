const { Pool } = require('pg');

const DB_CONFIG = {
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
};

const STATUS_CLASSIFICACAO = 'Pendente - Classificação';

async function classificarPendentes() {
    const pool = new Pool(DB_CONFIG);
    let client;
    try {
        client = await pool.connect();
        console.log('[CLASSIFICACAO] Conectado ao banco de dados.');

        const updateQuery = `
            UPDATE db_bloco_de_notas.cotacao c
            SET 
                status = $1,
                data_da_ultima_atualizacao = TO_CHAR(NOW(), 'DD/MM/YYYY HH24:MI')
            WHERE 
                c.validacao = 'Ativo'
                AND c.status NOT LIKE 'aprovado'
                AND c.status NOT LIKE 'reprovado'
                AND c.status != $1
                AND NOT EXISTS (
                    SELECT 1 FROM db_bloco_de_notas.r_000250 r 
                    WHERE r.cod_tarefa = c.tarefa
                )
                AND c.tarefa IS NOT NULL
                AND c.tarefa != ''
            RETURNING c.tarefa, c.usuario_login, c.status;
        `;

        const result = await client.query(updateQuery, [STATUS_CLASSIFICACAO]);
        const classificados = result.rows;
        
        console.log(`[CLASSIFICACAO] ${classificados.length} cotações classificadas.`);
        
        if (classificados.length > 0) {
            console.log('[CLASSIFICACAO] Cotações atualizadas:');
            classificados.forEach(row => {
                console.log(`  - Tarefa: ${row.tarefa} | Usuário: ${row.usuario_login}`);
            });
        }

        const countClassificados = await client.query(`
            SELECT COUNT(*) as total
            FROM db_bloco_de_notas.cotacao
            WHERE validacao = 'Ativo' AND status = $1
        `, [STATUS_CLASSIFICACAO]);

        console.log(`[CLASSIFICACAO] Total "Pendente - Classificação": ${countClassificados.rows[0].total}`);

        return { success: true, classificados: classificados.length, totalClassificados: countClassificados.rows[0].total };

    } catch (error) {
        console.error('[CLASSIFICACAO] Erro:', error.message);
        throw error;
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

if (require.main === module) {
    classificarPendentes()
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

module.exports = { classificarPendentes, STATUS_CLASSIFICACAO };