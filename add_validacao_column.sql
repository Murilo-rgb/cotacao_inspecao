-- Adicionar coluna validacao na tabela existente
-- Se a coluna já existir, este comando não vai causar erro

ALTER TABLE db_bloco_de_notas.cotacao 
ADD COLUMN IF NOT EXISTS validacao TEXT DEFAULT 'ativo';

-- Atualizar registros existentes para ter validacao='ativo' (caso a coluna tenha sido adicionada recentemente)
UPDATE db_bloco_de_notas.cotacao 
SET validacao = 'ativo' 
WHERE validacao IS NULL;
