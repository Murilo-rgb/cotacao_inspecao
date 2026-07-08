const { Pool } = require('pg');
const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

async function atualizarRanking() {
    console.log('[RANKING] Iniciando atualização de rankings...');
    const startTime = Date.now();

    try {
        // Limpar rankings antigos
        await pool.query("DELETE FROM db_bloco_de_notas.ranking_colaboradores");

        // 1. Ranking do DIA (aprovados + reprovados de HOJE)
        const rankingDia = await pool.query(`
            SELECT 
                u.id AS usuario_id,
                u.login AS usuario_login,
                u.nome AS usuario_nome,
                COUNT(DISTINCT c.tarefa) AS total_tratados
            FROM db_bloco_de_notas.cotacao c
            INNER JOIN db_automacao.usuarios u ON u.id::TEXT = c.usuario_id::TEXT
            WHERE c.validacao = 'Ativo'
                AND c.status IS NOT NULL AND c.status != ''
                AND LOWER(c.status) IN ('aprovado', 'reprovado')
                AND to_date(LEFT(c.data_de_criacao,10),'dd/MM/yyyy') = CURRENT_DATE
            GROUP BY u.id, u.login, u.nome
            ORDER BY total_tratados DESC
        `);

        // 2. Ranking do MÊS (aprovados + reprovados do mês atual)
        const rankingMes = await pool.query(`
            SELECT 
                u.id AS usuario_id,
                u.login AS usuario_login,
                u.nome AS usuario_nome,
                COUNT(DISTINCT c.tarefa) AS total_tratados
            FROM db_bloco_de_notas.cotacao c
            INNER JOIN db_automacao.usuarios u ON u.id::TEXT = c.usuario_id::TEXT
            WHERE c.validacao = 'Ativo'
                AND c.status IS NOT NULL AND c.status != ''
                AND LOWER(c.status) IN ('aprovado', 'reprovado')
                AND to_date(LEFT(c.data_de_criacao,10),'dd/MM/yyyy') >= date_trunc('month', CURRENT_DATE)
            GROUP BY u.id, u.login, u.nome
            ORDER BY total_tratados DESC
        `);

        // 3. Ranking GERAL (todos aprovados + reprovados)
        const rankingGeral = await pool.query(`
            SELECT 
                u.id AS usuario_id,
                u.login AS usuario_login,
                u.nome AS usuario_nome,
                COUNT(DISTINCT c.tarefa) AS total_tratados
            FROM db_bloco_de_notas.cotacao c
            INNER JOIN db_automacao.usuarios u ON u.id::TEXT = c.usuario_id::TEXT
            WHERE c.validacao = 'Ativo'
                AND c.status IS NOT NULL AND c.status != ''
                AND LOWER(c.status) IN ('aprovado', 'reprovado')
            GROUP BY u.id, u.login, u.nome
            ORDER BY total_tratados DESC
        `);

        // Função auxiliar para inserir ranking
        const inserirRanking = async (rows, periodo, dataReferencia) => {
            for (let i = 0; i < Math.min(rows.length, 5); i++) {
                const row = rows[i];
                await pool.query(
                    `INSERT INTO db_bloco_de_notas.ranking_colaboradores 
                    (usuario_id, usuario_login, usuario_nome, periodo, data_referencia, total_tratados, posicao)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [row.usuario_id, row.usuario_login, row.usuario_nome, periodo, dataReferencia, parseInt(row.total_tratados), i + 1]
                );
            }
        };

        // Inserir rankings
        await inserirRanking(rankingDia.rows, 'dia', new Date().toISOString().split('T')[0]);
        await inserirRanking(rankingMes.rows, 'mes', new Date().toISOString().split('T')[0].substring(0, 7) + '-01');
        await inserirRanking(rankingGeral.rows, 'geral', null);

        const elapsedTime = Date.now() - startTime;
        console.log(`[RANKING] Atualização concluída em ${elapsedTime}ms`);
        console.log(`[RANKING] Dia: ${rankingDia.rows.length} usuários | Mês: ${rankingMes.rows.length} usuários | Geral: ${rankingGeral.rows.length} usuários`);

    } catch (error) {
        console.error('[RANKING] Erro:', error);
    } finally {
        await pool.end();
    }
}

atualizarRanking();