const express = require('express');
const router = express.Router();

module.exports = function(pool, authenticateToken, authorizeRoute, formatDateBR, path, fs, upload, inputUpload, processarETL_250, processarETL_975_top, processarETL_975_net, classificarPendentes, authenticatePage, processarETL_HoteisHospitais) {

  const { jaDistribuida, inserirDistribuicaoAtomica } = require('../utils/distribuicao');

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

  // Normaliza o tipo do pedido nas categorias de negócio
  // Espelha o CASE ... ILIKE da query de referência sobre r_000250:
  // %novo% -> NOVO | %reno% -> RENOVACAO | %incre% -> INCREMENTO | %trans% -> TRANSFERENCIA | else -> DEMAIS
  function classificarTipoPedido(tipoPedido) {
    try {
      const t = String(tipoPedido || '').toLowerCase();
      if (!t) return 'DEMAIS';
      if (t.includes('novo')) return 'NOVO';
      if (t.includes('reno')) return 'RENOVACAO';
      if (t.includes('incre')) return 'INCREMENTO';
      if (t.includes('trans')) return 'TRANSFERENCIA';
      return 'DEMAIS';
    } catch {
      return 'DEMAIS';
    }
  }

  // ===== REGRAS DE MARATONA / PRIORIDADE 1 (r_000250) =====
  //
  // Regra de negócio (válida APENAS a partir do dia 20 de cada mês):
  //   - Dias 01-19: nenhuma tarefa é maratona; todos seguem dat_historico.
  //   - Dias 20+ (maratona = prioridade 1):
  //       Tipo do pedido NOVO ou INCREMENTO
  //       AND qtd_reprovacao < 4
  //       AND qtd_linhas_novas >= 10  (limiar 4 quando nom_territorio ILIKE '%YT4R%')
  //
  // Esta nova regra SUBSTITUI a antiga (qtd_linhas_novas >= 10 AND qtd_reprovacao < 4,
  // sem considerar data nem tipo do pedido nem nom_territorio).
  //
  // A expressão abaixo é usada tanto para gravar o flag `maratona` quanto para ordenar a fila.

  // Expressão de prioridade em 3 níveis para ORDER BY (já considerando o dia do mês).
  // Regra: maratona = prioridade 1 (nível 0). Válida APENAS a partir do dia 20 de cada mês.
  //   - Dias 01-19: tudo cai no nível 2 -> somente dat_historico (sem maratona).
  //   - Dias 20+: nível 0 (NOVO/INCREMENTO + qtd_reprovacao<4 + limiar linhas novas)
  //              nível 1 (demais NOVO/INCREMENTO, independente de quantidade)
  //              nível 2 (restante)
  const PRIORIDADE_FILA_SQL = `
    CASE
      WHEN (
        COALESCE(dat_criacao, '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
        AND EXTRACT(DAY FROM SUBSTRING(dat_criacao FROM 1 FOR 10)::date)::int >= 20
        AND (tipo_pedido ILIKE '%novo%' OR tipo_pedido ILIKE '%incre%')
        AND COALESCE(qtd_reprovacao, '0')::int < 4
        AND COALESCE(qtd_linhas_novas, '0')::int >= CASE WHEN nom_territorio ILIKE '%YT4R%' THEN 4 ELSE 10 END
      ) THEN 0
      WHEN (
        COALESCE(dat_criacao, '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
        AND EXTRACT(DAY FROM SUBSTRING(dat_criacao FROM 1 FOR 10)::date)::int >= 20
        AND (tipo_pedido ILIKE '%novo%' OR tipo_pedido ILIKE '%incre%')
      ) THEN 1
      ELSE 2
    END`;

  // Expressão booleana usada para gravar o flag `maratona` (= prioridade 1 / nível 0).
  const MAR_IS_MARATONA_SQL = `(
      COALESCE(dat_criacao, '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      AND EXTRACT(DAY FROM SUBSTRING(dat_criacao FROM 1 FOR 10)::date)::int >= 20
      AND (tipo_pedido ILIKE '%novo%' OR tipo_pedido ILIKE '%incre%')
      AND COALESCE(qtd_reprovacao, '0')::int < 4
      AND COALESCE(qtd_linhas_novas, '0')::int >= CASE WHEN nom_territorio ILIKE '%YT4R%' THEN 4 ELSE 10 END
    )`;

  // ===== ROTAS DE INSPEÇÃO (r_000250) =====

  // Serve inspecao page
  router.get('/inspecao', authenticatePage, authorizeRoute('/pme_notas/gestao'), (req, res) => {
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
      
      // Marcar automaticamente tarefas como Maratona (prioridade 1) com a regra de negócio.
      // Regra atual: somente a partir do dia 20 de cada mês, pedidos NOVO/INCREMENTO com
      // qtd_reprovacao<4 e qtd_linhas_novas >= 10 (>= 4 quando nom_territorio ILIKE '%YT4R%').
      // Dias 01-19: nenhuma tarefa é maratona. (Substitui a regra antiga de quantidade.)
      try {
        await pool.query(`
          UPDATE db_bloco_de_notas.r_000250 
          SET maratona = ${MAR_IS_MARATONA_SQL}
        `);
        console.log('[INSPECAO] Marcação automática de Maratona concluída.');
      } catch (maratonaErr) {
        console.error('[INSPECAO] Erro ao marcar Maratona:', maratonaErr.message);
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
        tipo_pedido_categoria: classificarTipoPedido(row.tipo_pedido),
        qtd_linhas: row.qtd_linhas,
        qtd_linhas_novas: row.qtd_linhas_novas,
        nom_territorio: row.nom_territorio,
        ind_portabilidade: row.ind_portabilidade,
        qtd_reprovacao: row.qtd_reprovacao,
        status_distribuicao: row.status_distribuicao,
        cotacao_status: row.cotacao_status,
        assumido_por: row.assumido_por,
        usuario_distribuido_nome: row.usuario_distribuido_nome || '-',
        maratona: row.maratona || false
      }));
      
      res.json(tarefas);
      
    } catch (error) {
      console.error('[INSPECAO] Erro ao buscar tarefas:', error);
      res.status(500).json({ error: 'Erro ao buscar tarefas' });
    }
  });

  // Listar usuários para distribuição
  // Parâmetro opcional ?ilha=xxx: retorna apenas usuários cuja ilha (db_gp.listafuncionarios)
  // contenha o termo (ILIKE %termo%). Usado pela tela de Inspeção (ilha%insp%). Sem o parâmetro
  // mantém o comportamento original (todos os usuários ativos).
  router.get('/api/inspecao/usuarios', authenticateToken, authorizeRoute('/pme_notas/gestao'), async (req, res) => {
    try {
      const ilha = req.query && req.query.ilha ? String(req.query.ilha).trim() : '';
      let result;
      if (ilha) {
        result = await pool.query(
          `SELECT u.id, u.login, u.nome
           FROM db_automacao.usuarios u
           INNER JOIN db_gp.listafuncionarios l ON l.login = u.login AND l.ativo = true
           WHERE u.ativo = true AND l.ilha ILIKE '%' || $1 || '%'
           ORDER BY u.nome`,
          [ilha]
        );
      } else {
        result = await pool.query(
          'SELECT id, login, nome FROM db_automacao.usuarios WHERE ativo = true ORDER BY nome'
        );
      }
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
          // Buscar dados da tarefa para preencher anotação e data_historico
          const tarefaResult = await pool.query(
            'SELECT nom_tarefa, nom_fila, dsc_cotacao, dat_historico FROM db_bloco_de_notas.r_000250 WHERE cod_tarefa = $1',
            [item.cod_tarefa]
          );
          
          let anotacao = '';
          let dataHistorico = null;
          const tarefaValue = item.cod_tarefa;
          let cotacaoDsc = item.cod_tarefa;
          if (tarefaResult.rows.length > 0) {
            const tr = tarefaResult.rows[0];
            anotacao = `Tarefa: ${tr.nom_tarefa || ''} | Fila: ${tr.nom_fila || ''}`;
            if (tr.dsc_cotacao) cotacaoDsc = tr.dsc_cotacao;
            if (tr.dat_historico) dataHistorico = tr.dat_historico;
          }

          // Buscar nome do usuário destino
          let destinoNome = String(item.usuario_id);
          try {
              const uRes = await pool.query('SELECT nome FROM db_automacao.usuarios WHERE id = $1', [item.usuario_id]);
              if (uRes.rows.length > 0) destinoNome = uRes.rows[0].nome;
          } catch {}

          // Inserção atômica: garante que não haja (tarefa + data_historico) duplicado,
          // mesmo com requisições simultâneas para colaboradores diferentes.
          const inserido = await inserirDistribuicaoAtomica(pool, {
            tarefa: tarefaValue,
            cotacao: cotacaoDsc,
            anotacao,
            agora: now,
            usuarioLogin,
            usuarioId: item.usuario_id,
            origem: 'r_000250',
            dataHistorico,
          });

          if (!inserido) {
            errors.push({ cod_tarefa: item.cod_tarefa, error: 'Tarefa já distribuída para este data_historico' });
            continue;
          }

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

  // Dashboard - Quantidade por colaborador e status (com range de datas)
  router.get('/api/inspecao/dashboard', authenticateToken, authorizeRoute('/pme_notas/gestao'), async (req, res) => {
    try {
      const dataInicio = req.query.dataInicio || null;
      const dataFim = req.query.dataFim || null;
      
      let queryParams = [];
      let dataFilter = '';
      let paramIndex = 1;
      
      if (dataInicio && dataFim) {
        // Range de datas
        dataFilter = ` AND uc.data_de_criacao >= $${paramIndex} AND uc.data_de_criacao <= $${paramIndex + 1}`;
        queryParams.push(dataInicio + ' 00:00');
        queryParams.push(dataFim + ' 23:59');
        paramIndex += 2;
      } else if (dataInicio) {
        // Apenas data início
        dataFilter = ` AND uc.data_de_criacao >= $${paramIndex}`;
        queryParams.push(dataInicio + ' 00:00');
        paramIndex++;
      } else if (dataFim) {
        // Apenas data fim
        dataFilter = ` AND uc.data_de_criacao <= $${paramIndex}`;
        queryParams.push(dataFim + ' 23:59');
        paramIndex++;
      }

      const query = `
        WITH ultima_cotacao AS (
          SELECT DISTINCT ON (tarefa, usuario_id) 
            tarefa, 
            usuario_id, 
            status, 
            validacao, 
            data_de_criacao,
            data_da_ultima_atualizacao
          FROM db_bloco_de_notas.cotacao
          WHERE validacao = 'Ativo'
          ORDER BY tarefa, usuario_id, data_da_ultima_atualizacao DESC NULLS LAST, data_de_criacao DESC
        )
        SELECT 
          l.login AS usuario_login,
          l.nome AS usuario_nome,
          COUNT(DISTINCT uc.tarefa) FILTER (WHERE uc.status = 'pendente' OR uc.status IS NULL) AS pendentes,
          COUNT(DISTINCT uc.tarefa) FILTER (WHERE uc.status IS NOT NULL AND uc.status != 'pendente') AS tratados,
          COUNT(DISTINCT uc.tarefa) AS total
        FROM db_gp.listafuncionarios l
        RIGHT JOIN db_automacao.usuarios u ON u.login = l.login
        LEFT JOIN ultima_cotacao uc 
          ON uc.usuario_id::text = u.id::text
        WHERE l.ilha ILIKE '%ins%' AND l.ativo = true
        ${dataFilter}
        GROUP BY l.login, l.nome
        ORDER BY l.nome
      `;
      
      const result = await pool.query(query, queryParams.length > 0 ? queryParams : undefined);
      
      // Buscar SLA médio (considerando apenas tratados)
      const colaboradores = [];
      for (const row of result.rows) {
        let slaHoras = null;
        try {
          let slaQuery = `
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
          `;
          let slaParams = [row.usuario_login];
          let slaParamIdx = 2;
          
          if (dataInicio && dataFim) {
            slaQuery += ` AND c.data_de_criacao >= $${slaParamIdx} AND c.data_de_criacao <= $${slaParamIdx + 1}`;
            slaParams.push(dataInicio + ' 00:00', dataFim + ' 23:59');
          } else if (dataInicio) {
            slaQuery += ` AND c.data_de_criacao >= $${slaParamIdx}`;
            slaParams.push(dataInicio + ' 00:00');
          } else if (dataFim) {
            slaQuery += ` AND c.data_de_criacao <= $${slaParamIdx}`;
            slaParams.push(dataFim + ' 23:59');
          }
          
          const slaRes = await pool.query(slaQuery, slaParams);
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
          u_dest.nome AS destino_nome,
          r.maratona
        FROM db_bloco_de_notas.cotacao_audit a
        LEFT JOIN db_automacao.usuarios u_orig ON a.usuario_origem_id = u_orig.id
        LEFT JOIN db_automacao.usuarios u_dest ON a.usuario_destino_id = u_dest.id
        LEFT JOIN db_bloco_de_notas.r_000250 r ON a.tarefa = r.cod_tarefa
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
        criado_por: row.criado_por,
        maratona: row.maratona || false
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

      // Marcar automaticamente tarefas como Maratona (prioridade 1) com a regra de negócio.
      // Regra atual: somente a partir do dia 20 de cada mês, pedidos NOVO/INCREMENTO com
      // qtd_reprovacao<4 e qtd_linhas_novas >= 10 (>= 4 quando nom_territorio ILIKE '%YT4R%').
      // Dias 01-19: nenhuma tarefa é maratona. (Substitui a regra antiga de quantidade.)
      try {
        await pool.query(`
          UPDATE db_bloco_de_notas.r_000250 
          SET maratona = ${MAR_IS_MARATONA_SQL}
        `);
        console.log('[ATUALIZAR_R_000250] Marcação automática de Maratona concluída.');
      } catch (maratonaErr) {
        console.error('[ATUALIZAR_R_000250] Erro ao marcar Maratona:', maratonaErr.message);
      }

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
        message: `${result.classificados} cotações classificadas como "Pendente - Classificação" (status gravado: pendente-classificacao)`,
        ...result
      });
    } catch (error) {
      console.error('[INSPECAO] Erro na classificação manual:', error);
      res.status(500).json({ error: `Erro ao classificar cotações: ${error.message}` });
    }
  });

  // Serve dashboard page (mantém rotas antigas e novas)
  router.get('/inspecao/dashboard', authenticatePage, authorizeRoute('/pme_notas/gestao'), (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
  });

  router.get('/pme_notas/inspecao/dashboard', authenticatePage, authorizeRoute('/pme_notas/gestao'), (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
  });

  // ============================================================
  // ===== JUSTIFICATIVA SLA (inspeção) ==========================
  // Tabela: db_qualidade.ins_justificativa_sla
  // Página: /inspecao/justificativa-sla
  // ============================================================

  const TABELA_JUSTIFICATIVA_SLA = 'db_qualidade.ins_justificativa_sla';

  // Motivos válidos de abono/justificativa para perda de SLA
  const MOTIVOS_JUSTIFICATIVA_SLA = [
    'ABONOS',
    'RECEBIDO E TRATADO NO MESMO DIA FORA DO EXPEDIENTE',
    'ABONO - PRIORIZAÇÃO MARATONA DE GROSS FINAL MÊS',
    'ABONO - PRIORIZAÇÃO MARATONA DE PORTABILIDADE',
    'AJUSTE FERIADO',
    'ABONO - IMPACTO SISTÊMICO',
    'ABONO - IMPACTO LISTA DE PRIORIDADE',
    'ABONO - IMPACTO SISTÊMICO 2FA',
    'ABONO - ESCALA REDUZIDA COPA',
    'ABONO - IMPACTO LISTA DE PRIORIDADE PORTABILIDADE',
    'ABONO - IMPACTO TREINAMENTOS',
    'ABONO - FREEZING CPC',
    'DESOCUPAÇÃO/ALTERAÇÃO PREDIAL'
  ];

  // Cria a tabela caso ainda não exista (idempotente / defesa em deploy)
  async function garantirTabelaJustificativaSLA() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${TABELA_JUSTIFICATIVA_SLA} (
        id SERIAL PRIMARY KEY,
        codigo_tarefa VARCHAR(255) NOT NULL,
        status VARCHAR(255),
        tipo_pedido VARCHAR(255),
        data_entrada TIMESTAMP NOT NULL,
        data_saida TIMESTAMP,
        qtd_horas NUMERIC(12, 2),
        sla_auto VARCHAR(10),
        faixa_sla VARCHAR(50),
        justificado_por INTEGER,
        motivo_justificativa TEXT,
        observacao TEXT,
        data_justificativa TIMESTAMP,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP,
        CONSTRAINT uq_justificativa_sla_tarefa_data UNIQUE (codigo_tarefa, data_entrada)
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ins_just_sla_tarefa ON ${TABELA_JUSTIFICATIVA_SLA}(codigo_tarefa);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ins_just_sla_saida ON ${TABELA_JUSTIFICATIVA_SLA}(data_saida);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ins_just_sla_justif ON ${TABELA_JUSTIFICATIVA_SLA}(justificado_por);`);
  }

  // Query base que extrai as tarefas com SLA estourado (> 12h) do mês corrente.
  // Colunas adicionais data_entrada_bruta/data_saida_bruta expõem os timestamps
  // originais para alimentar a tabela (a chave anti-duplicação usa data_entrada).
  const QUERY_BASE_JUSTIFICATIVA_SLA = `
    WITH consulta_base AS (
      SELECT DISTINCT ON (q.codigo_tarefa, q.data_saida)
          q.codigo_tarefa AS "CÓDIGO TAREFA",
          q.status AS "STATUS",
          UPPER(q.tipo_pedido_aux) AS "TIPO PEDIDO2",
          TO_CHAR(q.data_entrada, 'DD/MM/YYYY HH24:MI') AS "C3_DT_INICIO",
          TO_CHAR(q.data_saida, 'DD/MM/YYYY HH24:MI') AS "C3_DT_FIM",
          q.data_entrada AS data_entrada_bruta,
          q.data_saida AS data_saida_bruta,
          hrs.qtd_horas,
          LPAD(FLOOR(ROUND(hrs.qtd_horas * 3600) / 3600)::text, 2, '0') || ':' ||
          LPAD(FLOOR((ROUND(hrs.qtd_horas * 3600)::integer % 3600) / 60)::text, 2, '0') || ':' ||
          LPAD((ROUND(hrs.qtd_horas * 3600)::integer % 60)::text, 2, '0') AS "SLA_AUTO"
      FROM db_qualidade.qualidade_de_pedidos_inspecao q
      LEFT JOIN LATERAL (
          SELECT db_esteira_gross.fn_calcular_horas_uteis(q.data_entrada, q.data_saida) AS qtd_horas
      ) hrs ON TRUE
      WHERE q.data_saida_aux >= DATE_TRUNC('month', CURRENT_DATE)
        AND q.data_saida_aux < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
        AND COALESCE(q.analista, '') NOT ILIKE 'administrador'
        AND COALESCE(q.operacao_login_criador_cor_aux, '') NOT ILIKE 'BACK OFFICE LOJA PRÓPRIA'
        AND COALESCE(q.operacao_login_aprovador_cor_tarefa, '') NOT ILIKE 'BACK OFFICE LOJA PRÓPRIA'
        AND COALESCE(q.fila, '') NOT ILIKE 'CPC - Loja Própria'
        AND NOT (
            COALESCE(q.operacao_login_criador_cor_aux, '') ILIKE 'BACK OFFICE INPUT PME'
            AND COALESCE(q.status, '') ILIKE 'Inspeção Reprovada'
        )
        AND COALESCE(q.submotivo_devolucao, '') NOT ILIKE 'Erro sistêmico'
      ORDER BY q.codigo_tarefa, q.data_saida
    )
    SELECT 
        "CÓDIGO TAREFA",
        "STATUS",
        "TIPO PEDIDO2",
        data_entrada_bruta,
        data_saida_bruta,
        "SLA_AUTO",
        "C3_DT_INICIO",
        "C3_DT_FIM",
        qtd_horas,
        "SLA_AUTO" AS "C3_SLA_FORMATADO",
        CASE 
            WHEN qtd_horas > 24 THEN 'Acima de 24h'
            WHEN qtd_horas > 12 THEN 'Entre 12h e 24h'
            ELSE 'Dentro do SLA'
        END AS "C3_FAIXA_SLA"
    FROM consulta_base
    WHERE qtd_horas > 12
  `;

  // GET /api/inspecao/justificativa-sla — lista registros já importados na tabela
  async function handlerListarJustificativaSLA(req, res) {
    try {
      const { filtro } = req.query;
      let where = '';
      if (filtro === 'pendentes') {
        where = 'WHERE j.motivo_justificativa IS NULL';
      } else if (filtro === 'justificados') {
        where = 'WHERE j.motivo_justificativa IS NOT NULL';
      }

      const result = await pool.query(`
        SELECT 
          j.id,
          j.codigo_tarefa,
          j.status,
          j.tipo_pedido,
          TO_CHAR(j.data_entrada, 'DD/MM/YYYY HH24:MI') AS data_inicio_fmt,
          TO_CHAR(j.data_saida, 'DD/MM/YYYY HH24:MI') AS data_fim_fmt,
          j.qtd_horas,
          j.sla_auto,
          j.faixa_sla,
          j.motivo_justificativa,
          j.observacao,
          j.justificado_por,
          u.nome AS justificado_por_nome,
          TO_CHAR(j.data_justificativa, 'DD/MM/YYYY HH24:MI') AS data_justificativa_fmt
        FROM ${TABELA_JUSTIFICATIVA_SLA} j
        LEFT JOIN db_automacao.usuarios u ON u.id = j.justificado_por
        ${where}
        ORDER BY j.id DESC
      `, []);

      res.json({
        registros: result.rows,
        motivos: MOTIVOS_JUSTIFICATIVA_SLA
      });
    } catch (err) {
      console.error('[JUSTIFICATIVA-SLA] Erro ao listar:', err.message);
      res.status(500).json({ error: 'Erro ao listar registros: ' + err.message });
    }
  }

  // POST /api/inspecao/justificativa-sla/atualizar — roda a query fonte e insere
  // apenas as linhas novas (não apaga as antigas e não repete existentes).
  // Chave anti-duplicação: (codigo_tarefa, data_entrada)
  async function handlerAtualizarJustificativaSLA(req, res) {
    try {
      await garantirTabelaJustificativaSLA();

      const insertResult = await pool.query(`
        INSERT INTO ${TABELA_JUSTIFICATIVA_SLA} 
          (codigo_tarefa, status, tipo_pedido, data_entrada, data_saida, qtd_horas, sla_auto, faixa_sla)
        SELECT 
          cb."CÓDIGO TAREFA", cb."STATUS", cb."TIPO PEDIDO2",
          cb.data_entrada_bruta, cb.data_saida_bruta, cb.qtd_horas,
          cb."SLA_AUTO", cb."C3_FAIXA_SLA"
        FROM (${QUERY_BASE_JUSTIFICATIVA_SLA}) cb
        WHERE cb."CÓDIGO TAREFA" IS NOT NULL AND cb.data_entrada_bruta IS NOT NULL
        ON CONFLICT (codigo_tarefa, data_entrada) DO NOTHING
        RETURNING id
      `);

      const totalTabela = await pool.query(`SELECT COUNT(*)::int AS total FROM ${TABELA_JUSTIFICATIVA_SLA}`);

      console.log(`[JUSTIFICATIVA-SLA] Atualização manual: ${insertResult.rowCount} nova(s) linha(s), total na tabela: ${totalTabela.rows[0].total}`);
      res.json({
        message: `${insertResult.rowCount || 0} novo(s) registro(s) importado(s).`,
        inseridos: insertResult.rowCount || 0,
        total: totalTabela.rows[0].total
      });
    } catch (err) {
      console.error('[JUSTIFICATIVA-SLA] Erro ao atualizar:', err.message);
      res.status(500).json({ error: 'Erro ao atualizar registros: ' + err.message });
    }
  }

  // PUT /api/inspecao/justificativa-sla/:id/justificar — registra abono de SLA.
  // justificado_por recebe o id do usuário logado (JWT).
  async function handlerJustificarSLA(req, res) {
    try {
      const { id } = req.params;
      const { motivo_justificativa, observacao } = req.body;

      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({ error: 'ID inválido.' });
      }
      if (!motivo_justificativa || !String(motivo_justificativa).trim()) {
        return res.status(400).json({ error: 'O motivo da justificativa é obrigatório.' });
      }
      const motivoNormalizado = String(motivo_justificativa).trim().toUpperCase();
      if (!MOTIVOS_JUSTIFICATIVA_SLA.includes(motivoNormalizado)) {
        return res.status(400).json({ error: 'Motivo de justificativa inválido.' });
      }

      const result = await pool.query(`
        UPDATE ${TABELA_JUSTIFICATIVA_SLA}
        SET motivo_justificativa = $1,
            observacao = $2,
            justificado_por = $3,
            data_justificativa = CURRENT_TIMESTAMP,
            atualizado_em = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING id, codigo_tarefa, motivo_justificativa, observacao, justificado_por
      `, [motivoNormalizado, observacao ? String(observacao).trim() : null, req.user.id, parseInt(id)]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Registro não encontrado.' });
      }
      res.json({ message: 'Justificativa registrada com sucesso!', registro: result.rows[0] });
    } catch (err) {
      console.error('[JUSTIFICATIVA-SLA] Erro ao justificar:', err.message);
      res.status(500).json({ error: 'Erro ao registrar justificativa: ' + err.message });
    }
  }

  router.get('/api/inspecao/justificativa-sla', authenticateToken, authorizeRoute('/pme_notas/gestao'), handlerListarJustificativaSLA);
  router.get('/pme_notas/api/inspecao/justificativa-sla', authenticateToken, authorizeRoute('/pme_notas/gestao'), handlerListarJustificativaSLA);
  router.post('/api/inspecao/justificativa-sla/atualizar', authenticateToken, authorizeRoute('/pme_notas/gestao'), handlerAtualizarJustificativaSLA);
  router.post('/pme_notas/api/inspecao/justificativa-sla/atualizar', authenticateToken, authorizeRoute('/pme_notas/gestao'), handlerAtualizarJustificativaSLA);
  router.put('/api/inspecao/justificativa-sla/:id/justificar', authenticateToken, authorizeRoute('/pme_notas/gestao'), handlerJustificarSLA);
  router.put('/pme_notas/api/inspecao/justificativa-sla/:id/justificar', authenticateToken, authorizeRoute('/pme_notas/gestao'), handlerJustificarSLA);

  // GET /api/inspecao/justificativa-sla/calendario — quantidade por dia da data_saida
  async function handlerCalendarioJustificativaSLA(req, res) {
    try {
      const mes = parseInt(req.query.mes) || (new Date().getMonth() + 1);
      const ano = parseInt(req.query.ano) || new Date().getFullYear();

      const result = await pool.query(`
        SELECT
          EXTRACT(DAY FROM j.data_saida)::int AS dia,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE j.motivo_justificativa IS NOT NULL)::int AS justificados,
          COUNT(*) FILTER (WHERE j.motivo_justificativa IS NULL)::int AS pendentes
        FROM ${TABELA_JUSTIFICATIVA_SLA} j
        WHERE EXTRACT(YEAR FROM j.data_saida) = $1
          AND EXTRACT(MONTH FROM j.data_saida) = $2
        GROUP BY dia
        ORDER BY dia
      `, [ano, mes]);

      const diasMap = {};
      let totalGeral = 0, totalJustificados = 0, totalPendentes = 0;
      result.rows.forEach(r => {
        diasMap[r.dia] = { dia: r.dia, total: r.total, justificados: r.justificados, pendentes: r.pendentes };
        totalGeral += r.total;
        totalJustificados += r.justificados;
        totalPendentes += r.pendentes;
      });

      res.json({
        mes,
        ano,
        dias: result.rows,
        resumo: {
          total: totalGeral,
          justificados: totalJustificados,
          pendentes: totalPendentes,
          percentual: totalGeral > 0 ? Math.round((totalJustificados / totalGeral) * 100) : 0
        }
      });
    } catch (err) {
      console.error('[JUSTIFICATIVA-SLA] Erro no calendário:', err.message);
      res.status(500).json({ error: 'Erro ao carregar calendário: ' + err.message });
    }
  }

  router.get('/api/inspecao/justificativa-sla/calendario', authenticateToken, authorizeRoute('/pme_notas/gestao'), handlerCalendarioJustificativaSLA);
  router.get('/pme_notas/api/inspecao/justificativa-sla/calendario', authenticateToken, authorizeRoute('/pme_notas/gestao'), handlerCalendarioJustificativaSLA);

  // Serve página de justificativa SLA (mantém rotas antigas e novas)
  router.get('/inspecao/justificativa-sla', authenticatePage, authorizeRoute('/pme_notas/gestao'), (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'justificativa_sla.html'));
  });

  router.get('/pme_notas/inspecao/justificativa-sla', authenticatePage, authorizeRoute('/pme_notas/gestao'), (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'justificativa_sla.html'));
  });

  // Serve página do calendário de justificativa SLA (mantém rotas antigas e novas)
  router.get('/inspecao/justificativa-sla/calendario', authenticatePage, authorizeRoute('/pme_notas/gestao'), (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'justificativa_sla_calendario.html'));
  });

  router.get('/pme_notas/inspecao/justificativa-sla/calendario', authenticatePage, authorizeRoute('/pme_notas/gestao'), (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'justificativa_sla_calendario.html'));
  });

  // Serve devolucao padrao page
  router.get('/devolucoes-padrao', authenticatePage, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'devolucao_padrao_web.html'));
  });

  router.get('/pme_notas/devolucoes-padrao', authenticatePage, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'devolucao_padrao_web.html'));
  });

  // ===== ROTAS DE GESTÃO INPUT (IW_CPC_975) =====

  // Serve gestao_input pages
  router.get('/inspecao_input', authenticatePage, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'gestao_input.html'));
  });

  router.get('/input', authenticatePage, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'gestao_input.html'));
  });

  router.get('/input_top', authenticatePage, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'gestao_input_top.html'));
  });

  router.get('/input_net', authenticatePage, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'gestao_input_net.html'));
  });

  router.get('/pme_notas/input_top', authenticatePage, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'gestao_input_top.html'));
  });

  router.get('/pme_notas/input_net', authenticatePage, (req, res) => {
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
        LEFT JOIN db_bloco_de_notas.cotacao c
          ON iw.codigo_da_tarefa = c.tarefa
         AND NULLIF(iw.data_historico, '-')::timestamp = c.data_historico
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
            ) THEN codigo_da_tarefa 
          END) as pendente,
          COUNT(DISTINCT CASE 
            WHEN (acao ILIKE 'Cancelar' OR situacao_sistema ILIKE 'CANCELADO') THEN codigo_da_tarefa 
          END) as cancelado,
          COUNT(DISTINCT CASE 
            WHEN (da_etapa ILIKE '%04%' AND (para_etapa ILIKE '%01%' OR para_etapa ILIKE '%02%' OR para_etapa ILIKE '%03%' OR para_etapa ILIKE '%Admin%')) THEN codigo_da_tarefa 
          END) as desconsiderar,
          COUNT(DISTINCT CASE
            WHEN NOT EXISTS (
              SELECT 1 FROM db_bloco_de_notas.cotacao c2
              WHERE c2.tarefa = codigo_da_tarefa AND c2.validacao = 'Ativo'
            ) THEN codigo_da_tarefa
          END) as fila,
          COUNT(DISTINCT codigo_da_tarefa) as total
        FROM db_bloco_de_notas.iw_cpc_975_top 
        WHERE etapa_atual ILIKE '01%' AND situacao_sistema = 'ATIVO' AND acao = 'Alterar Status'
      `);
      const stats = countResult.rows[0] || {};

      // Contagem por status específico de cotação (ilha INPUT TOP)
      // Mesma lógica da ilha INPUT NET (tarefas_net), adaptada para o TOP.
      let statusCounts = {
        fila: 0, aprovado: 0, reprovado: 0, aguardando_chamado: 0,
        aguardando_qualidade: 0, aguardando_dupla_validacao: 0,
        aguardando_pre_analise: 0, em_tratamento: 0
      };
      try {
        const statusResult = await pool.query(`
          SELECT
            COUNT(DISTINCT c.tarefa) FILTER (WHERE c.status IS NULL OR c.status = '') AS fila,
            COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(REPLACE(c.status,' ','')) = 'aprovado') AS aprovado,
            COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(REPLACE(c.status,' ','')) = 'reprovado') AS reprovado,
            COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(REPLACE(c.status,' ','')) = 'aguardando-chamado') AS aguardando_chamado,
            COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(REPLACE(c.status,' ','')) = 'aguardando-qualidade') AS aguardando_qualidade,
            COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(REPLACE(c.status,' ','')) = 'aguardando-dupla-validacao') AS aguardando_dupla_validacao,
            COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(REPLACE(c.status,' ','')) = 'aguardando-pre-analise') AS aguardando_pre_analise,
            COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(REPLACE(c.status,' ','')) = 'em-tratamento') AS em_tratamento
          FROM db_gp.listafuncionarios l
          INNER JOIN db_automacao.usuarios u ON u.login = l.login
          LEFT JOIN db_bloco_de_notas.cotacao c
            ON c.usuario_id::text = u.id::text AND c.validacao = 'Ativo'
          WHERE UPPER(l.ilha) LIKE '%TOP%' AND l.ativo = true AND c.origem = 'iw_cpc_975_top'
        `);
        const st = statusResult.rows[0] || {};
        Object.keys(statusCounts).forEach(k => {
          statusCounts[k] = parseInt(st[k] || 0);
        });
      } catch (statusErr) {
        console.error('[INSPECAO_TOP STATUS] Erro:', statusErr.message);
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
      console.error('[INSPECAO_TOP] Erro:', error);
      res.status(500).json({ error: 'Erro ao buscar dados' });
    }
  });

  // API Tarefas Input NET (registrada com e sem prefixo /pme_notas)
  const handlerTarefasNet = async (req, res) => {
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
        LEFT JOIN db_bloco_de_notas.cotacao c
          ON hc.cod_tarefa = c.tarefa
         AND NULLIF(hc.data_historico, '-')::timestamp = c.data_historico
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
              OR (foto_recente.da_etapa ILIKE '%03%' AND foto_recente.para_etapa LIKE '%01%')
            ) AND foto_recente.qtd_producao_futura = 0 
            THEN foto_recente.cod_tarefa 
          END) as pendente,
          COUNT(DISTINCT CASE WHEN (foto_recente.acao ILIKE 'Cancelar' OR foto_recente.situacao_sistema ILIKE 'CANCELADO') THEN foto_recente.cod_tarefa END) as cancelado,
          COUNT(DISTINCT CASE 
            WHEN (foto_recente.da_etapa LIKE '%04%' AND (foto_recente.para_etapa LIKE '%01%' OR foto_recente.para_etapa LIKE '%02%' OR foto_recente.para_etapa LIKE '%03%' OR foto_recente.para_etapa ILIKE '%Admin%'))
            THEN foto_recente.cod_tarefa 
          END) as desconsiderar,
          COUNT(DISTINCT CASE
            WHEN NOT EXISTS (
              SELECT 1 FROM db_bloco_de_notas.cotacao c2
              WHERE c2.tarefa = foto_recente.cod_tarefa AND c2.validacao = 'Ativo'
            ) THEN foto_recente.cod_tarefa
          END) as fila,
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
        console.error('[INSPECAO_NET STATUS] Erro:', statusErr.message);
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
      console.error('[INSPECAO_NET] Erro:', error);
      res.status(500).json({ error: 'Erro ao buscar dados' });
    }
  };

  // Registra o handler com e sem prefixo /pme_notas (a página usa getBasePath())
  router.get('/api/inspecao/tarefas_net', authenticateToken, handlerTarefasNet);
  router.get('/pme_notas/api/inspecao/tarefas_net', authenticateToken, handlerTarefasNet);

  // Upload CSV/ZIP e processar ETL para iw_cpc_975_top
  router.post('/api/inspecao/upload', authenticateToken, inputUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      const result = await processarETL_975_top(req.file.path, pool, 'Input de Pedidos PME');
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
      const result = await processarETL_975_net(req.file.path, pool, 'Input de pedidos – PME – Demais Canais');
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
      
      const result = await processarETL_975_net(filePath, pool, 'Input de pedidos – PME – Demais Canais');
      
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
      
      await client.query('CALL db_bloco_de_notas.sp_limpar_iw_cpc_975_net();');
      console.log('[ATUALIZAR_INPUT_NET] Stored procedure sp_limpar_iw_cpc_975_net executada com sucesso.');
      
      res.json({ success: true, message: 'Dados atualizados com sucesso.' });
    } catch (error) {
      console.error('[ATUALIZAR_INPUT_NET] Erro:', error);
      res.status(500).json({ error: 'Erro ao atualizar dados' });
    } finally {
      if (client) client.release();
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
          // Buscar nome da tarefa para anotação e data_historico (necessário para o cruzamento por tarefa + data_historico)
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
            anotacao = `Origem: iw_cpc_975_net | Etapa: ${tr.etapa_atual || ''}`;
            if (tr.data_historico) dataHistorico = tr.data_historico;
          }

          // Buscar nome do usuário destino
          let destinoNome = String(item.usuario_id);
          try {
              const uRes = await pool.query('SELECT nome FROM db_automacao.usuarios WHERE id = $1', [item.usuario_id]);
              if (uRes.rows.length > 0) destinoNome = uRes.rows[0].nome;
          } catch {}

          // Inserção atômica: tarefa + data_historico nunca duplicada,
          // mesmo com requisições simultâneas para colaboradores diferentes.
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

  // ===== ROTAS INPUT TOP (iw_cpc_975_top) =====
  
  // Distribuir tarefas input_top (iw_cpc_975_top)
  router.post('/api/inspecao/distribuir_input_top', authenticateToken, authorizeRoute('/pme_notas/gestao'), async (req, res) => {
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
          // Buscar dados da tarefa para anotação e data_historico (necessário para o cruzamento por tarefa + data_historico)
          const tarefaResult = await pool.query(
            'SELECT codigo_da_tarefa, etapa_atual, data_historico FROM db_bloco_de_notas.iw_cpc_975_top WHERE codigo_da_tarefa = $1',
            [item.cod_tarefa]
          );
          
          let anotacao = '';
          let dataHistorico = null;
          if (tarefaResult.rows.length > 0) {
            const tr = tarefaResult.rows[0];
            anotacao = `Origem: iw_cpc_975_top | Etapa: ${tr.etapa_atual || ''}`;
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
            tarefa: item.cod_tarefa,
            cotacao: item.cod_tarefa,
            anotacao,
            agora: now,
            usuarioLogin,
            usuarioId: item.usuario_id,
            origem: 'iw_cpc_975_top',
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
                  [item.cod_tarefa, 'distribuido_input_top', usuarioId, usuarioLogin, item.usuario_id, destinoNome, '-', 'pendente', usuarioLogin]
              );
          } catch (auditErr) {
              console.error('[DISTRIBUIR_INPUT_TOP] Erro ao registrar auditoria:', auditErr.message);
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
      console.error('[DISTRIBUIR_INPUT_TOP] Erro:', error);
      res.status(500).json({ error: `Erro ao distribuir tarefas: ${error.message}` });
    }
  });

  // Redistribuir tarefas input_top (iw_cpc_975_top)
  router.post('/api/inspecao/redistribuir_input_top', authenticateToken, authorizeRoute('/pme_notas/gestao'), async (req, res) => {
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
            "SELECT tarefa, usuario_id FROM db_bloco_de_notas.cotacao WHERE tarefa = $1 AND validacao = $2 AND origem = 'iw_cpc_975_top'",
            [item.cod_tarefa, 'Ativo']
          );
          
          if (check.rows.length === 0) {
            errors.push({ cod_tarefa: item.cod_tarefa, error: 'Tarefa não encontrada ou origem não é iw_cpc_975_top' });
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
              [item.cod_tarefa, 'redistribuido_input_top', usuarioId, usuarioLogin, item.usuario_id, destinoNome, null, null, usuarioLogin]
          );

          // Atualizar usuário
          await pool.query(
            `UPDATE db_bloco_de_notas.cotacao 
             SET usuario_id = $1, data_da_ultima_atualizacao = $2, usuario_login = $3
             WHERE tarefa = $4 AND validacao = 'Ativo' AND origem = 'iw_cpc_975_top'`,
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
      console.error('[REDISTRIBUIR_INPUT_TOP] Erro:', error);
      res.status(500).json({ error: `Erro ao redistribuir tarefas: ${error.message}` });
    }
  });

  // Atualizar dados input_top a partir da esteira
  router.post('/api/inspecao/atualizar_input_top', authenticateToken, async (req, res) => {
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
            SELECT MAX(CAST(data_historico AS TIMESTAMP)) INTO v_max_esteira FROM db_esteira_gross.historico_input_pedido_pme_top;
            SELECT MAX(CAST(data_historico AS TIMESTAMP)) INTO v_max_bloco FROM db_bloco_de_notas.iw_cpc_975_top;

            IF v_max_esteira > COALESCE(v_max_bloco, '1900-01-01'::timestamp) THEN
                -- Otimização de IO/lock: em vez de TRUNCATE (AccessExclusiveLock, bloqueia leitores
                -- da iw_cpc durante toda a transação), usamos DELETE (RowExclusiveLock). O resultado
                -- final é o mesmo (tabela passa a conter somente os dados re-carregados abaixo), mas
                -- as leituras concorrentes (dashboard / distribuição) não ficam bloqueadas.
                DELETE FROM db_bloco_de_notas.iw_cpc_975_top;

                INSERT INTO db_bloco_de_notas.iw_cpc_975_top (
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
                FROM db_esteira_gross.historico_input_pedido_pme_top
                WHERE CAST(data_historico AS TIMESTAMP)::date = CURRENT_DATE;

                RAISE NOTICE 'Sucesso: Tabela truncada e dados atualizados para o dia %.', CURRENT_DATE;
            ELSE
                RAISE NOTICE 'Aviso: A tabela do bloco de notas já está atualizada ou a origem não possui dados mais recentes.';
            END IF;
        END $$;
      `);
      
      await client.query('CALL db_bloco_de_notas.sp_limpar_iw_cpc_975_top();');
      console.log('[ATUALIZAR_INPUT_TOP] Stored procedure sp_limpar_iw_cpc_975_top executada com sucesso.');
      
      res.json({ success: true, message: 'Dados atualizados com sucesso.' });
    } catch (error) {
      console.error('[ATUALIZAR_INPUT_TOP] Erro:', error);
      res.status(500).json({ error: 'Erro ao atualizar dados' });
    } finally {
      if (client) client.release();
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

  // ===== DISTRIBUIÇÃO AUTOMÁTICA (Dashboard r_000250) =====
  // Distribuir N tarefas da r_000250 para um colaborador
  // quantidade = 1: pega a mais antiga (SLA mais crítico)
  // quantidade 2-10: 1ª = mais antiga, demais = aleatórias, data_historico com +1h por posição
  router.post('/api/inspecao/distribuir-auto', authenticateToken, authorizeRoute('/pme_notas/gestao'), async (req, res) => {
    try {
      const { usuario_id, quantidade } = req.body;
      
      if (!usuario_id || !quantidade || quantidade < 1 || quantidade > 10) {
        return res.status(400).json({ error: 'Parâmetros inválidos. usuario_id e quantidade (1-10) são obrigatórios.' });
      }
      
      const usuarioLogin = req.user.username;
      const now = formatDateBR(new Date());
      
      // Condições base para tarefas distribuíveis na r_000250
      const baseFrom = `
        FROM db_bloco_de_notas.r_000250 r
        LEFT JOIN db_bloco_de_notas.cotacao c ON r.cod_tarefa = c.tarefa AND c.validacao = 'Ativo'
        WHERE (c.tarefa IS NULL OR c.status IS NULL OR c.status = '')
          AND (r.pendente_com IS NULL OR r.pendente_com = '' OR r.pendente_com = '-')
      `;

      // 1ª tarefa: prioridade de hoje (maratona p/ dia 20+ -> NOVO/INCREMENTO -> restante),
      // e dentro de cada nível a mais antiga pelo dat_historico (maior criticidade de SLA).
      const primeiraQuery = `
        SELECT r.cod_tarefa, r.dat_historico, r.nom_tarefa, r.nom_fila, r.dsc_cotacao
        ${baseFrom}
        ORDER BY
          ${PRIORIDADE_FILA_SQL},
          CASE WHEN r.dat_historico IS NULL OR r.dat_historico = '-' THEN 1 ELSE 0 END,
          r.dat_historico::timestamp ASC NULLS LAST,
          r.dat_criacao ASC
        LIMIT 1
      `;
      const primeiraResult = await pool.query(primeiraQuery);
      const primeira = primeiraResult.rows[0];
      
      if (!primeira) {
        return res.json({
          success: true,
          message: 'Nenhuma tarefa disponível para distribuição.',
          distribuidos: 0,
          tarefas: []
        });
      }
      
      let tarefas = [primeira];
      
      // Demais tarefas (apenas quando quantidade > 1): seleção aleatória
      if (quantidade > 1) {
        const demaisQuery = `
          SELECT r.cod_tarefa, r.dat_historico, r.nom_tarefa, r.nom_fila, r.dsc_cotacao
          ${baseFrom}
            AND r.cod_tarefa <> $1
          ORDER BY RANDOM()
          LIMIT $2
        `;
        const demaisResult = await pool.query(demaisQuery, [primeira.cod_tarefa, quantidade - 1]);
        tarefas = tarefas.concat(demaisResult.rows);
      }
      
      // Buscar nome do usuário destino
      let destinoNome = String(usuario_id);
      try {
        const uRes = await pool.query('SELECT nome FROM db_automacao.usuarios WHERE id = $1', [usuario_id]);
        if (uRes.rows.length > 0) destinoNome = uRes.rows[0].nome;
      } catch {}
      
      let count = 0;
      let errors = [];
      const distribuidos = [];
      
      for (let i = 0; i < tarefas.length; i++) {
        const tarefa = tarefas[i];
        try {
          let anotacao = '';
          let cotacaoDsc = tarefa.cod_tarefa;
          if (tarefa.dsc_cotacao) cotacaoDsc = tarefa.dsc_cotacao;
          if (tarefa.nom_tarefa || tarefa.nom_fila) {
            anotacao = `Tarefa: ${tarefa.nom_tarefa || ''} | Fila: ${tarefa.nom_fila || ''}`;
          }
          
          // Ajustar data_historico: 1ª = valor original, demais = cotação anterior + 1h
          let dataHistorico = null;
          if (i === 0) {
            dataHistorico = tarefa.dat_historico || null;
          } else {
            const anteriorSalvo = distribuidos.length > 0 ? distribuidos[distribuidos.length - 1].data_historico : null;
            dataHistorico = somarHorasDataHistorico(anteriorSalvo || tarefa.dat_historico, 1);
          }
          
          // Inserção atômica: tarefa + data_historico nunca duplicada,
          // mesmo com requisições simultâneas para colaboradores diferentes.
          const inserido = await inserirDistribuicaoAtomica(pool, {
            tarefa: tarefa.cod_tarefa,
            cotacao: cotacaoDsc,
            anotacao,
            agora: now,
            usuarioLogin,
            usuarioId: usuario_id,
            origem: 'r_000250',
            dataHistorico,
          });

          if (!inserido) {
            errors.push({ cod_tarefa: tarefa.cod_tarefa, error: 'Tarefa já distribuída para este data_historico' });
            continue;
          }
          
          // Registrar auditoria
          await registrarAuditoria(pool, {
            tarefa: tarefa.cod_tarefa,
            acao: 'distribuido',
            usuario_origem_id: req.user.id,
            usuario_origem_nome: req.user.nome || usuarioLogin,
            usuario_destino_id: usuario_id,
            usuario_destino_nome: destinoNome,
            status_anterior: null,
            status_novo: 'pendente',
            criado_por: usuarioLogin
          });
          
          count++;
          distribuidos.push({
            cod_tarefa: tarefa.cod_tarefa,
            data_historico: dataHistorico
          });
        } catch (err) {
          errors.push({ cod_tarefa: tarefa.cod_tarefa, error: err.message });
        }
      }
      
      res.json({
        success: true,
        message: `${count} tarefa(s) distribuída(s) para ${destinoNome}`,
        distribuidos: count,
        tarefas: distribuidos,
        erros: errors
      });
      
    } catch (error) {
      console.error('[DISTRIBUIR_AUTO] Erro:', error);
      res.status(500).json({ error: `Erro ao distribuir tarefas: ${error.message}` });
    }
  });

  // ===== DISTRIBUIÇÃO AUTOMÁTICA (Dashboard Input TOP - iw_cpc_975_top) =====
  // Distribuir N tarefas da iw_cpc_975_top para um colaborador
  // quantidade = 1: pega a mais antiga (SLA mais crítico)
  // quantidade 2-10: 1ª = mais antiga, demais = aleatórias, data_historico com +1h por posição
  router.post('/api/inspecao/distribuir-auto-input-top', authenticateToken, authorizeRoute('/pme_notas/gestao'), async (req, res) => {
    try {
      const { usuario_id, quantidade } = req.body;
      
      if (!usuario_id || !quantidade || quantidade < 1 || quantidade > 10) {
        return res.status(400).json({ error: 'Parâmetros inválidos. usuario_id e quantidade (1-10) são obrigatórios.' });
      }
      
      const usuarioLogin = req.user.username;
      const now = formatDateBR(new Date());
      
      // Condições base para tarefas distribuíveis na esteira.
      // NOT EXISTS com IS NOT DISTINCT FROM garante que um pedido já distribuído
      // (mesmo com data_historico NULL ou '-') não volte a ser oferecido.
      const baseFrom = `
        FROM db_bloco_de_notas.iw_cpc_975_top iw
        LEFT JOIN db_bloco_de_notas.cotacao c
          ON iw.codigo_da_tarefa = c.tarefa
         AND c.validacao = 'Ativo'
         AND NULLIF(iw.data_historico, '-')::timestamp = c.data_historico
        WHERE (c.tarefa IS NULL OR c.status IS NULL OR c.status = '')
          AND NOT EXISTS (
            SELECT 1
              FROM db_bloco_de_notas.cotacao c2
             WHERE c2.tarefa = iw.codigo_da_tarefa
               AND c2.validacao = 'Ativo'
               AND c2.data_historico IS NOT DISTINCT FROM NULLIF(iw.data_historico, '-')::timestamp
          )
          AND iw.etapa_atual ILIKE '01%'
      `;

      // 1ª tarefa: sempre a mais antiga (maior criticidade de SLA)
      const primeiraQuery = `
        SELECT iw.codigo_da_tarefa AS cod_tarefa, iw.data_historico, iw.etapa_atual
        ${baseFrom}
        ORDER BY 
          CASE WHEN iw.data_historico IS NULL OR iw.data_historico = '-' THEN 1 ELSE 0 END,
          iw.data_historico::timestamp ASC NULLS LAST
        LIMIT 1
      `;
      const primeiraResult = await pool.query(primeiraQuery);
      const primeira = primeiraResult.rows[0];
      
      if (!primeira) {
        return res.json({
          success: true,
          message: 'Nenhuma tarefa disponível para distribuição.',
          distribuidos: 0,
          tarefas: []
        });
      }
      
      let tarefas = [primeira];
      
      // Demais tarefas (apenas quando quantidade > 1): seleção aleatória
      if (quantidade > 1) {
        const demaisQuery = `
          SELECT iw.codigo_da_tarefa AS cod_tarefa, iw.data_historico, iw.etapa_atual
          ${baseFrom}
            AND iw.codigo_da_tarefa <> $1
          ORDER BY RANDOM()
          LIMIT $2
        `;
        const demaisResult = await pool.query(demaisQuery, [primeira.cod_tarefa, quantidade - 1]);
        tarefas = tarefas.concat(demaisResult.rows);
      }
      
      // Buscar nome do usuário destino
      let destinoNome = String(usuario_id);
      try {
        const uRes = await pool.query('SELECT nome FROM db_automacao.usuarios WHERE id = $1', [usuario_id]);
        if (uRes.rows.length > 0) destinoNome = uRes.rows[0].nome;
      } catch {}
      
      let count = 0;
      let errors = [];
      const distribuidos = [];
      
      for (let i = 0; i < tarefas.length; i++) {
        const tarefa = tarefas[i];
        try {
          // Ajustar data_historico: 1ª = valor original, demais = cotação anterior + 1h
          let dataHistorico = null;
          if (i === 0) {
            dataHistorico = tarefa.data_historico || null;
          } else {
            const anteriorSalvo = distribuidos.length > 0 ? distribuidos[distribuidos.length - 1].data_historico : null;
            dataHistorico = somarHorasDataHistorico(anteriorSalvo || tarefa.data_historico, 1);
          }

          let anotacao = '';
          if (tarefa.etapa_atual) {
            anotacao = `Origem: iw_cpc_975_top | Etapa: ${tarefa.etapa_atual}`;
          }
          
          // Inserção atômica: tarefa + data_historico nunca duplicada.
          const inserido = await inserirDistribuicaoAtomica(pool, {
            tarefa: tarefa.cod_tarefa,
            cotacao: tarefa.cod_tarefa,
            anotacao,
            agora: now,
            usuarioLogin,
            usuarioId: usuario_id,
            origem: 'iw_cpc_975_top',
            dataHistorico,
          });

          if (!inserido) {
            errors.push({ cod_tarefa: tarefa.cod_tarefa, error: 'Tarefa já distribuída para este data_historico' });
            continue;
          }
          
          // Registrar auditoria
          await registrarAuditoria(pool, {
            tarefa: tarefa.cod_tarefa,
            acao: 'distribuido_input_top',
            usuario_origem_id: req.user.id,
            usuario_origem_nome: req.user.nome || usuarioLogin,
            usuario_destino_id: usuario_id,
            usuario_destino_nome: destinoNome,
            status_anterior: null,
            status_novo: 'pendente',
            criado_por: usuarioLogin
          });
          
          count++;
          distribuidos.push({
            cod_tarefa: tarefa.cod_tarefa,
            data_historico: dataHistorico
          });
        } catch (err) {
          errors.push({ cod_tarefa: tarefa.cod_tarefa, error: err.message });
        }
      }
      
      res.json({
        success: true,
        message: `${count} tarefa(s) distribuída(s) para ${destinoNome}`,
        distribuidos: count,
        tarefas: distribuidos,
        erros: errors
      });
      
    } catch (error) {
      console.error('[DISTRIBUIR_AUTO_INPUT_TOP] Erro:', error);
      res.status(500).json({ error: `Erro ao distribuir tarefas: ${error.message}` });
    }
  });

  // ===== DISTRIBUIÇÃO AUTOMÁTICA (Dashboard Input NET - iw_cpc_975_net) =====
  // Distribuir N tarefas da iw_cpc_975_net para um colaborador
  // quantidade = 1: pega a mais antiga (SLA mais crítico)
  // quantidade 2-10: 1ª = mais antiga, demais = aleatórias, data_historico com +1h por posição

  // Função auxiliar para somar horas ao data_historico preservando o formato original
  function somarHorasDataHistorico(value, horas) {
    if (!value || value === '-') return value;
    const text = String(value).trim();
    let dt = null;
    let formato = 'iso';

    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);

    if (isoMatch) {
      const [, y, m, d, h, min, s = '00'] = isoMatch;
      dt = new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min), Number(s));
      formato = 'iso';
    } else if (brMatch) {
      const [, d, m, y, h, min, s = '00'] = brMatch;
      dt = new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min), Number(s));
      formato = 'br';
    } else {
      dt = new Date(text);
      if (isNaN(dt.getTime())) return value;
    }

    if (isNaN(dt.getTime())) return value;
    dt.setHours(dt.getHours() + horas);

    const pad = (n) => String(n).padStart(2, '0');
    if (formato === 'br') {
      return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    }
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  }

  router.post('/api/inspecao/distribuir-auto-input-net', authenticateToken, authorizeRoute('/pme_notas/gestao'), async (req, res) => {
    try {
      const { usuario_id, quantidade } = req.body;
      
      if (!usuario_id || !quantidade || quantidade < 1 || quantidade > 10) {
        return res.status(400).json({ error: 'Parâmetros inválidos. usuario_id e quantidade (1-10) são obrigatórios.' });
      }
      
      const usuarioLogin = req.user.username;
      const now = formatDateBR(new Date());
      
      // Condições base para tarefas distribuíveis na esteira.
      // NOT EXISTS com IS NOT DISTINCT FROM garante que um pedido já distribuído
      // (mesmo com data_historico NULL ou '-') não volte a ser oferecido.
      const baseFrom = `
        FROM db_bloco_de_notas.iw_cpc_975_net iw
        LEFT JOIN db_bloco_de_notas.cotacao c
          ON iw.codigo_da_tarefa = c.tarefa
         AND c.validacao = 'Ativo'
         AND NULLIF(iw.data_historico, '-')::timestamp = c.data_historico
        WHERE (c.tarefa IS NULL OR c.status IS NULL OR c.status = '')
          AND NOT EXISTS (
            SELECT 1
              FROM db_bloco_de_notas.cotacao c2
             WHERE c2.tarefa = iw.codigo_da_tarefa
               AND c2.validacao = 'Ativo'
               AND c2.data_historico IS NOT DISTINCT FROM NULLIF(iw.data_historico, '-')::timestamp
          )
          AND iw.etapa_atual ILIKE '01%'
      `;

      // 1ª tarefa: sempre a mais antiga (maior criticidade de SLA)
      const primeiraQuery = `
        SELECT iw.codigo_da_tarefa AS cod_tarefa, iw.data_historico, iw.etapa_atual
        ${baseFrom}
        ORDER BY 
          CASE WHEN iw.data_historico IS NULL OR iw.data_historico = '-' THEN 1 ELSE 0 END,
          iw.data_historico::timestamp ASC NULLS LAST
        LIMIT 1
      `;
      const primeiraResult = await pool.query(primeiraQuery);
      const primeira = primeiraResult.rows[0];
      
      if (!primeira) {
        return res.json({
          success: true,
          message: 'Nenhuma tarefa disponível para distribuição.',
          distribuidos: 0,
          tarefas: []
        });
      }
      
      let tarefas = [primeira];
      
      // Demais tarefas (apenas quando quantidade > 1): seleção aleatória
      if (quantidade > 1) {
        const demaisQuery = `
          SELECT iw.codigo_da_tarefa AS cod_tarefa, iw.data_historico, iw.etapa_atual
          ${baseFrom}
            AND iw.codigo_da_tarefa <> $1
          ORDER BY RANDOM()
          LIMIT $2
        `;
        const demaisResult = await pool.query(demaisQuery, [primeira.cod_tarefa, quantidade - 1]);
        tarefas = tarefas.concat(demaisResult.rows);
      }
      
      // Buscar nome do usuário destino
      let destinoNome = String(usuario_id);
      try {
        const uRes = await pool.query('SELECT nome FROM db_automacao.usuarios WHERE id = $1', [usuario_id]);
        if (uRes.rows.length > 0) destinoNome = uRes.rows[0].nome;
      } catch {}
      
      let count = 0;
      let errors = [];
      const distribuidos = [];
      
      for (let i = 0; i < tarefas.length; i++) {
        const tarefa = tarefas[i];
        try {
          // Ajustar data_historico: 1ª = valor original, demais = cotação anterior + 1h
          let dataHistorico = null;
          if (i === 0) {
            dataHistorico = tarefa.data_historico || null;
          } else {
            const anteriorSalvo = distribuidos.length > 0 ? distribuidos[distribuidos.length - 1].data_historico : null;
            dataHistorico = somarHorasDataHistorico(anteriorSalvo || tarefa.data_historico, 1);
          }

          let anotacao = '';
          if (tarefa.etapa_atual) {
            anotacao = `Origem: iw_cpc_975_net | Etapa: ${tarefa.etapa_atual}`;
          }
          
          // Inserção atômica: tarefa + data_historico nunca duplicada.
          const inserido = await inserirDistribuicaoAtomica(pool, {
            tarefa: tarefa.cod_tarefa,
            cotacao: tarefa.cod_tarefa,
            anotacao,
            agora: now,
            usuarioLogin,
            usuarioId: usuario_id,
            origem: 'iw_cpc_975_net',
            dataHistorico,
          });

          if (!inserido) {
            errors.push({ cod_tarefa: tarefa.cod_tarefa, error: 'Tarefa já distribuída para este data_historico' });
            continue;
          }
          
          // Registrar auditoria
          await registrarAuditoria(pool, {
            tarefa: tarefa.cod_tarefa,
            acao: 'distribuido_input_net',
            usuario_origem_id: req.user.id,
            usuario_origem_nome: req.user.nome || usuarioLogin,
            usuario_destino_id: usuario_id,
            usuario_destino_nome: destinoNome,
            status_anterior: null,
            status_novo: 'pendente',
            criado_por: usuarioLogin
          });
          
          count++;
          distribuidos.push({
            cod_tarefa: tarefa.cod_tarefa,
            data_historico: dataHistorico
          });
        } catch (err) {
          errors.push({ cod_tarefa: tarefa.cod_tarefa, error: err.message });
        }
      }
      
      res.json({
        success: true,
        message: `${count} tarefa(s) distribuída(s) para ${destinoNome}`,
        distribuidos: count,
        tarefas: distribuidos,
        erros: errors
      });
      
    } catch (error) {
      console.error('[DISTRIBUIR_AUTO_INPUT_NET] Erro:', error);
      res.status(500).json({ error: `Erro ao distribuir tarefas: ${error.message}` });
    }
  });

  // ===== ROTAS HOTEIS E HOSPITAIS (h_x_h) =====

  // Serve gestao hh page
  router.get('/hh', authenticatePage, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'gestao_h_x_h.html'));
  });

  router.get('/pme_notas/hh', authenticatePage, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'gestao_h_x_h.html'));
  });

  // API Tarefas Hoteis e Hospitais
  router.get('/api/inspecao/tarefas_h_x_h', authenticateToken, async (req, res) => {
    try {
      const { search, limit, offset = 0 } = req.query;
      const params = [];
      let paramIndex = 1;

      let query = `
        SELECT 
          h.fila,
          h.id_tarefa AS cod_tarefa,
          h.nome_tarefa,
          h.data_de_abertura,
          h.data_de_historico,
          h.data_de_conclusao,
          h.de_etapa,
          h.de_usuario,
          h.acao,
          h.para_etapa,
          h.para_usuario_grupo,
          h.cnpj,
          h.razao_social,
          h.uf_do_cartao_cnpj_do_cliente,
          h.codigo_da_revenda,
          h.territorio,
          h.nome_demandante,
          h.login_do_vendedor,
          h.nome_do_vendedor_responsavel_pela_venda,
          h.banda_larga,
          h.tv,
          h.produtos_agregados,
          h.total_de_pontos,
          h.valor_contratado_individual,
          h.valor_contratado_total,
          h.negociacao_com_desconto,
          c.usuario_id,
          u_dist.nome AS usuario_distribuido_nome,
          c.status AS cotacao_status,
          CASE WHEN c.cotacao IS NOT NULL THEN 'Enviado' ELSE 'Fila' END as status_distribuicao
        FROM db_bloco_de_notas.hoteis_x_hospitais h
        LEFT JOIN db_bloco_de_notas.cotacao c ON h.id_tarefa = c.tarefa AND c.validacao = 'Ativo'
        LEFT JOIN db_automacao.usuarios u_dist ON u_dist.id::TEXT = c.usuario_id AND u_dist.ativo = true
        WHERE 1=1
      `;

      if (search) {
        query += ` AND (h.id_tarefa ILIKE $${paramIndex} OR h.nome_tarefa ILIKE $${paramIndex} OR h.fila ILIKE $${paramIndex} OR h.razao_social ILIKE $${paramIndex} OR h.cnpj ILIKE $${paramIndex})`;
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
      query += ` ORDER BY h.data_de_historico DESC`;

      const result = await pool.query(query, params);

      // Stats - contagem de todos os registros da tabela
      const statsResult = await pool.query(`
        SELECT 
          COUNT(DISTINCT CASE WHEN (h.de_etapa ILIKE '%Abert%' AND h.para_etapa ILIKE '%Vistoria%') THEN h.id_tarefa END) as em_tratamento,
          COUNT(DISTINCT CASE WHEN (h.para_etapa ILIKE '%Conclu%' OR h.para_etapa ILIKE '%Aprovad%') THEN h.id_tarefa END) as aprovado,
          COUNT(DISTINCT CASE WHEN (h.para_etapa ILIKE '%Reprov%' OR h.para_etapa ILIKE '%Cancel%') THEN h.id_tarefa END) as reprovado,
          COUNT(DISTINCT CASE WHEN (h.de_etapa ILIKE '%Abert%' AND h.para_etapa ILIKE '%Vistoria%') THEN h.id_tarefa END) as pendente,
          COUNT(DISTINCT CASE WHEN (h.acao ILIKE 'Cancelar' OR h.para_etapa ILIKE '%Cancel%') THEN h.id_tarefa END) as cancelado,
          COUNT(*) as total
        FROM db_bloco_de_notas.hoteis_x_hospitais h
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
      console.error('[INSPECAO_H_X_H] Erro:', error);
      res.status(500).json({ error: 'Erro ao buscar dados' });
    }
  });

  // Upload CSV/ZIP e processar ETL para hoteis_x_hospitais
  router.post('/api/inspecao/upload_h_x_h', authenticateToken, inputUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      const result = await processarETL_HoteisHospitais(req.file.path, pool);
      res.json({ success: true, message: `Arquivo processado com sucesso. ${result.totalRows} registros carregados.`, totalRows: result.totalRows });
    } catch (error) {
      console.error('[H_X_H] Erro:', error);
      res.status(500).json({ error: `Erro ao processar arquivo: ${error.message}` });
    }
  });

  // Distribuir tarefas h_x_h (hoteis_x_hospitais)
  router.post('/api/inspecao/distribuir_h_x_h', authenticateToken, authorizeRoute('/pme_notas/gestao'), async (req, res) => {
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
          // Buscar dados da tarefa para anotação
          const tarefaResult = await pool.query(
            'SELECT id_tarefa, nome_tarefa, de_etapa, para_etapa, data_de_historico FROM db_bloco_de_notas.hoteis_x_hospitais WHERE id_tarefa = $1 ORDER BY data_de_historico DESC LIMIT 1',
            [item.cod_tarefa]
          );
          
          let anotacao = '';
          let dataHistorico = null;
          if (tarefaResult.rows.length > 0) {
            const tr = tarefaResult.rows[0];
            anotacao = `Origem: h_x_h | Tarefa: ${tr.nome_tarefa || ''} | Etapa: ${tr.para_etapa || tr.de_etapa || ''}`;
            if (tr.data_de_historico) dataHistorico = tr.data_de_historico;
          }

          // Buscar nome do usuário destino
          let destinoNome = String(item.usuario_id);
          try {
              const uRes = await pool.query('SELECT nome FROM db_automacao.usuarios WHERE id = $1', [item.usuario_id]);
              if (uRes.rows.length > 0) destinoNome = uRes.rows[0].nome;
          } catch {}

          // Inserção atômica: tarefa + data_historico nunca duplicada.
          const inserido = await inserirDistribuicaoAtomica(pool, {
            tarefa: item.cod_tarefa,
            cotacao: item.cod_tarefa,
            anotacao,
            agora: now,
            usuarioLogin,
            usuarioId: item.usuario_id,
            origem: 'h_x_h',
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
                  [item.cod_tarefa, 'distribuido_h_x_h', usuarioId, usuarioLogin, item.usuario_id, destinoNome, '-', 'pendente', usuarioLogin]
              );
          } catch (auditErr) {
              console.error('[DISTRIBUIR_H_X_H] Erro ao registrar auditoria:', auditErr.message);
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
      console.error('[DISTRIBUIR_H_X_H] Erro:', error);
      res.status(500).json({ error: `Erro ao distribuir tarefas: ${error.message}` });
    }
  });

  // Redistribuir tarefas h_x_h (hoteis_x_hospitais)
  router.post('/api/inspecao/redistribuir_h_x_h', authenticateToken, authorizeRoute('/pme_notas/gestao'), async (req, res) => {
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
            "SELECT tarefa, usuario_id FROM db_bloco_de_notas.cotacao WHERE tarefa = $1 AND validacao = $2 AND origem = 'h_x_h'",
            [item.cod_tarefa, 'Ativo']
          );
          
          if (check.rows.length === 0) {
            errors.push({ cod_tarefa: item.cod_tarefa, error: 'Tarefa não encontrada ou origem não é h_x_h' });
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
              [item.cod_tarefa, 'redistribuido_h_x_h', usuarioId, usuarioLogin, item.usuario_id, destinoNome, null, null, usuarioLogin]
          );

          // Atualizar usuário
          await pool.query(
            `UPDATE db_bloco_de_notas.cotacao 
             SET usuario_id = $1, data_da_ultima_atualizacao = $2, usuario_login = $3
             WHERE tarefa = $4 AND validacao = 'Ativo' AND origem = 'h_x_h'`,
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
      console.error('[REDISTRIBUIR_H_X_H] Erro:', error);
      res.status(500).json({ error: `Erro ao redistribuir tarefas: ${error.message}` });
    }
  });

  // ===== DISTRIBUIÇÃO AUTOMÁTICA (Dashboard Hoteis e Hospitais - h_x_h) =====
  router.post('/api/inspecao/distribuir-auto-h_x_h', authenticateToken, authorizeRoute('/pme_notas/gestao'), async (req, res) => {
    try {
      const { usuario_id, quantidade } = req.body;
      
      if (!usuario_id || !quantidade || quantidade < 1 || quantidade > 10) {
        return res.status(400).json({ error: 'Parâmetros inválidos. usuario_id e quantidade (1-10) são obrigatórios.' });
      }
      
      const usuarioLogin = req.user.username;
      const now = formatDateBR(new Date());
      
      // Condições base para tarefas distribuíveis na hoteis_x_hospitais
      const baseFrom = `
        FROM (
          SELECT DISTINCT ON (h.id_tarefa)
            h.id_tarefa AS cod_tarefa,
            h.data_de_historico,
            h.nome_tarefa,
            h.para_etapa,
            h.de_etapa
          FROM db_bloco_de_notas.hoteis_x_hospitais h
          ORDER BY h.id_tarefa, h.data_de_historico DESC
        ) h
        LEFT JOIN db_bloco_de_notas.cotacao c ON h.cod_tarefa = c.tarefa AND c.validacao = 'Ativo'
        WHERE (c.tarefa IS NULL OR c.status IS NULL OR c.status = '')
      `;

      // 1ª tarefa: sempre a mais antiga (maior criticidade de SLA)
      const primeiraQuery = `
        SELECT h.cod_tarefa, h.data_de_historico, h.nome_tarefa, h.para_etapa, h.de_etapa
        ${baseFrom}
        ORDER BY 
          CASE WHEN h.data_de_historico IS NULL THEN 1 ELSE 0 END,
          h.data_de_historico ASC NULLS LAST
        LIMIT 1
      `;
      const primeiraResult = await pool.query(primeiraQuery);
      const primeira = primeiraResult.rows[0];
      
      if (!primeira) {
        return res.json({
          success: true,
          message: 'Nenhuma tarefa disponível para distribuição.',
          distribuidos: 0,
          tarefas: []
        });
      }
      
      let tarefas = [primeira];
      
      // Demais tarefas (apenas quando quantidade > 1): seleção aleatória
      if (quantidade > 1) {
        const demaisQuery = `
          SELECT h.cod_tarefa, h.data_de_historico, h.nome_tarefa, h.para_etapa, h.de_etapa
          ${baseFrom}
            AND h.cod_tarefa <> $1
          ORDER BY RANDOM()
          LIMIT $2
        `;
        const demaisResult = await pool.query(demaisQuery, [primeira.cod_tarefa, quantidade - 1]);
        tarefas = tarefas.concat(demaisResult.rows);
      }
      
      // Buscar nome do usuário destino
      let destinoNome = String(usuario_id);
      try {
        const uRes = await pool.query('SELECT nome FROM db_automacao.usuarios WHERE id = $1', [usuario_id]);
        if (uRes.rows.length > 0) destinoNome = uRes.rows[0].nome;
      } catch {}
      
      let count = 0;
      let errors = [];
      const distribuidos = [];
      
      for (let i = 0; i < tarefas.length; i++) {
        const tarefa = tarefas[i];
        try {
          // Verificar se já não foi distribuída entre a consulta e agora
          let anotacao = '';
          if (tarefa.nome_tarefa || tarefa.para_etapa) {
            anotacao = `Origem: h_x_h | Tarefa: ${tarefa.nome_tarefa || ''} | Etapa: ${tarefa.para_etapa || tarefa.de_etapa || ''}`;
          }
          
          // Ajustar data_historico: 1ª = valor original, demais = cotação anterior + 1h
          let dataHistorico = null;
          if (i === 0) {
            dataHistorico = tarefa.data_de_historico || null;
          } else {
            const anteriorSalvo = distribuidos.length > 0 ? distribuidos[distribuidos.length - 1].data_historico : null;
            dataHistorico = somarHorasDataHistorico(anteriorSalvo || tarefa.data_de_historico, 1);
          }
          
          // Inserção atômica: tarefa + data_historico nunca duplicada.
          const inserido = await inserirDistribuicaoAtomica(pool, {
            tarefa: tarefa.cod_tarefa,
            cotacao: tarefa.cod_tarefa,
            anotacao,
            agora: now,
            usuarioLogin,
            usuarioId: usuario_id,
            origem: 'h_x_h',
            dataHistorico,
          });

          if (!inserido) {
            errors.push({ cod_tarefa: tarefa.cod_tarefa, error: 'Tarefa já distribuída para este data_historico' });
            continue;
          }
          
          // Registrar auditoria
          await registrarAuditoria(pool, {
            tarefa: tarefa.cod_tarefa,
            acao: 'distribuido_h_x_h',
            usuario_origem_id: req.user.id,
            usuario_origem_nome: req.user.nome || usuarioLogin,
            usuario_destino_id: usuario_id,
            usuario_destino_nome: destinoNome,
            status_anterior: null,
            status_novo: 'pendente',
            criado_por: usuarioLogin
          });
          
          count++;
          distribuidos.push({
            cod_tarefa: tarefa.cod_tarefa,
            data_historico: dataHistorico
          });
        } catch (err) {
          errors.push({ cod_tarefa: tarefa.cod_tarefa, error: err.message });
        }
      }
      
      res.json({
        success: true,
        message: `${count} tarefa(s) distribuída(s) para ${destinoNome}`,
        distribuidos: count,
        tarefas: distribuidos,
        erros: errors
      });
      
    } catch (error) {
      console.error('[DISTRIBUIR_AUTO_H_X_H] Erro:', error);
      res.status(500).json({ error: `Erro ao distribuir tarefas: ${error.message}` });
    }
  });

// ===== PEGAR EXTRA (colaborador) =====
  // Mapear la "ilha" del colaborador a las filas disponibles
  function filasPorIlha(ilha) {
    const u = String(ilha || '').toLowerCase();
    const filas = [];
    if (u.includes('ins')) filas.push({ origen: 'r_000250', etiqueta: 'Inspeção' });
    if (u.includes('top')) filas.push({ origen: 'iw_cpc_975_top', etiqueta: 'Input TOP' });
    if (u.includes('net')) filas.push({ origen: 'iw_cpc_975_net', etiqueta: 'Input NET' });
    if (u.includes('hotel') || u.includes('hot') || u.includes('hosp')) filas.push({ origen: 'h_x_h', etiqueta: 'Hoteis' });
    return filas;
  }

  function etiquetaPorOrigen(origen) {
    switch (origen) {
      case 'r_000250': return 'Inspeccion';
      case 'iw_cpc_975_top': return 'Input TOP';
      case 'iw_cpc_975_net': return 'Input NET';
      case 'h_x_h': return 'Hoteis';
      default: return origen;
    }
  }

  // Filas (origenes) del colaborador autenticado: para boton y modal
  const handlerMisFilas = async (req, res) => {
    try {
      const userId = req.user.id;
      const usuarioLogin = req.user.username;

      const ilhaRes = await pool.query(
        `SELECT DISTINCT ilha FROM db_gp.listafuncionarios WHERE login = $1 AND ativo = true ORDER BY ilha`,
        [usuarioLogin]
      );
      const ilhas = ilhaRes.rows.map(r => r && r.ilha).filter(Boolean);

      const filasMap = new Map();
      const agregarFila = (f) => { if (!filasMap.has(f.origen)) filasMap.set(f.origen, f.etiqueta); };
      for (const ilha of ilhas) filasPorIlha(ilha).forEach(f => agregarFila(f));

      if (filasMap.size === 0) {
        ['r_000250', 'iw_cpc_975_top', 'iw_cpc_975_net', 'h_x_h'].forEach((o) => {
          agregarFila({ origen: o, etiqueta: etiquetaPorOrigen(o) });
        });
      }

      const origenesRes = await pool.query(
        `SELECT DISTINCT origem FROM db_bloco_de_notas.cotacao WHERE usuario_id::text = $1 AND validacao = 'Ativo' AND origem != ''`,
        [String(userId)]
      );
      const origenesUsado = origenesRes.rows.map(r => r.origem).filter(Boolean);

      const filas = [...filasMap.entries()].map(([origen, etiqueta]) => ({ origen, etiqueta }));
      filas.sort((a, b) => {
        const aUsa = origenesUsado.includes(a.origen) ? 0 : 1;
        const bUsa = origenesUsado.includes(b.origen) ? 0 : 1;
        return (aUsa - bUsa) || (a.origen.localeCompare(b.origen));
      });

      res.json({ ilhas, filas, filas_con_cotizaciones: origenesUsado });
    } catch (error) {
      console.error('[MIS_FILAS] Error:', error);
      res.status(500).json({ error: 'Erro ao carregar filas.' });
    }
  };
router.get('/api/inspecao/mis-filas', authenticateToken, handlerMisFilas);
  router.get('/pme_notas/api/inspecao/mis-filas', authenticateToken, handlerMisFilas);
// Devuelve la tarea mas antigua (SLA) de la fila seleccionada
  async function obtenerTareaMasAntigua(pool, origen) {
    if (origen === 'r_000250') {
      const res = await pool.query(`
        SELECT r.cod_tarefa AS cod_tarefa, r.dat_historico, r.nom_tarefa, r.nom_fila, r.dsc_cotacao
        FROM db_bloco_de_notas.r_000250 r
        LEFT JOIN db_bloco_de_notas.cotacao c ON r.cod_tarefa = c.tarefa AND c.validacao = 'Ativo'
        WHERE (c.tarefa IS NULL OR c.status IS NULL OR c.status = '')
          AND NOT EXISTS (
            SELECT 1 FROM db_bloco_de_notas.cotacao c2
             WHERE c2.tarefa = r.cod_tarefa
               AND c2.validacao = 'Ativo'
               AND c2.data_historico IS NOT DISTINCT FROM NULLIF(r.dat_historico, '-')::timestamp
          )
          AND (r.pendente_com IS NULL OR r.pendente_com = '' OR r.pendente_com = '-')
        ORDER BY
          ${PRIORIDADE_FILA_SQL},
          CASE WHEN r.dat_historico IS NULL OR r.dat_historico = '-' THEN 1 ELSE 0 END,
          r.dat_historico::timestamp ASC NULLS LAST,
          r.dat_criacao ASC
        LIMIT 1`);
      const f = res.rows[0];
      if (!f) return null;
      return { cod_tarefa: f.cod_tarefa, cotacao: f.cod_tarefa, data_historico: f.dat_historico || null, nom_fila: f.nom_fila, nom_tarefa: f.nom_tarefa };
    }
    if (origen === 'iw_cpc_975_top') {
      const res = await pool.query(`
        SELECT COALESCE(iw.codigo_da_tarefa,'') AS cod_tarefa, iw.data_historico, iw.etapa_atual
        FROM db_bloco_de_notas.iw_cpc_975_top iw
        LEFT JOIN db_bloco_de_notas.cotacao c ON iw.codigo_da_tarefa = c.tarefa
          AND c.validacao = 'Ativo'
          AND NULLIF(iw.data_historico, '-')::timestamp = c.data_historico
        WHERE (c.tarefa IS NULL OR c.status IS NULL OR c.status = '')
          AND NOT EXISTS (
            SELECT 1 FROM db_bloco_de_notas.cotacao c2
             WHERE c2.tarefa = iw.codigo_da_tarefa
               AND c2.validacao = 'Ativo'
               AND c2.data_historico IS NOT DISTINCT FROM NULLIF(iw.data_historico, '-')::timestamp
          )
          AND iw.etapa_atual ILIKE '01%'
        ORDER BY
          CASE WHEN iw.data_historico IS NULL OR iw.data_historico = '-' THEN 1 ELSE 0 END,
          iw.data_historico::timestamp ASC NULLS LAST
        LIMIT 1`);
      const f = res.rows[0];
      if (!f) return null;
      return { cod_tarefa: f.cod_tarefa, cotacao: f.cod_tarefa, data_historico: f.data_historico || null, etapa_atual: f.etapa_atual };
    }
    if (origen === 'iw_cpc_975_net') {
      const res = await pool.query(`
        SELECT COALESCE(iw.codigo_da_tarefa,'') AS cod_tarefa, iw.data_historico, iw.etapa_atual
        FROM db_bloco_de_notas.iw_cpc_975_net iw
        LEFT JOIN db_bloco_de_notas.cotacao c ON iw.codigo_da_tarefa = c.tarefa
          AND c.validacao = 'Ativo'
          AND NULLIF(iw.data_historico, '-')::timestamp = c.data_historico
        WHERE (c.tarefa IS NULL OR c.status IS NULL OR c.status = '')
          AND NOT EXISTS (
            SELECT 1 FROM db_bloco_de_notas.cotacao c2
             WHERE c2.tarefa = iw.codigo_da_tarefa
               AND c2.validacao = 'Ativo'
               AND c2.data_historico IS NOT DISTINCT FROM NULLIF(iw.data_historico, '-')::timestamp
          )
          AND iw.etapa_atual ILIKE '01%'
        ORDER BY
          CASE WHEN iw.data_historico IS NULL OR iw.data_historico = '-' THEN 1 ELSE 0 END,
          iw.data_historico::timestamp ASC NULLS LAST
        LIMIT 1
      `);
      const f = res.rows[0];
      if (!f) return null;
      return { cod_tarefa: f.cod_tarefa, cotacao: f.cod_tarefa, data_historico: f.data_historico || null, etapa_atual: f.etapa_atual };
    }
    if (origen === 'h_x_h') {
      const res = await pool.query(`
        SELECT h.cod_tarefa, h.data_de_historico, h.nome_tarefa, h.para_etapa, h.de_etapa
        FROM (
          SELECT DISTINCT ON (h2.id_tarefa)
            h2.id_tarefa AS cod_tarefa, h2.data_de_historico, h2.nome_tarefa, h2.para_etapa, h2.de_etapa
          FROM db_bloco_de_notas.hoteis_x_hospitais h2
          ORDER BY h2.id_tarefa, h2.data_de_historico DESC
        ) h
        LEFT JOIN db_bloco_de_notas.cotacao c ON h.cod_tarefa = c.tarefa AND c.validacao = 'Ativo'
        WHERE (c.tarefa IS NULL OR c.status IS NULL OR c.status = '')
          AND NOT EXISTS (
            SELECT 1 FROM db_bloco_de_notas.cotacao c2
             WHERE c2.tarefa = h.cod_tarefa
               AND c2.validacao = 'Ativo'
               AND c2.data_historico IS NOT DISTINCT FROM NULLIF(h.data_de_historico, '-')::timestamp
          )
        ORDER BY
          CASE WHEN h.data_de_historico IS NULL OR h.data_de_historico = '-' THEN 1 ELSE 0 END,
          h.data_de_historico::timestamp ASC NULLS LAST
        LIMIT 1`);
      const f = res.rows[0];
      if (!f) return null;
      return { cod_tarefa: f.cod_tarefa, cotacao: f.cod_tarefa, data_historico: f.data_de_historico || null, nom_tarefa: f.nome_tarefa, para_etapa: f.para_etapa, origen: 'h_x_h' };
    }
    return null;
  }
const handlerPegarExtra = async (req, res) => {
    try {
      const userId = req.user.id;
      const usuarioLogin = req.user.username;
      const usuarioNom = req.user.nome || usuarioLogin;
      const ahora = formatDateBR(new Date());
      const origReq = (req.body && req.body.origen) ? String(req.body.origen).trim() : null;

      // No permitir si ya tiene pedidos pendientes
      const pendRes = await pool.query(
        `SELECT COUNT(DISTINCT cot.id_cotacao) AS total
         FROM db_bloco_de_notas.cotacao cot
         WHERE cot.usuario_id::text = $1 AND cot.validacao = 'Ativo'
           AND (cot.status IS NULL OR cot.status = '' OR lower(cot.status) LIKE 'pendent%')`,
        [String(userId)]
      );
      if (parseInt(pendRes.rows[0].total || 0) > 0) {
        return res.status(400).json({ success: false, error: 'Você já tem pedidos pendentes. Termine os que tem antes de pegar outro.' });
      }

      // Determinar la fila (origen) a usar
      let filaElegida = origReq;
      if (!filaElegida) {
        const ilhaRes = await pool.query(
          `SELECT DISTINCT ilha FROM db_gp.listafuncionarios WHERE login = $1 AND ativo = true LIMIT 1`,
          [usuarioLogin]
        );
        const ilha = (ilhaRes.rows[0] && ilhaRes.rows[0].ilha) || '';
        const candFilas = filasPorIlha(ilha);
        const usados = await pool.query(
          `SELECT DISTINCT origem FROM db_bloco_de_notas.cotacao WHERE usuario_id::text = $1 AND validacao = 'Ativo' AND origem != ''`,
          [String(userId)]
        );
        const origenesUsados = usados.rows.map(r => r.origem).filter(Boolean);
        const prio = candFilas.filter(c => origenesUsados.includes(c.origen));
        if (prio.length > 0) filaElegida = prio[0].origen;
        else if (candFilas.length === 1) filaElegida = candFilas[0].origen;
        else if (candFilas.length > 1) {
          const x = candFilas.find(c => origenesUsados.includes(c.origen));
          filaElegida = x ? x.origen : candFilas[0].origen;
        } else if (origenesUsados.length >= 1) {
          filaElegida = origenesUsados[0];
        }
      }

      if (!filaElegida) {
        return res.status(400).json({ success: false, error: 'Não foi possível determinar a fila da sua ilha. Contate o supervisor.' });
      }

      const tarea = await obtenerTareaMasAntigua(pool, filaElegida);
      if (!tarea) {
        return res.json({ success: true, message: 'Não há mais tarefas na fila ' + etiquetaPorOrigen(filaElegida) + '.', cantidad: 1, distribuidos: 0 });
      }

      let anotacion = '';
      if (filaElegida === 'r_000250') {
        anotacion = 'Tarea: ' + (tarea.nom_tarefa || '') + ' | Fila: ' + (tarea.nom_fila || '');
      } else if (filaElegida === 'iw_cpc_975_top' || filaElegida === 'iw_cpc_975_net') {
        anotacion = 'Origen: ' + filaElegida + ' | Etapa: ' + (tarea.etapa_atual || '');
      } else if (filaElegida === 'h_x_h') {
        anotacion = 'Origen: h_x_h | Tarea: ' + (tarea.nom_tarefa || '') + ' | Etapa: ' + (tarea.para_etapa || '');
      }

      // Inserção atômica: tarefa + data_historico nunca duplicada (evita corrida).
      const inserido = await inserirDistribuicaoAtomica(pool, {
        tarefa: tarea.cod_tarefa,
        cotacao: tarea.cotacao || tarea.cod_tarefa,
        anotacao: anotacion,
        validacao: 'Ativo',
        agora: ahora,
        usuarioLogin,
        usuarioId: userId,
        origem: filaElegida,
        dataHistorico: tarea.data_historico || null,
      });

      if (!inserido) {
        return res.status(409).json({ success: false, error: 'A tarefa ' + tarea.cod_tarefa + ' já foi pega. Tente novamente.' });
      }

      registrarAuditoria(pool, {
        tarefa: tarea.cod_tarefa,
        acao: 'tomado_extra_' + filaElegida,
        usuario_origem_id: userId,
        usuario_origem_nome: usuarioNom,
        usuario_destino_id: userId,
        usuario_destino_nome: usuarioNom,
        status_anterior: null,
        status_nuevo: 'pendente',
        criado_por: usuarioLogin
      });

      res.json({ success: true, message: 'Você pegou 1 tarefa a mais da fila ' + etiquetaPorOrigen(filaElegida) + '.', cantidad: 1, distribuidos: 1, origen: filaElegida, tarea: tarea.cod_tarefa });
    } catch (error) {
      console.error('[PEGAR_EXTRA] Error:', error);
      res.status(500).json({ error: 'Erro ao pegar tarefa extra: ' + error.message });
    }
  };

  router.post('/api/inspecao/pegar-extra', authenticateToken, handlerPegarExtra);
  router.post('/pme_notas/api/inspecao/pegar-extra', authenticateToken, handlerPegarExtra);
  return router;
};
