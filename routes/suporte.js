const express = require('express');
const { asDeps } = require('../app/route_deps');
const publicRouter = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// ============================================================
// ROTAS DE SUPORTE (aba Suporte na Correção Cadastral)
// Padrão replicado de routes/input_net.js
// O router é montado em /api e /pme_notas/api (mesmo módulo),
// eliminando os antigos "duplicados com prefixo" do server.js.
// ============================================================

const suporteAnexosDir = path.join(__dirname, '..', 'public', 'anexos');
if (!fs.existsSync(suporteAnexosDir)) {
  fs.mkdirSync(suporteAnexosDir, { recursive: true });
}

module.exports = function (pool, authenticateToken) {
  const deps = asDeps(arguments, ['pool', 'authenticateToken']);
  pool = deps.pool;
  authenticateToken = deps.authenticateToken;

  // Router criado por chamada: evita registro duplicado se o factory
  // for invocado mais de uma vez (o anterior era compartilhado no topo).
  const router = express.Router();

  const suporteStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, suporteAnexosDir),
    filename: (req, file, cb) => {
      const uuid = crypto.randomUUID();
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${uuid}${ext}`);
    }
  });
  const suporteUpload = multer({
    storage: suporteStorage,
    limits: { fileSize: 20 * 1024 * 1024 } // 20MB
  });

  // GET: Buscar dados de suporte (observação + anexos) de uma tarefa
  router.get('/suporte/:tarefa', authenticateToken, async (req, res) => {
    try {
      const { tarefa } = req.params;

      // Buscar id_cotacao a partir da tarefa
      const cotacaoRes = await pool.query(
        'SELECT id_cotacao FROM db_bloco_de_notas.cotacao WHERE tarefa = $1 AND validacao = $2',
        [tarefa, 'Ativo']
      );

      if (cotacaoRes.rows.length === 0) {
        return res.json({ observacao: '', anexos: [] });
      }

      const id_cotacao = cotacaoRes.rows[0].id_cotacao;

      // Buscar registros de suporte para esta cotação
      const suporteRes = await pool.query(
        'SELECT id, url, retorno FROM db_bloco_de_notas.suporte WHERE id_cotacao = $1 ORDER BY id',
        [id_cotacao]
      );

      if (suporteRes.rows.length === 0) {
        return res.json({ observacao: '', anexos: [] });
      }

      // Pega a observação do primeiro registro (todos compartilham o mesmo retorno)
      const observacao = suporteRes.rows[0].retorno || '';

      // Lista de anexos
      const anexos = suporteRes.rows
        .filter(row => row.url && row.url.trim())
        .map(row => ({
          id: row.id,
          uuid: row.url,
          url: `/api/anexos/${row.url}`
        }));

      res.json({ observacao, anexos });
    } catch (error) {
      console.error('[SUPORTE] Erro ao buscar dados:', error);
      res.status(500).json({ error: 'Erro ao buscar dados de suporte' });
    }
  });

  // POST: Salvar dados de suporte (observação + anexos)
  router.post('/suporte/:tarefa', authenticateToken, suporteUpload.array('anexos'), async (req, res) => {
    try {
      const { tarefa } = req.params;
      const observacao = req.body.observacao || '';

      // Buscar id_cotacao a partir da tarefa
      const cotacaoRes = await pool.query(
        'SELECT id_cotacao FROM db_bloco_de_notas.cotacao WHERE tarefa = $1 AND validacao = $2',
        [tarefa, 'Ativo']
      );

      if (cotacaoRes.rows.length === 0) {
        return res.status(404).json({ error: 'Cotação não encontrada' });
      }

      const id_cotacao = cotacaoRes.rows[0].id_cotacao;

      // Verificar se já existem registros de suporte para esta cotação
      const existingRes = await pool.query(
        'SELECT COUNT(*) as total FROM db_bloco_de_notas.suporte WHERE id_cotacao = $1',
        [id_cotacao]
      );
      const hasExisting = parseInt(existingRes.rows[0].total) > 0;

      if (hasExisting) {
        // Atualizar observação (retorno) em todos os registros existentes
        await pool.query(
          'UPDATE db_bloco_de_notas.suporte SET retorno = $1 WHERE id_cotacao = $2',
          [observacao, id_cotacao]
        );
      }

      // Inserir novos anexos
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const uuid = path.parse(file.filename).name; // Remove extension to get just the UUID
          await pool.query(
            'INSERT INTO db_bloco_de_notas.suporte (id_cotacao, url, retorno) VALUES ($1, $2, $3)',
            [id_cotacao, uuid, observacao]
          );
        }
      } else if (!hasExisting) {
        // Se não havia registros e não há anexos, inserir apenas a observação
        await pool.query(
          'INSERT INTO db_bloco_de_notas.suporte (id_cotacao, url, retorno) VALUES ($1, $2, $3)',
          [id_cotacao, '', observacao]
        );
      }

      // Retornar dados atualizados
      const suporteRes = await pool.query(
        'SELECT id, url, retorno FROM db_bloco_de_notas.suporte WHERE id_cotacao = $1 ORDER BY id',
        [id_cotacao]
      );

      const anexosAtualizados = suporteRes.rows
        .filter(row => row.url && row.url.trim())
        .map(row => ({
          id: row.id,
          uuid: row.url,
          url: `/api/anexos/${row.url}`
        }));

      res.json({
        success: true,
        message: 'Suporte salvo com sucesso',
        observacao: observacao,
        anexos: anexosAtualizados
      });
    } catch (error) {
      console.error('[SUPORTE] Erro ao salvar dados:', error);
      res.status(500).json({ error: 'Erro ao salvar dados de suporte' });
    }
  });

  // DELETE: Remover um anexo específico
  router.delete('/suporte/anexo/:id', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const suporteRes = await pool.query(
        'SELECT id, url, id_cotacao FROM db_bloco_de_notas.suporte WHERE id = $1',
        [id]
      );

      if (suporteRes.rows.length === 0) {
        return res.status(404).json({ error: 'Anexo não encontrado' });
      }

      const { url: uuid } = suporteRes.rows[0];

      // Deletar o arquivo físico se existir
      if (uuid && uuid.trim()) {
        const files = fs.readdirSync(suporteAnexosDir);
        const arquivo = files.find(f => f.startsWith(uuid));
        if (arquivo) {
          fs.unlinkSync(path.join(suporteAnexosDir, arquivo));
        }
      }

      // Deletar o registro do banco
      await pool.query('DELETE FROM db_bloco_de_notas.suporte WHERE id = $1', [id]);

      res.json({ success: true, message: 'Anexo removido com sucesso' });
    } catch (error) {
      console.error('[SUPORTE] Erro ao remover anexo:', error);
      res.status(500).json({ error: 'Erro ao remover anexo' });
    }
  });

  // GET: Servir arquivo de anexo pelo UUID (autenticado)
  router.get('/anexos/:uuid', authenticateToken, async (req, res) => {
    try {
      const { uuid } = req.params;
      const files = fs.readdirSync(suporteAnexosDir);
      const arquivo = files.find(f => f.startsWith(uuid));

      if (!arquivo) {
        return res.status(404).json({ error: 'Arquivo não encontrado' });
      }

      const filePath = path.join(suporteAnexosDir, arquivo);
      res.sendFile(filePath);
    } catch (error) {
      console.error('[ANEXOS] Erro ao servir arquivo:', error);
      res.status(500).json({ error: 'Erro ao servir arquivo' });
    }
  });

  return router;
};

// Rota pública para anexos (sem autenticação, para acesso via URL direta)
// Montada na raiz em app.use(require('./routes/suporte').publicRouter)
publicRouter.get('/anexos/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params;
    const files = fs.readdirSync(suporteAnexosDir);
    const arquivo = files.find(f => f.startsWith(uuid));

    if (!arquivo) {
      return res.status(404).json({ error: 'Arquivo não encontrado' });
    }

    const filePath = path.join(suporteAnexosDir, arquivo);
    res.sendFile(filePath);
  } catch (error) {
    console.error('[ANEXOS] Erro ao servir arquivo:', error);
    res.status(500).json({ error: 'Erro ao servir arquivo' });
  }
});

module.exports.publicRouter = publicRouter;
