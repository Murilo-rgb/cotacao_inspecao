DO $$
DECLARE
    sql_datas TEXT;
    query_final TEXT;
BEGIN
    -- 1. Cria as colunas dinâmicas usando a coluna correta (data_historico)
    SELECT string_agg(
        format(
            'COUNT(CASE WHEN DATE(base.data_historico) = %L THEN 1 END) AS %I', 
            data_dia, 
            TO_CHAR(data_dia, 'DD/mon')
        ), 
        ', ' ORDER BY data_dia
    )
    INTO sql_datas
    FROM (
        SELECT DISTINCT DATE(data_historico) AS data_dia 
        FROM (
            SELECT data_historico FROM db_bloco_de_notas.iw_cpc_975_top
            UNION ALL
            SELECT data_historico FROM db_bloco_de_notas.iw_cpc_975_net
        ) t
        WHERE data_historico IS NOT NULL
    ) sub;

    -- 2. Monta a consulta dinâmica para o bloco TOP PME
    query_final := 'CREATE OR REPLACE TEMP VIEW vw_parcial_input_pme AS
                    WITH base AS (
                        SELECT 
                            icn.data_historico,
                            icn.etapa_atual,
                            d.revenda
                        FROM db_bloco_de_notas.iw_cpc_975_top icn 
                        LEFT JOIN db_qualidade.aux_depara_demandante d 
                               ON icn.do_usuario_nome = d.demandante
                    ),
                    membros_subdivisao AS (
                        SELECT 1 AS ordem, ''PENDENTE INPUT'' AS status, ''TOP HUNTER'' AS subdivisao
                        UNION ALL SELECT 2, ''PENDENTE INPUT'', ''D2D''
                        UNION ALL SELECT 3, ''PENDENTE INPUT'', ''INSIDE SALES''
                        UNION ALL SELECT 4, ''PENDENTE INPUT'', ''FIELD SALES''
                        UNION ALL SELECT 5, ''EM TRATAMENTO DESDE'', NULL
                        UNION ALL SELECT 6, ''EM TROCA DE TERRITÓRIO DESDE'', NULL
                    )
                    SELECT 
                        m.status,
                        m.subdivisao, '
                        || sql_datas || ',
                        COUNT(base.data_historico) AS total
                    FROM membros_subdivisao m
                    LEFT JOIN base ON (
                        -- Regra PENDENTE INPUT (etapa_atual ilike ''01%'')
                        (m.status = ''PENDENTE INPUT'' 
                         AND base.etapa_atual ILIKE ''01%'' 
                         AND (
                             (m.subdivisao = ''TOP HUNTER''   AND base.revenda ILIKE ''TOP%'') OR
                             (m.subdivisao = ''D2D''          AND base.revenda ILIKE ''D2D%'') OR
                             (m.subdivisao = ''INSIDE SALES'' AND base.revenda ILIKE ''INSIDE%'') OR
                             (m.subdivisao = ''FIELD SALES''  AND base.revenda ILIKE ''FIELD%'')
                         )
                        )
                        OR
                        -- Regra EM TRATAMENTO DESDE (etapa_atual ilike ''02%'')
                        (m.status = ''EM TRATAMENTO DESDE'' 
                         AND base.etapa_atual ILIKE ''02%''
                        )
                    )
                    GROUP BY m.ordem, m.status, m.subdivisao
                    ORDER BY m.ordem;';

    -- 3. Executa a criação da View
    EXECUTE query_final;
END $$;

-- 4. Exibe o resultado
SELECT * FROM vw_parcial_input_pme;