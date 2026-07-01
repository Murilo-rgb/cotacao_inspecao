const express = require('express');
const router = express.Router();

module.exports = function(pool, authenticateToken, authorizeRoute, formatDateBR, path, fs, upload, inputUpload, processarETL_250, processarETL_975_top, processarETL_975_net, classificarPendentes) {

  // Função auxiliar para registrar auditoria
  async function registrarAuditoria(pool, { tarefa, acao, usuario_origem_id, usuario_origem_nome, usuario_destino_id, usuario_destino_nome, status_anterior, status_novo, criado_por }) {
    try {
      await pool.query(
        `INSERT INTO db_bloco_de_notas.cotacao_audit 
         (tarefa, acao, usuario_origem_id, usuario_origem_nome, usuario_destino_id, usuario_destino_nome, status_anterior, status_novo, criado_por) 
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [tarefa, acao, usuario_origem_id, usuario_origem_nome, usuario_destino_id, usuario_destino_nome, status_anterior, status_novo, criado_por]
      );
    } catch (err) {
      console.error('[AUDIT] Erro ao registrar:', err.message);
    }
  }

  // ===== ROTAS DE INSPEÇÃO (r_000250) =====

  // Serve inspecao page
  router.get('/inspecao', authenticateToken, authorizeRoute('/pme_notas/gestao'), (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'inspecao.html'));
  });

  // Upload CSV/ZIP e processar ETL r_000250
  router.post('/api/inspecao/upload', authenticateToken, authorizeRoute('/pme_notas/gestao'), upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      }
      
      const filePath = req.file.path;
      console.log(`[INSPECAO] Upload recebido: ${req.file.originalname} -> ${filePath}`);
      
      const result = await processarETL_250(filePath, pool);
      
      // Após ETL, classificar cotações pendentes que não existem mais em r_000250
      try {
        await classificarPendentes();
      } catch (classErr) {
        console.error('[INSPECAO] Erro na classificação após ETL:', classErr.message);
      }
      
      res.json({
        success: true,
        message: `Arquivo processado com sucesso. ${result.totalRows} registros carregados.`,
        totalRows: result.totalRows
      });
      
    } catch (error) {
      console.error('[INSPECAO] Erro no upload/ETL:', error);
      res.status(500).json({ error: `Erro ao processar arquivo: ${error.message}` });
    }
  });

  // Listar tarefas da r_000250 (com nome do usuário atribuído)
  router.get('/api/inspecao/tarefas', authenticateToken, authorizeRoute('/pme_notas/gestao'), async (req, res) => {
    try {
      const query = `
        SELECT r.*, 
          c.status AS cotacao_status,
          CASE WHEN c.cotacao IS NOT NULL THEN 'Enviado' ELSE 'Fila' END as status_distribuicao,
          COALESCE(u_dist.nome, c.usuario_login) AS usuario_distribuido_nome
        FROM db_bloco_de_notas.r_000250 r
        LEFT JOIN db_bloco_de_notas.cotacao c ON r.cod_tarefa = c.tarefa
        LEFT JOIN db_automacao.usuarios u_dist ON u_dist.id::TEXT = c.usuario_id AND u_dist.ativo = true
        ORDER BY r.dat_criacao DESC
      `;
      
      const result = await pool.query(query);
      
      // Formatar para o frontend
      const tarefas = result.rows.map(row => ({
        cod_tarefa: row.cod_tarefa,
        dat_criacao: row.dat_criacao,
        dat_historico: row.dat_historico,
        criado_por: row.criado_por,
        pendente_com: row.pendente_com,
        nom_statuswf: row.nom_statuswf,
        regional: row.regional,
        nom_tarefa: row.nom_tarefa,
        nom_fila: row.nom_fila,
        dsc_cotacao: row.dsc_cotacao,
        tipo_pedido: row.tipo_pedido,
        qtd_linhas: row.qtd_linhas,
        qtd_linhas_novas: row.qtd_linhas_novas,
        nom_territorio: row.nom_territorio,
        ind_portabilidade: row.ind_portabilidade,
        qtd_reprovacao: row.qtd_reprovacao,
        status_distribuicao: row.status_distribuicao,
        cotacao_status: row.cotacao_status,
        assumido_por: row.assumido_por,
        usuario_distribuido_nome: row.usuario_distribuido_nome || '-'
      }));
      
      res.json(tarefas);
      
    } catch (error) {
      console.error('[INSPECAO] Erro ao buscar tarefas:', error);
      res.status(500).json({ error: 'Erro ao buscar tarefas' });
    }
  });

  // Listar usuários para distribuição
  router.get('/api/inspecao/usuarios', authenticateToken, authorizeRoute('/pme_notas/gestao'), async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id, login, nome FROM db_automacao.usuarios WHERE ativo = true ORDER BY nome'
      );
      res.json(result.rows);
    } catch (error) {
      console.error('[INSPECAO] Erro ao buscar usuários:', error);
      res.status(500).json({ error: 'Erro ao buscar usuários' });
    }
  });

  // Redistribuir tarefas r_000250
  router.post('/api/inspecao/redistribuir', authenticateToken, authorizeRoute('/pme_notas/gestao'), async (req, res) => {
    try {
      const { redistribuicoes } = req.body; // Array de { cod_tarefa, usuario_id }

      if (!redistribuicoes || !Array.isArray(redistribuicoes) || redistribuicoes.length === 0) {
        return res.status(400).json({ error: 'Lista de redistribuições inválida' });
      }

      const usuarioLogin = req.user.username;
      const now = formatDateBR(new Date());

      let count = 0;
      let errors = [];

      for (const item of redistribuicoes) {
        if (!item.cod_tarefa || !item.usuario_id) {
          errors.push({ cod_tarefa: item.cod_tarefa, error: 'Dados incompletos' });
          continue;
        }

        try {
          // Verificar se a tarefa já foi distribuída
          const check = await pool.query(
            "SELECT tarefa, usuario_id FROM db_bloco_de_notas.cotacao WHERE tarefa = $1 AND validacao = $2",
            [item.cod_tarefa, 'Ativo']
          );

          if (check.rows.length === 0) {
            errors.push({ cod_tarefa: item.cod_tarefa, error: 'Tarefa não encontrada ou não está mais ativa' });
            continue;
          }

          // Buscar nome do usuário destino
          let destinoNome = String(item.usuario_id);
          try {
              const uRes = await pool.query('SELECT nome FROM db_automacao.usuarios WHERE id = $1', [item.usuario_id]);
              if (uRes.rows.length > 0) destinoNome = uRes.rows[0].nome;
          } catch {}

          // Registrar auditoria da redistribuição
          await registrarAuditoria(pool, {
              tarefa: item.cod_tarefa,
              acao: 'redistribuido',
              usuario_origem_id: req.user.id,
              usuario_origem_nome: req.user.nome || usuarioLogin,
              usuario_destino_id: item.usuario_id,
              usuario_destino_nome: destinoNome,
              status_anterior: null,
              status_novo: null,
              criado_por: usuarioLogin
          });

          // Atualizar o usuário da tarefa
          await pool.query(
            `UPDATE db_bloco_de_notas.cotacao 
             SET usuario_id = $1, data_da_ultima_atualizacao = $2, usuario_login = $3
             WHERE tarefa = $4 AND validacao = 'Ativo'`,
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
      console.error('[INSPECAO] Erro ao redistribuir tarefas:', error);
      res.status(500).json({ error: `Erro ao redistribuir tarefas: ${error.message}` });
    }
  });

  router.post('/api/inspecao/distribuir', authenticateToken, authorizeRoute('/pme_notas/gestao'), async (req, res) => {
    try {
      const { distribuicoes } = req.body; // Array de { cod_tarefa, usuario_id }
      
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
          // Primeiro verificar se já não foi distribuída
          const check = await pool.query(
            "SELECT tarefa FROM db_bloco_de_notas.cotacao WHERE tarefa = $1 AND validacao = $2",
            [item.cod_tarefa, 'Ativo']
          );
          
          if (check.rows.length > 0) {
            errors.push({ cod_tarefa: item.cod_tarefa, error: 'Tarefa já distribuída' });
            continue;
          }
          
          // Buscar dados da tarefa para preencher anotação
          const tarefaResult = await pool.query(
            'SELECT nom_tarefa, nom_fila, dsc_cotacao FROM db_bloco_de_notas.r_000250 WHERE cod_tarefa = $1',
            [item.cod_tarefa]
          );
          
          let anotacao = '';
          const tarefaValue = item.cod_tarefa;
          let cotacaoDsc = item.cod_tarefa;
          if (tarefaResult.rows.length > 0) {
            const tr = tarefaResult.rows[0];
            anotacao = `Tarefa: ${tr.nom_tarefa || ''} | Fila: ${tr.nom_fila || ''}`;
            if (tr.dsc_cotacao) cotacaoDsc = tr.dsc_cotacao;
          }

          // Buscar nome do usuário destino
          let destinoNome = String(item.usuario_id);
          try {
              const uRes = await pool.query('SELECT nome FROM db_automacao.usuarios WHERE id = $1', [item.usuario_id]);
              if (uRes.rows.length > 0) destinoNome = uRes.rows[0].nome;
          } catch {}

          await pool.query(
            `INSERT INTO db_bloco_de_notas.cotacao (tarefa, cotacao, anotacao, status, validacao, data_de_criacao, data_da_ultima_atualizacao, usuario_login, usuario_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [tarefaValue, cotacaoDsc, anotacao, 'pendente', 'Ativo', now, now, usuarioLogin, item.usuario_id]
          );

          // Registrar auditoria da distribuição
          await registrarAuditoria(pool, {
              tarefa: item.cod_tarefa,
              acao: 'distribuido',
              usuario_origem_id: req.user.id,
              usuario_origem_nome: req.user.nome || usuarioLogin,
              usuario_destino_id: item.usuario_id,
              usuario_destino_nome: destinoNome,
              status_anterior: null,
              status_novo: 'pendente',
              criado_por: usuarioLogin
          });
          
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
      console.error('[INSPECAO] Erro ao distribuir tarefas:', error);
      res.status(500).json({ error: `Erro ao distribuir tarefas: ${error.message}` });
    }
  });

  // ===== ROTAS DE DASHBOARD E HISTÓRICO =====

  // Dashboard - Quantidade por colaborador e status
  router.get('/api/inspecao/dashboard', authenticateToken, authorizeRoute('/pme_notas/gestao'), async (req, res) => {
    try {
      const query = `
        SELECT 
          l.login AS usuario_login,
          l.nome AS usuario_nome,
          COUNT(c.tarefa) FILTER (WHERE c.status = 'pendente' OR c.status IS NULL) AS pendentes,
          COUNT(c.tarefa) FILTER (WHERE c.status IS NOT NULL AND c.status != 'pendente') AS tratados,
          COUNT(c.tarefa) AS total
        FROM db_gp.listafuncionarios l
        RIGHT JOIN db_automacao.usuarios u ON u.login = l.login
        left join db_bloco_de_notas.cotacao c 
        on c.usuario_id::text = u.id::text
        WHERE l.ilha ILIKE '%ins%' AND l.ativo = true
        GROUP BY l.login, l.nome
        ORDER BY l.nome
      `;
      
      const result = await pool.query(query);
      
      // Buscar SLA médio (considerando apenas tratados)
      const colaboradores = [];
      for (const row of result.rows) {
        let slaHoras = null;
        try {
          const slaRes = await pool.query(`
            SELECT AVG(
              EXTRACT(EPOCH FROM (
                TO_TIMESTAMP(data_da_ultima_atualizacao, 'DD/MM/YYYY HH24:MI') -
                TO_TIMESTAMP(data_de_criacao, 'DD/MM/YYYY HH24:MI')
              )) / 3600
            ) AS sla_medio
            FROM db_bloco_de_notas.cotacao c
            INNER JOIN db_automacao.usuarios u ON u.id::TEXT = c.usuario_id
            WHERE u.login = $1 
              AND c.validacao = 'Ativo' 
              AND c.status != 'pendente' AND c.status IS NOT NULL AND c.status != ''
          `, [row.usuario_login]);
          slaHoras = slaRes.rows[0]?.sla_medio ? parseFloat(slaRes.rows[0].sla_medio).toFixed(1) : null;
        } catch (slaErr) {
          console.error('[DASHBOARD SLA] Erro para usuario', row.usuario_login, ':', slaErr.message);
        }
        
        const pendentes = parseInt(row.pendentes);
        const tratados = parseInt(row.tratados);
        
        colaboradores.push({
          usuario_id: null,
          usuario_nome: row.usuario_nome,
          usuario_login: row.usuario_login,
          pendentes,
          tratados,
          aprovados: 0,
          reprovados: 0,
          total: parseInt(row.total),
          sla_medio: slaHoras ? slaHoras + 'h' : '-'
        });
      }
      
      // Ordenar: pendentes primeiro, depois por nome
      colaboradores.sort((a, b) => {
        if (a.pendentes > 0 && b.pendentes === 0) return -1;
        if (a.pendentes === 0 && b.pendentes > 0) return 1;
        return a.usuario_nome.localeCompare(b.usuario_nome);
      });
      
      res.json(colaboradores);
    } catch (error) {
      console.error('[DASHBOARD] Erro:', error);
      res.status(500).json({ error: 'Erro ao carregar dashboard' });
    }
  });

  // Histórico de movimentações
  router.get('/api/inspecao/historico', authenticateToken, authorizeRoute('/pme_notas/gestao'), async (req, res) => {
    try {
      const { tarefa, limit = 100, offset = 0 } = req.query;
      
      let query = `
        SELECT a.*, 
          u_orig.nome AS origem_nome,
          u_dest.nome AS destino_nome
        FROM db_bloco_de_notas.cotacao_audit a
        LEFT JOIN db_automacao.usuarios u_orig ON a.usuario_origem_id = u_orig.id
        LEFT JOIN db_automacao.usuarios u_dest ON a.usuario_destino_id = u_dest.id
      `;
      let params = [];
      let conditions = [];
      
      if (tarefa) {
        params.push(tarefa);
        conditions.push(`a.tarefa = $${params.length}`);
      }
      
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      
      query += ' ORDER BY a.data_criacao DESC';
      params.push(parseInt(limit));
      query += ` LIMIT $${params.length}`;
      params.push(parseInt(offset));
      query += ` OFFSET $${params.length}`;
      
      const result = await pool.query(query, params);
      
      const historico = result.rows.map(row => ({
        id: row.id,
        tarefa: row.tarefa,
        acao: row.acao,
        usuario_origem: row.origem_nome || row.usuario_origem_nome || '-',
        usuario_destino: row.destino_nome || row.usuario_destino_nome || '-',
        status_anterior: row.status_anterior || '-',
        status_novo: row.status_novo || '-',
        data: row.data_criacao,
        criado_por: row.criado_por
      }));
      
      res.json(historico);
    } catch (error) {
      console.error('[HISTORICO] Erro:', error);
      res.status(500).json({ error: 'Erro ao carregar histórico' });
    }
  });

  // Histórico de uma tarefa específica
  router.get('/api/inspecao/historico/:tarefa', authenticateToken, authorizeRoute('/pme_notas/gestao'), async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT a.*,
          u_orig.nome AS origem_nome,
          u_dest.nome AS destino_nome
        FROM db_bloco_de_notas.cotacao_audit a
        LEFT JOIN db_automacao.usuarios u_orig ON a.usuario_origem_id = u_orig.id
        LEFT JOIN db_automacao.usuarios u_dest ON a.usuario_destino_id = u_dest.id
        WHERE a.tarefa = $1
        ORDER BY a.data_criacao DESC
      `, [req.params.tarefa]);
      
      res.json(result.rows.map(row => ({
        id: row.id,
        tarefa: row.tarefa,
        acao: row.acao,
        usuario_origem: row.origem_nome || row.usuario_origem_nome || '-',
        usuario_destino: row.destino_nome || row.usuario_destino_nome || '-',
        status_anterior: row.status_anterior || '-',
        status_novo: row.status_novo || '-',
        data: row.data_criacao,
        criado_por: row.criado_por
      })));
    } catch (error) {
      console.error('[HISTORICO TAREFA] Erro:', error);
      res.status(500).json({ error: 'Erro ao carregar histórico da tarefa' });
    }
  });

  // Atualizar tabela r_000250 a partir do db_claro
  router.post('/api/inspecao/atualizar_r_000250', authenticateToken, authorizeRoute('/pme_notas/gestao'), async (req, res) => {
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
        SELECT
            cod_tarefa, dat_criacao, dat_historico, criado_por, pendente_com,
            nom_statuswf, regional, nom_tarefa, nom_fila, dsc_cotacao,
            tipo_pedido, qtd_linhas, qtd_linhas_novas, nom_territorio,
            ind_portabilidade, qtd_reprovacao, CURRENT_DATE
        FROM db_claro.r_000250 where data_carga = CURRENT_DATE
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

  // Classificar cotações pendentes manualmente
  router.post('/api/inspecao/classificar-pendentes', authenticateToken, authorizeRoute('/pme_notas/gestao'), async (req, res) => {
    try {
      const result = await classificarPendentes();
      
      res.json({
        success: true,
        message: `${result.classificados} cotações classificadas como "Pendente - Classificação"`,
        ...result
      });
    } catch (error) {
      console.error('[INSPECAO] Erro na classificação manual:', error);
      res.status(500).json({ error: `Erro ao classificar cotações: ${error.message}` });
    }
  });

  // Serve dashboard page (mantém rotas antigas e novas)
  router.get('/inspecao/dashboard', authenticateToken, authorizeRoute('/pme_notas/gestao'), (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
  });

  router.get('/pme_notas/inspecao/dashboard', authenticateToken, authorizeRoute('/pme_notas/gestao'), (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
  });

  // Serve devolucao padrao page
  router.get('/devolucoes-padrao', authenticateToken, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'devolucao_padrao_web.html'));
  });

  router.get('/pme_notas/devolucoes-padrao', authenticateToken, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'devolucao_padrao_web.html'));
  });

  // ===== ROTAS DE GESTÃO INPUT (IW_CPC_975) =====

  // Serve gestao_input pages
  router.get('/inspecao_input', authenticateToken, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'gestao_input.html'));
  });

  router.get('/input', authenticateToken, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'gestao_input.html'));
  });

  router.get('/input_top', authenticateToken, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'gestao_input_top.html'));
  });

  router.get('/input_net', authenticateToken, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'gestao_input_net.html'));
  });

  router.get('/pme_notas/input_top', authenticateToken, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'gestao_input_top.html'));
  });

  router.get('/pme_notas/input_net', authenticateToken, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'gestao_input_net.html'));
  });

  // API Tarefas Input TOP
  router.get('/api/inspecao/tarefas_top', authenticateToken, async (req, res) => {
    try {
      const { search, limit = 100, offset = 0 } = req.query;
      const params = [];
      let query = `
        SELECT DISTINCT ON (iw.codigo_da_tarefa)
               iw.codigo_da_tarefa cod_tarefa,
               iw.data_historico,
               iw.para_usuario_nome assumido_por,
               iw.*,
               c.usuario_id,
               u_dist.nome as usuario_distribuido_nome
        FROM db_bloco_de_notas.iw_cpc_975_top iw
        LEFT JOIN db_bloco_de_notas.cotacao c ON iw.codigo_da_tarefa = c.tarefa
        LEFT JOIN db_automacao.usuarios u_dist ON u_dist.id::TEXT = c.usuario_id AND u_dist.ativo = true
        WHERE etapa_atual ilike '%01%' or etapa_atual ilike '%02%'
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
        WHERE etapa_atual = '04 - Inspeção' AND situacao_sistema = 'ATIVO' AND acao = 'Alterar Status'
      `);
      const stats = countResult.rows[0] || {};
      res.json({ 
        data: result.rows, 
        total: parseInt(countResult.rows[0].total || 0),
        stats,
        limit: parseInt(limit), 
        offset: parseInt(offset) 
      });
    } catch (error) {
      console.error('[INSPECAO_TOP] Erro:', error);
      res.status(500).json({ error: 'Erro ao buscar dados' });
    }
  });

  // API Tarefas Input NET
  router.get('/api/inspecao/tarefas_net', authenticateToken, async (req, res) => {
    try {
      const { search, limit = 100, offset = 0 } = req.query;
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
          u_dist.nome AS usuario_distribuido_nome,
          c.status AS cotacao_status,
          CASE WHEN (hc.da_etapa LIKE '%01%' AND hc.para_etapa LIKE '%02%') THEN 1 ELSE 0 END AS em_tratamento,
          CASE WHEN (hc.da_etapa LIKE '%02%' AND hc.para_etapa LIKE '%04%') THEN 1 ELSE 0 END AS aprovado,
          CASE WHEN (hc.da_etapa LIKE '%02%' AND hc.para_etapa LIKE '%03%') THEN 1 ELSE 0 END AS reprovado,
          CASE 
            WHEN (
              (hc.da_etapa ILIKE '%Abert%' AND hc.para_etapa LIKE '%01%')
              OR (hc.da_etapa ILIKE '%03%' AND hc.para_etapa LIKE '%01%')
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
          hc.etapa_atual NOT ILIKE '%Demanda Expirada%'
          AND (hc.data_historico::date = CURRENT_DATE OR (hc.etapa_atual ILIKE '%01%' OR hc.etapa_atual ILIKE '%02%'))
      `;

      if (search) {
        query += ` AND (hc.fila ILIKE $${paramIndex} OR hc.codigo_da_tarefa ILIKE $${paramIndex} OR hc.razao_social_cliente ILIKE $${paramIndex} OR hc.situacao_sistema ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      query += ` ORDER BY hc.cod_tarefa, hc.data_historico DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(parseInt(limit), parseInt(offset));

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
          WHERE hc.etapa_atual NOT ILIKE '%Demanda Expirada%'
            AND (hc.data_historico::date = CURRENT_DATE OR (hc.etapa_atual ILIKE '%01%' OR hc.etapa_atual ILIKE '%02%'))
          ORDER BY hc.cod_tarefa, hc.data_historico DESC
        )
        SELECT 
          COUNT(DISTINCT CASE WHEN (foto_recente.da_etapa LIKE '%01%' AND foto_recente.para_etapa LIKE '%02%') THEN foto_recente.cod_tarefa END) as em_tratamento,
          COUNT(DISTINCT CASE WHEN (foto_recente.da_etapa LIKE '%02%' AND foto_recente.para_etapa LIKE '%04%') THEN foto_recente.cod_tarefa END) as aprovado,
          COUNT(DISTINCT CASE WHEN (foto_recente.da_etapa LIKE '%02%' AND foto_recente.para_etapa LIKE '%03%') THEN foto_recente.cod_tarefa END) as reprovado,
          COUNT(DISTINCT CASE 
            WHEN (
              (foto_recente.da_etapa ILIKE '%Abert%' AND foto_recente.para_etapa LIKE '%01%')
              OR (foto_recente.da_etapa ILIKE '%03%' AND foto_recente.para_etapa LIKE '%01%')
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
      `);

      const stats = statsResult.rows[0] || {};
      res.json({ 
        data: result.rows, 
        total: parseInt(stats.total || 0),
        stats,
        limit: parseInt(limit), 
        offset: parseInt(offset) 
      });
    } catch (error) {
      console.error('[INSPECAO_NET] Erro:', error);
      res.status(500).json({ error: 'Erro ao buscar dados' });
    }
  });

  // Upload CSV/ZIP e processar ETL para iw_cpc_975_top
  router.post('/api/inspecao/upload', authenticateToken, inputUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      const result = await processarETL_975_top(req.file.path, pool);
      await pool.query(`UPDATE db_bloco_de_notas.iw_cpc_975_top SET fila = 'Input de Pedidos PME'`);
      res.json({ success: true, message: `Arquivo processado com sucesso. ${result.totalRows} registros carregados.`, totalRows: result.totalRows });
    } catch (error) {
      console.error('[INPUT_TOP] Erro:', error);
      res.status(500).json({ error: `Erro ao processar arquivo: ${error.message}` });
    }
  });

  // API Input NET
  router.get('/api/input_net/tarefas', authenticateToken, async (req, res) => {
    try {
      const { search, limit = 100, offset = 0 } = req.query;
      let query = `SELECT * FROM db_bloco_de_notas.iw_cpc_975_net WHERE 1=1`;
      const params = [];
      let paramIndex = 1;
      query += ` AND etapa_atual = $${paramIndex}`;
      params.push('04 - Inspeção');
      paramIndex++;
      query += ` AND situacao_sistema = $${paramIndex}`;
      params.push('ATIVO');
      paramIndex++;
      query += ` AND acao = $${paramIndex}`;
      params.push('Alterar Status');
      paramIndex++;
      if (search) {
        query += ` AND (fila ILIKE $${paramIndex} OR codigo_da_tarefa ILIKE $${paramIndex} OR razao_social_cliente ILIKE $${paramIndex} OR situacao_sistema ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }
      query += ` ORDER BY data_historico DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(parseInt(limit), parseInt(offset));
      const result = await pool.query(query, params);
      const countResult = await pool.query('SELECT COUNT(*) as total FROM db_bloco_de_notas.iw_cpc_975_net WHERE etapa_atual = $1 AND situacao_sistema = $2 AND acao = $3', ['04 - Inspeção', 'ATIVO', 'Alterar Status']);
      res.json({ data: result.rows, total: parseInt(countResult.rows[0].total), limit: parseInt(limit), offset: parseInt(offset) });
    } catch (error) {
      console.error('[INPUT_NET] Erro:', error);
      res.status(500).json({ error: 'Erro ao buscar dados' });
    }
  });

  router.post('/api/input_net/upload', authenticateToken, inputUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      const result = await processarETL_975_net(req.file.path, pool);
      res.json({ success: true, message: `Arquivo processado com sucesso. ${result.totalRows} registros carregados.`, totalRows: result.totalRows });
    } catch (error) {
      console.error('[INPUT_NET] Erro:', error);
      res.status(500).json({ error: `Erro ao processar arquivo: ${error.message}` });
    }
  });

  // Upload CSV/ZIP e processar ETL para iw_cpc_975
  router.post('/api/inspecao_input/upload', authenticateToken, inputUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      }
      
      const filePath = req.file.path;
      console.log(`[INSPECAO_INPUT] Upload recebido: ${req.file.originalname} -> ${filePath}`);
      
      const result = await processarETL_975_net(filePath, pool);
      
      res.json({
        success: true,
        message: `Arquivo processado com sucesso. ${result.totalRows} registros carregados.`,
        totalRows: result.totalRows
      });
      
    } catch (error) {
      console.error('[INSPECAO_INPUT] Erro no upload/ETL:', error);
      res.status(500).json({ error: `Erro ao processar arquivo: ${error.message}` });
    }
  });

  // Atualizar tabela iw_cpc_975_net a partir da esteira (somente dados do dia)
  router.post('/api/inspecao/atualizar_input_net', authenticateToken, async (req, res) => {
    try {
      await pool.query(`
        DO $$
        DECLARE
            v_max_esteira TIMESTAMP;
            v_max_bloco   TIMESTAMP;
        BEGIN
            SELECT MAX(CAST(data_historico AS TIMESTAMP)) INTO v_max_esteira FROM db_esteira_gross.historico_input_pedido_pme_net;
            SELECT MAX(CAST(data_historico AS TIMESTAMP)) INTO v_max_bloco FROM db_bloco_de_notas.iw_cpc_975_net;

            IF v_max_esteira > COALESCE(v_max_bloco, '1900-01-01'::timestamp) THEN
                EXECUTE 'TRUNCATE TABLE db_bloco_de_notas.iw_cpc_975_net';

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
    }
  });

  // Distribuir tarefas input_net (iw_cpc_975_net)
  router.post('/api/inspecao/distribuir_input_net', authenticateToken, authorizeRoute('/pme_notas/gestao'), async (req, res) => {
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
          // Verificar se já foi distribuída
          const check = await pool.query(
            "SELECT tarefa FROM db_bloco_de_notas.cotacao WHERE tarefa = $1 AND validacao = $2",
            [item.cod_tarefa, 'Ativo']
          );
          
          if (check.rows.length > 0) {
            errors.push({ cod_tarefa: item.cod_tarefa, error: 'Tarefa já distribuída' });
            continue;
          }
          
          // Buscar nome da tarefa para anotação
          const tarefaResult = await pool.query(
            'SELECT codigo_da_tarefa, etapa_atual FROM db_bloco_de_notas.iw_cpc_975_net WHERE codigo_da_tarefa = $1',
            [item.cod_tarefa]
          );
          
          let anotacao = '';
          let tarefaValue = item.cod_tarefa;
          let cotacaoDsc = item.cod_tarefa;
          if (tarefaResult.rows.length > 0) {
            const tr = tarefaResult.rows[0];
            anotacao = `Origem: iw_cpc_975_net | Etapa: ${tr.etapa_atual || ''}`;
          }

          // Buscar nome do usuário destino
          let destinoNome = String(item.usuario_id);
          try {
              const uRes = await pool.query('SELECT nome FROM db_automacao.usuarios WHERE id = $1', [item.usuario_id]);
              if (uRes.rows.length > 0) destinoNome = uRes.rows[0].nome;
          } catch {}

          await pool.query(
            `INSERT INTO db_bloco_de_notas.cotacao (tarefa, cotacao, anotacao, status, validacao, data_de_criacao, data_da_ultima_atualizacao, usuario_login, usuario_id, origem) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [tarefaValue, cotacaoDsc, anotacao, 'pendente', 'Ativo', now, now, usuarioLogin, item.usuario_id, 'iw_cpc_975_net']
          );

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

  // Redistribuir tarefas input_net (iw_cpc_975_net)
  router.post('/api/inspecao/redistribuir_input_net', authenticateToken, authorizeRoute('/pme_notas/gestao'), async (req, res) => {
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

  // Listar dados da iw_cpc_975_net
  router.get('/api/inspecao_input/tarefas', authenticateToken, async (req, res) => {
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
      console.error('[INSPECAO_INPUT] Erro ao buscar dados:', error);
      res.status(500).json({ error: 'Erro ao buscar dados' });
    }
  });

  return router;
};