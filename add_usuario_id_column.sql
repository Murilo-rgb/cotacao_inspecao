-- Adicionar coluna usuario_id na tabela de cotações
ALTER TABLE db_bloco_de_notas.cotacao 
ADD COLUMN IF NOT EXISTS usuario_id TEXT;

-- Atualizar registros existentes para preencher usuario_id baseado no usuario_login
-- Isso vincula as cotações existentes aos IDs dos usuários correspondentes
UPDATE db_bloco_de_notas.cotacao c
SET usuario_id = u.id
FROM db_automacao.usuarios u
WHERE c.usuario_login = u.login AND c.usuario_id IS NULL;

-- Criar índice para busca por usuario_id
CREATE INDEX IF NOT EXISTS idx_cotacao_usuario_id ON db_bloco_de_notas.cotacao(usuario_id);
