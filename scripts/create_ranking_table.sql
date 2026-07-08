-- Tabela de ranking de colaboradores
CREATE TABLE IF NOT EXISTS db_bloco_de_notas.ranking_colaboradores (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER,
    usuario_login VARCHAR(100),
    usuario_nome VARCHAR(200),
    periodo VARCHAR(10) NOT NULL CHECK (periodo IN ('dia', 'mes', 'geral')),
    data_referencia DATE,
    total_tratados INTEGER DEFAULT 0,
    posicao INTEGER,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para otimizar consultas
CREATE INDEX IF NOT EXISTS idx_ranking_periodo_data ON db_bloco_de_notas.ranking_colaboradores(periodo, data_referencia);
CREATE INDEX IF NOT EXISTS idx_ranking_usuario ON db_bloco_de_notas.ranking_colaboradores(usuario_id, periodo);

-- View para facilitar consultas
CREATE OR REPLACE VIEW db_bloco_de_notas.vw_ranking AS
SELECT 
    usuario_id,
    usuario_login,
    usuario_nome,
    periodo,
    data_referencia,
    total_tratados,
    posicao,
    data_atualizacao
FROM db_bloco_de_notas.ranking_colaboradores
ORDER BY periodo, posicao;