-- Criar esquema se não existir
CREATE SCHEMA IF NOT EXISTS db_bloco_de_notas;

-- Criar tabela de cotações
CREATE TABLE IF NOT EXISTS db_bloco_de_notas.quotations (
    id TEXT PRIMARY KEY,
    cotacao TEXT NOT NULL,
    anotacao TEXT,
    status TEXT DEFAULT 'pendente',
    createdat TEXT,
    updatedat TEXT
);

-- Criar índice para busca por cotação
CREATE INDEX IF NOT EXISTS idx_quotations_cotacao ON db_bloco_de_notas.quotations(cotacao);
