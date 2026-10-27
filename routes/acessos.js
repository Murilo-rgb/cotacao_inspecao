const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { asDeps } = require('../app/route_deps');

// ============================================================
// RUTAS DE ACESSOS (gerenciamento de permissoes)
// Extraidas de server.js. El router se monta en /api y /pme_notas/api
// (se eliminaron los espelhos app._router.handle y los duplicados /pme_notas).
// ============================================================

// Mapeo de opciones a rutas (movido de server.js)
const OPCOES_ROTAS = {
    gestao: ['/pme_notas/input_net', '/pme_notas/input_top', '/pme_notas/hh', '/pme_notas/inspecao', '/pme_notas/dashboard', '/pme_notas/gestao'],
    qualidade: ['/pme_notas/qualidade', '/pme_notas/rcv', '/pme_notas/reports'],
    admin: ['/pme_notas/acessos']
};

module.exports = function (pool, authenticateToken, authorizeRoute, permissions, config) {
  // Item 3: aceita (deps) ou posicional; Item 4: senha padrao via app/config.js.
  const deps = asDeps(arguments, ['pool', 'authenticateToken', 'authorizeRoute', 'permissions', 'config']);
  pool = deps.pool; authenticateToken = deps.authenticateToken; authorizeRoute = deps.authorizeRoute;
  permissions = deps.permissions; config = deps.config || require('../app/config');
  const SENHA_PADRAO_TROCA = config.SENHA_PADRAO_TROCA;

  router.get('/acessos/usuarios', authenticateToken, async (req, res) => {
      try {
          const { q } = req.query;
          if (!q || q.trim().length < 2) {
              return res.json({ usuarios: [] });
          }
  
          const result = await pool.query(
              `SELECT id, nome, sobrenome, login 
               FROM db_automacao.usuarios 
               WHERE ativo = true 
                 AND (LOWER(nome) LIKE LOWER($1) OR LOWER(sobrenome) LIKE LOWER($1) OR LOWER(CONCAT(nome, ' ', sobrenome)) LIKE LOWER($1))
               ORDER BY nome ASC 
               LIMIT 20`,
              [`%${q.trim()}%`]
          );
  
          res.json({ usuarios: result.rows });
      } catch (error) {
          console.error('[ACESSOS] Erro ao buscar usuários:', error.message);
          res.status(500).json({ error: 'Erro ao buscar usuários' });
      }
  });

  router.get('/acessos/usuarios/:id/permissoes', authenticateToken, async (req, res) => {
      try {
          const { id } = req.params;
  
          const result = await pool.query(
              `SELECT rota, tem_acesso, atualizado_em, atualizado_por
               FROM db_automacao.usuario_permissoes 
               WHERE usuario_id = $1
               ORDER BY rota`,
              [id]
          );
  
          res.json({ permissoes: result.rows });
      } catch (error) {
          console.error('[ACESSOS] Erro ao listar permissões:', error.message);
          res.status(500).json({ error: 'Erro ao listar permissões' });
      }
  });

  router.post('/acessos/usuarios/:id/resetar-senha', authenticateToken, authorizeRoute('/pme_notas/acessos'), async (req, res) => {
      try {
          const { id } = req.params;
          const alteradoPor = req.user.username || req.user.nome || 'sistema';
  
          // Validar que o usuário existe
          const userCheck = await pool.query(
              'SELECT id, login, nome, sobrenome FROM db_automacao.usuarios WHERE id = $1 AND ativo = true',
              [id]
          );
          if (userCheck.rows.length === 0) {
              return res.status(404).json({ success: false, error: 'Usuário não encontrado ou inativo' });
          }
  
          const novoHash = await bcrypt.hash(SENHA_PADRAO_TROCA, 10);
  
          await pool.query(
              `UPDATE db_automacao.usuarios 
               SET senha = $1,
                   deve_trocar_senha = true,
                   data_ultima_troca_senha = NULL,
                   atualizado_por = $2,
                   atualizado_em = CURRENT_TIMESTAMP
               WHERE id = $3`,
              [novoHash, alteradoPor, id]
          );
  
          const usuario = userCheck.rows[0];
          console.log(`[ACESSOS] Senha resetada para usuário ${id} (${usuario.login}) por ${alteradoPor}`);
  
          res.json({
              success: true,
              message: `Senha de ${usuario.nome} ${usuario.sobrenome} resetada para a senha padrão`,
              usuario: {
                  id: usuario.id,
                  login: usuario.login,
                  nome: usuario.nome,
                  sobrenome: usuario.sobrenome
              }
          });
      } catch (error) {
          console.error('[ACESSOS] Erro ao resetar senha:', error.message);
          res.status(500).json({ success: false, error: 'Erro ao resetar senha' });
      }
  });

  router.post('/acessos/usuarios/:id/permissoes', authenticateToken, async (req, res) => {
      try {
          const { id } = req.params;
          const { permissoes: opcoesAtivas } = req.body;
          const alteradoPor = req.user.username || req.user.nome || 'sistema';
  
          // Validar que o usuário existe
          const userCheck = await pool.query(
              'SELECT id, nome, sobrenome FROM db_automacao.usuarios WHERE id = $1 AND ativo = true',
              [id]
          );
          if (userCheck.rows.length === 0) {
              return res.status(404).json({ success: false, error: 'Usuário não encontrado ou inativo' });
          }
  
          // Mapear opções ativas para rotas
          const rotasParaAtivar = new Set();
          if (Array.isArray(opcoesAtivas)) {
              for (const opcao of opcoesAtivas) {
                  const rotas = OPCOES_ROTAS[opcao];
                  if (rotas) {
                      for (const rota of rotas) {
                          rotasParaAtivar.add(rota);
                      }
                  }
              }
          }
  
          // Buscar permissões existentes do usuário que estão dentro do nosso domínio
          const todasRotasDominio = new Set([
              ...OPCOES_ROTAS.gestao,
              ...OPCOES_ROTAS.qualidade,
              ...OPCOES_ROTAS.admin
          ]);
  
          const existentesResult = await pool.query(
              `SELECT rota, tem_acesso FROM db_automacao.usuario_permissoes 
               WHERE usuario_id = $1 AND rota = ANY($2)`,
              [id, Array.from(todasRotasDominio)]
          );
  
          const rotasExistentes = {};
          for (const row of existentesResult.rows) {
              rotasExistentes[row.rota] = row.tem_acesso;
          }
  
          // Inserir ou atualizar permissões
          let inseridas = 0;
          let removidas = 0;
  
          // Para cada rota do domínio, decidir se deve ativar ou desativar
          for (const rota of todasRotasDominio) {
              const deveEstarAtiva = rotasParaAtivar.has(rota);
              const jaExiste = rotasExistentes[rota] !== undefined;
              const estaAtiva = rotasExistentes[rota] === true;
  
              if (deveEstarAtiva && (!jaExiste || !estaAtiva)) {
                  // Precisa ativar
                  await permissions.atualizarPermissao(id, rota, true, alteradoPor);
                  inseridas++;
              } else if (!deveEstarAtiva && jaExiste && estaAtiva) {
                  // Precisa desativar
                  await permissions.atualizarPermissao(id, rota, false, alteradoPor);
                  removidas++;
              }
              // Se já está no estado correto, ignora
          }
  
          console.log(`[ACESSOS] Permissões atualizadas para usuário ${id}: ${inseridas} ativadas, ${removidas} desativadas`);
  
          res.json({
              success: true,
              message: `${inseridas} permissão(ões) adicionada(s), ${removidas} removida(s)`,
              ativadas: inseridas,
              removidas
          });
      } catch (error) {
          console.error('[ACESSOS] Erro ao salvar permissões:', error.message);
          res.status(500).json({ success: false, error: 'Erro ao salvar permissões' });
      }
  });

  return router;
};
