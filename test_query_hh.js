const { Pool } = require('pg');
const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

async function main() {
    try {
        const result = await pool.query(`
            WITH foto_recente AS (
                SELECT DISTINCT ON (h.id_tarefa)
                    h.fila,
                    h.id_tarefa AS cod_tarefa,
                    h.nome_tarefa,
                    h.data_de_abertura,
                    h.data_de_historico,
                    h.data_de_conclusao,
                    h.de_etapa,
                    h.de_usuario,
                    h.acao,
                    h.para_etapa,
                    h.para_usuario_grupo,
                    c.usuario_id,
                    u_dist.nome AS usuario_distribuido_nome,
                    c.status AS cotacao_status,
                    CASE WHEN c.cotacao IS NOT NULL THEN 'Enviado' ELSE 'Fila' END as status_distribuicao
                FROM db_bloco_de_notas.hoteis_x_hospitais h
                LEFT JOIN db_bloco_de_notas.cotacao c ON h.id_tarefa = c.tarefa AND c.validacao = 'Ativo'
                LEFT JOIN db_automacao.usuarios u_dist ON u_dist.id::TEXT = c.usuario_id AND u_dist.ativo = true
                ORDER BY h.id_tarefa, h.data_de_historico DESC
            )
            SELECT * FROM foto_recente
            WHERE 1=1
            ORDER BY data_de_historico DESC
        `);
        console.log('Total:', result.rows.length);
        console.log('Colunas:', Object.keys(result.rows[0] || {}));
        console.log('Amostra:', JSON.stringify(result.rows[0], null, 2));
    } catch (e) {
        console.error('ERRO:', e.message);
    } finally {
        pool.end();
    }
}

main();