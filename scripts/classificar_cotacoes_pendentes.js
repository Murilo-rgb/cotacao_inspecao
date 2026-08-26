const { Pool } = require('pg');

const DB_CONFIG = {
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
};

// Status canônico gravado no banco (kebab-case, mesmo padrão do restante do sistema).
// O rótulo amigável "Pendente - Classificação" é usado apenas na exibição nos frontends.
const STATUS_CLASSIFICACAO = 'pendente-classificacao';

// Passo 0a: auto-normaliza qualquer variante legada de classificação
// (ex.: 'Pendente - Classificação', 'PENDENTE - CLASSIFICACAO',
// 'pendiente-clasificacion'), cobrindo espaços, acentos e maiúsculas.
const NORMALIZAR_CLASSIFICACAO_SQL = `
    UPDATE db_bloco_de_notas.cotacao
    SET status = $1,
        data_da_ultima_atualizacao = TO_CHAR(NOW(), 'DD/MM/YYYY HH24:MI')
    WHERE validacao = 'Ativo'
      AND lower(trim(status)) <> $1
      AND (
            lower(trim(status)) LIKE 'pendiente%classif%'
         OR lower(trim(status)) LIKE 'pendiente%clasific%'
         OR lower(trim(status)) LIKE 'pendente%classif%'
         OR lower(trim(status)) LIKE 'pendente%clasific%'
      )
`;

// Passo 0b: typo histórico em espanhol puro ('pendiente') -> 'pendente'
const NORMALIZAR_PENDIENTE_SQL = `
    UPDATE db_bloco_de_notas.cotacao
    SET status = 'pendente',
        data_da_ultima_atualizacao = TO_CHAR(NOW(), 'DD/MM/YYYY HH24:MI')
    WHERE validacao = 'Ativo'
      AND lower(trim(status)) IN ('pendiente', 'pendientes')
`;

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
                AND c.status NOT LIKE 'correcao-efetivada'
                AND c.status NOT LIKE 'pendente-qualidade'
                AND c.status NOT LIKE 'pendente-correcao-cadastral'
                AND c.status NOT LIKE 'pendente-correcao-efetuada'
                AND c.status NOT LIKE 'pendente-iphone'
                -- Não reprocessa o valor canônico nem legados já classificados
                -- (ex.: 'Pendente - Classificação', 'pendiente-clasificacion', etc.)
                AND lower(trim(c.status)) NOT LIKE 'pendente%classifica%'
                AND NOT EXISTS (
                    SELECT 1 FROM db_bloco_de_notas.r_000250 r 
                    WHERE r.cod_tarefa = c.tarefa
                )
                AND c.tarefa IS NOT NULL
                AND c.tarefa != ''
            RETURNING c.tarefa, c.usuario_login, c.status;
        `;

        // Passo 0: auto-normaliza legados antes de classificar (idempotente)
        const normClass = await client.query(NORMALIZAR_CLASSIFICACAO_SQL, [STATUS_CLASSIFICACAO]);
        const normPend = await client.query(NORMALIZAR_PENDIENTE_SQL);
        if ((normClass.rowCount || 0) > 0 || (normPend.rowCount || 0) > 0) {
            console.log(`[CLASSIFICACAO] Legados normalizados: classificacao=${normClass.rowCount}, pendiente=${normPend.rowCount}`);
        }

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

        console.log(`[CLASSIFICACAO] Total "${STATUS_CLASSIFICACAO}": ${countClassificados.rows[0].total}`);

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

module.exports = { classificarPendentes, STATUS_CLASSIFICACAO, NORMALIZAR_CLASSIFICACAO_SQL, NORMALIZAR_PENDIENTE_SQL };