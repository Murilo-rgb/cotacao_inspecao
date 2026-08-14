const { Pool } = require('pg');

const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

async function test() {
    try {
        // 1. Verificar a auditoria_qualidade
        const aq = await pool.query(`
            SELECT id_qldd, codigo_tarefa, analista_qualidade_id, cotacao, status, data_qualidade
            FROM db_bloco_de_notas.auditoria_qualidade
            WHERE codigo_tarefa = '22920502'
        `);
        console.log('=== AUDITORIA QUALIDADE (22920502) ===');
        console.log(JSON.stringify(aq.rows, null, 2));

        // 2. Verificar se existe na cotacao
        const c = await pool.query(`
            SELECT id_cotacao, tarefa, cotacao, usuario_id, id_qldd, validacao
            FROM db_bloco_de_notas.cotacao
            WHERE tarefa = '22920502'
        `);
        console.log('\n=== COTACAO (22920502) ===');
        console.log(JSON.stringify(c.rows, null, 2));

        // 3. Consulta completa com JOIN corrigido
        const full = await pool.query(`
            SELECT aq.codigo_tarefa, 
                   aq.analista_qualidade_id,
                   TRIM(COALESCE(u_analista.nome, '') || ' ' || COALESCE(u_analista.sobrenome, '')) AS analista_nome,
                   c.usuario_id,
                   TRIM(COALESCE(u_auditado.nome, '') || ' ' || COALESCE(u_auditado.sobrenome, '')) AS auditado_nome
            FROM db_bloco_de_notas.auditoria_qualidade aq
            LEFT JOIN db_bloco_de_notas.cotacao c ON c.tarefa = aq.codigo_tarefa
            LEFT JOIN db_automacao.usuarios u_analista ON u_analista.id::TEXT = aq.analista_qualidade_id::TEXT
            LEFT JOIN db_automacao.usuarios u_auditado ON u_auditado.id::TEXT = c.usuario_id::TEXT
            WHERE aq.codigo_tarefa = '22920502'
        `);
        console.log('\n=== CONSULTA COMPLETA (JOIN CORRIGIDO) ===');
        console.log(JSON.stringify(full.rows, null, 2));

        // 4. Consulta com JOIN antigo (id_qldd)
        const old = await pool.query(`
            SELECT aq.codigo_tarefa,
                   aq.analista_qualidade_id,
                   TRIM(COALESCE(u_analista.nome, '') || ' ' || COALESCE(u_analista.sobrenome, '')) AS analista_nome,
                   c.usuario_id,
                   TRIM(COALESCE(u_auditado.nome, '') || ' ' || COALESCE(u_auditado.sobrenome, '')) AS auditado_nome
            FROM db_bloco_de_notas.auditoria_qualidade aq
            LEFT JOIN db_bloco_de_notas.cotacao c ON c.id_qldd = aq.id_qldd
            LEFT JOIN db_automacao.usuarios u_analista ON u_analista.id::TEXT = aq.analista_qualidade_id::TEXT
            LEFT JOIN db_automacao.usuarios u_auditado ON u_auditado.id::TEXT = c.usuario_id::TEXT
            WHERE aq.codigo_tarefa = '22920502'
        `);
        console.log('\n=== CONSULTA COM JOIN ANTIGO (id_qldd) ===');
        console.log(JSON.stringify(old.rows, null, 2));

    } catch (e) {
        console.error('ERRO:', e.message);
    } finally {
        await pool.end();
    }
}

test();