const express = require('express');
const router = express.Router();

module.exports = function(pool, authenticateToken, authorizeRoute, formatDateBR, path, fs) {

  // ===== DASHBOARD HOTEIS E HOSPITAIS =====

  // API Dashboard Hoteis e Hospitais
  router.get('/dashboard', authenticateToken, async (req, res) => {
    try {
      const { data } = req.query;
      const params = [];
      let whereData = '';
      if (data && data.trim()) {
        whereData = ` AND to_date(LEFT(c.data_de_criacao,10),'dd/MM/yyyy') = to_date($${params.length + 1},'dd/MM/yyyy')`;
        params.push(data.trim());
      }

      // 1. Produtividade por colaborador (filtrado por ilha = 'INPUT NET' - mesmos colaboradores do input_net)
      const query = `
        SELECT 
          l.login AS usuario_login,
          l.nome AS usuario_nome,
          COUNT(DISTINCT c.tarefa) AS total,
          COUNT(DISTINCT c.tarefa) FILTER (WHERE c.status IS NULL OR c.status = '') AS pendentes,
          COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(c.status) = 'pendente') AS pendente_simples,
          COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(c.status) = 'pendente-classificacao') AS pendente_classificacao,
          COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(c.status) = 'pendente-iphone') AS pendente_iphone,
          COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(c.status) = 'pendente-iphone-aprovado') AS pendente_iphone_aprovado,
          COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(c.status) = 'pendente-iphone-reprovado') AS pendente_iphone_reprovado,
          COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(c.status) = 'pendente-qualidade' OR LOWER(c.status) = 'pendente-qualidade/suporte') AS pendente_qualidade,
          COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(c.status) = 'pendente-correcao-cadastral') AS pendente_correcao_cadastral,
          COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(c.status) = 'pendente-correcao-efetuada') AS pendente_correcao_efetuada,
          COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(c.status) = 'pendente-suporte') AS pendente_suporte,
          COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(c.status) = 'aprovado') AS aprovados,
          COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(c.status) = 'reprovado') AS reprovados
        FROM db_gp.listafuncionarios l
        RIGHT JOIN db_automacao.usuarios u ON u.login = l.login
        left join db_bloco_de_notas.cotacao c 
          on c.usuario_id::text = u.id::text AND c.validacao = 'Ativo' AND c.origem = 'h_x_h'
        WHERE l.ilha = 'INPUT NET' AND l.ativo = true${whereData}
        GROUP BY l.login, l.nome
        ORDER BY l.nome
      `;

      const result = await pool.query(query, params);

      const colaboradores = [];
      for (const row of result.rows) {
        let slaHoras = null;
        try {
          const slaParams = [row.usuario_login];
          let slaWhereData = '';
          if (data && data.trim()) {
            slaWhereData = ` AND to_date(LEFT(c.data_de_criacao,10),'dd/MM/yyyy') = to_date(${slaParams.length + 1},'dd/MM/yyyy')`;
            slaParams.push(data.trim());
          }
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
              AND c.origem = 'h_x_h'
              AND c.status IS NOT NULL AND c.status != '' AND c.status != 'pendente'
              AND LOWER(c.status) IN ('aprovado', 'reprovado', 'pendente-classificacao', 'pendente-iphone', 'pendente-iphone-aprovado', 'pendente-iphone-reprovado', 'pendente-qualidade', 'pendente-qualidade/suporte', 'pendente-correcao-cadastral', 'pendente-correcao-efetuada', 'pendente-suporte')${slaWhereData}
          `, slaParams);
          slaHoras = slaRes.rows[0]?.sla_medio ? parseFloat(slaRes.rows[0].sla_medio).toFixed(1) : null;
        } catch (slaErr) {
          console.error('[DASHBOARD_H_X_H SLA] Erro para usuario', row.usuario_login, ':', slaErr.message);
        }

        const statusCounts = {
          'pendente': parseInt(row.pendentes) + parseInt(row.pendente_simples || 0),
          'pendente-classificacao': parseInt(row.pendente_classificacao || 0),
          'pendente-iphone': parseInt(row.pendente_iphone || 0),
          'pendente-iphone-aprovado': parseInt(row.pendente_iphone_aprovado || 0),
          'pendente-iphone-reprovado': parseInt(row.pendente_iphone_reprovado || 0),
          'pendente-qualidade': parseInt(row.pendente_qualidade || 0),
          'pendente-correcao-cadastral': parseInt(row.pendente_correcao_cadastral || 0),
          'pendente-correcao-efetuada': parseInt(row.pendente_correcao_efetuada || 0),
          'pendente-suporte': parseInt(row.pendente_suporte || 0),
          'aprovado': parseInt(row.aprovados || 0),
          'reprovado': parseInt(row.reprovados || 0)
        };

        const total = parseInt(row.total);

        colaboradores.push({
          usuario_id: null,
          usuario_nome: row.usuario_nome,
          usuario_login: row.usuario_login,
          statusCounts,
          total,
          sla_medio: slaHoras ? slaHoras + 'h' : '-'
        });
      }

      colaboradores.sort((a, b) => {
        if (a.pendentes > 0 && b.pendentes === 0) return -1;
        if (a.pendentes === 0 && b.pendentes > 0) return 1;
        return a.usuario_nome.localeCompare(b.usuario_nome);
      });

      // 2. Stats da tabela hoteis_x_hospitais
      let statsHXH = { em_tratamento: 0, aprovado: 0, reprovado: 0, pendente: 0, cancelado: 0 };
      try {
        const statsRes = await pool.query(`
          WITH foto_recente AS (
            SELECT DISTINCT ON (h.id_tarefa) h.id_tarefa, h.de_etapa, h.para_etapa, h.acao, h.data_de_historico
            FROM db_bloco_de_notas.hoteis_x_hospitais h
            ORDER BY h.id_tarefa, h.data_de_historico DESC
          )
          SELECT 
            COUNT(DISTINCT CASE WHEN (foto_recente.de_etapa ILIKE '%Abert%' AND foto_recente.para_etapa ILIKE '%Vistoria%') THEN foto_recente.id_tarefa END) as em_tratamento,
            COUNT(DISTINCT CASE WHEN (foto_recente.para_etapa ILIKE '%Conclu%' OR foto_recente.para_etapa ILIKE '%Aprovad%') THEN foto_recente.id_tarefa END) as aprovado,
            COUNT(DISTINCT CASE WHEN (foto_recente.para_etapa ILIKE '%Reprov%' OR foto_recente.para_etapa ILIKE '%Cancel%') THEN foto_recente.id_tarefa END) as reprovado,
            COUNT(DISTINCT CASE WHEN (foto_recente.de_etapa ILIKE '%Abert%' AND foto_recente.para_etapa ILIKE '%Vistoria%') THEN foto_recente.id_tarefa END) as pendente,
            COUNT(DISTINCT CASE WHEN (foto_recente.acao ILIKE 'Cancelar' OR foto_recente.para_etapa ILIKE '%Cancel%') THEN foto_recente.id_tarefa END) as cancelado
          FROM foto_recente
        `);
        if (statsRes.rows.length > 0) {
          statsHXH = {
            em_tratamento: parseInt(statsRes.rows[0].em_tratamento || 0),
            aprovado: parseInt(statsRes.rows[0].aprovado || 0),
            reprovado: parseInt(statsRes.rows[0].reprovado || 0),
            pendente: parseInt(statsRes.rows[0].pendente || 0),
            cancelado: parseInt(statsRes.rows[0].cancelado || 0)
          };
        }
      } catch (statsErr) {
        console.error('[DASHBOARD_H_X_H STATS] Erro:', statsErr.message);
      }

      res.json({ colaboradores, stats: statsHXH });
    } catch (error) {
      console.error('[DASHBOARD_H_X_H] Erro:', error);
      res.status(500).json({ error: 'Erro ao carregar dashboard hoteis e hospitais' });
    }
  });

  // Serve h_x_h dashboard page
  router.get('/dashboard-page', authenticateToken, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'dashboard_h_x_h.html'));
  });

  // Listar usuários (reaproveitado)
  router.get('/usuarios', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id, login, nome FROM db_automacao.usuarios WHERE ativo = true ORDER BY nome'
      );
      res.json(result.rows);
    } catch (error) {
      console.error('[H_X_H USUARIOS] Erro:', error);
      res.status(500).json({ error: 'Erro ao buscar usuários' });
    }
  });

  // Histórico de movimentações
  router.get('/historico', authenticateToken, async (req, res) => {
    try {
      const { tarefa, limit = 100, offset = 0 } = req.query;

      let query = `
        SELECT a.*, 
          u_orig.nome AS origem_nome,
          u_dest.nome AS destino_nome
        FROM db_bloco_de_notas.cotacao_audit a
        INNER JOIN db_bloco_de_notas.cotacao c ON a.tarefa = c.tarefa
        LEFT JOIN db_automacao.usuarios u_orig ON a.usuario_origem_id = u_orig.id
        LEFT JOIN db_automacao.usuarios u_dest ON a.usuario_destino_id = u_dest.id
        WHERE c.origem = 'h_x_h'
      `;
      let params = [];
      let conditions = [];

      if (tarefa) {
        params.push(tarefa);
        conditions.push(`a.tarefa = $${params.length}`);
      }

      if (conditions.length > 0) {
        query += ' AND ' + conditions.join(' AND ');
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
      console.error('[H_X_H HISTORICO] Erro:', error);
      res.status(500).json({ error: 'Erro ao carregar histórico' });
    }
  });

  return router;
};