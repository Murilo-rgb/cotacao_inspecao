-- ============================================================================
-- db_bloco_de_notas.net_ate_3_linhas()
--
-- Mantem db_bloco_de_notas.cotacao.cotacao/qtd_linhas sincronizados com a carga
-- mais recente de db_claro.r_000247 (origem NET) e db_claro.input_pedido_pme
-- (origem TOP), consolidando por tarefa (cod_tarefa / num_dem).
--
-- Execucao:
--   Agendada todos os dias as 03:00 pelo app  -> app/scheduler.js
--   Manual                                    -> CALL db_bloco_de_notas.net_ate_3_linhas();
--
-- >>> ESTE ARQUIVO NAO FOI EXECUTADO NO BANCO. Precisa de aprovacao do DBA. <<<
--
-- Por que aplicar:
--   A versao instalada hoje (oid 32074385, owner jose_faria) termina com
--       AND (a.cotacao IS NULL OR a.cotacao = '' OR a.cotacao NOT ILIKE 'Q%')
--   Como o mesmo UPDATE tambem grava a.cotacao, a partir da 2a execucao a linha
--   ja possui um codigo 'Q...' e passa a ser ignorada PARA SEMPRE: o qtd_linhas
--   congela no valor da primeira execucao e a carga nova do dia nunca chega na
--   tela de qualidade (que filtra por qtd_linhas <= 3). O agendador das 03:00
--   rodaria "com sucesso" sem atualizar nada.
--
--   O mesmo vale para o SET da cotacao: COALESCE(NULLIF(sub.cotacao,''), 'N/A',
--   a.cotacao) sobrescreve um 'Q...' valido por 'N/A' quando a carga nova nao
--   traz codigo de cotacao.
--
-- O que muda nesta versao (somente as 2 clausulas comentadas como [CORRIGIDO]):
--   * SET: preserva o 'Q...' existente, grava o novo quando aparecer e so cai
--     para 'N/A' quando nao existe nenhum dos dois.
--   * WHERE: atualiza quando o qtd_linhas calculado difere do gravado, quando a
--     cotacao esta vazia ou quando surgiu um 'Q...' onde ainda nao havia.
--   Nada mais foi alterado (mesmas origens, mesmo MAX por coluna, mesma janela
--   de MAX(data_carga)). Se nao quiser mexer nisso agora, o arquivo pode ficar
--   apenas como referencia e o agendador continua rodando como esta.
--
-- Observacao (nao alterada aqui): a subconsulta faz UNION ALL das duas origens e
-- depois MAX(qtd_linhas) por cod_tarefa. Se a MESMA tarefa existir nas duas
-- tabelas, fica o maior valor (nao a soma) - comportamento herdado da versao atual.
-- ============================================================================

CREATE OR REPLACE PROCEDURE db_bloco_de_notas.net_ate_3_linhas()
 LANGUAGE plpgsql
AS $procedure$
BEGIN
    UPDATE db_bloco_de_notas.cotacao a
    SET
        -- [CORRIGIDO] preserva o codigo 'Q...' ja gravado em vez de troca-lo por 'N/A'
        cotacao = CASE
            WHEN a.cotacao ILIKE 'Q%' THEN a.cotacao
            WHEN NULLIF(sub.cotacao, '') IS NOT NULL THEN sub.cotacao
            ELSE COALESCE(a.cotacao, 'N/A')
        END,
        qtd_linhas = COALESCE(sub.qtd_linhas, a.qtd_linhas)
    FROM (
        -- Subconsulta unificada das origens já consolidadas por tarefa
        SELECT
            cod_tarefa,
            COALESCE(
                MAX(CASE WHEN cotacao ILIKE 'Q%' THEN cotacao END),
                MAX(cotacao)
            ) AS cotacao,
            MAX(qtd_linhas) AS qtd_linhas
        FROM (
            -- Origem 1: Tabela r_000247 (Agrupada aplicando MAX por coluna e somando os resultados)
            SELECT
                b.cod_tarefa::text AS cod_tarefa,
                COALESCE(
                    MAX(CASE WHEN b.cod_cotacao ILIKE 'Q%' THEN b.cod_cotacao::text END),
                    MAX(b.cod_cotacao::text)
                ) AS cotacao,
                (COALESCE(MAX(b.qtd_linha_dados::int), 0) +
                 COALESCE(MAX(b.qtd_linha_voz::int), 0)) AS qtd_linhas
            FROM db_claro.r_000247 b
            INNER JOIN (
                SELECT cod_tarefa, MAX(data_carga) AS max_data
                FROM db_claro.r_000247
                WHERE cod_tarefa IS NOT NULL
                GROUP BY cod_tarefa
            ) ult ON b.cod_tarefa = ult.cod_tarefa AND b.data_carga = ult.max_data
            WHERE b.cod_tarefa IS NOT NULL
            GROUP BY b.cod_tarefa

            UNION ALL

            -- Origem 2: Tabela input_pedido_pme (Agrupada aplicando MAX por coluna e somando os resultados)
            SELECT
                p.num_dem::text AS cod_tarefa,
                COALESCE(
                    MAX(CASE WHEN p.cotacao ILIKE 'Q%' THEN p.cotacao::text END),
                    MAX(p.cotacao::text)
                ) AS cotacao,
                (COALESCE(MAX(p.total_linhas_dados::int), 0) +
                 COALESCE(MAX(p.total_linhas_telemetria::int), 0) +
                 COALESCE(MAX(p.total_linhas_voz::int), 0)) AS qtd_linhas
            FROM db_claro.input_pedido_pme p
            INNER JOIN (
                SELECT num_dem, MAX(data_carga) AS max_data
                FROM db_claro.input_pedido_pme
                WHERE num_dem IS NOT NULL
                GROUP BY num_dem
            ) ult ON p.num_dem = ult.num_dem AND p.data_carga = ult.max_data
            WHERE p.num_dem IS NOT NULL
            GROUP BY p.num_dem
        ) combined
        GROUP BY cod_tarefa
    ) sub
    WHERE a.tarefa::text = sub.cod_tarefa
      -- [CORRIGIDO] antes: (a.cotacao IS NULL OR a.cotacao = '' OR a.cotacao NOT ILIKE 'Q%')
      -- o que congelava o qtd_linhas depois da primeira execucao.
      AND (
            a.qtd_linhas IS DISTINCT FROM sub.qtd_linhas
         OR a.cotacao IS NULL
         OR a.cotacao = ''
         OR (a.cotacao NOT ILIKE 'Q%' AND sub.cotacao ILIKE 'Q%')
      );

    RAISE NOTICE 'Atualização de cotação e qtd_linhas realizada com sucesso utilizando a carga mais recente.';
END;
$procedure$;

-- ============================================================================
-- Validacao sugerida (somente leitura), antes e depois de aplicar:
--
--   -- 1) cotacoes de Input ainda sem qtd_linhas
--   SELECT COALESCE(origem, '(sem origem)') AS origem, count(*) AS sem_qtd_linhas
--   FROM db_bloco_de_notas.cotacao
--   WHERE origem IN ('iw_cpc_975_net', 'iw_cpc_975_top') AND qtd_linhas IS NULL
--   GROUP BY 1 ORDER BY 1;
--
--   -- 2) distribuicao por faixa (o que a tela mostra com qtd_linhas <= 3)
--   SELECT origem,
--          count(*) FILTER (WHERE qtd_linhas <= 3) AS ate_3,
--          count(*) FILTER (WHERE qtd_linhas > 3)  AS acima_3
--   FROM db_bloco_de_notas.cotacao
--   WHERE origem IN ('iw_cpc_975_net', 'iw_cpc_975_top')
--   GROUP BY origem;
--
--   -- 3) prova de que o UPDATE voltou a atualizar: rodar em dois dias de carga
--   --    seguidos e conferir que o comando reporta linhas afetadas (> 0).
--   CALL db_bloco_de_notas.net_ate_3_linhas();
--
-- Para validar a sintaxe sem aplicar:
--   BEGIN;  (executar o CREATE do arquivo)  ROLLBACK;
-- O CREATE OR REPLACE e transacional: o ROLLBACK descarta a troca.
-- ============================================================================
