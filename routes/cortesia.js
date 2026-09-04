const express = require('express');
const router = express.Router();
const https = require('https');

// ============================================================
// ROTAS DE CORTESIA (Jira -> Tabela cortesia -> Distribuicao)
// Padrao replicado de routes/input_net.js
// ============================================================
module.exports = function (pool, authenticateToken, authorizeRoute, formatDateBR, path, fs, config) {

  const JIRA_SITE = (config && config.JIRA_SITE) || 'https://clarobr-jsm-negocios.atlassian.net';
  const JIRA_EMAIL = (config && config.JIRA_EMAIL) || 'felipe.holanda.terceiros@claro.com.br';
  const JIRA_FILTRO = (config && config.JIRA_FILTRO) || '10288';
  // Dias de retrospectiva quando a tabela ainda nao foi populada (primeira sincronizacao)
  const JIRA_DIAS_ATRAS = (config && config.JIRA_DIAS_ATRAS) || 60;
  const FIELDS = 'summary,status,priority,assignee,creator,created,updated,customfield_10038';

  // Helper para buscar uma pagina no Jira (Basic Auth com o token informado)
  // jqlExtra permite adicionar condicoes a consulta (ex.: updated >= data)
  function jiraBuscarPagina(tokenJira, tokenPagina, jqlExtra) {
    return new Promise(function (resolve, reject) {
      let jql = 'filter = ' + JIRA_FILTRO;
      if (jqlExtra) jql += ' AND ' + jqlExtra;
      let url = '/rest/api/3/search/jql?jql=' + encodeURIComponent(jql) +
        '&maxResults=100&fields=' + encodeURIComponent(FIELDS);
      if (tokenPagina) {
        url += '&nextPageToken=' + encodeURIComponent(tokenPagina);
      }
      const auth = 'Basic ' + Buffer.from(JIRA_EMAIL + ':' + tokenJira, 'utf8').toString('base64');
      const req = https.request({
        hostname: 'clarobr-jsm-negocios.atlassian.net',
        port: 443,
        path: url,
        method: 'GET',
        timeout: 240000,
        headers: {
          'Authorization': auth,
          'Accept': 'application/json',
          'User-Agent': 'geo-pme-cortesia'
        }
      }, function (res) {
        let corpo = '';
        res.setEncoding('utf8');
        res.on('data', function (d) { corpo += d; });
        res.on('end', function () {
          if (res.statusCode !== 200) {
            return reject(new Error('HTTP ' + res.statusCode + ' - ' + corpo.substring(0, 300)));
          }
          let dados = null;
          try { dados = JSON.parse(corpo); } catch (e) { dados = null; }
          resolve(dados);
        });
      });
      req.on('timeout', function () { req.destroy(new Error('Timeout de 240s')); });
      req.on('error', function (e) { reject(e); });
      req.end();
    });
  }

  // Normaliza issue do Jira para linha da tabela cortesia
  function formatarRegistro(it) {
    const f = (it && it.fields) || {};
    function nomeDe(obj) { return (obj && obj.displayName) ? obj.displayName : null; }
    let responsavel = nomeDe(f.assignee);
    if (!responsavel) { responsavel = nomeDe(f.creator); }
    return {
      id: String(it && it.id ? it.id : ''),
      chave: String(it && it.key ? it.key : ''),
      url: JIRA_SITE + '/browse/' + (it && it.key ? it.key : ''),
      resumo: String(f.summary || ''),
      status: (f.status && f.status.name) ? String(f.status.name) : '',
      prioridade: (f.priority && f.priority.name) ? String(f.priority.name) : '',
      responsavel: responsavel ? String(responsavel) : '',
      criador: nomeDe(f.creator) ? String(nomeDe(f.creator)) : '',
      criada_em: f.created ? String(f.created) : '',
      atualizada_em: f.updated ? String(f.updated) : '',
      // customfield_10038 = "Approver groups" (array de grupos). Guarda os nomes dos grupos.
      approver_groups: extrairApproverGroups(f.customfield_10038),
      importada_em: new Date().toISOString()
    };
  }
  // Extrai os nomes do campo "Approver groups" (customfield_10038).
  // A API retorna um array de objetos: [{"name": "...", "groupId": "...", "self": "..."}]
  function extrairApproverGroups(valor) {
    if (!Array.isArray(valor)) return '';
    const nomes = valor
      .map(function (g) { return (g && g.name) ? String(g.name) : ''; })
      .filter(function (n) { return n.length > 0; });
    return nomes.join(', ');
  }

// ===== DASHBOARD CORTESIA (modelo replicado do input_net) =====
  router.get('/dashboard', authenticateToken, async (req, res) => {
    try {
      const { data, dataInicio, dataFim } = req.query;
      const params = [];
      let whereData = '';
      if (dataInicio && dataFim) {
        whereData = ` AND TO_TIMESTAMP(c.data_de_criacao, 'DD/MM/YYYY HH24:MI') >= TO_TIMESTAMP($${params.length + 1}, 'DD/MM/YYYY HH24:MI')
                      AND TO_TIMESTAMP(c.data_de_criacao, 'DD/MM/YYYY HH24:MI') <= TO_TIMESTAMP($${params.length + 2}, 'DD/MM/YYYY HH24:MI')`;
        params.push(dataInicio.trim() + ' 00:00', dataFim.trim() + ' 23:59');
      } else if (dataInicio) {
        whereData = ` AND TO_TIMESTAMP(c.data_de_criacao, 'DD/MM/YYYY HH24:MI') >= TO_TIMESTAMP($${params.length + 1}, 'DD/MM/YYYY HH24:MI')`;
        params.push(dataInicio.trim() + ' 00:00');
      } else if (dataFim) {
        whereData = ` AND TO_TIMESTAMP(c.data_de_criacao, 'DD/MM/YYYY HH24:MI') <= TO_TIMESTAMP($${params.length + 1}, 'DD/MM/YYYY HH24:MI')`;
        params.push(dataFim.trim() + ' 23:59');
      } else if (data && data.trim()) {
        whereData = ` AND to_date(LEFT(c.data_de_criacao,10),'dd/MM/yyyy') = to_date($${params.length + 1}::text,'dd/MM/yyyy')`;
        params.push(data.trim());
      }

      // 1. Produtividade por colaborador (filtrado por ilha = 'CORTESIA' - mesmo padrao do input_net)
      const query = `
        SELECT
          l.login AS usuario_login,
          l.nome AS usuario_nome,
          COUNT(DISTINCT c.tarefa) AS total,
          COUNT(DISTINCT c.tarefa) FILTER (WHERE c.status IS NULL OR c.status = '' OR LOWER(c.status) = 'pendente') AS pendente,
          COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(c.status) = 'em-tratamento') AS em_tratamento,
          COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(c.status) = 'aprovado') AS aprovados,
          COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(c.status) = 'reprovado') AS reprovados,
          COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(c.status) LIKE '%cancel%') AS cancelados
        FROM db_gp.listafuncionarios l
        RIGHT JOIN db_automacao.usuarios u ON u.login = l.login
        LEFT JOIN db_bloco_de_notas.cotacao c
          ON c.usuario_id::text = u.id::text AND c.validacao = 'Ativo' AND c.origem = 'cortesia'
        WHERE l.ilha = 'CORTESIA' AND l.ativo = true${whereData}
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
          if (dataInicio && dataFim) {
            slaWhereData = ` AND TO_TIMESTAMP(c.data_de_criacao, 'DD/MM/YYYY HH24:MI') >= TO_TIMESTAMP(${slaParams.length + 1}, 'DD/MM/YYYY HH24:MI')
                             AND TO_TIMESTAMP(c.data_de_criacao, 'DD/MM/YYYY HH24:MI') <= TO_TIMESTAMP(${slaParams.length + 2}, 'DD/MM/YYYY HH24:MI')`;
            slaParams.push(dataInicio.trim() + ' 00:00', dataFim.trim() + ' 23:59');
          } else if (dataInicio) {
            slaWhereData = ` AND TO_TIMESTAMP(c.data_de_criacao, 'DD/MM/YYYY HH24:MI') >= TO_TIMESTAMP(${slaParams.length + 1}, 'DD/MM/YYYY HH24:MI')`;
            slaParams.push(dataInicio.trim() + ' 00:00');
          } else if (dataFim) {
            slaWhereData = ` AND TO_TIMESTAMP(c.data_de_criacao, 'DD/MM/YYYY HH24:MI') <= TO_TIMESTAMP(${slaParams.length + 1}, 'DD/MM/YYYY HH24:MI')`;
            slaParams.push(dataFim.trim() + ' 23:59');
          } else if (data && data.trim()) {
            slaWhereData = ` AND to_date(LEFT(c.data_de_criacao,10),'dd/MM/yyyy') = to_date(${slaParams.length + 1}::text,'dd/MM/yyyy')`;
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
              AND c.origem = 'cortesia'
              AND c.status IS NOT NULL AND c.status != '' AND c.status != 'pendente'
              AND c.data_da_ultima_atualizacao IS NOT NULL
              AND c.data_de_criacao IS NOT NULL${slaWhereData}
          `, slaParams);
          slaHoras = slaRes.rows[0]?.sla_medio ? parseFloat(slaRes.rows[0].sla_medio).toFixed(1) : null;
        } catch (slaErr) {
          console.error('[DASHBOARD_CORTESIA SLA] Erro para usuario', row.usuario_login, ':', slaErr.message);
        }

        const statusCounts = {
          'pendente': parseInt(row.pendente || 0),
          'em-tratamento': parseInt(row.em_tratamento || 0),
          'aprovado': parseInt(row.aprovados || 0),
          'reprovado': parseInt(row.reprovados || 0),
          'cancelado': parseInt(row.cancelados || 0)
        };

        colaboradores.push({
          usuario_id: null,
          usuario_nome: row.usuario_nome,
          usuario_login: row.usuario_login,
          statusCounts,
          total: parseInt(row.total),
          sla_medio: slaHoras ? slaHoras + 'h' : '-'
        });
      }

      colaboradores.sort((a, b) => {
        if (a.statusCounts.pendente > 0 && b.statusCounts.pendente === 0) return -1;
        if (a.statusCounts.pendente === 0 && b.statusCounts.pendente > 0) return 1;
        return String(a.usuario_nome).localeCompare(String(b.usuario_nome));
      });

      // 2. Stats globais das tarefas distribuidas (origem = 'cortesia')
      let statsNet = { em_tratamento: 0, aprovado: 0, reprovado: 0, pendente: 0, cancelado: 0 };
      try {
        const statsRes = await pool.query(`
          SELECT
            COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(c.status) = 'em-tratamento')::int AS em_tratamento,
            COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(c.status) = 'aprovado')::int AS aprovado,
            COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(c.status) = 'reprovado')::int AS reprovado,
            COUNT(DISTINCT c.tarefa) FILTER (WHERE c.status IS NULL OR c.status = '' OR LOWER(c.status) = 'pendente')::int AS pendente,
            COUNT(DISTINCT c.tarefa) FILTER (WHERE LOWER(c.status) LIKE '%cancel%')::int AS cancelado
          FROM db_bloco_de_notas.cotacao c
          WHERE c.validacao = 'Ativo' AND c.origem = 'cortesia'
        `);
        if (statsRes.rows.length > 0) {
          statsNet = {
            em_tratamento: parseInt(statsRes.rows[0].em_tratamento || 0),
            aprovado: parseInt(statsRes.rows[0].aprovado || 0),
            reprovado: parseInt(statsRes.rows[0].reprovado || 0),
            pendente: parseInt(statsRes.rows[0].pendente || 0),
            cancelado: parseInt(statsRes.rows[0].cancelado || 0)
          };
        }
      } catch (statsErr) {
        console.error('[DASHBOARD_CORTESIA STATS] Erro:', statsErr.message);
      }

      res.json({ colaboradores, stats: statsNet });
    } catch (error) {
      console.error('[CORTESIA DASHBOARD] Erro:', error.message);
      res.status(500).json({ error: 'Erro ao carregar dashboard cortesia' });
    }
  });

  // Serve a pagina
  router.get('/dashboard-page', authenticateToken, function (req, res) {
    res.sendFile(path.join(__dirname, '..', 'public', 'dashboard_cortesia.html'));
  });

  // Lista pessoas (ilha) - mesmo padrao do input_net
  router.get('/usuarios', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id, login, nome FROM db_automacao.usuarios WHERE ativo = true ORDER BY nome'
      );
      res.json(result.rows);
    } catch (error) {
      console.error('[CORTESIA USUARIOS] Erro:', error.message);
      res.status(500).json({ error: 'Erro ao buscar usuÃ¡rios' });
    }
  });
  // Lista tarefas de cortesia (distribuidas e em fila) - padrao tarefas_net
  router.get('/tarefas', authenticateToken, async (req, res) => {
    try {
      const query = `
        SELECT c.chave AS cod_tarefa,
               c.status AS etapa_atual,
               c.responsavel,
               c.approver_groups,
               c.atualizada_em,
               c.criada_em,
               cc.status AS cotacao_status,
               COALESCE(NULLIF(TRIM(COALESCE(u.nome, '') || ' ' || COALESCE(u.sobrenome, '')), ''), '-'::text) AS usuario_distribuido_nome,
               cc.data_historico,
               CASE WHEN cc.id_cotacao IS NULL THEN 'Fila' ELSE 'Distribuido' END AS status_distribuicao
        FROM db_bloco_de_notas.cortesia c
        LEFT JOIN db_bloco_de_notas.cotacao cc
          ON cc.tarefa = c.chave
         AND cc.origem = 'cortesia'
         AND cc.validacao = 'Ativo'
         AND c.atualizada_em::timestamp = cc.data_historico
        LEFT JOIN db_automacao.usuarios u ON u.id::text = cc.usuario_id::text
        WHERE (c.status ILIKE '%apr5%' OR c.status ILIKE '%apr4%')
        ORDER BY c.criada_em DESC
      `;
      const result = await pool.query(query);
      const rows = result.rows;

      const statusCounts = { fila: 0 };
      for (const r of rows) {
        if (r.status_distribuicao === 'Fila' || !r.cotacao_status) { statusCounts.fila++; continue; }
        const st = String(r.cotacao_status).toLowerCase().replace(/\s+/g, '');
        if (!st) { statusCounts.fila++; continue; }
        statusCounts[st] = (statusCounts[st] || 0) + 1;
      }

      const stats = {
        total: rows.length,
        em_tratamento: statusCounts['em-tratamento'] || 0,
        aprovado: statusCounts['aprovado'] || 0,
        reprovado: statusCounts['reprovado'] || 0,
        cancelado: statusCounts['cancelado'] || 0,
        pendente: statusCounts['pendente'] || 0,
        desconsiderar: 0
      };

      res.json({ data: rows, total: rows.length, stats, statusCounts });
    } catch (error) {
      console.error('[CORTESIA TAREFAS] Erro:', error.message);
      res.status(500).json({ error: 'Erro ao carregar tarefas cortesia' });
    }
  });

  // Distribuir tarefas cortesia selecionadas (padrao distribuir_input_net)
  router.post('/distribuir-lista', authenticateToken, async (req, res) => {
    const { distribuicoes } = req.body;
    if (!distribuicoes || !Array.isArray(distribuicoes) || distribuicoes.length === 0) {
      return res.status(400).json({ error: 'Lista de distribuiÃ§Ãµes invÃ¡lida' });
    }
    const usuarioLogin = req.user.username;
    const usuarioId = req.user.id;
    const agora = new Date();
    let count = 0;
    const errors = [];
    const cliente = await pool.connect();
    try {
      for (const item of distribuicoes) {
        const okTarefa = item && typeof item.cod_tarefa === 'string' && item.cod_tarefa.trim() !== '';
        const idNum = Number(item && item.usuario_id);
        const okUsuario = Number.isInteger(idNum) && idNum > 0;
        if (!okTarefa || !okUsuario) {
          errors.push({
            cod_tarefa: item && item.cod_tarefa,
            error: okTarefa && !okUsuario
              ? 'usuario_id invalido (debe ser un entero positivo)'
              : 'Datos incompletos (cod_tarefa requerido)'
          });
          continue;
        }
        try {
          const tarefaRes = await cliente.query(
            'SELECT chave, resumo, status, atualizada_em FROM db_bloco_de_notas.cortesia WHERE chave = $1',
            [item.cod_tarefa]
          );
          if (tarefaRes.rows.length === 0) {
            errors.push({ cod_tarefa: item.cod_tarefa, error: 'Tarefa nÃ£o encontrada na tabela cortesia' });
            continue;
          }
          const t = tarefaRes.rows[0];

          // Regra de negocio: somente chamados com status AP5 podem ser distribuidos.
          if (String(t.status || '').toLowerCase().indexOf('apr5') === -1) {
            errors.push({ cod_tarefa: item.cod_tarefa, error: 'Tarefa sem status AP5 nao pode ser distribuida' });
            continue;
          }

          const uRes = await cliente.query('SELECT id, nome FROM db_automacao.usuarios WHERE id = $1 AND ativo = true', [item.usuario_id]);
          if (uRes.rows.length === 0) {
            errors.push({ cod_tarefa: item.cod_tarefa, error: 'Colaborador de destino nao encontrado ou inativo' });
            continue;
          }
          const destinoNome = uRes.rows[0].nome;

          // Insercao atomica: evita duplicidade em requisicoes simultaneas
          const inserido = await cliente.query(`
            INSERT INTO db_bloco_de_notas.cotacao
              (tarefa, cotacao, anotacao, status, validacao, data_de_criacao,
               data_da_ultima_atualizacao, usuario_login, usuario_id, origem, data_historico)
            SELECT $1,$2,$3,$4,'Ativo',$5,$5,$6,$7,'cortesia',
                   CASE WHEN $8::text <> '' THEN $8::timestamp ELSE NULL END
            WHERE NOT EXISTS (
              SELECT 1 FROM db_bloco_de_notas.cotacao
              WHERE tarefa = $1 AND origem = 'cortesia' AND validacao = 'Ativo'
            )
            RETURNING id_cotacao
          `, [item.cod_tarefa, item.cod_tarefa, t.resumo || '', t.status || 'pendente', agora, usuarioLogin, item.usuario_id, t.atualizada_em || '']);

          if (inserido.rows.length === 0) {
            errors.push({ cod_tarefa: item.cod_tarefa, error: 'Tarefa jÃ¡ distribuÃ­da' });
            continue;
          }

          try {
            await cliente.query(
              `INSERT INTO db_bloco_de_notas.cotacao_audit
                 (tarefa, acao, usuario_origem_id, usuario_origem_nome, usuario_destino_id, usuario_destino_nome, status_anterior, status_novo, criado_por)
               VALUES ($1,'distribuido_cortesia',$2,$3,$4,$5,'-','pendente',$3)`,
              [item.cod_tarefa, usuarioId, usuarioLogin, item.usuario_id, destinoNome]
            );
          } catch (auditErr) {
            console.error('[CORTESIA DISTRIBUIR-LISTA] Erro ao registrar auditoria:', auditErr.message);
          }
          count++;
        } catch (err) {
          errors.push({ cod_tarefa: item.cod_tarefa, error: err.message });
        }
      }
      res.json({
        success: true,
        message: count + ' tarefa(s) distribuÃ­da(s) com sucesso',
        distribuidos: count,
        erros: errors
      });
    } catch (error) {
      console.error('[CORTESIA DISTRIBUIR-LISTA] Erro:', error.message);
      res.status(500).json({ error: 'Erro ao distribuir tarefas cortesia' });
    } finally {
      cliente.release();
    }
  });

  // Redistribuir tarefas cortesia (padrao redistribuir_input_net)
  router.post('/redistribuir', authenticateToken, async (req, res) => {
    const { redistribuicoes } = req.body;
    if (!redistribuicoes || !Array.isArray(redistribuicoes) || redistribuicoes.length === 0) {
      return res.status(400).json({ error: 'Lista de redistribuiÃ§Ãµes invÃ¡lida' });
    }
    const usuarioLogin = req.user.username;
    const usuarioId = req.user.id;
    const agora = new Date();
    let count = 0;
    const errors = [];
    try {
      for (const item of redistribuicoes) {
        if (!item.cod_tarefa || !item.usuario_id) {
          errors.push({ cod_tarefa: item.cod_tarefa, error: 'Dados incompletos' });
          continue;
        }
        try {
          const check = await pool.query(
            "SELECT tarefa, usuario_id FROM db_bloco_de_notas.cotacao WHERE tarefa = $1 AND validacao = 'Ativo' AND origem = 'cortesia'",
            [item.cod_tarefa]
          );
          if (check.rows.length === 0) {
            errors.push({ cod_tarefa: item.cod_tarefa, error: 'Tarefa nÃ£o encontrada ou origem nÃ£o Ã© cortesia' });
            continue;
          }

          let destinoNome = String(item.usuario_id);
          try {
            const uRes = await pool.query('SELECT nome FROM db_automacao.usuarios WHERE id = $1', [item.usuario_id]);
            if (uRes.rows.length > 0) destinoNome = uRes.rows[0].nome;
          } catch {}

          await pool.query(
            `INSERT INTO db_bloco_de_notas.cotacao_audit
               (tarefa, acao, usuario_origem_id, usuario_origem_nome, usuario_destino_id, usuario_destino_nome, status_anterior, status_novo, criado_por)
             VALUES ($1,'redistribuido_cortesia',$2,$3,$4,$5,NULL,NULL,$3)`,
            [item.cod_tarefa, usuarioId, usuarioLogin, item.usuario_id, destinoNome]
          );

          await pool.query(
            `UPDATE db_bloco_de_notas.cotacao
             SET usuario_id = $1, data_da_ultima_atualizacao = $2, usuario_login = $3
             WHERE tarefa = $4 AND validacao = 'Ativo' AND origem = 'cortesia'`,
            [item.usuario_id, agora, usuarioLogin, item.cod_tarefa]
          );
          count++;
        } catch (err) {
          errors.push({ cod_tarefa: item.cod_tarefa, error: err.message });
        }
      }
      res.json({
        success: true,
        message: count + ' tarefa(s) redistribuÃ­da(s) com sucesso',
        redistribuidos: count,
        erros: errors
      });
    } catch (error) {
      console.error('[CORTESIA REDISTRIBUIR] Erro:', error.message);
      res.status(500).json({ error: 'Erro ao redistribuir tarefas cortesia: ' + error.message });
    }
  });

// Sync: recebe chave da API e grava issues na tabela cortesia
  router.post('/sync', authenticateToken, async (req, res) => {
    const tokenJira = (req.body && req.body.chaveApi) || '';
    if (!tokenJira) {
      return res.status(400).json({ error: 'Chave da API nÃ£o informada' });
    }
    try {
      // Sincronizacao incremental: busca apenas issues atualizadas desde o
      // ultimo import (evita baixar/processar a fila inteira a cada clique).
      let cut = null;
      try {
        const last = await pool.query('SELECT MAX(importada_em) AS max FROM db_bloco_de_notas.cortesia');
        const maxDate = last.rows[0] && last.rows[0].max;
        if (maxDate) {
          // Retrocede 2 dias de margem para pegar updates que caÃ­ram entre sincronizaÃ§Ãµes
          const d = new Date(maxDate);
          d.setDate(d.getDate() - 2);
          cut = d.toISOString().substring(0, 10);
        }
      } catch (metaErr) {
        console.error('[CORTESIA SYNC] Erro ao consultar ultimo import:', metaErr.message);
      }
      if (!cut) {
        const d = new Date();
        d.setDate(d.getDate() - JIRA_DIAS_ATRAS);
        cut = d.toISOString().substring(0, 10);
      }
      const jqlExtra = 'updated >= "' + cut + '"';

      let todas = [];
      let proximo = null;
      let pagina = 0;
      do {
        const dados = await jiraBuscarPagina(tokenJira, proximo, jqlExtra);
        const issues = (dados && Array.isArray(dados.issues)) ? dados.issues : [];
        todas = todas.concat(issues);
        pagina++;
        proximo = (dados && dados.nextPageToken) || null;
      } while (proximo && todas.length < 20000);

      const lote = 500;
      for (let i = 0; i < todas.length; i += lote) {
        const fatia = todas.slice(i, i + lote).map(formatarRegistro);
        const valores = [];
        const params2 = [];
        for (let j = 0; j < fatia.length; j++) {
          const r = fatia[j];
          const base = j * 12;
          const marc = '($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)';
          const substituido = marc.replace(
            '$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12',
            '$' + (base + 1) + ',$' + (base + 2) + ',$' + (base + 3) + ',$' + (base + 4) + ',$' + (base + 5) +
            ',$' + (base + 6) + ',$' + (base + 7) + ',$' + (base + 8) + ',$' + (base + 9) + ',$' + (base + 10) +
            ',$' + (base + 11) + ',$' + (base + 12)
          );
          valores.push(substituido);
          params2.push(r.id, r.chave, r.url, r.resumo, r.status, r.prioridade, r.responsavel, r.criador, r.criada_em, r.atualizada_em, r.approver_groups, r.importada_em);
        }
        const sql = 'INSERT INTO db_bloco_de_notas.cortesia ' +
          '(id, chave, url, resumo, status, prioridade, responsavel, criador, criada_em, atualizada_em, approver_groups, importada_em) VALUES ' +
          valores.join(',') +
          ' ON CONFLICT (chave) DO UPDATE SET ' +
          'status=EXCLUDED.status, prioridade=EXCLUDED.prioridade, responsavel=EXCLUDED.responsavel, ' +
          'approver_groups=EXCLUDED.approver_groups, atualizada_em=EXCLUDED.atualizada_em, importada_em=EXCLUDED.importada_em';
        await pool.query(sql, params2);
      }

      // Executa a limpeza dos dados nao necessarios apos cada sincronizacao.
      let limpos = 0;
      try {
        const r = await pool.query('CALL db_bloco_de_notas.sp_limpar_iw_cortesia()');
        limpos = (r && r.rowCount) ? r.rowCount : 0;
      } catch (cleanErr) {
        console.error('[CORTESIA SYNC] Erro ao executar sp_limpar_iw_cortesia:', cleanErr.message);
      }

      res.json({ success: true, total: todas.length, mensagem: todas.length + ' chamados sincronizados', limpos });
    } catch (error) {
      console.error('[CORTESIA SYNC] Erro:', error.message);
      res.status(500).json({ error: 'Erro ao sincronizar: ' + error.message });
    }
  });
// HistÃ³rico de movimentaÃ§Ãµes (origem = cortesia)
  router.get('/historico', authenticateToken, async (req, res) => {
    try {
      const { tarefa, limit = 100, offset = 0 } = req.query;
      let query = `
        SELECT a.*, u_orig.nome AS origem_nome, u_dest.nome AS destino_nome
        FROM db_bloco_de_notas.cotacao_audit a
        INNER JOIN db_bloco_de_notas.cotacao c ON a.tarefa = c.tarefa
        LEFT JOIN db_automacao.usuarios u_orig ON a.usuario_origem_id = u_orig.id
        LEFT JOIN db_automacao.usuarios u_dest ON a.usuario_destino_id = u_dest.id
        WHERE c.origem = 'cortesia'
      `;
      const paramsHistorico = [];
      if (tarefa) {
        paramsHistorico.push(tarefa);
        query += ' AND a.tarefa = $' + paramsHistorico.length;
      }
      query += ' ORDER BY a.data_criacao DESC';
      paramsHistorico.push(parseInt(limit));
      query += ' LIMIT $' + paramsHistorico.length;
      paramsHistorico.push(parseInt(offset));
      query += ' OFFSET $' + paramsHistorico.length;

      const result = await pool.query(query, paramsHistorico);
      const historico = result.rows.map(function (row) {
        return {
          id: row.id,
          tarefa: row.tarefa,
          acao: row.acao,
          usuario_origem: row.origem_nome || row.usuario_origem_nome || '-',
          usuario_destino: row.destino_nome || row.usuario_destino_nome || '-',
          status_anterior: row.status_anterior || '-',
          status_novo: row.status_novo || '-',
          data: row.data_criacao,
          criado_por: row.criado_por
        };
      });
      res.json(historico);
    } catch (error) {
      console.error('[CORTESIA HISTORICO] Erro:', error.message);
      res.status(500).json({ error: 'Erro ao carregar histÃ³rico' });
    }
  });
// Distribuir tarefas cortesia (origem = 'cortesia')
  router.post('/distribuir', authenticateToken, async (req, res) => {
    const usuarioId = req.body && req.body.usuario_id;
    const quantidade = parseInt((req.body && req.body.quantidade), 10) || 0;
    if (!usuarioId || quantidade <= 0) {
      return res.status(400).json({ error: 'usuÃ¡rio e quantidade obrigatÃ³rios' });
    }
    const cliente = await pool.connect();
    try {
      const userRes = await cliente.query(
        'SELECT id, login, nome FROM db_automacao.usuarios WHERE id = $1 AND ativo = true',
        [usuarioId]
      );
      if (userRes.rows.length === 0) {
        return res.status(404).json({ error: 'UsuÃ¡rio nÃ£o encontrado' });
      }
      const usuario = userRes.rows[0];

      // Seleciona itens de cortesia ainda nÃ£o distribuÃ­dos (nÃ£o estÃ£o em cotacao origem='cortesia')
      const pending = await cliente.query(`
        SELECT c.chave, c.resumo, c.status, c.atualizada_em
        FROM db_bloco_de_notas.cortesia c
        LEFT JOIN db_bloco_de_notas.cotacao cc
          ON cc.tarefa = c.chave AND cc.origem = 'cortesia'
        WHERE cc.id_cotacao IS NULL
        AND c.status ILIKE '%apr5%'
        ORDER BY c.criada_em ASC
        LIMIT $1
      `, [quantidade]);

      const itens = pending.rows;
      let distribuidos = 0;
      const agora = new Date();

      for (let i = 0; i < itens.length; i++) {
        const item = itens[i];
        try {
          await cliente.query(
            `INSERT INTO db_bloco_de_notas.cotacao
               (tarefa, cotacao, anotacao, status, validacao, data_de_criacao,
                data_da_ultima_atualizacao, usuario_login, usuario_id, origem, data_historico)
             VALUES ($1,$2,$3,$4,'Ativo',$5,$5,$6,$7,'cortesia',
                     CASE WHEN $8::text <> '' THEN $8::timestamp ELSE NULL END)`,
            [item.chave, item.chave, item.resumo || '', item.status || 'pendente', agora, usuario.login, usuario.id, item.atualizada_em || '']
          );
          await cliente.query(
            `INSERT INTO db_bloco_de_notas.cotacao_audit
               (tarefa, acao, usuario_origem_id, usuario_origem_nome, usuario_destino_id, usuario_destino_nome, status_anterior, status_novo, criado_por)
             VALUES ($1,'distribuido_cortesia',NULL,NULL,$2,$3,NULL,$4,$4)`,
            [item.chave, usuario.id, usuario.nome, usuario.login]
          );
          distribuidos++;
        } catch (insertErr) {
          console.error('[CORTESIA DISTRIBUIR] Erro no item ' + item.chave + ':', insertErr.message);
        }
      }

      res.json({ success: true, distribuidos, message: distribuidos + ' tarefa(s) distribuÃ­da(s) com sucesso!' });
    } catch (error) {
      console.error('[CORTESIA DISTRIBUIR] Erro:', error.message);
      res.status(500).json({ error: 'Erro ao distribuir tarefas cortesia' });
    } finally {
      cliente.release();
    }
  });
  return router;
};
