/**
 * Correção pontual (one-shot) dos status legados de classificação
 * na tabela db_bloco_de_notas.cotacao.
 *
 * Convenção vigente do sistema: valores de status em kebab-case minúsculo
 * (ex.: 'pendente', 'pendente-classificacao', 'pendente-iphone').
 *
 * Regras aplicadas (apenas no universo "pendente"/"pendiente"):
 *   - 'pendiente' (typo histórico em espanhol, sem sufixo) ......... -> 'pendente'
 *   - qualquer variante de classificação (PT/ES, espaços, acentos,
 *     maiúsculas), ex.: 'Pendente - Classificação' ................ -> 'pendente-classificacao'
 *
 * Demais status oficiais (ex.: 'pendente-iphone', 'pendente-qualidade')
 * permanecem intactos. Histórico de auditoria (cotacao_audit) não é alterado.
 *
 * Uso:
 *   node scripts/corrigir_status_classificacao.js          # dry-run (somente relatório)
 *   node scripts/corrigir_status_classificacao.js --apply  # aplica as correções
 */

const { Pool } = require('pg');

const DB_CONFIG = {
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
};

const APPLY = process.argv.includes('--apply');

/** Minúsculas + sem acentos + sem espaços ao redor dos hífens (para comparar). */
function normalizar(valor) {
    if (!valor) return '';
    return String(valor)
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s*-\s*/g, '-')
        .replace(/\s+/g, ' ');
}

/** Retorna o status canônico de destino ou null se não precisar corrigir. */
function statusCorrigido(statusOriginal) {
    const n = normalizar(statusOriginal);
    if (!n) return null;

    // Só mexe em registros do universo "pendente"/"pendiente"
    if (!n.startsWith('pendente') && !n.startsWith('pendiente')) return null;

    // Qualquer variante de classificação (PT/ES, com/sem espaços e acentos)
    if ((n.includes('classif') || n.includes('clasific')) && n !== 'pendente-classificacao') {
        return 'pendente-classificacao';
    }

    // Typo histórico em espanhol, sem sufixo
    if (n.startsWith('pendiente')) return 'pendente';

    // 'pendente' e os demais status oficiais permanecem como estão
    return null;
}

async function main() {
    const pool = new Pool(DB_CONFIG);
    const client = await pool.connect();
    try {
        console.log('[FIX-STATUS] Modo:', APPLY ? 'APLICAR (--apply)' : 'DRY-RUN (use --apply para gravar)');
        console.log('[FIX-STATUS] Conectado ao banco.');

        // 1. Diagnóstico: status distintos e quantidades (apenas válidos)
        const antes = await client.query(`
            SELECT status, COUNT(*)::int AS qtd
            FROM db_bloco_de_notas.cotacao
            WHERE validacao = 'Ativo'
            GROUP BY status
            ORDER BY qtd DESC
        `);

        console.log('\n[FIX-STATUS] ===== Status atuais (validacao = Ativo) =====');
        antes.rows.forEach(r => console.log(`  ${JSON.stringify(r.status)} : ${r.qtd}`));

        // 2. Plano de correção por grupo exato de status atual
        const plano = new Map();
        for (const row of antes.rows) {
            const alvo = statusCorrigido(row.status);
            if (alvo && alvo !== String(row.status ?? '')) {
                plano.set(row.status, alvo);
            }
        }

        if (plano.size === 0) {
            console.log('\n[FIX-STATUS] ✔ Nada a corrigir. Base já consistente.');
            return;
        }

        console.log('\n[FIX-STATUS] ===== Plano de correção =====');
        for (const [de, para] of plano.entries()) {
            console.log(`  ${JSON.stringify(de)} -> "${para}"`);
        }

        if (!APPLY) {
            console.log('\n[FIX-STATUS] Dry-run concluído. Execute com --apply para gravar as alterações.');
            return;
        }

        // 3. Aplicação em transação (all-or-nothing)
        await client.query('BEGIN');
        try {
            for (const [de, para] of plano.entries()) {
                const upd = await client.query(`
                    UPDATE db_bloco_de_notas.cotacao
                    SET status = $2,
                        data_da_ultima_atualizacao = TO_CHAR(NOW(), 'DD/MM/YYYY HH24:MI')
                    WHERE validacao = 'Ativo'
                      AND status = $1
                `, [de, para]);
                console.log(`[FIX-STATUS] ${JSON.stringify(de)} -> "${para}": ${upd.rowCount} linha(s) atualizada(s).`);
            }
            await client.query('COMMIT');
            console.log('[FIX-STATUS] Transação commitada.');
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('[FIX-STATUS] Transação revertida (ROLLBACK).');
            throw err;
        }

        // 4. Verificação pós-correção
        const depois = await client.query(`
            SELECT status, COUNT(*)::int AS qtd
            FROM db_bloco_de_notas.cotacao
            WHERE validacao = 'Ativo'
            GROUP BY status
            ORDER BY status
        `);

        console.log('\n[FIX-STATUS] ===== Verificação final =====');
        depois.rows.forEach(r => console.log(`  ${JSON.stringify(r.status)} : ${r.qtd}`));

        const restantes = depois.rows.filter(r => {
            const alvo = statusCorrigido(r.status);
            return alvo && alvo !== String(r.status ?? '');
        });

        if (restantes.length === 0) {
            console.log('[FIX-STATUS] ✔ Sucesso: nenhum status legado restante.');
        } else {
            console.warn('[FIX-STATUS] ⚠ Atenção, ainda restam legados:', JSON.stringify(restantes));
        }
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

main()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('[FIX-STATUS] Erro:', err.message);
        process.exit(1);
    });