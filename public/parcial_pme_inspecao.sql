DO $$
DECLARE
    sql_datas TEXT;
    query_final TEXT;
BEGIN
    -- 1. Cria dinamicamente as colunas para TODAS as datas encontradas na tabela
    SELECT string_agg(
        format(
            'COUNT(CASE WHEN DATE(dat_historico) = %L THEN 1 END) AS %I', 
            data_dia, 
            TO_CHAR(data_dia, 'DD/mon')
        ), 
        ', ' ORDER BY data_dia
    )
    INTO sql_datas
    FROM (
        SELECT DISTINCT DATE(dat_historico) AS data_dia 
        FROM r_000250 
        WHERE dat_historico IS NOT NULL
    ) sub;

    -- 2. Monta a consulta ordenando a regional exatamente na sequência da imagem
    query_final := 'CREATE OR REPLACE TEMP VIEW vw_parcial_inspecao AS
                    SELECT 
                        COALESCE(regional, ''TOTAL'') AS regional, ' 
                        || sql_datas || ',
                        COUNT(*) AS total,
                        COUNT(CASE WHEN criado_por ILIKE ''RPA%'' THEN 1 END) AS solar_qtd,
                        CONCAT(ROUND(100.0 * COUNT(CASE WHEN criado_por ILIKE ''RPA%'' THEN 1 END) / NULLIF(COUNT(*), 0), 2), ''%'') AS solar_pct,
                        COUNT(CASE WHEN criado_por NOT ILIKE ''RPA%'' OR criado_por IS NULL THEN 1 END) AS manual_qtd,
                        CONCAT(ROUND(100.0 * COUNT(CASE WHEN criado_por NOT ILIKE ''RPA%'' OR criado_por IS NULL THEN 1 END) / NULLIF(COUNT(*), 0), 2), ''%'') AS manual_pct
                    FROM r_000250
                    GROUP BY ROLLUP(regional)
                    ORDER BY 
                        CASE COALESCE(regional, ''TOTAL'')
                            WHEN ''SP1''        THEN 1
                            WHEN ''SP2''        THEN 2
                            WHEN ''RJ/ES''      THEN 3
                            WHEN ''CO''         THEN 4
                            WHEN ''MG''         THEN 5
                            WHEN ''NE''         THEN 6
                            WHEN ''NO''         THEN 7
                            WHEN ''BA/SE''      THEN 8
                            WHEN ''PR/SC''      THEN 9
                            WHEN ''RS''         THEN 10
                            WHEN ''E-COMMERCE'' THEN 11
                            WHEN ''TOTAL''      THEN 99
                            ELSE 90
                        END;';

    -- 3. Executa a criação da View
    EXECUTE query_final;
END $$;

-- 4. Exibe a tabela montada dinamicamente e ordenada
SELECT * FROM vw_parcial_inspecao;