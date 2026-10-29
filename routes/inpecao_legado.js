const express = require('express');
const router = express.Router();
const { asDeps } = require('../app/route_deps');

// ============================================================
// RUTAS LEGADAS /api/inpecao/* y /api/inpecao_input/*
// Movidas tal cual desde server.js (sin deduplicar contra /api/inspecao/*).
// El router se monta en /api y /pme_notas/api (mismo modulo).
// ============================================================

module.exports = function (pool, authenticateToken, authorizeRoute, formatDateBR, classificarPendentes, inserirDistribuicaoAtomica) {
  const deps = asDeps(arguments, ['pool', 'authenticateToken', 'authorizeRoute', 'formatDateBR', 'classificarPendentes', 'inserirDistribuicaoAtomica']);
  pool = deps.pool;
  authenticateToken = deps.authenticateToken;
  authorizeRoute = deps.authorizeRoute;
  formatDateBR = deps.formatDateBR;
  classificarPendentes = deps.classificarPendentes;
  inserirDistribuicaoAtomica = deps.inserirDistribuicaoAtomica;

  router.post('inpecao/atualizar_r_000250', authenticateToken, authorizeRoute('/pme_notas/inpecao'), async (req, res) => {
    try {
      const startTime = Date.now();
      console.log('[ATUALIZAR_R_000250] Iniciando atualização...');
  
      // 1. Verificar datas máximas
      const blocoRes = await pool.query("SELECT COALESCE(MAX(CAST(dat_historico AS TIMESTAMP)), '1900-01-01'::TIMESTAMP) AS max_data FROM db_bloco_de_notas.r_000250");
      const claroRes = await pool.query("SELECT COALESCE(MAX(CAST(dat_historico AS TIMESTAMP)), '1900-01-01'::TIMESTAMP) AS max_data FROM db_claro.r_000250");
  
      const maxBloco = blocoRes.rows[0]?.max_data;
      const maxClaro = claroRes.rows[0]?.max_data;
  
      console.log(`[ATUALIZAR_R_000250] max_bloco=${maxBloco}, max_claro=${maxClaro}`);
  
      if (!maxClaro || maxClaro <= maxBloco) {
        const elapsedTime = Date.now() - startTime;
        console.log(`[ATUALIZAR_R_000250] Nenhuma atualização necessária. Concluído em ${elapsedTime}ms`);
        return res.json({ success: true, message: 'A tabela já está atualizada ou db_claro não possui dados mais recentes.' });
      }
  
      // 2. Truncar tabela
      await pool.query('TRUNCATE TABLE db_bloco_de_notas.r_000250 RESTART IDENTITY CASCADE');
      console.log('[ATUALIZAR_R_000250] Tabela truncada');
  
      // 3. Inserir dados do db_claro
      await pool.query(`
        INSERT INTO db_bloco_de_notas.r_000250 (
            cod_tarefa, dat_criacao, dat_historico, criado_por, pendente_com,
            nom_statuswf, regional, nom_tarefa, nom_fila, dsc_cotacao,
            tipo_pedido, qtd_linhas, qtd_linhas_novas, nom_territorio,
            ind_portabilidade, qtd_reprovacao, data_carga
        )
        SELECT DISTINCT ON (cod_tarefa)
            cod_tarefa, dat_criacao, dat_historico, criado_por, pendente_com,
            nom_statuswf, regional, nom_tarefa, nom_fila, dsc_cotacao,
            tipo_pedido, qtd_linhas, qtd_linhas_novas, nom_territorio,
            ind_portabilidade, qtd_reprovacao, CURRENT_DATE
        FROM db_claro.r_000250 where data_carga = CURRENT_DATE AND nom_fila NOT ILIKE 'CPC - Loja Pr_pria' AND nom_fila NOT ILIKE 'CPC - Loja Propria'
        ORDER BY cod_tarefa, dat_historico DESC NULLS LAST
      `);
  
      const elapsedTime = Date.now() - startTime;
      console.log(`[ATUALIZAR_R_000250] Concluído em ${elapsedTime}ms`);
      res.json({ success: true, message: 'Tabela atualizada com sucesso.' });
    } catch (error) {
      console.error('[ATUALIZAR_R_000250] Erro:', error);
      res.status(500).json({ 
        error: 'Erro ao atualizar tabela',
        details: error.message || 'Erro desconhecido',
        code: error.code
      });
    }
  });

  router.post('inpecao/classificar-pendentes', authenticateToken, authorizeRoute('/pme_notas/inpecao'), async (req, res) => {
    try {
      const result = await classificarPendentes();
      
      res.json({
        success: true,
        message: `${result.classificados} cotações classificadas como "Pendente - Classificação" (status gravado: pendente-classificacao)`,
        ...result
      });
    } catch (error) {
      console.error('[GESTAO] Erro na classificação manual:', error);
      res.status(500).json({ error: `Erro ao classificar cotações: ${error.message}` });
    }
  });

  router.get('inpecao/dashboard', authenticateToken, async (req, res) => {
    res.json([]);
  });

  router.get('inpecao/historico', authenticateToken, async (req, res) => {
    const { limit = 200, tarefa } = req.query;
    res.json([]);
  });

  router.get('inpecao/tarefas_top', authenticateToken, async (req, res) => {
    try {
      const { search, limit, offset = 0 } = req.query;
      const params = [];
      let query = `
        SELECT DISTINCT ON (iw.codigo_da_tarefa)
               iw.codigo_da_tarefa cod_tarefa,
               iw.data_historico,
               iw.para_usuario_nome assumido_por,
               iw.*,
               c.usuario_id,
               NULLIF(TRIM(COALESCE(u_dist.nome, '') || ' ' || COALESCE(u_dist.sobrenome, '')), '') as usuario_distribuido_nome
        FROM db_bloco_de_notas.iw_cpc_975_top iw
        LEFT JOIN db_bloco_de_notas.cotacao c ON iw.codigo_da_tarefa = c.tarefa
        LEFT JOIN db_automacao.usuarios u_dist ON u_dist.id::TEXT = c.usuario_id AND u_dist.ativo = true
        WHERE (etapa_atual ILIKE '01%' OR etapa_atual ILIKE '02%')
          AND situacao_sistema = 'ATIVO'
          AND acao = 'Alterar Status'
      `;
      if (search) {
        query += ` AND (fila ILIKE $1 OR codigo_da_tarefa ILIKE $1 OR razao_social_cliente ILIKE $1 OR situacao_sistema ILIKE $1)`;
        params.push(`%${search}%`);
      }
      query += ` ORDER BY iw.codigo_da_tarefa, iw.data_historico::timestamp DESC`;
      params.push(parseInt(limit), parseInt(offset));
      query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
      const result = await pool.query(query, params);
      const countResult = await pool.query(`
        SELECT 
          COUNT(DISTINCT CASE 
            WHEN (da_etapa ILIKE '%01%' AND para_etapa ILIKE '%02%') THEN codigo_da_tarefa 
          END) as em_tratamento,
          COUNT(DISTINCT CASE 
            WHEN (da_etapa ILIKE '%02%' AND para_etapa ILIKE '%04%') THEN codigo_da_tarefa 
          END) as aprovado,
          COUNT(DISTINCT CASE 
            WHEN (da_etapa ILIKE '%02%' AND para_etapa ILIKE '%03%') THEN codigo_da_tarefa 
          END) as reprovado,
          COUNT(DISTINCT CASE 
            WHEN (
              (da_etapa ILIKE '%Abert%' AND para_etapa ILIKE '%01%')
              OR (da_etapa ILIKE '%03%' AND para_etapa ILIKE '%01%')
            ) AND COALESCE(qtd_producao_futura, 0) = 0 THEN codigo_da_tarefa 
          END) as pendente,
          COUNT(DISTINCT CASE 
            WHEN (acao ILIKE 'Cancelar' OR situacao_sistema ILIKE 'CANCELADO') THEN codigo_da_tarefa 
          END) as cancelado,
          COUNT(DISTINCT CASE 
            WHEN (da_etapa ILIKE '%04%' AND (para_etapa ILIKE '%01%' OR para_etapa ILIKE '%02%' OR para_etapa ILIKE '%03%' OR para_etapa ILIKE '%Admin%')) THEN codigo_da_tarefa 
          END) as desconsiderar
        FROM db_bloco_de_notas.iw_cpc_975_top 
        WHERE etapa_atual ILIKE '01%' AND situacao_sistema = 'ATIVO' AND acao = 'Alterar Status'
      `);
      const stats = countResult.rows[0] || {};
  
      // Contagem por status específico de cotação (ilha INPUT TOP)
      let statusCounts = {
        fila: 0, aprovado: 0, reprovado: 0, aguardando_chamado: 0,
        aguardando_qualidade: 0, aguardando_dupla_validacao: 0,
        aguardando_pre_analise: 0, em_tratamento: 0
      };
      try {
        const statusResult = await pool.query(`
          SELECT 
            COUNT(DISTINCT c.tarefa) FILTER (WHERE c.status IS NULL OR c.status = '') AS fila,
            COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(c.status) = 'aprovado') AS aprovado,
            COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(c.status) = 'reprovado') AS reprovado,
            COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(REPLACE(c.status,' ','')) = 'aguardando-chamado') AS aguardando_chamado,
            COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(REPLACE(c.status,' ','')) = 'aguardando-qualidade') AS aguardando_qualidade,
            COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(REPLACE(c.status,' ','')) = 'aguardando-dupla-validacao') AS aguardando_dupla_validacao,
            COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(REPLACE(c.status,' ','')) LIKE 'aguardando-pre-analise%') AS aguardando_pre_analise,
            COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(REPLACE(c.status,' ','')) = 'em-tratamento') AS em_tratamento
          FROM db_gp.listafuncionarios l
          INNER JOIN db_automacao.usuarios u ON u.login = l.login
          LEFT JOIN db_bloco_de_notas.cotacao c ON c.usuario_id::text = u.id::text AND c.validacao = 'Ativo'
          WHERE l.ilha = 'TOP' AND l.ativo = true AND c.origem = 'iw_cpc_975_top'
        `);
        const st = statusResult.rows[0] || {};
        Object.keys(statusCounts).forEach(k => {
          statusCounts[k] = parseInt(st[k] || 0);
        });
      } catch (statusErr) {
        console.error('[GESTAO_TOP STATUS] Erro:', statusErr.message);
      }
  
      res.json({ 
        data: result.rows, 
        total: parseInt(countResult.rows[0].total || 0),
        stats,
        statusCounts,
        limit: parseInt(limit), 
        offset: parseInt(offset) 
      });
    } catch (error) {
      console.error('[GESTAO_TOP] Erro:', error);
      res.status(500).json({ error: 'Erro ao buscar dados' });
    }
  });

  router.get('inpecao/tarefas_net', authenticateToken, async (req, res) => {
    try {
      const { search, limit, offset = 0 } = req.query;
      const params = [];
      const filters = [];
      let paramIndex = 1;
  
      let query = `
        WITH historico_calculado AS (
          SELECT 
            iw.codigo_da_tarefa AS cod_tarefa,
            iw.data_historico,
            iw.para_usuario_nome AS assumido_por,
            iw.da_etapa,
            iw.para_etapa,
            iw.acao,
            iw.situacao_sistema,
            iw.etapa_atual,
            COUNT(*) FILTER (WHERE para_etapa LIKE '%02%') OVER (
              PARTITION BY iw.codigo_da_tarefa 
              ORDER BY iw.data_historico 
              ROWS BETWEEN 1 PRECEDING AND UNBOUNDED FOLLOWING
            ) AS qtd_producao_futura
          FROM db_bloco_de_notas.iw_cpc_975_net iw
        )
        SELECT DISTINCT ON (hc.cod_tarefa)
          hc.cod_tarefa,
          hc.data_historico,
          hc.assumido_por,
          hc.etapa_atual,
          c.usuario_id,
          NULLIF(TRIM(COALESCE(u_dist.nome, '') || ' ' || COALESCE(u_dist.sobrenome, '')), '') AS usuario_distribuido_nome,
          CASE WHEN (hc.da_etapa LIKE '%01%' AND hc.para_etapa LIKE '%02%') THEN 1 ELSE 0 END AS em_tratamento,
          CASE WHEN (hc.da_etapa LIKE '%02%' AND hc.para_etapa LIKE '%04%') THEN 1 ELSE 0 END AS aprovado,
          CASE WHEN (hc.da_etapa LIKE '%02%' AND hc.para_etapa LIKE '%03%') THEN 1 ELSE 0 END AS reprovado,
          CASE 
            WHEN (
              (hc.da_etapa ILIKE '%Abert%' AND hc.para_etapa LIKE '%01%')
              OR (hc.da_etapa LIKE '%03%' AND hc.para_etapa LIKE '%01%')
            ) AND hc.qtd_producao_futura = 0 THEN 1 
            ELSE 0 
          END AS pendente,
          CASE WHEN (hc.acao ILIKE 'Cancelar' OR hc.situacao_sistema ILIKE 'CANCELADO') THEN 1 ELSE 0 END AS cancelado,
          CASE 
            WHEN (
              hc.da_etapa LIKE '%04%' AND (
                hc.para_etapa LIKE '%01%' OR 
                hc.para_etapa LIKE '%02%' OR 
                hc.para_etapa LIKE '%03%' OR 
                hc.para_etapa ILIKE '%Admin%'
              )
            ) THEN 1 ELSE 0 END AS desconsiderar,
          hc.*
        FROM historico_calculado hc
        LEFT JOIN db_bloco_de_notas.cotacao c ON hc.cod_tarefa = c.tarefa
        LEFT JOIN db_automacao.usuarios u_dist ON u_dist.id::TEXT = c.usuario_id AND u_dist.ativo = true
        WHERE 
          (hc.etapa_atual ILIKE '01%' OR hc.etapa_atual ILIKE '02%')
      `;
  
      if (search) {
        query += ` AND (hc.fila ILIKE $${paramIndex} OR hc.codigo_da_tarefa ILIKE $${paramIndex} OR hc.razao_social_cliente ILIKE $${paramIndex} OR hc.situacao_sistema ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }
  
      if (limit) {
        query += ` LIMIT $${paramIndex}`;
        params.push(parseInt(limit));
        paramIndex++;
      }
      if (parseInt(offset) > 0) {
        query += ` OFFSET $${paramIndex}`;
        params.push(parseInt(offset));
      }
      query += ` ORDER BY hc.cod_tarefa, hc.data_historico DESC`;
  
      const result = await pool.query(query, params);
  
      const statsResult = await pool.query(`
        WITH historico_calculado AS (
          SELECT 
            iw.codigo_da_tarefa AS cod_tarefa,
            iw.data_historico,
            iw.para_usuario_nome AS assumido_por,
            iw.da_etapa,
            iw.para_etapa,
            iw.acao,
            iw.situacao_sistema,
            iw.etapa_atual,
            COUNT(*) FILTER (WHERE para_etapa LIKE '%02%') OVER (
              PARTITION BY iw.codigo_da_tarefa 
              ORDER BY iw.data_historico 
              ROWS BETWEEN 1 PRECEDING AND UNBOUNDED FOLLOWING
            ) AS qtd_producao_futura
          FROM db_bloco_de_notas.iw_cpc_975_net iw
        ),
        foto_recente AS (
          SELECT DISTINCT ON (hc.cod_tarefa) hc.cod_tarefa, hc.data_historico, hc.assumido_por, hc.da_etapa, hc.para_etapa, hc.acao, hc.situacao_sistema, hc.etapa_atual, hc.qtd_producao_futura
          FROM historico_calculado hc
          WHERE hc.etapa_atual ILIKE '01%'
          ORDER BY hc.cod_tarefa, hc.data_historico DESC
        )
        SELECT 
          COUNT(DISTINCT CASE WHEN (foto_recente.da_etapa LIKE '%01%' AND foto_recente.para_etapa LIKE '%02%') THEN foto_recente.cod_tarefa END) as em_tratamento,
          COUNT(DISTINCT CASE WHEN (foto_recente.da_etapa LIKE '%02%' AND foto_recente.para_etapa LIKE '%04%') THEN foto_recente.cod_tarefa END) as aprovado,
          COUNT(DISTINCT CASE WHEN (foto_recente.da_etapa LIKE '%02%' AND foto_recente.para_etapa LIKE '%03%') THEN foto_recente.cod_tarefa END) as reprovado,
          COUNT(DISTINCT CASE 
            WHEN (
              (foto_recente.da_etapa ILIKE '%Abert%' AND foto_recente.para_etapa LIKE '%01%')
              OR (foto_recente.da_etapa LIKE '%03%' AND foto_recente.para_etapa LIKE '%01%')
            ) AND foto_recente.qtd_producao_futura = 0 
            THEN foto_recente.cod_tarefa 
          END) as pendente,
          COUNT(DISTINCT CASE WHEN (foto_recente.acao ILIKE 'Cancelar' OR foto_recente.situacao_sistema ILIKE 'CANCELADO') THEN foto_recente.cod_tarefa END) as cancelado,
          COUNT(DISTINCT CASE 
            WHEN (foto_recente.da_etapa LIKE '%04%' AND (foto_recente.para_etapa LIKE '%01%' OR foto_recente.para_etapa LIKE '%02%' OR foto_recente.para_etapa LIKE '%03%' OR foto_recente.para_etapa ILIKE '%Admin%'))
            THEN foto_recente.cod_tarefa 
          END) as desconsiderar,
          COUNT(DISTINCT foto_recente.cod_tarefa) as total
        FROM foto_recente
        WHERE foto_recente.etapa_atual ILIKE '01%'
      `);
  
      const stats = statsResult.rows[0] || {};
  
      // Contagem por status específico de cotação (ilha INPUT NET)
      let statusCounts = {
        fila: 0, em_tratamento: 0, troca_de_territorio: 0, troca_de_segmento: 0,
        cadastro_de_membro: 0, aguardando_chamado: 0, aguardando_qualidade: 0,
        renovacao_aparelho: 0, aprovado: 0, reprovado: 0
      };
      try {
        const statusResult = await pool.query(`
          SELECT 
            COUNT(DISTINCT c.tarefa) FILTER (WHERE c.status IS NULL OR c.status = '') AS fila,
            COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(REPLACE(c.status,' ','')) = 'em-tratamento') AS em_tratamento,
            COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(REPLACE(c.status,' ','')) = 'troca-de-territorio') AS troca_de_territorio,
            COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(REPLACE(c.status,' ','')) = 'troca-de-segmento') AS troca_de_segmento,
            COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(REPLACE(c.status,' ','')) = 'cadastro-de-membro') AS cadastro_de_membro,
            COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(REPLACE(c.status,' ','')) = 'aguardando-chamado') AS aguardando_chamado,
            COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(REPLACE(c.status,' ','')) = 'aguardando-qualidade') AS aguardando_qualidade,
            COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(c.status) LIKE '%aparelho%') AS renovacao_aparelho,
            COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(c.status) = 'aprovado') AS aprovado,
            COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(c.status) = 'reprovado') AS reprovado
          FROM db_gp.listafuncionarios l
          INNER JOIN db_automacao.usuarios u ON u.login = l.login
          LEFT JOIN db_bloco_de_notas.cotacao c ON c.usuario_id::text = u.id::text AND c.validacao = 'Ativo'
          WHERE l.ilha = 'INPUT NET' AND l.ativo = true AND c.origem = 'iw_cpc_975_net'
        `);
        const st = statusResult.rows[0] || {};
        Object.keys(statusCounts).forEach(k => {
          statusCounts[k] = parseInt(st[k] || 0);
        });
      } catch (statusErr) {
        console.error('[GESTAO_NET STATUS] Erro:', statusErr.message);
      }
  
      res.json({ 
        data: result.rows, 
        total: parseInt(stats.total || 0),
        stats,
        statusCounts,
        limit: parseInt(limit), 
        offset: parseInt(offset) 
      });
    } catch (error) {
      console.error('[GESTAO_NET] Erro:', error);
      res.status(500).json({ error: 'Erro ao buscar dados' });
    }
  });

  router.post('inpecao/atualizar_input_net', authenticateToken, async (req, res) => {
    let client;
    try {
      client = await pool.connect();
      // Evita que o ETL fique preso segurando locks por muito tempo, o que degrada a
      // leitura da página de inspeção (que consome a tabela cotacao).
      // Usamos um cliente dedicado para que os SETs valham para o mesmo statement.
      await client.query('SET lock_timeout = \'30s\'');
      await client.query('SET statement_timeout = 0');
      await client.query(`
        DO $$
        DECLARE
            v_max_esteira TIMESTAMP;
            v_max_bloco   TIMESTAMP;
        BEGIN
            SELECT MAX(CAST(data_historico AS TIMESTAMP)) INTO v_max_esteira FROM db_esteira_gross.historico_input_pedido_pme_net;
            SELECT MAX(CAST(data_historico AS TIMESTAMP)) INTO v_max_bloco FROM db_bloco_de_notas.iw_cpc_975_net;
  
            IF v_max_esteira > COALESCE(v_max_bloco, '1900-01-01'::timestamp) THEN
                -- Otimização de IO/lock: em vez de TRUNCATE (AccessExclusiveLock, bloqueia leitores
                -- da iw_cpc durante toda a transação), usamos DELETE (RowExclusiveLock). O resultado
                -- final é o mesmo (tabela passa a conter somente os dados re-carregados abaixo), mas
                -- as leituras concorrentes (dashboard / distribuição) não ficam bloqueadas.
                DELETE FROM db_bloco_de_notas.iw_cpc_975_net;
  
                INSERT INTO db_bloco_de_notas.iw_cpc_975_net (
                    fila, codigo_da_tarefa, data_criacao, data_finalizacao, etapa_atual,
                    data_historico, da_etapa, do_usuario_login, do_usuario_nome, para_etapa,
                    para_usuario_login, para_usuario_nome, acao, canal_cliente, segmento_cliente,
                    cnpj_cliente, razao_social_cliente, cliente_cpc, login_gerente_conta,
                    nome_gerente_conta, id_cor, id_cotacao, id_ped, descricao, situacao_sistema,
                      data_carga
                )
                SELECT
                    fila, codigo_da_tarefa, data_criacao, data_finalizacao, etapa_atual,
                    data_historico, da_etapa, do_usuario_login, do_usuario_nome, para_etapa,
                    para_usuario_login, para_usuario_nome, acao, canal_cliente, segmento_cliente,
                    cnpj_cliente, razao_social_cliente, cliente_cpc, login_gerente_conta,
                    nome_gerente_conta, id_cor, id_cotacao, id_ped, descricao, situacao_sistema,
                    CURRENT_DATE AS data_carga
                FROM db_esteira_gross.historico_input_pedido_pme_net
                WHERE CAST(data_historico AS TIMESTAMP)::date = CURRENT_DATE;
  
                RAISE NOTICE 'Sucesso: Tabela truncada e dados atualizados para o dia %.', CURRENT_DATE;
            ELSE
                RAISE NOTICE 'Aviso: A tabela do bloco de notas já está atualizada ou a origem não possui dados mais recentes.';
            END IF;
        END $$;
      `);
      res.json({ success: true, message: 'Dados atualizados com sucesso.' });
    } catch (error) {
      console.error('[ATUALIZAR_INPUT_NET] Erro:', error);
      res.status(500).json({ error: 'Erro ao atualizar dados' });
    } finally {
      if (client) client.release();
    }
  });

  router.post('inpecao/distribuir_input_net', authenticateToken, authorizeRoute('/pme_notas/inpecao'), async (req, res) => {
    try {
      const { distribuicoes } = req.body;
      
      if (!distribuicoes || !Array.isArray(distribuicoes) || distribuicoes.length === 0) {
        return res.status(400).json({ error: 'Lista de distribuições inválida' });
      }
      
      const usuarioLogin = req.user.username;
      const usuarioId = req.user.id;
      const now = formatDateBR(new Date());
      
      let count = 0;
      let errors = [];
      
      for (const item of distribuicoes) {
        if (!item.cod_tarefa || !item.usuario_id) {
          errors.push({ cod_tarefa: item.cod_tarefa, error: 'Dados incompletos' });
          continue;
        }
        
        try {
          // Buscar nome da tarefa para anotação e data_historico
          const tarefaResult = await pool.query(
            'SELECT codigo_da_tarefa, etapa_atual, data_historico FROM db_bloco_de_notas.iw_cpc_975_net WHERE codigo_da_tarefa = $1',
            [item.cod_tarefa]
          );
          
          let anotacao = '';
          let dataHistorico = null;
          let tarefaValue = item.cod_tarefa;
          let cotacaoDsc = item.cod_tarefa;
          if (tarefaResult.rows.length > 0) {
            const tr = tarefaResult.rows[0];
            // Distribuição manual restrita à etapa 01 (entrada da esteira)
            if (!tr.etapa_atual || !String(tr.etapa_atual).trim().toUpperCase().startsWith('01')) {
              errors.push({ cod_tarefa: item.cod_tarefa, error: `Etapa não permitida para distribuição: ${tr.etapa_atual || 'indefinida'} (apenas etapa 01)` });
              continue;
            }
            anotacao = `Origem: iw_cpc_975_net | Etapa: ${tr.etapa_atual || ''}`;
            if (tr.data_historico) dataHistorico = tr.data_historico;
          }
  
          // Buscar nome do usuário destino
          let destinoNome = String(item.usuario_id);
          try {
              const uRes = await pool.query('SELECT nome FROM db_automacao.usuarios WHERE id = $1', [item.usuario_id]);
              if (uRes.rows.length > 0) destinoNome = uRes.rows[0].nome;
          } catch {}
  
          // Inserção atômica: tarefa + data_historico nunca duplicada.
          const inserido = await inserirDistribuicaoAtomica(pool, {
            tarefa: tarefaValue,
            cotacao: cotacaoDsc,
            anotacao,
            agora: now,
            usuarioLogin,
            usuarioId: item.usuario_id,
            origem: 'iw_cpc_975_net',
            dataHistorico,
          });
  
          if (!inserido) {
            errors.push({ cod_tarefa: item.cod_tarefa, error: 'Tarefa já distribuída para este data_historico' });
            continue;
          }
  
          // Registrar auditoria
          try {
              await pool.query(
                  `INSERT INTO db_bloco_de_notas.cotacao_audit 
                   (tarefa, acao, usuario_origem_id, usuario_origem_nome, usuario_destino_id, usuario_destino_nome, status_anterior, status_novo, criado_por) 
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                  [item.cod_tarefa, 'distribuido_input_net', usuarioId, usuarioLogin, item.usuario_id, destinoNome, '-', 'pendente', usuarioLogin]
              );
          } catch (auditErr) {
              console.error('[DISTRIBUIR_INPUT_NET] Erro ao registrar auditoria:', auditErr.message);
          }
          
          count++;
        } catch (err) {
          errors.push({ cod_tarefa: item.cod_tarefa, error: err.message });
        }
      }
      
      res.json({
        success: true,
        message: `${count} tarefa(s) distribuída(s) com sucesso`,
        distribuidos: count,
        erros: errors
      });
      
    } catch (error) {
      console.error('[DISTRIBUIR_INPUT_NET] Erro:', error);
      res.status(500).json({ error: `Erro ao distribuir tarefas: ${error.message}` });
    }
  });

  router.post('inpecao/redistribuir_input_net', authenticateToken, authorizeRoute('/pme_notas/inpecao'), async (req, res) => {
    try {
      const { redistribuicoes } = req.body;
      
      if (!redistribuicoes || !Array.isArray(redistribuicoes) || redistribuicoes.length === 0) {
        return res.status(400).json({ error: 'Lista de redistribuições inválida' });
      }
      
      const usuarioLogin = req.user.username;
      const usuarioId = req.user.id;
      const now = formatDateBR(new Date());
      
      let count = 0;
      let errors = [];
      
      for (const item of redistribuicoes) {
        if (!item.cod_tarefa || !item.usuario_id) {
          errors.push({ cod_tarefa: item.cod_tarefa, error: 'Dados incompletos' });
          continue;
        }
        
        try {
          // Verificar se a tarefa existe e está ativa
          const check = await pool.query(
            "SELECT tarefa, usuario_id FROM db_bloco_de_notas.cotacao WHERE tarefa = $1 AND validacao = $2 AND origem = 'iw_cpc_975_net'",
            [item.cod_tarefa, 'Ativo']
          );
          
          if (check.rows.length === 0) {
            errors.push({ cod_tarefa: item.cod_tarefa, error: 'Tarefa não encontrada ou origem não é iw_cpc_975_net' });
            continue;
          }
  
          // Buscar nome do usuário destino
          let destinoNome = String(item.usuario_id);
          try {
              const uRes = await pool.query('SELECT nome FROM db_automacao.usuarios WHERE id = $1', [item.usuario_id]);
              if (uRes.rows.length > 0) destinoNome = uRes.rows[0].nome;
          } catch {}
  
          // Registrar auditoria
          await pool.query(
              `INSERT INTO db_bloco_de_notas.cotacao_audit 
               (tarefa, acao, usuario_origem_id, usuario_origem_nome, usuario_destino_id, usuario_destino_nome, status_anterior, status_novo, criado_por) 
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
              [item.cod_tarefa, 'redistribuido_input_net', usuarioId, usuarioLogin, item.usuario_id, destinoNome, null, null, usuarioLogin]
          );
  
          // Atualizar usuário
          await pool.query(
            `UPDATE db_bloco_de_notas.cotacao 
             SET usuario_id = $1, data_da_ultima_atualizacao = $2, usuario_login = $3
             WHERE tarefa = $4 AND validacao = 'Ativo' AND origem = 'iw_cpc_975_net'`,
            [item.usuario_id, now, usuarioLogin, item.cod_tarefa]
          );
  
          count++;
        } catch (err) {
          errors.push({ cod_tarefa: item.cod_tarefa, error: err.message });
        }
      }
      
      res.json({
        success: true,
        message: `${count} tarefa(s) redistribuída(s) com sucesso`,
        redistribuidos: count,
        erros: errors
      });
      
    } catch (error) {
      console.error('[REDISTRIBUIR_INPUT_NET] Erro:', error);
      res.status(500).json({ error: `Erro ao redistribuir tarefas: ${error.message}` });
    }
  });

  router.get('inpecao_input/tarefas', authenticateToken, async (req, res) => {
    try {
      const { search, limit = 100, offset = 0 } = req.query;
      
      let query = `
        SELECT * FROM db_bloco_de_notas.iw_cpc_975_net 
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;
      
      if (search) {
        query += ` AND (
          fila ILIKE $${paramIndex} OR 
          codigo_da_tarefa ILIKE $${paramIndex} OR 
          razao_social_cliente ILIKE $${paramIndex} OR
          situacao_sistema ILIKE $${paramIndex}
        )`;
        params.push(`%${search}%`);
        paramIndex++;
      }
      
      query += ` ORDER BY data_historico DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(parseInt(limit), parseInt(offset));
      
      const result = await pool.query(query, params);
      
      // Contar total
      const countResult = await pool.query('SELECT COUNT(*) as total FROM db_bloco_de_notas.iw_cpc_975_net');
      const total = parseInt(countResult.rows[0].total);
      
      res.json({
        data: result.rows,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      
    } catch (error) {
      console.error('[GESTAO_INPUT] Erro ao buscar dados:', error);
      res.status(500).json({ error: 'Erro ao buscar dados' });
    }
  });

  return router;
};
