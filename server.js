const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const fs = require('fs');
const { processarETL_250 } = require('./utils/etl_250');
const { processarETL_975_net } = require('./utils/etl_975_input_net');
const { processarETL_975_top } = require('./utils/etl_975_input_top');
const { classificarPendentes, STATUS_CLASSIFICACAO } = require('./scripts/classificar_cotacoes_pendentes');

const app = express();
const PORT = 3016;
const JWT_SECRET = 'Lenovo!Hitss!Global';
const LEGACY_SECRET = JWT_SECRET;
const SENHA_PADRAO_TROCA = 'Hitss@2026';

// Função para formatar data no formato brasileiro
function formatDateBR(date) {
    if (typeof date === 'string' && /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(date)) {
        return date;
    }
    if (!date) {
        return '-';
    }
    const d = new Date(date);
    if (isNaN(d.getTime())) {
        return '-';
    }
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

// Função para calcular a semana do ano (1-53)
function calcularSemana(date) {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    const day = d.getDate();
    const month = d.getMonth();
    const year = d.getFullYear();
    // Primeiro dia do mês
    const firstDay = new Date(year, month, 1);
    // Dia da semana do primeiro dia (0-6)
    const firstDayWeek = firstDay.getDay();
    // Ajuste para iniciar a semana no domingo
    const startDay = firstDayWeek === 0 ? 0 : firstDayWeek;
    // Calcular semana do mês (1-5)
    const weekOfMonth = Math.ceil((day + startDay) / 7);
    return weekOfMonth;
}

// PostgreSQL connection
const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use('/pme_notas', express.static(path.join(__dirname, 'public'), { index: false }));
app.use((req, res, next) => {
    if (req.path.endsWith('.js') || req.path.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

// Configuração do multer para upload de arquivos r_000250
const filesDir = path.join(__dirname, 'files');
if (!fs.existsSync(filesDir)) {
    fs.mkdirSync(filesDir, { recursive: true });
}
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, filesDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `r_000250${ext}`);
    }
});
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.csv' || ext === '.zip') {
            cb(null, true);
        } else {
            cb(new Error('Apenas arquivos .csv ou .zip são permitidos'));
        }
    },
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// Configuração do multer para upload de arquivos input (IW_CPC_975)
const inputFilesDir = path.join(__dirname, 'files');
if (!fs.existsSync(inputFilesDir)) {
    fs.mkdirSync(inputFilesDir, { recursive: true });
}
const inputStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, inputFilesDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `iw_cpc_975${ext}`);
    }
});
const inputUpload = multer({
    storage: inputStorage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.csv' || ext === '.zip') {
            cb(null, true);
        } else {
            cb(new Error('Apenas arquivos .csv ou .zip são permitidos'));
        }
    },
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// Permissions module (copied from geo-web-app)
const { createPermissions } = require('./app/auth/permissions');
const permissions = createPermissions(pool);
const authorizeRoute = permissions.authorizeRoute;

// Middleware de autenticação
function authenticateToken(req, res, next) {
    let token = null;
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7);
    }
    if (!token && req.cookies?.token) {
        token = req.cookies.token;
    }
    if (!token && req.query.token) {
        token = req.query.token;
    }
    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido' });
        }
        req.user = user;
        next();
    });
}

// Função auxiliar para registrar auditoria (usada nas rotas PUT de cotação)
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

// Inicializar rotas de inspeção após definir authenticateToken e authorizeRoute
var inspecaoRoutes = require('./routes/inspecao')(pool, authenticateToken, authorizeRoute, formatDateBR, path, fs, upload, inputUpload, processarETL_250, processarETL_975_top, processarETL_975_net, classificarPendentes);

// Inicializar rotas de input_net
var inputNetRoutes = require('./routes/input_net')(pool, authenticateToken, authorizeRoute, formatDateBR, path, fs);

// API Routes

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }

    const result = await pool.query(
      'SELECT id, login, nome, sobrenome, email, senha, ativo, deve_trocar_senha FROM db_automacao.usuarios WHERE login = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }

    const user = result.rows[0];

    if (!user.ativo) {
      return res.status(401).json({ error: 'Usuário inativo' });
    }

    // Regra: usuários marcados para troca de senha só autenticam com a senha padrão
    if (user.deve_trocar_senha) {
      if (password !== SENHA_PADRAO_TROCA) {
        return res.status(401).json({ error: 'Senha incorreta' });
      }

      const token = jwt.sign(
        { username: user.login, id: user.id, nome: user.nome },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.cookie('token', token, {
        httpOnly: true,
        secure: false,
        path: '/',
        maxAge: 24 * 60 * 60 * 1000
      });

      await pool.query(
        'UPDATE db_automacao.usuarios SET data_ultimo_acesso = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      );

      return res.json({
        token,
        username: user.login,
        nome: user.nome,
        deveTrocarSenha: true,
        usuario: {
          id: user.id,
          login: user.login,
          nome: user.nome,
          sobrenome: user.sobrenome,
          email: user.email,
          deve_trocar_senha: true
        }
      });
    }

    let senhaValida = false;
    try {
      senhaValida = await bcrypt.compare(password, user.senha);
    } catch (error) {
      senhaValida = false;
    }

    if (!senhaValida && typeof user.senha === 'string' && user.senha === password) {
      senhaValida = true;
    }

    if (!senhaValida && typeof user.senha === 'string') {
      const stored = user.senha.trim();
      const isHex = /^[0-9a-fA-F]+$/.test(stored);

      if (isHex && stored.length === 64) {
        const digestSha256 = (str) => crypto.createHash('sha256').update(str, 'utf8').digest('hex');
        const storedLower = stored.toLowerCase();
        const candidatos = [
          password,
          `${username}${password}`,
          `${password}${username}`,
          `${username}:${password}`,
          `${password}:${username}`,
          `${LEGACY_SECRET}${password}`,
          `${password}${LEGACY_SECRET}`,
          `${LEGACY_SECRET}${username}${password}`,
          `${username}${password}${LEGACY_SECRET}`
        ];
        for (const c of candidatos) {
          if (digestSha256(c).toLowerCase() === storedLower) {
            senhaValida = true;
            break;
          }
        }
      } else if (isHex && stored.length === 32) {
        const md5 = crypto.createHash('md5').update(password, 'utf8').digest('hex');
        if (md5.toLowerCase() === stored.toLowerCase()) {
          senhaValida = true;
        }
      }
    }

    if (senhaValida && typeof user.senha === 'string' && !user.senha.startsWith('$2')) {
      bcrypt.hash(password, 10)
        .then(hash => pool.query(
          'UPDATE db_automacao.usuarios SET senha = $1 WHERE id = $2',
          [hash, user.id]
        ))
        .catch(err => console.error('[AUTH] Falha ao migrar senha para bcrypt:', err.message));
    }

    if (!senhaValida) {
      return res.status(401).json({ error: 'Senha incorreta' });
    }

    const token = jwt.sign(
      { username: user.login, id: user.id, nome: user.nome },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: false,
      path: '/',
      maxAge: 24 * 60 * 60 * 1000
    });

    await pool.query(
      'UPDATE db_automacao.usuarios SET data_ultimo_acesso = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    res.json({ 
      token, 
      username: user.login, 
      nome: user.nome,
      deveTrocarSenha: false,
      usuario: {
        id: user.id,
        login: user.login,
        nome: user.nome,
        sobrenome: user.sobrenome,
        email: user.email,
        deve_trocar_senha: false
      }
    });
  } catch (error) {
    console.error('Erro ao fazer login:', error);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// API: Listar cotações para correção cadastral
app.get('/api/quotations/correcao-cadastral', authenticateToken, async (req, res) => {
  try {
    const { search, dateStart, origem } = req.query;
    let query = `SELECT c.*, r.dsc_cotacao, r.qtd_linhas, r.qtd_linhas_novas, r.qtd_reprovacao, aq.status as auditoria_status, aq.anotacao as auditoria_anotacao 
      FROM db_bloco_de_notas.cotacao c 
      LEFT JOIN db_bloco_de_notas.r_000250 r ON c.tarefa = r.cod_tarefa 
      LEFT JOIN db_bloco_de_notas.auditoria_qualidade aq ON aq.id_qldd = c.id_qldd 
      WHERE c.validacao = $1 AND (c.status = $2 OR c.status = $3)`;
    const params = ['Ativo', 'pendente-correcao-cadastral', 'pendente-iphone'];
    let paramIndex = 4;

    if (search && search.trim()) {
      query += ` AND (c.tarefa ILIKE $${paramIndex} OR c.cotacao ILIKE $${paramIndex} OR c.anotacao ILIKE $${paramIndex})`;
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    if (dateStart && dateStart.trim()) {
      const [year, month, day] = dateStart.trim().split('-');
      const dateStartBR = `${day}/${month}/${year}`;
      query += ` AND c.data_de_criacao LIKE $${paramIndex}`;
      params.push(`${dateStartBR}%`);
      paramIndex++;
    }

    if (origem && origem.trim() && origem !== 'todas') {
      if (origem === 'r_000250') {
        query += ` AND (c.origem = 'r_000250' OR c.origem IS NULL OR c.origem = '')`;
      } else {
        query += ` AND c.origem = $${paramIndex}`;
        params.push(origem.trim());
        paramIndex++;
      }
    }

    query += ' ORDER BY c.data_de_criacao DESC';

    const result = await pool.query(query, params);
const serialized = result.rows.map(row => ({
      tarefa: row.tarefa,
      cotacao: row.cotacao,
      cotacao_display: row.dsc_cotacao ? `${row.dsc_cotacao} - ${row.tarefa}` : row.tarefa,
      anotacao: row.anotacao,
      status: row.status,
      data_de_criacao: formatDateBR(row.data_de_criacao),
      data_da_ultima_atualizacao: formatDateBR(row.data_da_ultima_atualizacao),
      usuario_login: row.usuario_login,
      origem: row.origem || null,
      dsc_cotacao: row.dsc_cotacao || null,
      auditoria: row.auditoria_status ? { status: row.auditoria_status, anotacao: row.auditoria_anotacao || '' } : null
    }));

    res.json(serialized);
  } catch (error) {
    console.error('[CORRECAO_CAD] Erro ao buscar cotações:', error);
    res.status(500).json({ error: 'Erro ao buscar cotações para correção cadastral' });
  }
});

// Duplicate route with /pme_notas prefix
app.get('/pme_notas/api/quotations/correcao-cadastral', authenticateToken, async (req, res) => {
  try {
    const { search, dateStart, origem } = req.query;
    let query = `SELECT c.*, r.dsc_cotacao, r.qtd_linhas, r.qtd_linhas_novas, r.qtd_reprovacao, aq.status as auditoria_status, aq.anotacao as auditoria_anotacao 
      FROM db_bloco_de_notas.cotacao c 
      LEFT JOIN db_bloco_de_notas.r_000250 r ON c.tarefa = r.cod_tarefa 
      LEFT JOIN db_bloco_de_notas.auditoria_qualidade aq ON aq.id_qldd = c.id_qldd 
      WHERE c.validacao = $1 AND (c.status = $2 OR c.status = $3)`;
    const params = ['Ativo', 'pendente-correcao-cadastral', 'pendente-iphone'];
    let paramIndex = 4;

    if (search && search.trim()) {
      query += ` AND (c.tarefa ILIKE $${paramIndex} OR c.cotacao ILIKE $${paramIndex} OR c.anotacao ILIKE $${paramIndex})`;
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    if (dateStart && dateStart.trim()) {
      const [year, month, day] = dateStart.trim().split('-');
      const dateStartBR = `${day}/${month}/${year}`;
      query += ` AND c.data_de_criacao LIKE $${paramIndex}`;
      params.push(`${dateStartBR}%`);
      paramIndex++;
    }

    if (origem && origem.trim() && origem !== 'todas') {
      if (origem === 'r_000250') {
        query += ` AND (c.origem = 'r_000250' OR c.origem IS NULL OR c.origem = '')`;
      } else {
        query += ` AND c.origem = $${paramIndex}`;
        params.push(origem.trim());
        paramIndex++;
      }
    }

    query += ' ORDER BY c.data_de_criacao DESC';

    const result = await pool.query(query, params);
const serialized = result.rows.map(row => ({
      tarefa: row.tarefa,
      cotacao: row.cotacao,
      cotacao_display: row.dsc_cotacao ? `${row.dsc_cotacao} - ${row.tarefa}` : row.tarefa,
      anotacao: row.anotacao,
      status: row.status,
      data_de_criacao: formatDateBR(row.data_de_criacao),
      data_da_ultima_atualizacao: formatDateBR(row.data_da_ultima_atualizacao),
      usuario_login: row.usuario_login,
      origem: row.origem || null,
      dsc_cotacao: row.dsc_cotacao || null,
      auditoria: row.auditoria_status ? { status: row.auditoria_status, anotacao: row.auditoria_anotacao || '' } : null
    }));

    res.json(serialized);
  } catch (error) {
    console.error('[CORRECAO_CAD] Erro ao buscar cotações:', error);
    res.status(500).json({ error: 'Erro ao buscar cotações para correção cadastral' });
  }
});

// Get all quotations
app.get('/api/quotations', authenticateToken, async (req, res) => {
  try {
    const { search, dateStart } = req.query;
    const usuarioId = req.user.id;
    let query = `SELECT DISTINCT ON (c.tarefa) c.tarefa, c.cotacao, c.anotacao, c.status, c.data_de_criacao, c.data_da_ultima_atualizacao, c.usuario_login, c.origem, r.dsc_cotacao, c.data_historico, r.dat_historico as r_dat_historico, aq.status as auditoria_status, aq.anotacao as auditoria_anotacao FROM db_bloco_de_notas.cotacao c LEFT JOIN db_bloco_de_notas.r_000250 r ON c.tarefa = r.cod_tarefa LEFT JOIN db_bloco_de_notas.auditoria_qualidade aq ON aq.id_qldd = c.id_qldd WHERE c.usuario_id = $1 AND c.validacao = $2`;
    let params = [usuarioId, 'Ativo'];
    let paramIndex = 3;

    if (search) {
      query += ` AND (c.tarefa ILIKE $${paramIndex} OR c.cotacao ILIKE $${paramIndex} OR c.anotacao ILIKE $${paramIndex} OR c.status ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (dateStart && dateStart.trim()) {
      const [year, month, day] = dateStart.trim().split('-');
      const dateStartBR = `${day}/${month}/${year}`;
      query += ` AND c.data_de_criacao LIKE $${paramIndex}`;
      params.push(`${dateStartBR}%`);
      paramIndex++;
    }

    query += ' ORDER BY c.tarefa, c.data_da_ultima_atualizacao DESC NULLS LAST';

    const result = await pool.query(query, params);
    const serialized = result.rows.map(row => ({
      cotacao: row.tarefa,
      dsc_cotacao: row.cotacao || row.dsc_cotacao,
      anotacao: row.anotacao,
      status: row.status,
      createdAt: formatDateBR(row.data_de_criacao),
      updatedAt: formatDateBR(row.data_da_ultima_atualizacao),
      usuarioLogin: row.usuario_login,
      origem: row.origem || null,
      data_historico: row.data_historico || row.r_dat_historico || null,
      data_historico_sla: row.data_historico || row.r_dat_historico || null,
      auditoria: row.auditoria_status ? { status: row.auditoria_status, anotacao: row.auditoria_anotacao || '' } : null
    }));

    res.json(serialized);
  } catch (error) {
    console.error('Erro ao buscar cotações:', error);
    res.status(500).json({ error: 'Erro ao buscar cotações' });
  }
});

// Get single quotation by cotacao
app.get('/api/quotations/:cotacao', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM db_bloco_de_notas.cotacao WHERE tarefa = $1",
      [req.params.cotacao]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cotação não encontrada' });
    }

    const row = result.rows[0];
    res.json({
      cotacao: row.tarefa,
      dsc_cotacao: row.cotacao,
      anotacao: row.anotacao,
      status: row.status,
      createdAt: row.data_de_criacao,
      updatedAt: row.data_da_ultima_atualizacao
    });
  } catch (error) {
    console.error('Erro ao buscar cotação:', error);
    res.status(500).json({ error: 'Erro ao buscar cotação' });
  }
});

// Create new quotation
app.post('/api/quotations', authenticateToken, async (req, res) => {
  try {
    const { cotacao, anotacao } = req.body;
    const usuarioLogin = req.user.username;
    const usuarioId = req.user.id;

    if (!cotacao) {
      return res.status(400).json({ error: 'Cotação é obrigatória' });
    }

    const now = formatDateBR(new Date());
    // Store tarefa (code) and cotacao (dsc) separately. Try to fetch dsc and dat_historico from r_000250.
    let tarefaValue = cotacao;
    let cotacaoDsc = cotacao;
    let dataHistorico = null;
    try {
      const rRes = await pool.query('SELECT dsc_cotacao, dat_historico FROM db_bloco_de_notas.r_000250 WHERE cod_tarefa = $1', [cotacao]);
      if (rRes.rows.length > 0) {
        if (rRes.rows[0].dsc_cotacao) cotacaoDsc = rRes.rows[0].dsc_cotacao;
        if (rRes.rows[0].dat_historico) dataHistorico = rRes.rows[0].dat_historico;
      }
    } catch (e) {
      console.error('Erro ao buscar dados da r_000250:', e.message);
    }

    const result = await pool.query(
      'INSERT INTO db_bloco_de_notas.cotacao (tarefa, cotacao, anotacao, status, validacao, data_de_criacao, data_da_ultima_atualizacao, usuario_login, usuario_id, data_historico) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
      [tarefaValue, cotacaoDsc, anotacao || '', 'pendente', 'Ativo', now, now, usuarioLogin, usuarioId, dataHistorico]
    );

    const row = result.rows[0];
    res.status(201).json({
      cotacao: row.tarefa,
      dsc_cotacao: row.cotacao,
      anotacao: row.anotacao,
      status: row.status,
      createdAt: formatDateBR(row.data_de_criacao),
      updatedAt: formatDateBR(row.data_da_ultima_atualizacao),
      usuarioLogin: row.usuario_login
    });
  } catch (error) {
    console.error('Erro ao criar cotação:', error);
    res.status(500).json({ error: 'Erro ao criar cotação' });
  }
});

// Duplicate route with /pme_notas prefix
app.put('/pme_notas/api/quotations/:cotacao', authenticateToken, async (req, res) => {
  try {
    const { anotacao, status, auditoria_anotacao, auditoria_status } = req.body;
    const usuarioLogin = req.user.username;
    const usuarioId = req.user.id;
    const now = formatDateBR(new Date());

    console.log(`[PUT] Atualizando cotação: ${req.params.cotacao}`);
    console.log(`[PUT] Usuário: ${usuarioLogin}`);
    console.log(`[PUT] Dados recebidos:`, { anotacao, status, auditoria_anotacao, auditoria_status });

    // Buscar status anterior antes de atualizar (TODAS as cotações, não apenas do usuário)
    const beforeRes = await pool.query(
      "SELECT status FROM db_bloco_de_notas.cotacao WHERE tarefa = $1 AND validacao = 'Ativo'",
      [req.params.cotacao]
    );
    const statusAnterior = beforeRes.rows.length > 0 ? beforeRes.rows[0].status : null;

    const result = await pool.query(
      "UPDATE db_bloco_de_notas.cotacao SET anotacao = COALESCE($1, anotacao), status = COALESCE($2, status), data_da_ultima_atualizacao = $3 WHERE tarefa = $4 AND validacao = 'Ativo' RETURNING *",
      [anotacao, status, now, req.params.cotacao]
    );

    console.log(`[PUT] Linhas afetadas: ${result.rowCount}`);

    if (result.rows.length === 0) {
      console.log(`[PUT] Cotação não encontrada ou usuário não é dono: ${req.params.cotacao}`);
      return res.status(404).json({ error: 'Cotação não encontrada' });
    }

    const row = result.rows[0];

    // Salvar dados de auditoria se fornecidos
    if (auditoria_anotacao !== undefined || auditoria_status !== undefined) {
      try {
        // Verificar se já existe vínculo de auditoria para esta cotação
        const checkAudit = await pool.query(
          'SELECT id_qldd FROM db_bloco_de_notas.cotacao WHERE tarefa = $1 AND id_qldd IS NOT NULL',
          [req.params.cotacao]
        );

        if (checkAudit.rows.length > 0) {
          const idQldd = checkAudit.rows[0].id_qldd;
          await pool.query(
            'UPDATE db_bloco_de_notas.auditoria_qualidade SET anotacao = COALESCE($1, anotacao), status = COALESCE($2, status) WHERE id_qldd = $3',
            [auditoria_anotacao || '', auditoria_status || '', idQldd]
          );
        } else if (auditoria_anotacao || auditoria_status) {
          const insertAudit = await pool.query(
            'INSERT INTO db_bloco_de_notas.auditoria_qualidade (anotacao, status) VALUES ($1, $2) RETURNING id_qldd',
            [auditoria_anotacao || '', auditoria_status || '']
          );
          const newIdQldd = insertAudit.rows[0].id_qldd;
          await pool.query(
            'UPDATE db_bloco_de_notas.cotacao SET id_qldd = $1 WHERE tarefa = $2',
            [newIdQldd, req.params.cotacao]
          );
        }
      } catch (auditErr) {
        console.error('[PUT] Erro ao salvar auditoria:', auditErr.message);
      }
    }

    // Registrar auditoria de mudança de status
    if (status && String(statusAnterior || '').toLowerCase() !== String(status).toLowerCase()) {
        try {
            await registrarAuditoria(pool, {
                tarefa: req.params.cotacao,
                acao: 'status_alterado',
                usuario_origem_id: usuarioId,
                usuario_origem_nome: req.user.nome || usuarioLogin,
                usuario_destino_id: null,
                usuario_destino_nome: null,
                status_anterior: statusAnterior || '-',
                status_novo: status,
                criado_por: usuarioLogin
            });
        } catch (auditErr) {
            console.error('[PUT] Erro ao registrar auditoria (não crítico):', auditErr.message);
        }
    }

    console.log(`[PUT] Cotação atualizada com sucesso:`, row);
    
    res.json({
      cotacao: row.tarefa,
      dsc_cotacao: row.cotacao,
      anotacao: row.anotacao,
      status: row.status,
      createdAt: row.data_de_criacao,
      updatedAt: row.data_da_ultima_atualizacao,
      usuarioLogin: row.usuario_login
    });
  } catch (error) {
    console.error('[PUT] Erro ao atualizar cotação:', error);
    res.status(500).json({ error: 'Erro ao atualizar cotação' });
  }
});

// Update quotation
app.put('/api/quotations/:cotacao', authenticateToken, async (req, res) => {
  try {
    const { anotacao, status, auditoria_anotacao, auditoria_status } = req.body;
    const usuarioLogin = req.user.username;
    const usuarioId = req.user.id;
    const now = formatDateBR(new Date());

    console.log(`[PUT] Atualizando cotação: ${req.params.cotacao}`);
    console.log(`[PUT] Usuário: ${usuarioLogin}`);
    console.log(`[PUT] Dados recebidos:`, { anotacao, status, auditoria_anotacao, auditoria_status });

    // Buscar status anterior antes de atualizar (TODAS as cotações, não apenas do usuário)
    const beforeRes = await pool.query(
      "SELECT status FROM db_bloco_de_notas.cotacao WHERE tarefa = $1 AND validacao = 'Ativo'",
      [req.params.cotacao]
    );
    const statusAnterior = beforeRes.rows.length > 0 ? beforeRes.rows[0].status : null;

    const result = await pool.query(
      "UPDATE db_bloco_de_notas.cotacao SET anotacao = COALESCE($1, anotacao), status = COALESCE($2, status), data_da_ultima_atualizacao = $3 WHERE tarefa = $4 AND validacao = 'Ativo' RETURNING *",
      [anotacao, status, now, req.params.cotacao]
    );

    console.log(`[PUT] Linhas afetadas: ${result.rowCount}`);

    if (result.rows.length === 0) {
      console.log(`[PUT] Cotação não encontrada ou usuário não é dono: ${req.params.cotacao}`);
      return res.status(404).json({ error: 'Cotação não encontrada' });
    }

    const row = result.rows[0];

    // Salvar dados de auditoria se fornecidos
    if (auditoria_anotacao !== undefined || auditoria_status !== undefined) {
      try {
        // Verificar se já existe vínculo de auditoria para esta cotação
        const checkAudit = await pool.query(
          'SELECT id_qldd FROM db_bloco_de_notas.cotacao WHERE tarefa = $1 AND id_qldd IS NOT NULL',
          [req.params.cotacao]
        );

        if (checkAudit.rows.length > 0) {
          const idQldd = checkAudit.rows[0].id_qldd;
          await pool.query(
            'UPDATE db_bloco_de_notas.auditoria_qualidade SET anotacao = COALESCE($1, anotacao), status = COALESCE($2, status) WHERE id_qldd = $3',
            [auditoria_anotacao || '', auditoria_status || '', idQldd]
          );
        } else if (auditoria_anotacao || auditoria_status) {
          const insertAudit = await pool.query(
            'INSERT INTO db_bloco_de_notas.auditoria_qualidade (anotacao, status) VALUES ($1, $2) RETURNING id_qldd',
            [auditoria_anotacao || '', auditoria_status || '']
          );
          const newIdQldd = insertAudit.rows[0].id_qldd;
          await pool.query(
            'UPDATE db_bloco_de_notas.cotacao SET id_qldd = $1 WHERE tarefa = $2',
            [newIdQldd, req.params.cotacao]
          );
        }
      } catch (auditErr) {
        console.error('[PUT] Erro ao salvar auditoria:', auditErr.message);
      }
    }

    // Registrar auditoria de mudança de status
    if (status && String(statusAnterior || '').toLowerCase() !== String(status).toLowerCase()) {
        try {
            await registrarAuditoria(pool, {
                tarefa: req.params.cotacao,
                acao: 'status_alterado',
                usuario_origem_id: usuarioId,
                usuario_origem_nome: req.user.nome || usuarioLogin,
                usuario_destino_id: null,
                usuario_destino_nome: null,
                status_anterior: statusAnterior || '-',
                status_novo: status,
                criado_por: usuarioLogin
            });
        } catch (auditErr) {
            console.error('[PUT] Erro ao registrar auditoria (não crítico):', auditErr.message);
        }
    }

    console.log(`[PUT] Cotação atualizada com sucesso:`, row);
    
    res.json({
      cotacao: row.tarefa,
      dsc_cotacao: row.cotacao,
      anotacao: row.anotacao,
      status: row.status,
      createdAt: row.data_de_criacao,
      updatedAt: row.data_da_ultima_atualizacao,
      usuarioLogin: row.usuario_login
    });
  } catch (error) {
    console.error('[PUT] Erro ao atualizar cotação:', error);
    res.status(500).json({ error: 'Erro ao atualizar cotação' });
  }
});

// Duplicate route with /pme_notas prefix
app.delete('/pme_notas/api/quotations/:cotacao', authenticateToken, async (req, res) => {
  try {
    const usuarioLogin = req.user.username;
    const usuarioId = req.user.id;
    console.log(`[DELETE] Soft delete cotação: ${req.params.cotacao}`);
    console.log(`[DELETE] Usuário: ${usuarioLogin}`);

    const result = await pool.query(
      "UPDATE db_bloco_de_notas.cotacao SET validacao = $1, data_da_ultima_atualizacao = $2 WHERE tarefa = $3 AND usuario_id = $4 RETURNING *",
      ['Inativo', formatDateBR(new Date()), req.params.cotacao, usuarioId]
    );

    console.log(`[DELETE] Linhas afetadas: ${result.rowCount}`);

    if (result.rows.length === 0) {
      console.log(`[DELETE] Cotação não encontrada ou usuário não é dono: ${req.params.cotacao}`);
      return res.status(404).json({ error: 'Cotação não encontrada' });
    }

    console.log(`[DELETE] Cotação deletada com sucesso:`, result.rows[0]);
    res.json({ message: 'Cotação deletada com sucesso' });
  } catch (error) {
    console.error('[DELETE] Erro ao deletar cotação:', error);
    res.status(500).json({ error: 'Erro ao deletar cotação' });
  }
});

// Delete quotation (soft delete - update validacao to 'inativo')
app.delete('/api/quotations/:cotacao', authenticateToken, async (req, res) => {
  try {
    const usuarioLogin = req.user.username;
    const usuarioId = req.user.id;
    console.log(`[DELETE] Soft delete cotação: ${req.params.cotacao}`);
    console.log(`[DELETE] Usuário: ${usuarioLogin}`);

    const result = await pool.query(
      "UPDATE db_bloco_de_notas.cotacao SET validacao = $1, data_da_ultima_atualizacao = $2 WHERE tarefa = $3 AND usuario_id = $4 RETURNING *",
      ['Inativo', formatDateBR(new Date()), req.params.cotacao, usuarioId]
    );

    console.log(`[DELETE] Linhas afetadas: ${result.rowCount}`);

    if (result.rows.length === 0) {
      console.log(`[DELETE] Cotação não encontrada ou usuário não é dono: ${req.params.cotacao}`);
      return res.status(404).json({ error: 'Cotação não encontrada' });
    }

    console.log(`[DELETE] Cotação deletada com sucesso:`, result.rows[0]);
    res.json({ message: 'Cotação deletada com sucesso' });
  } catch (error) {
    console.error('[DELETE] Erro ao deletar cotação:', error);
    res.status(500).json({ error: 'Erro ao deletar cotação' });
  }
});

// Trocar senha endpoint
app.post('/api/trocar-senha', async (req, res) => {
  try {
    const token = req.cookies?.token || req.headers?.authorization?.replace('Bearer ', '');
    const { senhaAtual, novaSenha } = req.body;

    if (!token || !senhaAtual || !novaSenha) {
      return res.status(400).json({ success: false, message: 'Token, senha atual e nova senha são obrigatórios' });
    }

    // Verificar token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Token inválido ou expirado' });
    }

    // Buscar usuário
    const userResult = await pool.query(
      'SELECT id, login, nome, sobrenome, email, senha, ativo, deve_trocar_senha FROM db_automacao.usuarios WHERE id = $1',
      [decoded.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Usuário não encontrado' });
    }

    const user = userResult.rows[0];

    if (!user.ativo) {
      return res.status(401).json({ success: false, message: 'Usuário inativo' });
    }

    // Verificar senha atual
    let senhaValida = false;

    // Se deve_trocar_senha, aceitar senha padrão como senha atual
    if (user.deve_trocar_senha && senhaAtual === SENHA_PADRAO_TROCA) {
      senhaValida = true;
    }

    if (!senhaValida) {
      try {
        senhaValida = await bcrypt.compare(senhaAtual, user.senha);
      } catch (error) {
        senhaValida = false;
      }
    }

    if (!senhaValida && typeof user.senha === 'string' && user.senha === senhaAtual) {
      senhaValida = true;
    }

    if (!senhaValida) {
      return res.status(401).json({ success: false, message: 'Senha atual incorreta' });
    }

    // Hashear nova senha
    const novaSenhaHash = await bcrypt.hash(novaSenha, 10);

    // Atualizar senha no banco
    await pool.query(
      `UPDATE db_automacao.usuarios
       SET senha = $1,
           deve_trocar_senha = false,
           data_ultima_troca_senha = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [novaSenhaHash, user.id]
    );

    res.json({ success: true, message: 'Senha atualizada com sucesso' });

  } catch (error) {
    console.error('[TROCAR SENHA] Erro:', error.message);
    res.status(500).json({ success: false, message: 'Erro interno ao trocar senha' });
  }
});

// Serve trocar-senha page
app.get('/trocar-senha', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'trocar-senha.html'));
});


// Serve the frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});


// Serve quotations page
app.get('/cotacoes', (req, res) => {
  let token = req.cookies.token || req.headers['authorization']?.replace('Bearer ', '');
  if (!token) {
    return res.redirect('/pme_notas/login.html');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});





app.get('/cotacoes', (req, res) => {
  let token = req.cookies.token || req.headers['authorization']?.replace('Bearer ', '');
  if (!token) {
    return res.redirect('/pme_notas/login.html');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/reprova_padrao', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reprova_padrao.html'));
});



// Atualizar tabela r_000250 a partir do db_claro
app.post('/api/inpecao/atualizar_r_000250', authenticateToken, authorizeRoute('/pme_notas/inpecao'), async (req, res) => {
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
app.post('/api/inpecao/classificar-pendentes', authenticateToken, authorizeRoute('/pme_notas/inpecao'), async (req, res) => {
  try {
    const result = await classificarPendentes();
    
    res.json({
      success: true,
      message: `${result.classificados} cotações classificadas como "Pendente - Classificação"`,
      ...result
    });
  } catch (error) {
    console.error('[GESTAO] Erro na classificação manual:', error);
    res.status(500).json({ error: `Erro ao classificar cotações: ${error.message}` });
  }
});

// Serve dashboard page
app.get('/inpecao/dashboard', authenticateToken, authorizeRoute('/pme_notas/inpecao'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard_inp.html'));
});


app.get('/api/inpecao/dashboard', authenticateToken, async (req, res) => {
  res.json([]);
});

app.get('/api/inpecao/historico', authenticateToken, async (req, res) => {
  const { limit = 200, tarefa } = req.query;
  res.json([]);
});

// Serve devolucao padrao page
app.get('/devolucoes-padrao', authenticateToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'devolucao_padrao_web.html'));
});


// ===== ROTAS DE QUALIDADE (auditoria_qualidade) =====

// API: Listar todas as cotações para auditoria de qualidade
app.get('/api/qualidade', authenticateToken, async (req, res) => {
  try {
    const { search, dateStart, origem } = req.query;
    let query = `SELECT * FROM (
      SELECT DISTINCT ON (c.usuario_id) c.id_cotacao, c.cotacao, c.tarefa, c.anotacao, c.status, c.validacao, c.data_de_criacao, c.data_da_ultima_atualizacao, c.usuario_login, c.usuario_id, c.origem, c.id_qldd,
        TRIM(COALESCE(u.nome, '') || ' ' || COALESCE(u.sobrenome, '')) as usuario_nome
        FROM db_bloco_de_notas.cotacao c 
        LEFT JOIN db_automacao.usuarios u ON u.id::TEXT = c.usuario_id::TEXT
        WHERE c.validacao = 'Ativo'`;
    const params = [];
    let paramIndex = 1;

    if (search && search.trim()) {
      query += ` AND (
        LOWER(TRIM(COALESCE(u.nome, '') || ' ' || COALESCE(u.sobrenome, ''))) LIKE LOWER($${paramIndex})
        OR LOWER(c.usuario_login) LIKE LOWER($${paramIndex})
      )`;
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    const effectiveDate = dateStart || new Date().toISOString().split('T')[0];
    const [year, month, day] = effectiveDate.split('-');
    const dateStartBR = `${day}/${month}/${year}`;
    query += ` AND c.data_de_criacao LIKE $${paramIndex}`;
    params.push(`${dateStartBR}%`);
    paramIndex++;

    if (origem && origem.trim() && origem !== 'todas') {
      if (origem === 'r_000250') {
        query += ` AND (c.origem = 'r_000250' OR c.origem IS NULL OR c.origem = '')`;
      } else {
        query += ` AND c.origem = $${paramIndex}`;
        params.push(origem.trim());
        paramIndex++;
      }
    }

    if (req.query.status && req.query.status.trim()) {
      query += ` AND LOWER(c.status) = LOWER($${paramIndex})`;
      params.push(req.query.status.trim());
      paramIndex++;
    }

    query += ' ORDER BY c.usuario_id, c.data_de_criacao DESC) sub ORDER BY sub.data_de_criacao DESC';

    const result = await pool.query(query, params);

    // Para cada cotação, verificar se já existe auditoria
    const rows = await Promise.all(result.rows.map(async (row) => {
      let auditoria = null;
      try {
        const auditRes = await pool.query(
          `SELECT aq.anotacao, aq.status FROM db_bloco_de_notas.auditoria_qualidade aq
           LEFT JOIN db_bloco_de_notas.cotacao c ON c.id_qldd = aq.id_qldd
           WHERE c.id_cotacao = $1`,
          [row.id_cotacao]
        );
        if (auditRes.rows.length > 0) {
          auditoria = {
            anotacao: auditRes.rows[0].anotacao,
            status: auditRes.rows[0].status
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
        auditoria
      };
    }));

    res.json(rows);
  } catch (error) {
    console.error('[QUALIDADE] Erro ao listar cotações:', error);
    res.status(500).json({ error: 'Erro ao listar cotações para auditoria' });
  }
});

// API: Salvar auditoria de qualidade (insere ou atualiza na auditoria_qualidade)
app.post('/api/qualidade/auditar', authenticateToken, async (req, res) => {
  try {
    const { id_cotacao, anotacao, status } = req.body;

    if (!id_cotacao) {
      return res.status(400).json({ error: 'ID da cotação é obrigatório' });
    }

    if (!status) {
      return res.status(400).json({ error: 'Status é obrigatório' });
    }

    const statusPermitidos = ['Procedimento Correto', 'Devolução Parcial', 'Devolução Indevida', 'Reprova Parcial', 'Reprova Indevida', 'Aprovacao Indevida'];
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

    // Atualizar o status na tabela cotacao também
    await pool.query(
      "UPDATE db_bloco_de_notas.cotacao SET status = $1, data_da_ultima_atualizacao = $2 WHERE id_cotacao = $3 AND validacao = 'Ativo'",
      [status.toLowerCase(), formatDateBR(new Date()), id_cotacao]
    );

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

// API: Salvar auditoria de qualidade completa (todos os campos)
app.post('/api/qualidade/auditar-completo', authenticateToken, async (req, res) => {
    try {
        const { id_cotacao, reprova_bko, apontamento, motivo_1_sistema_documento, motivo_2_erro, motivo_3_detalhamento, contestacao, obs, regional, tipo_de_pedido, enviado, data_envio, status } = req.body;
        const usuarioLogadoId = req.user.id;

        if (!id_cotacao) {
            return res.status(400).json({ error: 'ID da cotação é obrigatório' });
        }
        if (!status) {
            return res.status(400).json({ error: 'Status é obrigatório' });
        }
        const statusPermitidos = ['Procedimento Correto', 'Devolução Parcial', 'Devolução Indevida', 'Reprova Parcial', 'Reprova Indevida', 'Aprovacao Indevida'];
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
            [cotacao.usuario_id]
        );
        const analistaNome = analistaRes.rows.length > 0 ? analistaRes.rows[0].nome : null;

        const now = new Date();
        const dataQualidade = formatDateBR(now);
        const semana = calcularSemana(now);
        const anotacao = [reprova_bko, apontamento].filter(Boolean).join('\n');

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
                    apontamento = $15, contestacao = $16, obs = $17, enviado = $18, data_envio = $19, semana = $20
                WHERE id_qldd = $21`,
                [anotacao, status, now, usuarioLogadoId, reprova_bko || '', cotacao.tarefa, analistaNome,
                 dataAnalise, cotacao.cotacao, regional || '', tipo_de_pedido || '',
                 motivo_1_sistema_documento || '', motivo_2_erro || '', motivo_3_detalhamento || '',
                 apontamento || '', contestacao || '', obs || '', enviado || false,
                 data_envio ? new Date(data_envio) : null, semana, idQldd]
            );
        } else {
            const insertAudit = await pool.query(
                `INSERT INTO db_bloco_de_notas.auditoria_qualidade
                    (anotacao, status, data_qualidade, analista_qualidade_id, reprova_bko, codigo_tarefa, analista, data_analise, cotacao, regional, tipo_de_pedido, motivo_1_sistema_documento, motivo_2_erro, motivo_3_detalhamento, apontamento, contestacao, obs, enviado, data_envio, semana)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id_qldd`,
                [anotacao, status, now, usuarioLogadoId, reprova_bko || '', cotacao.tarefa, analistaNome,
                 dataAnalise, cotacao.cotacao, regional || '', tipo_de_pedido || '',
                 motivo_1_sistema_documento || '', motivo_2_erro || '', motivo_3_detalhamento || '',
                 apontamento || '', contestacao || '', obs || '', enviado || false,
                 data_envio ? new Date(data_envio) : null, semana]
            );
            const newIdQldd = insertAudit.rows[0].id_qldd;
            await pool.query(
                'UPDATE db_bloco_de_notas.cotacao SET id_qldd = $1 WHERE id_cotacao = $2',
                [newIdQldd, id_cotacao]
            );
        }

        await pool.query(
            "UPDATE db_bloco_de_notas.cotacao SET status = $1, data_da_ultima_atualizacao = $2 WHERE id_cotacao = $3 AND validacao = 'Ativo'",
            [status.toLowerCase(), formatDateBR(new Date()), id_cotacao]
        );

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

// API: Estatísticas de qualidade para o usuário logado
app.get('/api/qualidade/stats', authenticateToken, async (req, res) => {
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

// Duplicate route with /pme_notas prefix
app.get('/pme_notas/api/qualidade/auditoria/:id_cotacao', authenticateToken, async (req, res) => {
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
      status: result.rows[0].status
    });
  } catch (error) {
    console.error('[QUALIDADE] Erro ao buscar auditoria:', error);
    res.status(500).json({ error: 'Erro ao buscar auditoria' });
  }
});

// API: Buscar auditoria de uma cotação específica
app.get('/api/qualidade/auditoria/:id_cotacao', authenticateToken, async (req, res) => {
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
      status: result.rows[0].status
    });
  } catch (error) {
    console.error('[QUALIDADE] Erro ao buscar auditoria:', error);
    res.status(500).json({ error: 'Erro ao buscar auditoria' });
  }
});

// Duplicate route with /pme_notas prefix
app.get('/pme_notas/api/qualidade', authenticateToken, async (req, res) => {
  try {
    const { search, dateStart, origem } = req.query;
    let query = `SELECT * FROM (
      SELECT DISTINCT ON (c.usuario_id) c.id_cotacao, c.cotacao, c.tarefa, c.anotacao, c.status, c.validacao, c.data_de_criacao, c.data_da_ultima_atualizacao, c.usuario_login, c.usuario_id, c.origem, c.id_qldd,
        TRIM(COALESCE(u.nome, '') || ' ' || COALESCE(u.sobrenome, '')) as usuario_nome
        FROM db_bloco_de_notas.cotacao c 
        LEFT JOIN db_automacao.usuarios u ON u.id::TEXT = c.usuario_id::TEXT
        WHERE c.validacao = 'Ativo'`;
    const params = [];
    let paramIndex = 1;

    if (search && search.trim()) {
      query += ` AND (
        LOWER(TRIM(COALESCE(u.nome, '') || ' ' || COALESCE(u.sobrenome, ''))) LIKE LOWER($${paramIndex})
        OR LOWER(c.usuario_login) LIKE LOWER($${paramIndex})
      )`;
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    const effectiveDate = dateStart || new Date().toISOString().split('T')[0];
    const [year, month, day] = effectiveDate.split('-');
    const dateStartBR = `${day}/${month}/${year}`;
    query += ` AND c.data_de_criacao LIKE $${paramIndex}`;
    params.push(`${dateStartBR}%`);
    paramIndex++;

    if (origem && origem.trim() && origem !== 'todas') {
      if (origem === 'r_000250') {
        query += ` AND (c.origem = 'r_000250' OR c.origem IS NULL OR c.origem = '')`;
      } else {
        query += ` AND c.origem = $${paramIndex}`;
        params.push(origem.trim());
        paramIndex++;
      }
    }

    if (req.query.status && req.query.status.trim()) {
      query += ` AND LOWER(c.status) = LOWER($${paramIndex})`;
      params.push(req.query.status.trim());
      paramIndex++;
    }

    query += ' ORDER BY c.usuario_id, c.data_de_criacao DESC) sub ORDER BY sub.data_de_criacao DESC';

    const result = await pool.query(query, params);

    // Para cada cotação, verificar se já existe auditoria
    const rows = await Promise.all(result.rows.map(async (row) => {
      let auditoria = null;
      try {
        const auditRes = await pool.query(
          `SELECT aq.anotacao, aq.status FROM db_bloco_de_notas.auditoria_qualidade aq
           LEFT JOIN db_bloco_de_notas.cotacao c ON c.id_qldd = aq.id_qldd
           WHERE c.id_cotacao = $1`,
          [row.id_cotacao]
        );
        if (auditRes.rows.length > 0) {
          auditoria = {
            anotacao: auditRes.rows[0].anotacao,
            status: auditRes.rows[0].status
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
        auditoria
      };
    }));

    res.json(rows);
  } catch (error) {
    console.error('[QUALIDADE] Erro ao listar cotações:', error);
    res.status(500).json({ error: 'Erro ao listar cotações para auditoria' });
  }
});

// Duplicate route with /pme_notas prefix
app.post('/pme_notas/api/qualidade/auditar', authenticateToken, async (req, res) => {
    try {
        const { id_cotacao, anotacao, status } = req.body;

        if (!id_cotacao) {
            return res.status(400).json({ error: 'ID da cotação é obrigatório' });
        }

        if (!status) {
            return res.status(400).json({ error: 'Status é obrigatório' });
        }

        const statusPermitidos = ['Procedimento Correto', 'Devolução Parcial', 'Devolução Indevida', 'Reprova Parcial', 'Reprova Indevida', 'Aprovacao Indevida'];
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

        // Atualizar o status na tabela cotacao também
        await pool.query(
            "UPDATE db_bloco_de_notas.cotacao SET status = $1, data_da_ultima_atualizacao = $2 WHERE id_cotacao = $3 AND validacao = 'Ativo'",
            [status.toLowerCase(), formatDateBR(new Date()), id_cotacao]
        );

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

// Duplicate route with /pme_notas prefix
app.post('/pme_notas/api/qualidade/auditar-completo', authenticateToken, async (req, res) => {
    try {
        const { id_cotacao, reprova_bko, apontamento, motivo_1_sistema_documento, motivo_2_erro, motivo_3_detalhamento, contestacao, obs, regional, tipo_de_pedido, enviado, data_envio, status } = req.body;
        const usuarioLogadoId = req.user.id;

        if (!id_cotacao) {
            return res.status(400).json({ error: 'ID da cotação é obrigatório' });
        }
        if (!status) {
            return res.status(400).json({ error: 'Status é obrigatório' });
        }
        const statusPermitidos = ['Procedimento Correto', 'Devolução Parcial', 'Devolução Indevida', 'Reprova Parcial', 'Reprova Indevida', 'Aprovacao Indevida'];
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

        const parseBRDate = (value) => {
            if (!value) return null;
            const text = String(value).trim();
            if (!text) return null;
            const m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}))?$/);
            if (!m) return null;
            const [ , day, month, year, hour = '00', minute = '00' ] = m;
            return new Date(`${year}-${month}-${day}T${hour}:${minute}:00`);
        };
        const dataAnalise = parseBRDate(cotacao.data_de_criacao);
        const analistaRes = await pool.query(
            "SELECT TRIM(COALESCE(nome, '') || ' ' || COALESCE(sobrenome, '')) as nome FROM db_automacao.usuarios WHERE id::TEXT = $1",
            [cotacao.usuario_id]
        );
        const analistaNome = analistaRes.rows.length > 0 ? analistaRes.rows[0].nome : null;

        const now = new Date();
        const dataQualidade = formatDateBR(now);
        const semana = calcularSemana(now);
        const anotacao = [reprova_bko, apontamento].filter(Boolean).join('\n');

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
                    apontamento = $15, contestacao = $16, obs = $17, enviado = $18, data_envio = $19, semana = $20
                WHERE id_qldd = $21`,
                [anotacao, status, now, usuarioLogadoId, reprova_bko || '', cotacao.tarefa, analistaNome,
                 dataAnalise, cotacao.cotacao, regional || '', tipo_de_pedido || '',
                 motivo_1_sistema_documento || '', motivo_2_erro || '', motivo_3_detalhamento || '',
                 apontamento || '', contestacao || '', obs || '', enviado || false,
                 data_envio ? new Date(data_envio) : null, semana, idQldd]
            );
        } else {
            const insertAudit = await pool.query(
                `INSERT INTO db_bloco_de_notas.auditoria_qualidade
                    (anotacao, status, data_qualidade, analista_qualidade_id, reprova_bko, codigo_tarefa, analista, data_analise, cotacao, regional, tipo_de_pedido, motivo_1_sistema_documento, motivo_2_erro, motivo_3_detalhamento, apontamento, contestacao, obs, enviado, data_envio, semana)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id_qldd`,
                [anotacao, status, now, usuarioLogadoId, reprova_bko || '', cotacao.tarefa, analistaNome,
                 dataAnalise, cotacao.cotacao, regional || '', tipo_de_pedido || '',
                 motivo_1_sistema_documento || '', motivo_2_erro || '', motivo_3_detalhamento || '',
                 apontamento || '', contestacao || '', obs || '', enviado || false,
                 data_envio ? new Date(data_envio) : null, semana]
            );
            const newIdQldd = insertAudit.rows[0].id_qldd;
            await pool.query(
                'UPDATE db_bloco_de_notas.cotacao SET id_qldd = $1 WHERE id_cotacao = $2',
                [newIdQldd, id_cotacao]
            );
        }

        await pool.query(
            "UPDATE db_bloco_de_notas.cotacao SET status = $1, data_da_ultima_atualizacao = $2 WHERE id_cotacao = $3 AND validacao = 'Ativo'",
            [status.toLowerCase(), formatDateBR(new Date()), id_cotacao]
        );

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

// ===== ROTAS DE RCV (Réplica) =====

// API: Listar registros RCV com join em cotacao e usuarios
app.get('/api/rcv', authenticateToken, async (req, res) => {
  try {
    const { search, dateStart, fila, etapa } = req.query;
    let query = `
      SELECT rcv.codigo_tarefa, rcv.data_de_criacao, rcv.data_da_ultima_alteracao_etapa,
             rcv.fila, rcv.etapa, rcv.titulo_tarefa, rcv.descricao,
             rcv.demandante, rcv.responsavel_atual, rcv.status, rcv.pont, rcv.leitura,
             rcv.area_ofensora, rcv.status_replica, rcv.tarefa, rcv.cotacao,
             rcv.motivo, rcv.submotivos, rcv.detalhamento, rcv.descricao2,
             rcv.nome, rcv.data_hora, rcv.mes, rcv.turno, rcv.status2, rcv.motivo3, rcv.obs,
             TRIM(COALESCE(u.nome, '') || ' ' || COALESCE(u.sobrenome, '')) as colaborador_nome
      FROM db_qualidade.rcv rcv
      LEFT JOIN db_bloco_de_notas.cotacao c ON c.tarefa = rcv.codigo_tarefa
      LEFT JOIN db_automacao.usuarios u ON u.id::TEXT = c.usuario_id::TEXT
      WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (search && search.trim()) {
      query += ` AND (rcv.codigo_tarefa ILIKE $${paramIndex} OR rcv.cotacao ILIKE $${paramIndex} OR TRIM(COALESCE(u.nome, '') || ' ' || COALESCE(u.sobrenome, '')) ILIKE $${paramIndex})`;
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    if (dateStart && dateStart.trim()) {
      const [year, month, day] = dateStart.trim().split('-');
      const dateStartBR = `${day}/${month}/${year}`;
      query += ` AND rcv.data_de_criacao LIKE $${paramIndex}`;
      params.push(`${dateStartBR}%`);
      paramIndex++;
    }

    if (fila && fila.trim()) {
      query += ` AND rcv.fila = $${paramIndex}`;
      params.push(fila.trim());
      paramIndex++;
    }

    if (etapa && etapa.trim()) {
      query += ` AND rcv.etapa = $${paramIndex}`;
      params.push(etapa.trim());
      paramIndex++;
    }

    query += ' ORDER BY rcv.data_de_criacao DESC NULLS LAST';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('[RCV] Erro ao listar registros:', error);
    res.status(500).json({ error: 'Erro ao listar registros RCV' });
  }
});

// Duplicate route with /pme_notas prefix
app.get('/pme_notas/api/rcv', authenticateToken, async (req, res) => {
  try {
    const { search, dateStart, fila, etapa } = req.query;
    let query = `
      SELECT rcv.codigo_tarefa, rcv.data_de_criacao, rcv.data_da_ultima_alteracao_etapa,
             rcv.fila, rcv.etapa, rcv.titulo_tarefa, rcv.descricao,
             rcv.demandante, rcv.responsavel_atual, rcv.status, rcv.pont, rcv.leitura,
             rcv.area_ofensora, rcv.status_replica, rcv.tarefa, rcv.cotacao,
             rcv.motivo, rcv.submotivos, rcv.detalhamento, rcv.descricao2,
             rcv.nome, rcv.data_hora, rcv.mes, rcv.turno, rcv.status2, rcv.motivo3, rcv.obs,
             TRIM(COALESCE(u.nome, '') || ' ' || COALESCE(u.sobrenome, '')) as colaborador_nome
      FROM db_qualidade.rcv rcv
      LEFT JOIN db_bloco_de_notas.cotacao c ON c.tarefa = rcv.codigo_tarefa
      LEFT JOIN db_automacao.usuarios u ON u.id::TEXT = c.usuario_id::TEXT
      WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (search && search.trim()) {
      query += ` AND (rcv.codigo_tarefa ILIKE $${paramIndex} OR rcv.cotacao ILIKE $${paramIndex} OR TRIM(COALESCE(u.nome, '') || ' ' || COALESCE(u.sobrenome, '')) ILIKE $${paramIndex})`;
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    if (dateStart && dateStart.trim()) {
      const [year, month, day] = dateStart.trim().split('-');
      const dateStartBR = `${day}/${month}/${year}`;
      query += ` AND rcv.data_de_criacao LIKE $${paramIndex}`;
      params.push(`${dateStartBR}%`);
      paramIndex++;
    }

    if (fila && fila.trim()) {
      query += ` AND rcv.fila = $${paramIndex}`;
      params.push(fila.trim());
      paramIndex++;
    }

    if (etapa && etapa.trim()) {
      query += ` AND rcv.etapa = $${paramIndex}`;
      params.push(etapa.trim());
      paramIndex++;
    }

    query += ' ORDER BY rcv.data_de_criacao DESC NULLS LAST';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('[RCV] Erro ao listar registros:', error);
    res.status(500).json({ error: 'Erro ao listar registros RCV' });
  }
});

// Serve rcv page
app.get('/rcv', authenticateToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'rcv.html'));
});

app.get('/pme_notas/rcv', authenticateToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'rcv.html'));
});

// Serve qualidade page
app.get('/qualidade', authenticateToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'qualidade.html'));
});

app.get('/pme_notas/qualidade', authenticateToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'qualidade.html'));
});


// Serve gestao_input page
app.get('/inpecao_input', authenticateToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'gestao_input.html'));
});

app.get('/input', authenticateToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'gestao_input.html'));
});

app.get('/input_top', authenticateToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'gestao_input_top.html'));
});

app.get('/input_net', authenticateToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'gestao_input_net.html'));
});

// Serve input_net dashboard page
app.get('/input_net/dashboard', authenticateToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard_input_net.html'));
});

app.get('/pme_notas/input_net/dashboard', authenticateToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard_input_net.html'));
});

// Usar rotas de inspeção
app.use(inspecaoRoutes);

// Usar rotas de input_net (API e dashboard)
app.use('/api/input_net', inputNetRoutes);
app.use('/pme_notas/api/input_net', inputNetRoutes);

// ===== ROTAS DE ACESSOS (gerenciamento de permissões) =====

// Mapeamento de opções para rotas
const OPCOES_ROTAS = {
    gestao: ['/pme_notas/input_net', '/pme_notas/input_top', '/pme_notas/inspecao', '/pme_notas/dashboard'],
    qualidade: ['/pme_notas/qualidade', '/pme_notas/rcv'],
    admin: ['/pme_notas/acessos']
};

// Espelho das rotas de acessos com prefixo /pme_notas (acessível tanto por /pme_notas/api/acessos/... quanto por /api/acessos/...)
app.get('/pme_notas/api/acessos/usuarios', authenticateToken, async (req, res) => {
    req.url = req.url.replace(/^\/pme_notas/, '');
    req.originalUrl = req.originalUrl.replace(/^\/pme_notas/, '');
    app._router.handle(req, res);
});

app.get('/pme_notas/api/acessos/usuarios/:id/permissoes', authenticateToken, async (req, res) => {
    req.url = req.url.replace(/^\/pme_notas/, '');
    req.originalUrl = req.originalUrl.replace(/^\/pme_notas/, '');
    app._router.handle(req, res);
});

app.post('/pme_notas/api/acessos/usuarios/:id/permissoes', authenticateToken, async (req, res) => {
    req.url = req.url.replace(/^\/pme_notas/, '');
    req.originalUrl = req.originalUrl.replace(/^\/pme_notas/, '');
    app._router.handle(req, res);
});

// API: Buscar usuários por nome/sobrenome
app.get('/api/acessos/usuarios', authenticateToken, async (req, res) => {
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

// API: Listar permissões de um usuário
app.get('/api/acessos/usuarios/:id/permissoes', authenticateToken, async (req, res) => {
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

// Espelho da rota POST /api/acessos/usuarios/:id/permissoes com prefixo /pme_notas
app.post('/pme_notas/api/acessos/usuarios/:id/permissoes', authenticateToken, async (req, res) => {
    req.url = req.url.replace(/^\/pme_notas/, '');
    req.originalUrl = req.originalUrl.replace(/^\/pme_notas/, '');
    app._router.handle(req, res);
});

// API: Salvar permissões de um usuário (sincroniza com base nas opções selecionadas)
app.post('/api/acessos/usuarios/:id/permissoes', authenticateToken, async (req, res) => {
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

// Serve página de acessos
app.get('/acessos', authenticateToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'acessos.html'));
});

app.get('/correcao_cadastral', authenticateToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'correcao_cadastral.html'));
});





// API Tarefas Input TOP (antes do fallback SPA)
app.get('/api/inpecao/tarefas_top', authenticateToken, async (req, res) => {
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
    console.error('[GESTAO_TOP] Erro:', error);
    res.status(500).json({ error: 'Erro ao buscar dados' });
  }
});

// API Tarefas Input NET (antes do fallback SPA)
app.get('/api/inpecao/tarefas_net', authenticateToken, async (req, res) => {
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
        hc.etapa_atual NOT ILIKE '%Demanda Expirada%'
        AND (hc.data_historico::date = CURRENT_DATE OR (hc.etapa_atual ILIKE '%01%' OR hc.etapa_atual ILIKE '%02%'))
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
    console.error('[GESTAO_NET] Erro:', error);
    res.status(500).json({ error: 'Erro ao buscar dados' });
  }
});

// Upload CSV/ZIP e processar ETL para iw_cpc_975
app.post('/api/inpecao/upload', authenticateToken, inputUpload.single('file'), async (req, res) => {
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
app.get('/api/input_net/tarefas', authenticateToken, async (req, res) => {
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

app.post('/api/input_net/upload', authenticateToken, inputUpload.single('file'), async (req, res) => {
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
app.post('/api/inpecao_input/upload', authenticateToken, inputUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }
    
    const filePath = req.file.path;
    console.log(`[GESTAO_INPUT] Upload recebido: ${req.file.originalname} -> ${filePath}`);
    
    const result = await processarETL_975_net(filePath, pool);
    
    res.json({
      success: true,
      message: `Arquivo processado com sucesso. ${result.totalRows} registros carregados.`,
      totalRows: result.totalRows
    });
    
  } catch (error) {
    console.error('[GESTAO_INPUT] Erro no upload/ETL:', error);
    res.status(500).json({ error: `Erro ao processar arquivo: ${error.message}` });
  }
});

// Atualizar tabela iw_cpc_975_net a partir da esteira (somente dados do dia)
app.post('/api/inpecao/atualizar_input_net', authenticateToken, async (req, res) => {
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
app.post('/api/inpecao/distribuir_input_net', authenticateToken, authorizeRoute('/pme_notas/inpecao'), async (req, res) => {
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
          anotacao = `Origem: iw_cpc_975_net | Etapa: ${tr.etapa_atual || ''}`;
          if (tr.data_historico) dataHistorico = tr.data_historico;
        }

        // Buscar nome do usuário destino
        let destinoNome = String(item.usuario_id);
        try {
            const uRes = await pool.query('SELECT nome FROM db_automacao.usuarios WHERE id = $1', [item.usuario_id]);
            if (uRes.rows.length > 0) destinoNome = uRes.rows[0].nome;
        } catch {}

        await pool.query(
          `INSERT INTO db_bloco_de_notas.cotacao (tarefa, cotacao, anotacao, status, validacao, data_de_criacao, data_da_ultima_atualizacao, usuario_login, usuario_id, origem, data_historico) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [tarefaValue, cotacaoDsc, anotacao, 'pendente', 'Ativo', now, now, usuarioLogin, item.usuario_id, 'iw_cpc_975_net', dataHistorico]
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
app.post('/api/inpecao/redistribuir_input_net', authenticateToken, authorizeRoute('/pme_notas/inpecao'), async (req, res) => {
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

// Listar dados da iw_cpc_975
app.get('/api/inpecao_input/tarefas', authenticateToken, async (req, res) => {
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

// ===== ROTA PÚBLICA: DEVOLUÇÃO PADRÃO INPUT =====

// Página de visualização (pública)
app.get('/devolucao-padrao', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'devolucao_padrao.html'));
});

app.get('/pme_notas/devolucao-padrao', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'devolucao_padrao.html'));
});

// API pública para listar dados da devolução padrão
app.get('/api/devolucao-padrao', async (req, res) => {
  try {
    const { search, limit = 100, offset = 0 } = req.query;
    
    let query = 'SELECT * FROM db_qualidade.devolucao_padrao_input';
    let countQuery = 'SELECT COUNT(*) as total FROM db_qualidade.devolucao_padrao_input';
    let params = [];
    let countParams = [];
    let paramIndex = 1;

    if (search) {
      const whereClause = ` WHERE (motivo ILIKE $${paramIndex} OR codigo ILIKE $${paramIndex} OR descricao ILIKE $${paramIndex} OR reprova ILIKE $${paramIndex})`;
      query += whereClause;
      countQuery += whereClause;
      const searchParam = `%${search}%`;
      params.push(searchParam);
      countParams.push(searchParam);
      paramIndex++;
    }

    // Total count
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    // Pagination
    query += ` ORDER BY motivo, codigo LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    res.json({
      data: result.rows,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('[DEVOLUCAO_PADRAO] Erro ao buscar dados:', error);
    res.status(500).json({ error: 'Erro ao buscar dados' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});