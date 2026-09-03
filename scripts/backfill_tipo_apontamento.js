const { Pool } = require('pg');

const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

// Backfill de tipo_apontamento com base no status (regras derivadas de TIPO_APONTAMENTO_STATUS):
//   Devolução Parcial / Devolução Indevida  -> DEVOLUÇÃO PARCIAL/INDEVIDA
//   Erro Interno - Inspeção                 -> ERRO INTERNO
//   Apontamento RCV                         -> RCV
//   Procedimento Correto                    -> DEVOLUÇÃO PARCIAL/INDEVIDA se a anotacao tiver a linha do tipo; senão APROVADO
//   Aprovação Indevida - Qualidade          -> APROVADO se a anotacao tiver a linha "APROVADO"; senão APROVAÇÃO INDEVIDA
//   Demais (ex.: Falta Evidência)           -> fica sem tipo (card "Sem Tipo")
// Idempotente: só toca em registros sem tipo preenchido.

const SEM_TIPO = "COALESCE(TRIM(tipo_apontamento), '') = ''";

const EXPRESSAO_TIPO = `
        CASE
            WHEN TRIM(COALESCE(status, '')) IN ('Devolução Parcial', 'Devolução Indevida')
                THEN 'DEVOLUÇÃO PARCIAL/INDEVIDA'
            WHEN TRIM(COALESCE(status, '')) = 'Erro Interno - Inspeção'
                THEN 'ERRO INTERNO'
            WHEN TRIM(COALESCE(status, '')) = 'Apontamento RCV'
                THEN 'RCV'
            WHEN TRIM(COALESCE(status, '')) = 'Procedimento Correto'
                 AND (anotacao LIKE 'DEVOLUÇÃO PARCIAL/INDEVIDA%' OR anotacao LIKE '%' || chr(10) || 'DEVOLUÇÃO PARCIAL/INDEVIDA%')
                THEN 'DEVOLUÇÃO PARCIAL/INDEVIDA'
            WHEN TRIM(COALESCE(status, '')) = 'Procedimento Correto'
                THEN 'APROVADO'
            WHEN TRIM(COALESCE(status, '')) = 'Aprovação Indevida - Qualidade'
                 AND (anotacao LIKE 'APROVADO%' OR anotacao LIKE '%' || chr(10) || 'APROVADO%')
                THEN 'APROVADO'
            WHEN TRIM(COALESCE(status, '')) = 'Aprovação Indevida - Qualidade'
                THEN 'APROVAÇÃO INDEVIDA'
            ELSE '(SEM TIPO)'
        END`;

async function run() {
    try {
        // 1. PREVIEW: quantos registros cada tipo receberia
        const preview = await pool.query(`
            SELECT ${EXPRESSAO_TIPO} AS tipo, COUNT(*)::int AS qtd
            FROM db_bloco_de_notas.auditoria_qualidade
            WHERE ${SEM_TIPO}
            GROUP BY 1
            ORDER BY qtd DESC`);
        let previsaoTotal = 0;
        console.log('=== PREVIEW (antes do UPDATE) ===');
        for (const r of preview.rows) {
            console.log(`  ${String(r.tipo).padEnd(30)} ${r.qtd}`);
            if (r.tipo !== '(SEM TIPO)') previsaoTotal += r.qtd;
        }
        console.log(`  => serão preenchidos: ${previsaoTotal} | ficarão sem tipo: ${preview.rows.filter(r => r.tipo === '(SEM TIPO)').reduce((a, r) => a + r.qtd, 0)}`);

        // 2. UPDATE idempotente
        const upd = await pool.query(`
            UPDATE db_bloco_de_notas.auditoria_qualidade
               SET tipo_apontamento = ${EXPRESSAO_TIPO}
             WHERE ${SEM_TIPO}
               AND TRIM(COALESCE(status, '')) IN (
                    'Devolução Parcial', 'Devolução Indevida', 'Erro Interno - Inspeção',
                    'Apontamento RCV', 'Procedimento Correto', 'Aprovação Indevida - Qualidade')`);
        console.log(`=== UPDATE CONCLUÍDO: ${upd.rowCount} registro(s) atualizado(s) (esperado: ${previsaoTotal}) ===`);

        // 3. Pós-checagem: distribuição final e restantes sem tipo
        const pos = await pool.query(`
            SELECT COALESCE(NULLIF(TRIM(tipo_apontamento), ''), '(SEM TIPO)') AS tipo, COUNT(*)::int AS qtd
            FROM db_bloco_de_notas.auditoria_qualidade
            GROUP BY 1 ORDER BY qtd DESC`);
        console.log('=== DISTRIBUIÇÃO FINAL (tabela inteira) ===');
        let restantes = 0;
        for (const r of pos.rows) {
            console.log(`  ${String(r.tipo).padEnd(30)} ${r.qtd}`);
            if (r.tipo === '(SEM TIPO)') restantes = r.qtd;
        }
        console.log(`=== restantes sem tipo: ${restantes} (esperado: somente status sem inferência, ex. Falta Evidência) ===`);
    } catch (err) {
        console.error('ERRO:', err.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

run();
