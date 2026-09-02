const { Pool } = require('pg');

const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

async function simular() {
    try {
        // Simular a consulta corrigida do /api/reports
        // Usando um período de exemplo (últimos 7 dias)
        const dataFim = new Date();
        const dataInicio = new Date();
        dataInicio.setDate(dataInicio.getDate() - 7);
        
        const dataInicioISO = dataInicio.toISOString().split('T')[0];
        const dataFimExclusivo = new Date(dataFim);
        dataFimExclusivo.setDate(dataFimExclusivo.getDate() + 1);
        const dataFimISO = dataFimExclusivo.toISOString().split('T')[0];

        console.log(`=== SIMULAÇÃO DO RELATÓRIO (${dataInicioISO} a ${dataFimISO}) ===\n`);

        // Consulta CORRIGIDA (mesma do server.js após a alteração)
        const result = await pool.query(
            `SELECT * FROM (
                    SELECT DISTINCT ON (aq.codigo_tarefa) aq.id_qldd, aq.anotacao, aq.status, aq.data_qualidade, aq.analista_qualidade_id, aq.reprova_bko,
                    aq.codigo_tarefa, aq.data_analise, aq.cotacao, aq.regional, aq.tipo_de_pedido,
                    aq.motivo_1_sistema_documento, aq.motivo_2_erro, aq.motivo_3_detalhamento, aq.apontamento,
                    aq.contestacao, aq.obs, aq.enviado, aq.data_envio, aq.semana, aq.data_leitura,
                    TRIM(COALESCE(u_analista.nome, '') || ' ' || COALESCE(u_analista.sobrenome, '')) AS analista,
                    TRIM(COALESCE(u_auditado.nome, '') || ' ' || COALESCE(u_auditado.sobrenome, '')) AS auditado_nome
             FROM db_bloco_de_notas.auditoria_qualidade aq
             LEFT JOIN db_bloco_de_notas.cotacao c ON c.tarefa = aq.codigo_tarefa
             LEFT JOIN db_automacao.usuarios u_analista ON u_analista.id::TEXT = c.usuario_id::TEXT
             LEFT JOIN db_automacao.usuarios u_auditado ON u_auditado.id::TEXT = aq.analista_qualidade_id::TEXT
             WHERE aq.data_qualidade >= $1::date AND aq.data_qualidade < $2::date
             ORDER BY aq.codigo_tarefa,
                      CASE WHEN c.id_qldd IS NOT NULL AND c.id_qldd = aq.id_qldd THEN 0
                           WHEN COALESCE(aq.anotacao, '') <> '' THEN 1
                           ELSE 2 END,
                      aq.id_qldd DESC
             ) sub
             ORDER BY sub.data_qualidade DESC
             LIMIT 10`,
            [dataInicioISO, dataFimISO]
        );

        if (result.rows.length === 0) {
            console.log('Nenhum registro encontrado no período. Tentando buscar qualquer registro...');
            // Buscar qualquer registro para demonstrar
            const anyResult = await pool.query(
                `SELECT * FROM (
                        SELECT DISTINCT ON (aq.codigo_tarefa) aq.id_qldd, aq.anotacao, aq.status, aq.data_qualidade, aq.analista_qualidade_id, aq.reprova_bko,
                        aq.codigo_tarefa, aq.data_analise, aq.cotacao, aq.regional, aq.tipo_de_pedido,
                        aq.motivo_1_sistema_documento, aq.motivo_2_erro, aq.motivo_3_detalhamento, aq.apontamento,
                        aq.contestacao, aq.obs, aq.enviado, aq.data_envio, aq.semana, aq.data_leitura,
                        TRIM(COALESCE(u_analista.nome, '') || ' ' || COALESCE(u_analista.sobrenome, '')) AS analista,
                        TRIM(COALESCE(u_auditado.nome, '') || ' ' || COALESCE(u_auditado.sobrenome, '')) AS auditado_nome
                 FROM db_bloco_de_notas.auditoria_qualidade aq
                 LEFT JOIN db_bloco_de_notas.cotacao c ON c.tarefa = aq.codigo_tarefa
                 LEFT JOIN db_automacao.usuarios u_analista ON u_analista.id::TEXT = c.usuario_id::TEXT
                 LEFT JOIN db_automacao.usuarios u_auditado ON u_auditado.id::TEXT = aq.analista_qualidade_id::TEXT
                 ORDER BY aq.codigo_tarefa,
                          CASE WHEN c.id_qldd IS NOT NULL AND c.id_qldd = aq.id_qldd THEN 0
                               WHEN COALESCE(aq.anotacao, '') <> '' THEN 1
                               ELSE 2 END,
                          aq.id_qldd DESC
                 ) sub
                 ORDER BY sub.data_qualidade DESC
                 LIMIT 10`
            );
            result.rows = anyResult.rows;
        }

        console.log(`Total de registros encontrados: ${result.rows.length}\n`);
        console.log('='.repeat(120));
        console.log('| Tarefa      | Analista (tratador)          | Auditado (auditor)           | Status                | Data Qualidade      |');
        console.log('='.repeat(120));

        for (const r of result.rows) {
            const tarefa = (r.codigo_tarefa || '-').padEnd(12);
            const analista = (r.analista || '-').padEnd(28);
            const auditado = (r.auditado_nome || '-').padEnd(28);
            const status = (r.status || '-').padEnd(22);
            const dataQualidade = r.data_qualidade ? new Date(r.data_qualidade).toLocaleDateString('pt-BR') : '-';
            console.log(`| ${tarefa} | ${analista} | ${auditado} | ${status} | ${dataQualidade} |`);
        }
        console.log('='.repeat(120));

        // Mostrar detalhes adicionais
        console.log('\n=== DETALHES ADICIONAIS (primeiros 3 registros) ===');
        for (const r of result.rows.slice(0, 3)) {
            console.log(`\n--- Tarefa: ${r.codigo_tarefa} ---`);
            console.log(`  analista_qualidade_id: ${r.analista_qualidade_id}`);
            console.log(`  Analista (tratador): ${r.analista || '(vazio)'}`);
            console.log(`  Auditado (auditor): ${r.auditado_nome || '(vazio)'}`);
            console.log(`  Status: ${r.status || '-'}`);
            console.log(`  Cotação: ${r.cotacao || '-'}`);
            console.log(`  Regional: ${r.regional || '-'}`);
            console.log(`  Tipo Pedido: ${r.tipo_de_pedido || '-'}`);
        }

    } catch (e) {
        console.error('ERRO:', e.message);
    } finally {
        await pool.end();
    }
}

simular();