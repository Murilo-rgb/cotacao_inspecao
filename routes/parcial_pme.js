const express = require('express');
const router = express.Router();
const { asDeps } = require('../app/route_deps');

// ============================================================
// ROTAS DE PARCIAL PME (tabla inspección dinámica)
// Reproduce la query de public/parcial_pme_inspecao.sql pero
// SIN usar TEMP VIEW (que no es accesible desde otra conexión):
//   - Genera una columna de fecha por cada DATE(dat_historico)
//     distinta en db_bloco_de_notas.r_000250.
//   - Agrupa por regional con ROLLUP y ordena en la secuencia
//     esperada (SP1..E-COMMERCE, TOTAL).
// ============================================================
module.exports = function (pool, authenticateToken, authorizeRoute, formatDateBR, path, fs, authenticatePage) {
  const deps = asDeps(arguments, ['pool', 'authenticateToken', 'authorizeRoute', 'formatDateBR', 'path', 'fs', 'authenticatePage']);
  pool = deps.pool;
  authenticateToken = deps.authenticateToken;
  authorizeRoute = deps.authorizeRoute;
  formatDateBR = deps.formatDateBR;
  path = deps.path;
  fs = deps.fs;
  authenticatePage = deps.authenticatePage;

  // Secuencia de regionales (misma del ORDER BY CASE de la query)
  const SECAO_ORDEN = ['SP1', 'SP2', 'RJ/ES', 'CO', 'MG', 'NE', 'NO', 'BA/SE', 'PR/SC', 'RS', 'E-COMMERCE'];

  // Ordinal de ordenación para el ORDER BY CASE (coincide con la query)
  const ordenCASE = SECAO_ORDEN.map((r, i) => `WHEN '${r}' THEN ${i + 1}`).join('\n') + '\n                        WHEN \'TOTAL\' THEN 99';

  // Devuelve el alias de columna en formato 'DD/mon' (ej. '04/set').
  // Acepta tanto Date como texto 'YYYY-MM-DD'.
  function aliasFecha(fecha) {
    let y = null, m = null, dd = null;
    if (typeof fecha === 'string') {
      const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha.trim());
      if (match) { y = +match[1]; m = +match[2]; dd = +match[3]; }
    } else if (fecha instanceof Date && !isNaN(fecha.getTime())) {
      y = fecha.getFullYear(); m = fecha.getMonth() + 1; dd = fecha.getDate();
    }
    if (y === null || m === null || dd === null) {
      // Fallback: parsear
      const d = new Date(fecha);
      if (isNaN(d.getTime())) return '-';
      y = d.getFullYear(); m = d.getMonth() + 1; dd = d.getDate();
    }
    const dia = String(dd).padStart(2, '0');
    const partesMes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const mes = partesMes[m - 1];
    return `${dia}/${mes}`;
  }

  // ---- PÁGINA: PARCIAL PME ----
  router.get('/reports/parcial_pme', authenticatePage, authorizeRoute('/pme_notas/gestao'), (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'parcial_pme.html'));
  });
  router.get('/pme_notas/reports/parcial_pme', authenticatePage, authorizeRoute('/pme_notas/gestao'), (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'parcial_pme.html'));
  });

  // ---- API: datos dinámicos para la tabla inspección ----
  const handlerParcialInspecao = async (req, res) => {
    try {
      // 1. Fechas distintas presentes en r_000250
      const fechasRes = await pool.query(
        `SELECT DISTINCT DATE(dat_historico) AS d
           FROM db_bloco_de_notas.r_000250
          WHERE dat_historico IS NOT NULL
          ORDER BY d`
      );
      const fechas = fechasRes.rows.map((r) => r.d);

      if (fechas.length === 0) {
        return res.json({ columnas: [], filas: [], totalGlobal: null });
      }

      // Identificador de parámetro posicional (empezamos en 1)
      let p = 1;
      // 2. Construye una columna COUNT CASE por fecha
      const colsFecha = fechas.map((f) => {
        const alias = aliasFecha(f).replace(/[^a-zA-Z0-9]/g, '_');
        const cls = `COUNT(CASE WHEN DATE(dat_historico) = $${p++} THEN 1 END) AS "${alias}"`;
        return cls;
      });

      const query = `
        SELECT
            COALESCE(regional, 'TOTAL') AS regional,
            ${colsFecha.join(',\n            ')},
            COUNT(*) AS total,
            COUNT(CASE WHEN criado_por ILIKE 'RPA%' THEN 1 END) AS solar_qtd,
            (ROUND(100.0 * COUNT(CASE WHEN criado_por ILIKE 'RPA%' THEN 1 END) / NULLIF(COUNT(*), 0), 2))::TEXT || '%' AS solar_pct,
            COUNT(CASE WHEN criado_por NOT ILIKE 'RPA%' OR criado_por IS NULL THEN 1 END) AS manual_qtd,
            (ROUND(100.0 * COUNT(CASE WHEN criado_por NOT ILIKE 'RPA%' OR criado_por IS NULL THEN 1 END) / NULLIF(COUNT(*), 0), 2))::TEXT || '%' AS manual_pct
        FROM db_bloco_de_notas.r_000250
        GROUP BY ROLLUP(regional)
        ORDER BY
            CASE COALESCE(regional, 'TOTAL')
                ${ordenCASE}
                ELSE 90
            END`;

      const result = await pool.query(query, fechas.map((f) => f));

      // Alias de columna de fecha que usará el frontend para leer el valor
      const columnas = fechas.map((f) => aliasFecha(f));

      // Normalizar número -> string para que el navegador no pierda el 0
      const filas = result.rows.map((r) => {
        const item = { regional: r.regional };
        columnas.forEach((alias) => {
          const key = alias.replace(/[^a-zA-Z0-9]/g, '_');
          item[alias] = r[key] != null ? String(r[key]) : '0';
        });
        item.total = r.total != null ? String(r.total) : '0';
        item.solar_qtd = r.solar_qtd != null ? String(r.solar_qtd) : '0';
        item.solar_pct = r.solar_pct != null ? String(r.solar_pct) : '-';
        item.manual_qtd = r.manual_qtd != null ? String(r.manual_qtd) : '0';
        item.manual_pct = r.manual_pct != null ? String(r.manual_pct) : '-';
        return item;
      });

      // La fila TOTAL (producida por ROLLUP) se entrega por separado
      const totalGlobal = filas.find((f) => f.regional === 'TOTAL') || null;
      const filasRegional = filas.filter((f) => f.regional !== 'TOTAL');
      // Asegurar el orden de la secuencia esperada (las desconocidas al final)
      filasRegional.sort((a, b) => {
        const ia = SECAO_ORDEN.indexOf(a.regional);
        const ib = SECAO_ORDEN.indexOf(b.regional);
        return ((ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib));
      });

      // Fecha máxima da fonte de datos (r_000250)
      const maxRes = await pool.query('SELECT MAX(dat_historico) AS max_dato FROM db_bloco_de_notas.r_000250');
      const maxDatoInspecao = maxRes.rows[0] && maxRes.rows[0].max_dato;

      res.json({ columnas, filas: filasRegional, totalGlobal, maxDato: maxDatoInspecao });
    } catch (error) {
      console.error('[PARCIAL_PME] Erro ao extrair report inspeção:', error);
      res.status(500).json({ error: 'Erro ao extrair report inspeção', details: error.message });
    }
  };

  router.get('/api/reports/parcial_pme', authenticateToken, authorizeRoute('/pme_notas/gestao'), handlerParcialInspecao);
  router.get('/pme_notas/api/reports/parcial_pme', authenticateToken, authorizeRoute('/pme_notas/gestao'), handlerParcialInspecao);

  // ===================== TABELA INPUT (arquitectura UNION ALL) =====================
  // Cada sub-bloque (top_pme, net, hh, cortesia, sinergia) produce filas
  // `{ status, subdivisao, <fechas...>, total }` con las MISMAS columnas de
  // fecha. La lista de fechas es la UNIÓN de todas las fuentes activas, lo que
  // garantiza que un UNION ALL futuro entre bloques sea válido.
  const BLOCOS_INPUT = [
    {
      id: 'top_pme',
      rotulo: 'TOP PME',
      sideTag: 'TOP PME',
      activo: true,
      // Columna de fecha a usar en el COUNT CASE del bloque
      colData: 'base.data_historico',
      // Fuente de fechas del bloque (para el conjunto unificado)
      fechasFrom: `SELECT data_historico::timestamp AS data_historico FROM db_bloco_de_notas.iw_cpc_975_top`,
      // Construye el SQL del bloque. Recibe las columnas de fecha dinámicas y
      // el índice paramétrico donde empiezan las fechas ($fromIdx...).
      build: (colsFecha, fromIdx) => ({
        sql: `
          WITH base AS (
            SELECT icn.data_historico, icn.etapa_atual, d.revenda
            FROM db_bloco_de_notas.iw_cpc_975_top icn
            LEFT JOIN db_qualidade.aux_depara_demandante d
                   ON icn.do_usuario_nome = d.demandante
          ),
          membros_subdivisao AS (
            SELECT 1 AS ordem, 'PENDENTE INPUT' AS status, 'TOP HUNTER' AS subdivisao
            UNION ALL SELECT 2, 'PENDENTE INPUT', 'D2D'
            UNION ALL SELECT 3, 'PENDENTE INPUT', 'INSIDE SALES'
            UNION ALL SELECT 4, 'PENDENTE INPUT', 'FIELD SALES'
            UNION ALL SELECT 5, 'EM TRATAMENTO DESDE', NULL
            UNION ALL SELECT 6, 'EM TROCA DE TERRITÓRIO DESDE', NULL
          )
          SELECT m.status AS status, m.subdivisao AS subdivisao,
                 ${colsFecha.join(',\n                 ')},
                 COUNT(base.data_historico) AS total
          FROM membros_subdivisao m
          LEFT JOIN base ON (
            (m.status = 'PENDENTE INPUT' AND base.etapa_atual ILIKE '01%'
              AND (
                (m.subdivisao = 'TOP HUNTER'   AND base.revenda ILIKE 'TOP%')
                OR (m.subdivisao = 'D2D'          AND base.revenda ILIKE 'D2D%')
                OR (m.subdivisao = 'INSIDE SALES' AND base.revenda ILIKE 'INSIDE%')
                OR (m.subdivisao = 'FIELD SALES'  AND base.revenda ILIKE 'FIELD%')
              ))
            OR (m.status = 'EM TRATAMENTO DESDE' AND base.etapa_atual ILIKE '02%')
          )
          GROUP BY m.ordem, m.status, m.subdivisao
          ORDER BY m.ordem`,
        // Agrupación de filas para el front (layout con rowspan)
        grupos: [
          { label: 'PENDENTE INPUT', subfilas: ['TOP HUNTER', 'D2D', 'INSIDE SALES', 'FIELD SALES'] },
          { label: 'EM TRATAMENTO DESDE' },
          { label: 'EM TROCA DE TERRITÓRIO DESDE' }
        ],
                                totalLabel: 'TOTAL CORP-PME'
      })
    },
    {
      id: 'net',
      rotulo: 'NET',
      sideTag: 'NET',
      activo: true,
      // Columna de fecha a usar en el COUNT CASE del bloque
      colData: 'base.data_historico',
      fechasFrom: `SELECT data_historico::timestamp AS data_historico FROM db_bloco_de_notas.iw_cpc_975_net`,
      build: (colsFecha, fromIdx) => ({
        sql: `
          WITH base AS (
            SELECT icn.data_historico, d.revenda
            FROM db_bloco_de_notas.iw_cpc_975_net icn
            LEFT JOIN db_qualidade.aux_depara_demandante d
                   ON icn.do_usuario_nome = d.demandante
          ),
          membros AS (
            SELECT 1 AS ordem, 'E-COMMERCE' AS status, NULL::text AS subdivisao
            UNION ALL SELECT 2, 'TELEVENDAS', NULL::text
          )
          SELECT m.status AS status,
                 m.subdivisao AS subdivisao,
                 ${colsFecha.join(',\n                 ')},
                 COUNT(base.data_historico) AS total
          FROM membros m
          LEFT JOIN base ON (
            (m.status = 'E-COMMERCE' AND base.revenda ILIKE '%ecom%')
            OR (m.status = 'TELEVENDAS' AND base.revenda NOT ILIKE '%ecom%')
          )
          GROUP BY m.ordem, m.status, m.subdivisao
          ORDER BY m.ordem`,
        // Agrupación de filas para el front (E-COMMERCE / TELEVENDAS)
        grupos: [
          { label: 'E-COMMERCE' },
          { label: 'TELEVENDAS' }
        ],
        totalLabel: 'TOTAL NET'
      })
    },
    {
      id: 'hh',
      rotulo: 'HOTÉIS & HOSPITAIS',
      sideTag: 'H & H',
      activo: true,
      // Columna de fecha a usar en el COUNT CASE del bloque (requerida por el handler)
      colData: 'h.data_de_historico',
      fechasFrom: `SELECT data_de_historico::timestamp AS data_historico FROM db_bloco_de_notas.hoteis_x_hospitais`,
            build: (colsFecha, fromIdx) => ({
        sql: `
          -- foto_recente por tarefa CON EL MISMO SEMANTICO DA QUERY DO USUARIO:
          -- DISTINCT ON (id_tarefa) sobre TODAS as filas (foto global), e luego
          -- filtrado a BKO Comercial. Asi el bloque aparece SEMPRE (mesmo con 0
          -- tarefas na fase atual), evidenciando "0" e nao um erro do sistema.
          WITH foto_global AS (
            SELECT DISTINCT ON (hxh.id_tarefa) hxh.*
            FROM db_bloco_de_notas.hoteis_x_hospitais hxh
            ORDER BY hxh.id_tarefa, hxh.data_de_historico::timestamp DESC
          ),
          foto AS (
            SELECT h.* FROM foto_global h
            WHERE h.para_etapa = 'BKO Comercial'
          ),
          membros AS (
            SELECT 1 AS ordem, 'PENDENTE' AS status, NULL::text AS subdivisao
            UNION ALL SELECT 2, 'EM TRATAMENTO', NULL::text
          )
          SELECT m.status AS status,
                 m.subdivisao AS subdivisao,
                 ${colsFecha.join(',\n                 ')},
                 COUNT(h.id_tarefa) AS total
          FROM membros m
          LEFT JOIN (
            foto h
            LEFT JOIN db_bloco_de_notas.cotacao c
              ON c.tarefa::text = h.id_tarefa::text
             AND c.data_historico IS NOT DISTINCT FROM h.data_de_historico::timestamp
          ) ON ( (m.status = 'PENDENTE' AND c.tarefa IS NULL)
                 OR (m.status = 'EM TRATAMENTO' AND c.tarefa IS NOT NULL) )
          GROUP BY m.ordem, m.status, m.subdivisao
          ORDER BY m.ordem`,
        // Agrupación de filas para el front (PENDENTE / EM TRATAMENTO)
        grupos: [
          { label: 'PENDENTE' },
          { label: 'EM TRATAMENTO' }
        ],
        totalLabel: 'TOTAL HOTÉIS & HOSPITAIS'
      })
    },
    {
      id: 'cortesia',
      rotulo: 'CORTESIA',
      sideTag: 'CORTESIA',
      activo: true,
      colData: 'f.atualizada_em',
      fechasFrom: `SELECT atualizada_em::timestamp AS data_historico FROM db_bloco_de_notas.cortesia`,
      build: (colsFecha, fromIdx) => ({
        sql: `
          WITH foto AS (
            SELECT DISTINCT ON (chave) *
            FROM db_bloco_de_notas.cortesia
            ORDER BY chave, atualizada_em DESC
          ),
          membros AS (
            SELECT 1 AS ordem, 'PENDENTE' AS status, NULL::text AS subdivisao
            UNION ALL SELECT 2, 'EM TRATAMENTO', NULL::text
          )
          SELECT m.status AS status,
                 m.subdivisao AS subdivisao,
                 ${colsFecha.join(',\n                 ')},
                 COUNT(f.chave) AS total
          FROM membros m
          LEFT JOIN (
            foto f
            LEFT JOIN db_bloco_de_notas.cotacao cc
              ON cc.tarefa = f.chave
             AND cc.origem = 'cortesia'
             AND cc.validacao = 'Ativo'
             AND cc.data_historico IS NOT DISTINCT FROM f.atualizada_em::timestamp
          ) ON ( (m.status = 'PENDENTE' AND cc.tarefa IS NULL)
                 OR (m.status = 'EM TRATAMENTO' AND cc.tarefa IS NOT NULL) )
          WHERE f.status ILIKE '%apr5%'
          GROUP BY m.ordem, m.status, m.subdivisao
          ORDER BY m.ordem`,
        grupos: [
          { label: 'PENDENTE' },
          { label: 'EM TRATAMENTO' }
        ],
        totalLabel: 'TOTAL CORTESIA'
      })
    }
  ];

  // Devuelve la lista de fechas unificadas de todos los bloques activos
  async function fechasUnificadasInput(bloquesActivos) {
    const sql = bloquesActivos.map((b) => `(${b.fechasFrom})`).join('\nUNION ALL\n');
    const res = await pool.query(
      `SELECT DISTINCT DATE(sub.data_historico) AS d
         FROM (${sql}) sub
        WHERE sub.data_historico IS NOT NULL
        ORDER BY d`
    );
    return res.rows.map((r) => r.d);
  }

const handlerParcialInput = async (req, res) => {
    try {
      const activos = BLOCOS_INPUT.filter((b) => b.activo);

      let fechas = [];
      if (activos.length > 0) {
        fechas = await fechasUnificadasInput(activos);
      }

      const columnas = fechas.map((f) => aliasFecha(f));

      if (activos.length === 0 || fechas.length === 0) {
        return res.json({ colunas: [], blocos: [], totalGeral: null });
      }

      // Parámetros posicionales: fechas en formato 'YYYY-MM-DD' (el mismo orden para cada bloque)
      const params = fechas.map((f) => {
        const d = new Date(f);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      });
      const pInicio = 1;

      const blocos = [];
      let totalGeral = null;

      for (const blk of activos) {
        const colExpr = blk.colData || 'base.data_historico';
        const colsFecha = fechas.map((f, i) => {
          const alias = columnas[i].replace(/[^a-zA-Z0-9]/g, '_');
          return `COUNT(CASE WHEN DATE(${colExpr}) = $${pInicio + i} THEN 1 END) AS "${alias}"`;
        });
        const def = blk.build(colsFecha, pInicio);
        const result = await pool.query(def.sql, params);

        // Normalizar filas
        const filasRaw = result.rows.map((r) => {
          const item = { status: r.status, subdivisao: r.subdivisao };
          columnas.forEach((alias) => {
            const key = alias.replace(/[^a-zA-Z0-9]/g, '_');
            item[alias] = r[key] != null ? String(r[key]) : '0';
          });
          item.total = r.total != null ? String(r.total) : '0';
          return item;
        });

        // Total del bloque = suma por columna
        const suma = {};
        columnas.forEach((alias) => {
          suma[alias] = String(filasRaw.reduce((acc, f) => acc + parseInt(f[alias] || '0', 10), 0));
        });
        suma.total = String(filasRaw.reduce((acc, f) => acc + parseInt(f.total || '0', 10), 0));

        // Agrupar filas según la definición del bloque
        const grupos = (def.grupos || []).map((g) => {
          if (g.subfilas && g.subfilas.length > 0) {
            const subs = g.subfilas.map((nombre) => {
              const f = filasRaw.find((x) => x.subdivisao === nombre) || {};
              return { label: nombre, valores: { ...f }, total: (f.total || '0') };
            });
            return { label: g.label, subfilas: subs };
          }
          const f = filasRaw.find((x) => x.status === g.label) || {};
          return { label: g.label, valores: { ...f }, total: (f.total || '0') };
        });

        blocos.push({
          id: blk.id,
          rotulo: blk.rotulo,
          sideTag: blk.sideTag,
          grupos,
          totalBloco: { label: def.totalLabel, valores: suma, total: suma.total }
        });

        // Total general: acumular
        if (!totalGeral) {
          totalGeral = { valores: { ...suma }, total: suma.total };
        } else {
          columnas.forEach((alias) => {
            totalGeral.valores[alias] = String(parseInt(totalGeral.valores[alias] || '0', 10) + parseInt(suma[alias] || '0', 10));
          });
          totalGeral.total = String(parseInt(totalGeral.total || '0', 10) + parseInt(suma.total || '0', 10));
        }
      }

      // Fecha máxima das fontes de datos (975_top, 975_net, hh, cortesia)
      const maxSrc = await pool.query(`
        SELECT MAX(d) AS max_dato FROM (
          SELECT data_historico::timestamp AS d FROM db_bloco_de_notas.iw_cpc_975_top
          UNION ALL SELECT data_historico::timestamp FROM db_bloco_de_notas.iw_cpc_975_net
          UNION ALL SELECT data_de_historico::timestamp FROM db_bloco_de_notas.hoteis_x_hospitais
          UNION ALL SELECT atualizada_em::timestamp FROM db_bloco_de_notas.cortesia
        ) t
      `);
      const maxDatoInput = maxSrc.rows[0] && maxSrc.rows[0].max_dato;

      res.json({ colunas: columnas, blocos, totalGeral, maxDato: maxDatoInput });
    } catch (error) {
      console.error('[PARCIAL_PME] Erro ao extrair report input:', error);
      res.status(500).json({ error: 'Erro ao extrair report input', details: error.message });
    }
  };

  router.get('/api/reports/parcial_pme/input', authenticateToken, authorizeRoute('/pme_notas/gestao'), handlerParcialInput);
  router.get('/pme_notas/api/reports/parcial_pme/input', authenticateToken, authorizeRoute('/pme_notas/gestao'), handlerParcialInput);

  // ---- API: datos dinámicos para a táboa MARATONA ----
  router.get('/api/reports/parcial_pme/maratona', authenticateToken, authorizeRoute('/pme_notas/gestao'), async (req, res) => {
    try {
      const query = `
        SELECT
          regional,
          SUM(qtd_linhas_novas::integer) AS gross,
          SUM(CASE WHEN tipo_pedido ILIKE '%port%' THEN qtd_linhas::integer - qtd_linhas_novas::integer ELSE 0 END) AS portabilidade,
          SUM(CASE WHEN tipo_pedido ILIKE '%ren%' THEN qtd_linhas::integer - qtd_linhas_novas::integer ELSE 0 END) AS renovacao,
          SUM(qtd_linhas::integer) AS total
        FROM db_bloco_de_notas.r_000250
        GROUP BY regional

        UNION ALL

        SELECT
          'TOTAL' AS regional,
          SUM(qtd_linhas_novas::integer) AS gross,
          SUM(CASE WHEN tipo_pedido ILIKE '%port%' THEN qtd_linhas::integer - qtd_linhas_novas::integer ELSE 0 END) AS portabilidade,
          SUM(CASE WHEN tipo_pedido ILIKE '%ren%' THEN qtd_linhas::integer - qtd_linhas_novas::integer ELSE 0 END) AS renovacao,
          SUM(qtd_linhas::integer) AS total
        FROM db_bloco_de_notas.r_000250

        ORDER BY 1
      `;
      const result = await pool.query(query);
      const maxRes = await pool.query('SELECT MAX(dat_historico) AS max_dato FROM db_bloco_de_notas.r_000250');
      res.json({ data: result.rows, maxDato: maxRes.rows[0] && maxRes.rows[0].max_dato });
    } catch (error) {
      console.error('[PARCIAL_PME_MARATONA] Erro:', error);
      res.status(500).json({ error: 'Erro ao carregar dados da maratona', details: error.message });
    }
  });

  // ---- API: datos dinámicos para a táboa MARATONA II (6 escenarios) ----
  router.get('/api/reports/parcial_pme/maratona_v2', authenticateToken, authorizeRoute('/pme_notas/gestao'), async (req, res) => {
    try {
      const query = `
        SELECT
          regional,
          COUNT(DISTINCT cod_tarefa) AS gross,
          COUNT(DISTINCT CASE WHEN tipo_pedido ILIKE '%ren%' THEN cod_tarefa END) AS renovacao,
          COUNT(DISTINCT CASE WHEN tipo_pedido ILIKE '%port%' THEN cod_tarefa END) AS portabilidade,
          COUNT(DISTINCT CASE WHEN qtd_linhas_novas ~ '^[0-9]+$' AND qtd_linhas_novas::integer > 0 AND tipo_pedido ILIKE '%ren%' THEN cod_tarefa END) AS gross_renovacao,
          COUNT(DISTINCT CASE WHEN qtd_linhas_novas ~ '^[0-9]+$' AND qtd_linhas_novas::integer > 0 AND tipo_pedido ILIKE '%port%' THEN cod_tarefa END) AS gross_portabilidade,
          COUNT(DISTINCT CASE WHEN tipo_pedido ILIKE '%ren%' AND tipo_pedido ILIKE '%port%' THEN cod_tarefa END) AS renovacao_portabilidade,
          COUNT(DISTINCT cod_tarefa) AS total
        FROM db_bloco_de_notas.r_000250
        GROUP BY regional

        UNION ALL

        SELECT
          'TOTAL' AS regional,
          COUNT(DISTINCT cod_tarefa) AS gross,
          COUNT(DISTINCT CASE WHEN tipo_pedido ILIKE '%ren%' THEN cod_tarefa END) AS renovacao,
          COUNT(DISTINCT CASE WHEN tipo_pedido ILIKE '%port%' THEN cod_tarefa END) AS portabilidade,
          COUNT(DISTINCT CASE WHEN qtd_linhas_novas ~ '^[0-9]+$' AND qtd_linhas_novas::integer > 0 AND tipo_pedido ILIKE '%ren%' THEN cod_tarefa END) AS gross_renovacao,
          COUNT(DISTINCT CASE WHEN qtd_linhas_novas ~ '^[0-9]+$' AND qtd_linhas_novas::integer > 0 AND tipo_pedido ILIKE '%port%' THEN cod_tarefa END) AS gross_portabilidade,
          COUNT(DISTINCT CASE WHEN tipo_pedido ILIKE '%ren%' AND tipo_pedido ILIKE '%port%' THEN cod_tarefa END) AS renovacao_portabilidade,
          COUNT(DISTINCT cod_tarefa) AS total
        FROM db_bloco_de_notas.r_000250

        ORDER BY 1
      `;
      const result = await pool.query(query);
      const maxRes2 = await pool.query('SELECT MAX(dat_historico) AS max_dato FROM db_bloco_de_notas.r_000250');
      res.json({ data: result.rows, maxDato: maxRes2.rows[0] && maxRes2.rows[0].max_dato });
    } catch (error) {
      console.error('[PARCIAL_PME_MARATONA_V2] Erro:', error);
      res.status(500).json({ error: 'Erro ao carregar dados da maratona II', details: error.message });
    }
  });

  return router;
};
