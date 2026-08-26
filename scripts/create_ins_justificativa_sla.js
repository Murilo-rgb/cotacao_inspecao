// ============================================================
// Criacao da tabela db_qualidade.ins_justificativa_sla
// Armazena as tarefas de inspecao que estouraram o SLA (> 12h)
// e os respectivos abonos/justificativas.
// Chave anti-duplicacao: UNIQUE (codigo_tarefa, data_entrada)
// ============================================================
const { Pool } = require('pg');
const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

async function run() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS db_qualidade.ins_justificativa_sla (
                id SERIAL PRIMARY KEY,
                codigo_tarefa VARCHAR(255) NOT NULL,
                status VARCHAR(255),
                tipo_pedido VARCHAR(255),
                data_entrada TIMESTAMP NOT NULL,
                data_saida TIMESTAMP,
                qtd_horas NUMERIC(12, 2),
                sla_auto VARCHAR(10),
                faixa_sla VARCHAR(50),
                justificado_por INTEGER,
                motivo_justificativa TEXT,
                observacao TEXT,
                data_justificativa TIMESTAMP,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP,
                CONSTRAINT uq_justificativa_sla_tarefa_data UNIQUE (codigo_tarefa, data_entrada)
            );
        `);
        console.log('Tabela ins_justificativa_sla criada com sucesso');

        await pool.query(`CREATE INDEX IF NOT EXISTS idx_ins_just_sla_tarefa ON db_qualidade.ins_justificativa_sla(codigo_tarefa);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_ins_just_sla_saida ON db_qualidade.ins_justificativa_sla(data_saida);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_ins_just_sla_justificado_por ON db_qualidade.ins_justificativa_sla(justificado_por);`);
        console.log('Indices criados com sucesso');
    } catch (err) {
        console.error('Erro:', err.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}
run();
