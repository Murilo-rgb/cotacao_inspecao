-- Atualizar registros existentes para ter validacao com letra maiúscula
UPDATE db_bloco_de_notas.cotacao 
SET validacao = 'Ativo' 
WHERE validacao ILIKE 'ativo';

UPDATE db_bloco_de_notas.cotacao 
SET validacao = 'Inativo' 
WHERE validacao ILIKE 'inativo';
