const express = require('express');
const router = express.Router();
const { asDeps } = require('../app/route_deps');

// ROTAS DE QUALIDADE (auditoria_qualidade) - canonicas, deduplicadas.
// Montado em /api e /pme_notas/api.

module.exports = function (pool, authenticateToken, formatDateBR, calcularSemana) {
  const deps = asDeps(arguments, ['pool', 'authenticateToken', 'formatDateBR', 'calcularSemana']);
  pool = deps.pool; authenticateToken = deps.authenticateToken;
  formatDateBR = deps.formatDateBR; calcularSemana = deps.calcularSemana;

  router.get('/qualidade', authenticateToken, async (req, res) => {
    try {
      const { search, dateStart, month, origem } = req.query;
      const params = [];
      let paramIndex = 1;
      const normalizedSearch = search && search.trim() ? search.trim() : '';
      const hasSearch = Boolean(normalizedSearch);
      // Conversão segura de data (text): aceita dd/MM/yyyy e ISO 8601 (origem 'cortesia').
      // Base de data canônica = data_qualidade da auditoria (tabela auditoria_qualidade),
      // alinhada ao /api/reports (WHERE aq.data_qualidade) e ao calendário. Cai para
      // data_de_criacao quando ainda não há auditoria (id_qldd nulo).
      // data_qualidade é timestamp: usa-se (data_qualidade)::date para comparar só o dia.
      const DATA_BASE_SQL = `COALESCE(
        (SELECT (aq0.data_qualidade)::date FROM db_bloco_de_notas.auditoria_qualidade aq0 WHERE aq0.id_qldd = c.id_qldd),
        CASE
        WHEN c.data_de_criacao ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}' THEN TO_DATE(LEFT(c.data_de_criacao, 10), 'DD/MM/YYYY')
        WHEN c.data_de_criacao ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN TO_DATE(LEFT(c.data_de_criacao, 10), 'YYYY-MM-DD')
        ELSE NULL END)`;
      let innerQuery = `
        SELECT DISTINCT ON (c.usuario_id, ${DATA_BASE_SQL}) 
          c.id_cotacao, c.cotacao, c.tarefa, c.anotacao, c.status, c.validacao, 
          c.data_de_criacao, c.data_da_ultima_atualizacao, c.usuario_login, 
          c.usuario_id, c.origem, c.id_qldd,
          TRIM(COALESCE(u.nome, '') || ' ' || COALESCE(u.sobrenome, '')) as usuario_nome
        FROM db_bloco_de_notas.cotacao c 
        LEFT JOIN db_automacao.usuarios u ON u.id::TEXT = c.usuario_id::TEXT
        WHERE c.validacao = 'Ativo'`;
  
      if (hasSearch) {
        innerQuery += ` AND (
          LOWER(COALESCE(c.tarefa, '')) LIKE LOWER($${paramIndex})
          OR LOWER(COALESCE(c.cotacao, '')) LIKE LOWER($${paramIndex})
          OR LOWER(COALESCE(c.usuario_login, '')) LIKE LOWER($${paramIndex})
          OR LOWER(TRIM(COALESCE(u.nome, '') || ' ' || COALESCE(u.sobrenome, ''))) LIKE LOWER($${paramIndex})
        )`;
        params.push(`%${normalizedSearch}%`);
        paramIndex++;
      }
  
      if (!hasSearch) {
        if (month && /^\d{4}-\d{2}$/.test(month.trim())) {
          const [mYear, mMonth] = month.trim().split('-').map(Number);
          innerQuery += ` AND EXTRACT(YEAR FROM ${DATA_BASE_SQL}) = $${paramIndex} AND EXTRACT(MONTH FROM ${DATA_BASE_SQL}) = $${paramIndex + 1}`;
          params.push(mYear, mMonth);
          paramIndex += 2;
        } else if (dateStart && /^\d{4}-\d{2}-\d{2}$/.test(dateStart.trim())) {
          // Visão diária também alinhada à data_qualidade: compara a data-base
          // (data_qualidade da auditoria, ou data_de_criacao se sem auditoria).
          const [dYear, dMonth, dDay] = dateStart.trim().split('-').map(Number);
          innerQuery += ` AND ${DATA_BASE_SQL} = make_date($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2})`;
          params.push(dYear, dMonth, dDay);
          paramIndex += 3;
        } else {
          const effectiveDate = dateStart || new Date().toISOString().split('T')[0];
          const [year, monthDay, day] = effectiveDate.split('-');
          const dateStartBR = `${day}/${monthDay}/${year}`;
          innerQuery += ` AND c.data_de_criacao LIKE $${paramIndex}`;
          params.push(`${dateStartBR}%`);
          paramIndex++;
        }
      }
  
      if (!hasSearch && origem && origem.trim() && origem !== 'todas') {
        if (origem === 'r_000250') {
          innerQuery += ` AND (
            c.origem = 'r_000250'
            OR (
              (c.origem IS NULL OR c.origem = '')
              AND NOT EXISTS (SELECT 1 FROM db_bloco_de_notas.iw_cpc_975_net inet WHERE inet.codigo_da_tarefa = c.tarefa)
              AND NOT EXISTS (SELECT 1 FROM db_bloco_de_notas.iw_cpc_975_top itop WHERE itop.codigo_da_tarefa = c.tarefa)
              AND NOT EXISTS (SELECT 1 FROM db_bloco_de_notas.hoteis_x_hospitais hh WHERE hh.id_tarefa = c.tarefa)
            )
          )`;
        } else {
          innerQuery += ` AND c.origem = $${paramIndex}`;
          params.push(origem.trim());
          paramIndex++;
          // Para os filtros TOP e NET exibe apenas cotações com qtd_linhas < 3.
          if (origem.trim() === 'iw_cpc_975_top' || origem.trim() === 'iw_cpc_975_net') {
            innerQuery += ` AND c.qtd_linhas < 3::int`;
          }
        }
      }
  
      if (!hasSearch) {
        const statusFilter = req.query.status && req.query.status.trim() ? req.query.status.trim() : '';
        if (statusFilter) {
          if (statusFilter.toLowerCase() === 'dia' || statusFilter.toLowerCase() === 'base') {
            // Visao base (dia do calendario OU mes da pagina mensal): reprovadas +
            // TODAS as auditadas do recorte, independente do status. Mesma base do
            // calendario. UNICO modo com OR id_qldd — preserva o batimento
            // calendario x tabela x mensal.
            innerQuery += ` AND (LOWER(c.status) = 'reprovado' OR c.id_qldd IS NOT NULL)`;
          } else if (statusFilter.toLowerCase() === 'todos' || statusFilter.toLowerCase() === 'todas') {
            // Sem filtro de status: mostra tudo.
          } else {
            // Filtro manual do usuario (reprovado/aprovado/pendente/...): ESTRITO,
            // somente o status da cotacao. Sem OR id_qldd para aprovada nao
            // vazar no filtro "reprovadas" e vice-versa.
            innerQuery += ` AND LOWER(c.status) = LOWER($${paramIndex})`;
            params.push(statusFilter);
            paramIndex++;
          }
        }
      }
  
      // DISTINCT ON (usuario_id, data_base): prioriza de forma deterministica a
      // linha auditada (id_qldd NOT NULL) e, em empate, a mais recente — sem
      // RANDOM() para a auditada nao perder o sorteio e sumir da tabela.
      innerQuery += " ORDER BY c.usuario_id, " + DATA_BASE_SQL + ", CASE WHEN c.id_qldd IS NOT NULL THEN 0 ELSE 1 END, c.id_cotacao DESC";
  
      const query = `SELECT * FROM (${innerQuery}) as subquery ORDER BY CASE WHEN subquery.id_qldd IS NOT NULL THEN 0 ELSE 1 END, subquery.data_de_criacao DESC`;
  
      const result = await pool.query(query, params);
  
      // Para cada cotação, verificar se já existe auditoria
      const rows = await Promise.all(result.rows.map(async (row) => {
        let auditoria = null;
        try {
          const auditRes = await pool.query(
            `SELECT aq.anotacao, aq.status, aq.reprova_bko, aq.apontamento,
                    aq.tipo_apontamento,
                    aq.motivo_1_sistema_documento, aq.motivo_2_erro, aq.motivo_3_detalhamento,
                    aq.contestacao, aq.obs, aq.regional, aq.tipo_de_pedido,
                    aq.enviado, aq.data_envio, aq.data_qualidade, aq.semana, aq.analista
             FROM db_bloco_de_notas.auditoria_qualidade aq
             LEFT JOIN db_bloco_de_notas.cotacao c ON c.id_qldd = aq.id_qldd
             WHERE c.id_cotacao = $1`,
            [row.id_cotacao]
          );
          if (auditRes.rows.length > 0) {
            const a = auditRes.rows[0];
            auditoria = {
              anotacao: a.anotacao,
              status: a.status,
              reprova_bko: a.reprova_bko,
              tipo_apontamento: a.tipo_apontamento,
              apontamento: a.apontamento,
              motivo_1_sistema_documento: a.motivo_1_sistema_documento,
              motivo_2_erro: a.motivo_2_erro,
              motivo_3_detalhamento: a.motivo_3_detalhamento,
              contestacao: a.contestacao,
              obs: a.obs,
              regional: a.regional,
              tipo_de_pedido: a.tipo_de_pedido,
              enviado: a.enviado,
              data_envio: a.data_envio,
              data_qualidade: a.data_qualidade,
              semana: a.semana,
              analista: a.analista
            };
          }
        } catch (e) {
          // Tabela pode não existir ainda
        }
  
        return {
          id_cotacao: row.id_cotacao,
          tarefa: row.tarefa,
          cotacao: row.cotacao,
          anotacao: row.anotacao,
          status: row.status,
          validacao: row.validacao,
          data_de_criacao: formatDateBR(row.data_de_criacao),
          data_da_ultima_atualizacao: formatDateBR(row.data_da_ultima_atualizacao),
          usuario_login: row.usuario_login,
          usuario_nome: row.usuario_nome || null,
          usuario_id: row.usuario_id,
          origem: row.origem || null,
          auditoria
        };
      }));
  
      res.json(rows);
    } catch (error) {
      console.error('[QUALIDADE] Erro ao listar cotações:', error);
      res.status(500).json({ error: 'Erro ao listar cotações para auditoria' });
    }
  });

  router.post('/qualidade/auditar', authenticateToken, async (req, res) => {
    try {
      const { id_cotacao, anotacao, status } = req.body;
  
      if (!id_cotacao) {
        return res.status(400).json({ error: 'ID da cotação é obrigatório' });
      }
  
      if (!status) {
        return res.status(400).json({ error: 'Status é obrigatório' });
      }
  
      const statusPermitidos = ['Procedimento Correto', 'Devolução Parcial', 'Devolução Indevida', 'Reprova Parcial', 'Reprova Indevida', 'Aprovacao Indevida', 'Aprovação Indevida - Qualidade', 'RCV', 'Erro Interno - Inspeção', 'Apontamento RCV'];
      if (!statusPermitidos.includes(status)) {
        return res.status(400).json({ error: 'Status inválido' });
      }
  
      // Verificar se já existe auditoria para esta cotação
      const cotacaoRow = await pool.query(
        'SELECT id_qldd FROM db_bloco_de_notas.cotacao WHERE id_cotacao = $1',
        [id_cotacao]
      );
      const idQldd = cotacaoRow.rows.length > 0 ? cotacaoRow.rows[0].id_qldd : null;
  
      if (idQldd) {
        await pool.query(
          'UPDATE db_bloco_de_notas.auditoria_qualidade SET anotacao = $1, status = $2 WHERE id_qldd = $3',
          [anotacao || '', status, idQldd]
        );
      } else {
        const insertAudit = await pool.query(
          'INSERT INTO db_bloco_de_notas.auditoria_qualidade (anotacao, status) VALUES ($1, $2) RETURNING id_qldd',
          [anotacao || '', status]
        );
        const newIdQldd = insertAudit.rows[0].id_qldd;
        await pool.query(
          'UPDATE db_bloco_de_notas.cotacao SET id_qldd = $1 WHERE id_cotacao = $2',
          [newIdQldd, id_cotacao]
        );
      }
  
      res.json({
        success: true,
        message: 'Auditoria salva com sucesso',
        id_cotacao,
        anotacao: anotacao || '',
        status
      });
    } catch (error) {
      console.error('[QUALIDADE] Erro ao salvar auditoria:', error);
      res.status(500).json({ error: 'Erro ao salvar auditoria' });
    }
  });

  router.post('/qualidade/auditar-completo', authenticateToken, async (req, res) => {
      try {
          const rawBody = req.body;
          const { id_cotacao, tipo_apontamento, reprova_bko, apontamento, contestacao, obs, regional, tipo_de_pedido, enviado, data_envio, status } = rawBody;
          // Se Motivo 1 for "Isento", forçar Motivo 2 e Motivo 3 como "Isento"
          const isIsento = rawBody.motivo_1_sistema_documento === 'Isento';
          let motivo_1_sistema_documento = rawBody.motivo_1_sistema_documento || '';
          let motivo_2_erro = rawBody.motivo_2_erro || '';
          let motivo_3_detalhamento = rawBody.motivo_3_detalhamento || '';
          if (isIsento) {
              motivo_2_erro = 'Isento';
              motivo_3_detalhamento = 'Isento';
          }
          const usuarioLogadoId = req.user.id;
  
          if (!id_cotacao) {
              return res.status(400).json({ error: 'ID da cotação é obrigatório' });
          }
          if (!status) {
              return res.status(400).json({ error: 'Status é obrigatório' });
          }
          const statusPermitidos = ['Procedimento Correto', 'Devolução Parcial', 'Devolução Indevida', 'Reprova Parcial', 'Reprova Indevida', 'Aprovacao Indevida', 'Aprovação Indevida - Qualidade', 'RCV', 'Erro Interno - Inspeção', 'Apontamento RCV'];
          if (!statusPermitidos.includes(status)) {
              return res.status(400).json({ error: 'Status inválido' });
          }
  
          const cotacaoRow = await pool.query(
              'SELECT tarefa, cotacao, usuario_id, data_de_criacao FROM db_bloco_de_notas.cotacao WHERE id_cotacao = $1',
              [id_cotacao]
          );
          if (cotacaoRow.rows.length === 0) {
              return res.status(404).json({ error: 'Cotação não encontrada' });
          }
          const cotacao = cotacaoRow.rows[0];
          const analistaRes = await pool.query(
              "SELECT TRIM(COALESCE(nome, '') || ' ' || COALESCE(sobrenome, '')) as nome FROM db_automacao.usuarios WHERE id::TEXT = $1",
              [usuarioLogadoId]
          );
          const analistaNome = analistaRes.rows.length > 0 ? analistaRes.rows[0].nome : null;
  
          const now = new Date();
          const parseBRDate = (value) => {
              if (!value) return now;
              const text = String(value).trim();
              if (!text) return now;
              const m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}))?$/);
              if (!m) return now;
              const [ , day, month, year, hour = '00', minute = '00' ] = m;
              return new Date(`${year}-${month}-${day}T${hour}:${minute}:00`);
          };
          const dataCriacao = parseBRDate(cotacao.data_de_criacao);
          const dataQualidade = formatDateBR(dataCriacao);
          const semana = calcularSemana(dataCriacao);
          const anotacao = [reprova_bko, tipo_apontamento, apontamento].filter(Boolean).join('\n');
  
          const existingAudit = await pool.query(
              'SELECT id_qldd FROM db_bloco_de_notas.cotacao WHERE id_cotacao = $1',
              [id_cotacao]
          );
          const idQldd = existingAudit.rows.length > 0 ? existingAudit.rows[0].id_qldd : null;
  
          if (idQldd) {
              await pool.query(
                  `UPDATE db_bloco_de_notas.auditoria_qualidade SET
                      anotacao = $1, status = $2, data_qualidade = $3, analista_qualidade_id = $4,
                      reprova_bko = $5, codigo_tarefa = $6, analista = $7, data_analise = $8,
                      cotacao = $9, regional = $10, tipo_de_pedido = $11,
                      motivo_1_sistema_documento = $12, motivo_2_erro = $13, motivo_3_detalhamento = $14,
                      apontamento = $15, contestacao = $16, obs = $17, enviado = $18, data_envio = $19, semana = $20,
                      tipo_apontamento = $22
                  WHERE id_qldd = $21`,
                  [anotacao, status, dataCriacao, usuarioLogadoId, reprova_bko || '', cotacao.tarefa, analistaNome,
                   now, cotacao.cotacao, regional || '', tipo_de_pedido || '',
                   motivo_1_sistema_documento || '', motivo_2_erro || '', motivo_3_detalhamento || '',
                   apontamento || '', contestacao || '', obs || '', enviado || false,
                   data_envio ? new Date(data_envio) : null, semana, idQldd, tipo_apontamento || '']
              );
          } else {
              const insertAudit = await pool.query(
                  `INSERT INTO db_bloco_de_notas.auditoria_qualidade
                      (anotacao, status, data_qualidade, analista_qualidade_id, reprova_bko, codigo_tarefa, analista, data_analise, cotacao, regional, tipo_de_pedido, motivo_1_sistema_documento, motivo_2_erro, motivo_3_detalhamento, apontamento, contestacao, obs, enviado, data_envio, semana, tipo_apontamento)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id_qldd`,
                  [anotacao, status, dataCriacao, usuarioLogadoId, reprova_bko || '', cotacao.tarefa, analistaNome,
                   now, cotacao.cotacao, regional || '', tipo_de_pedido || '',
                   motivo_1_sistema_documento || '', motivo_2_erro || '', motivo_3_detalhamento || '',
                   apontamento || '', contestacao || '', obs || '', enviado || false,
                   data_envio ? new Date(data_envio) : null, semana, tipo_apontamento || '']
              );
              const newIdQldd = insertAudit.rows[0].id_qldd;
              await pool.query(
                  'UPDATE db_bloco_de_notas.cotacao SET id_qldd = $1 WHERE id_cotacao = $2',
                  [newIdQldd, id_cotacao]
              );
          }
  
          res.json({
              success: true,
              message: 'Auditoria salva com sucesso',
              id_cotacao,
              data_qualidade: dataQualidade,
              semana,
              status
          });
      } catch (error) {
          console.error('[QUALIDADE] Erro ao salvar auditoria:', error);
          res.status(500).json({ error: 'Erro ao salvar auditoria' });
      }
  });

  router.get('/qualidade/stats', authenticateToken, async (req, res) => {
    try {
      const usuarioId = req.user.id;
      const result = await pool.query(`
        SELECT aq.status, COUNT(*)::int as qtd
        FROM db_bloco_de_notas.auditoria_qualidade aq
        INNER JOIN db_bloco_de_notas.cotacao c ON c.id_qldd = aq.id_qldd
        WHERE c.usuario_id = $1 AND c.validacao = 'Ativo'
        GROUP BY aq.status
      `, [usuarioId]);
  
      // Contar total de RCV
      let rcvTotal = 0;
      try {
        const rcvResult = await pool.query(`
          SELECT COUNT(*)::int as total
          FROM db_qualidade.rcv rcv
          JOIN db_automacao.usuarios u ON rcv.nome = u.nome || ' ' || u.sobrenome
          WHERE u.id = $1
        `, [usuarioId]);
        rcvTotal = rcvResult.rows.length > 0 ? rcvResult.rows[0].total : 0;
      } catch (rcvErr) {
        console.error('[QUALIDADE STATS] Erro ao contar RCV:', rcvErr.message);
      }
  
      const stats = {
        total: 0,
        rcv_total: rcvTotal,
        procedimento_correto: 0,
        devolucao_parcial: 0,
        devolucao_indevida: 0,
        aprovacao_indevida: 0,
        outros: 0
      };
  
      for (const row of result.rows) {
        const qtd = parseInt(row.qtd);
        stats.total += qtd;
        const s = (row.status || '').trim().toLowerCase();
        if (s === 'procedimento correto') stats.procedimento_correto = qtd;
        else if (s === 'devolução parcial') stats.devolucao_parcial = qtd;
        else if (s === 'devolução indevida') stats.devolucao_indevida = qtd;
        else if (s === 'aprovacao indevida' || s === 'aprovação indevida') stats.aprovacao_indevida = qtd;
        else stats.outros += qtd;
      }
  
      res.json(stats);
    } catch (error) {
      console.error('[QUALIDADE STATS] Erro:', error);
      res.status(500).json({ error: 'Erro ao carregar estatísticas de qualidade' });
    }
  });

  router.get('/qualidade/auditoria/:id_cotacao', authenticateToken, async (req, res) => {
    try {
      const row = await pool.query(
        'SELECT c.id_qldd FROM db_bloco_de_notas.cotacao c WHERE c.tarefa = $1',
        [req.params.id_cotacao]
      );
      let result = { rows: [] };
      if (row.rows.length > 0 && row.rows[0].id_qldd) {
        result = await pool.query(
          'SELECT * FROM db_bloco_de_notas.auditoria_qualidade WHERE id_qldd = $1',
          [row.rows[0].id_qldd]
        );
      }
  
      if (result.rows.length === 0) {
        return res.json(null);
      }
  
      res.json({
        cotacao: result.rows[0].cotacao,
        anotacao: result.rows[0].anotacao,
        status: result.rows[0].status,
        data_leitura: result.rows[0].data_leitura || null
      });
    } catch (error) {
      console.error('[QUALIDADE] Erro ao buscar auditoria:', error);
      res.status(500).json({ error: 'Erro ao buscar auditoria' });
    }
  });

  router.post('/qualidade/auditoria/:id_cotacao/ler', authenticateToken, async (req, res) => {
    try {
      const row = await pool.query(
        'SELECT c.id_qldd FROM db_bloco_de_notas.cotacao c WHERE c.tarefa = $1',
        [req.params.id_cotacao]
      );
      if (row.rows.length === 0 || !row.rows[0].id_qldd) {
        return res.status(404).json({ error: 'Auditoria não encontrada para esta cotação' });
      }
      const idQldd = row.rows[0].id_qldd;
      await pool.query(
        'UPDATE db_bloco_de_notas.auditoria_qualidade SET data_leitura = CURRENT_TIMESTAMP WHERE id_qldd = $1',
        [idQldd]
      );
      res.json({ success: true, message: 'Auditoria marcada como lida', data_leitura: new Date() });
    } catch (error) {
      console.error('[QUALIDADE] Erro ao marcar auditoria como lida:', error);
      res.status(500).json({ error: 'Erro ao marcar auditoria como lida' });
    }
  });

  router.get('/qualidade/calendario', authenticateToken, async (req, res) => {
      try {
          const mes = parseInt(req.query.mes) || (new Date().getMonth() + 1);
          const ano = parseInt(req.query.ano) || new Date().getFullYear();
          const origem = req.query.origem && req.query.origem !== 'todos' ? req.query.origem : null;
  
          // Data-base canônica = data_qualidade da auditoria ((::date, só o dia);
          // data_qualidade é timestamp e não pode ser comparada direto com date);
          // cai para data_de_criacao quando ainda não há auditoria (id_qldd nulo).
          // Mesma expressão do GET /qualidade (lista) para calendário e tabela baterem.
          const DATA_BASE_SQL = `COALESCE(
                    (SELECT (aq0.data_qualidade)::date FROM db_bloco_de_notas.auditoria_qualidade aq0 WHERE aq0.id_qldd = c.id_qldd),
                    CASE
                      WHEN c.data_de_criacao ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}' THEN TO_DATE(LEFT(c.data_de_criacao, 10), 'DD/MM/YYYY')
                      WHEN c.data_de_criacao ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN TO_DATE(LEFT(c.data_de_criacao, 10), 'YYYY-MM-DD')
                      ELSE NULL END)`;
  
          // Total de tarefas criadas por dia no mês, considerando apenas uma tarefa por usuário por dia
          const tarefasQuery = await pool.query(`
              WITH base AS (
                  SELECT
                      c.usuario_id,
                      ${DATA_BASE_SQL} AS data_base,
                      c.id_qldd
                  FROM db_bloco_de_notas.cotacao c
                  WHERE c.validacao = 'Ativo'
                    AND EXTRACT(YEAR FROM ${DATA_BASE_SQL}) = $1
                    AND EXTRACT(MONTH FROM ${DATA_BASE_SQL}) = $2
                    ${origem === 'r_000250' ? "AND ( c.origem = 'r_000250' OR ( (c.origem IS NULL OR c.origem = '') AND NOT EXISTS (SELECT 1 FROM db_bloco_de_notas.iw_cpc_975_net inet WHERE inet.codigo_da_tarefa = c.tarefa) AND NOT EXISTS (SELECT 1 FROM db_bloco_de_notas.iw_cpc_975_top itop WHERE itop.codigo_da_tarefa = c.tarefa) AND NOT EXISTS (SELECT 1 FROM db_bloco_de_notas.hoteis_x_hospitais hh WHERE hh.id_tarefa = c.tarefa) ) )" : origem ? "AND c.origem = $3" : ""} AND (LOWER(c.status) = 'reprovado' OR c.id_qldd IS NOT NULL)
              ),
              dedup AS (
                  SELECT DISTINCT ON (usuario_id, data_base)
                      usuario_id,
                      data_base,
                      id_qldd
                  FROM base
                  ORDER BY usuario_id, data_base, CASE WHEN id_qldd IS NOT NULL THEN 0 ELSE 1 END, data_base
              )
              SELECT
                  EXTRACT(DAY FROM data_base)::int AS dia,
                  COUNT(*)::int AS total
              FROM dedup
              GROUP BY dia
              ORDER BY dia
          `, origem === 'r_000250' ? [ano, mes] : origem ? [ano, mes, origem] : [ano, mes]);
  
          // Tarefas auditadas por dia no mês (data canônica = data_qualidade).
          // Inclui TODAS as auditadas (id_qldd NOT NULL), independente do status.
          const auditadasQuery = await pool.query(`
              WITH base AS (
                  SELECT
                      c.usuario_id,
                      ${DATA_BASE_SQL} AS data_base,
                      c.id_qldd
                  FROM db_bloco_de_notas.cotacao c
                  LEFT JOIN db_bloco_de_notas.auditoria_qualidade aq ON aq.id_qldd = c.id_qldd
                  WHERE c.validacao = 'Ativo'
                    AND c.id_qldd IS NOT NULL
                    AND EXTRACT(YEAR FROM ${DATA_BASE_SQL}) = $1
                    AND EXTRACT(MONTH FROM ${DATA_BASE_SQL}) = $2
                    ${origem === 'r_000250' ? "AND ( c.origem = 'r_000250' OR ( (c.origem IS NULL OR c.origem = '') AND NOT EXISTS (SELECT 1 FROM db_bloco_de_notas.iw_cpc_975_net inet WHERE inet.codigo_da_tarefa = c.tarefa) AND NOT EXISTS (SELECT 1 FROM db_bloco_de_notas.iw_cpc_975_top itop WHERE itop.codigo_da_tarefa = c.tarefa) AND NOT EXISTS (SELECT 1 FROM db_bloco_de_notas.hoteis_x_hospitais hh WHERE hh.id_tarefa = c.tarefa) ) )" : origem ? "AND c.origem = $3" : ""}
              ),
              dedup AS (
                  SELECT DISTINCT ON (usuario_id, data_base)
                      usuario_id,
                      data_base,
                      id_qldd
                  FROM base
                  ORDER BY usuario_id, data_base, CASE WHEN id_qldd IS NOT NULL THEN 0 ELSE 1 END, data_base
              )
              SELECT
                  EXTRACT(DAY FROM data_base)::int AS dia,
                  COUNT(*)::int AS auditadas
              FROM dedup
              GROUP BY dia
              ORDER BY dia
          `, origem === 'r_000250' ? [ano, mes] : origem ? [ano, mes, origem] : [ano, mes]);
  
          // Montar mapa de dias
          const diasMap = {};
          for (const row of tarefasQuery.rows) {
              diasMap[row.dia] = { total: row.total, auditadas: 0 };
          }
          for (const row of auditadasQuery.rows) {
              if (!diasMap[row.dia]) {
                  diasMap[row.dia] = { total: 0, auditadas: 0 };
              }
              diasMap[row.dia].auditadas = row.auditadas;
          }
  
          // Calcular total do mês
          let totalTarefas = 0;
          let totalAuditadas = 0;
          const dias = Object.keys(diasMap).sort((a, b) => a - b).map(d => {
              totalTarefas += diasMap[d].total;
              totalAuditadas += diasMap[d].auditadas;
              return {
                  dia: parseInt(d),
                  total: diasMap[d].total,
                  auditadas: diasMap[d].auditadas
              };
          });
  
          res.json({
              mes,
              ano,
              dias,
              resumo: {
                  total_tarefas: totalTarefas,
                  total_auditadas: totalAuditadas,
                  percentual: totalTarefas > 0 ? Math.round((totalAuditadas / totalTarefas) * 100) : 0
              }
          });
      } catch (error) {
          console.error('[QUALIDADE CALENDARIO] Erro:', error);
          res.status(500).json({ error: 'Erro ao carregar calendário de qualidade' });
      }
  });

  return router;
};

