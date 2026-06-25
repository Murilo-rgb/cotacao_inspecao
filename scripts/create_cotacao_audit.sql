-- Tabela de auditoria para rastreabilidade das movimentações de cotação
CREATE TABLE IF NOT EXISTS db_bloco_de_notas.cotacao_audit (
    id SERIAL PRIMARY KEY,
    tarefa VARCHAR(255) NOT NULL,
    acao VARCHAR(50) NOT NULL, -- 'distribuido', 'redistribuido', 'status_alterado'
    usuario_origem_id INTEGER,
    usuario_origem_nome VARCHAR(255),
    usuario_destino_id INTEGER,
    usuario_destino_nome VARCHAR(255),
    status_anterior VARCHAR(50),
    status_novo VARCHAR(50),
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    criado_por VARCHAR(255)
);

-- Índice para consultas rápidas por tarefa
CREATE INDEX IF NOT EXISTS idx_cotacao_audit_tarefa ON db_bloco_de_notas.cotacao_audit(tarefa);
CREATE INDEX IF NOT EXISTS idx_cotacao_audit_data ON db_bloco_de_notas.cotacao_audit(data_criacao);
CREATE INDEX IF NOT EXISTS idx_cotacao_audit_destino ON db_bloco_de_notas.cotacao_audit(usuario_destino_id);