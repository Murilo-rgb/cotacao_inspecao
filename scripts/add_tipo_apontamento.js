const { Pool } = require('pg');

const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

// Valores de "Tipo de Apontamento/Amostra" válidos (TIPO_APONTAMENTO_STATUS)
const TIPOS = ['APROVAÇÃO INDEVIDA', 'APROVADO', 'DEVOLUÇÃO PARCIAL/INDEVIDA', 'ERRO INTERNO', 'RCV'];

async function run() {
    try {
        // 1. Criar a coluna tipo_apontamento (se ainda não existir)
        await pool.query(
            'ALTER TABLE db_bloco_de_notas.auditoria_qualidade ADD COLUMN IF NOT EXISTS tipo_apontamento TEXT'
        );
        console.log('COLUNA tipo_apontamento CRIADA COM SUCESSO');

        // 2. Backfill: copiar valores antigos de apontamento que coincidem com um Tipo válido
        //    (mantém apontamento preservado como texto livre)
        const placeholders = TIPOS.map((_, i) => `$${i + 1}`).join(',');
        const backfill = await pool.query(
            `UPDATE db_bloco_de_notas.auditoria_qualidade
                SET tipo_apontamento = apontamento
              WHERE apontamento IN (${placeholders})
                AND (tipo_apontamento IS NULL OR tipo_apontamento = '')`,
            TIPOS
        );
        console.log(`BACKFILL CONCLUÍDO: ${backfill.rowCount} registro(s) atualizado(s)`);
    } catch (err) {
        console.error('ERRO:', err.message);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

run();