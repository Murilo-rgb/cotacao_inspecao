INSERT INTO db_automacao.usuarios (
    id, 
    login, 
    senha, 
    nome, 
    sobrenome, 
    email, 
    ativo, 
    deve_trocar_senha, 
    data_criacao, 
    data_ultima_troca_senha, 
    data_ultimo_acesso, 
    criado_por
)
SELECT 
    nextval('db_automacao.usuarios_id_seq'::regclass),
    fonte.login, 
    '',                                 -- Senha vazia
    SPLIT_PART(fonte.nome, ' ', 1),     -- Primeiro nome
    TRIM(SUBSTRING(fonte.nome FROM POSITION(' ' IN fonte.nome) + 1)), -- Sobrenome
    COALESCE(fonte.email, ''),
    fonte.ativo,
    true,                              -- deve_trocar_senha
    CURRENT_TIMESTAMP,                  -- data_criacao
    NULL,                               -- data_ultima_troca_senha (Corrigido para NULL)
    NULL,                               -- data_ultimo_acesso (Corrigido para NULL)
    'SISTEMA_IMPORTACAO'
FROM (
    -- Subquery para tratar duplicatas na origem
    SELECT DISTINCT ON (login) 
        login, nome, email, ativo
    FROM db_gp.listafuncionarios 
    WHERE ilha ILIKE '%ins%' 
    AND login IS NOT NULL 
    AND login <> ''
) AS fonte
WHERE NOT EXISTS (
    -- Verifica se o login já existe no destino para evitar erros de duplicidade
    SELECT 1 
    FROM db_automacao.usuarios destino 
    WHERE destino.login = fonte.login
);