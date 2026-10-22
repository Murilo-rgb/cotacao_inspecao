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
const { processarETL_HoteisHospitais } = require('./utils/etl_hoteis_hospitais');
const { classificarPendentes, STATUS_CLASSIFICACAO } = require('./scripts/classificar_cotacoes_pendentes');
const { jaDistribuida, inserirDistribuicaoAtomica } = require('./utils/distribuicao');

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

// IMPORTANTE: desabilitar cache ANTES do express.static.
// O express.static responde e encerra a cadeia (não chama next()), portanto qualquer
// middleware registrado DEPOIS dele jamais define os headers de cache para .html/.js —
// o navegador passa a servir o HTML/JS antigo do cache, e correções no front
// (ex.: coluna PORT) não aparecem para o usuário mesmo com o deploy feito.
app.use((req, res, next) => {
    if (req.path.endsWith('.js') || req.path.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use('/pme_notas', express.static(path.join(__dirname, 'public'), { index: false }));

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

// Middleware de autenticação (retorna JSON para APIs)
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

// Middleware de autenticação para páginas (redireciona para login externo)
const LOGIN_URL = 'https://elpis.globalhitss.com.br/pme_notas/login.html';
function authenticatePage(req, res, next) {
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
        return res.redirect(LOGIN_URL);
    }
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.redirect(LOGIN_URL);
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
var inspecaoRoutes = require('./routes/inspecao')(pool, authenticateToken, authorizeRoute, formatDateBR, path, fs, upload, inputUpload, processarETL_250, processarETL_975_top, processarETL_975_net, classificarPendentes, authenticatePage, processarETL_HoteisHospitais);

// Inicializar rotas de input_net
var inputNetRoutes = require('./routes/input_net')(pool, authenticateToken, authorizeRoute, formatDateBR, path, fs);

// Inicializar rotas de input_top
var inputTopRoutes = require('./routes/input_top')(pool, authenticateToken, authorizeRoute, formatDateBR, path, fs);

// Inicializar rotas de h_x_h
var hXHRoutes = require('./routes/h_x_h')(pool, authenticateToken, authorizeRoute, formatDateBR, path, fs);
// Inicializar rotas de cortesia
var cortesiaRoutes = require('./routes/cortesia')(pool, authenticateToken, authorizeRoute, formatDateBR, path, fs, require('./app/config'));

// Inicializar rotas de parcial PME
var parcialPmeRoutes = require('./routes/parcial_pme')(pool, authenticateToken, authorizeRoute, formatDateBR, path, fs, authenticatePage);
// Inicializar rotas de suporte (aba Suporte na Correção Cadastral)
var suporteModule = require('./routes/suporte');
var suporteRoutes = suporteModule(pool, authenticateToken);

// Inicializar rutas legadas /api/inpecao/* (sin deduplicar contra /api/inspecao/*)
var inpecaoLegadoModule = require('./routes/inpecao_legado');
var inpecaoLegadoRoutes = inpecaoLegadoModule(pool, authenticateToken, authorizeRoute, formatDateBR, classificarPendentes, inserirDistribuicaoAtomica);
// Registrar rotas com prefixo /pme_notas (API input_net)
// Inicializar rotas de acessos (permissões)
var acessosModule = require('./routes/acessos');
var acessosRoutes = acessosModule(pool, authenticateToken, authorizeRoute, permissions, { SENHA_PADRAO_TROCA: SENHA_PADRAO_TROCA });
// Inicializar rotas de qualidade (auditoria_qualidade)
var qualidadeModule = require('./routes/qualidade');
var qualidadeRoutes = qualidadeModule(pool, authenticateToken, formatDateBR, calcularSemana);
app.use('/api/input_net', inputNetRoutes);
app.use('/pme_notas/api/input_net', inputNetRoutes);

// Registrar rotas com prefixo /pme_notas (API input_top)
app.use('/api/input_top', inputTopRoutes);
app.use('/pme_notas/api/input_top', inputTopRoutes);

// Registrar rotas com prefixo /pme_notas (API hh)
// Registrar rotas de cortesia (API)
app.use('/api/cortesia', cortesiaRoutes);
app.use('/pme_notas/api/cortesia', cortesiaRoutes);
app.use('/api/hh', hXHRoutes);
app.use('/pme_notas/api/hh', hXHRoutes);

// Registrar rotas de suporte (API) - mesmo router nos prefixos /api e /pme_notas/api
app.use('/api', suporteRoutes);
app.use('/pme_notas/api', suporteRoutes);
// Anexos públicos na raiz (sem autenticação)
app.use(suporteModule.publicRouter);

// Registrar rutas legadas /api/inpecao/* (API)
app.use('/api', inpecaoLegadoRoutes);
app.use('/pme_notas/api', inpecaoLegadoRoutes);
// API Routes
// Registrar rutas de acessos (API)
app.use('/api', acessosRoutes);
app.use('/pme_notas/api', acessosRoutes);

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
app.get('/api/quotations/suporte', authenticateToken, async (req, res) => {
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
        query += ` AND ( c.origem = 'r_000250' OR ( (c.origem IS NULL OR c.origem = '') AND NOT EXISTS (SELECT 1 FROM db_bloco_de_notas.iw_cpc_975_net inet WHERE inet.codigo_da_tarefa = c.tarefa) AND NOT EXISTS (SELECT 1 FROM db_bloco_de_notas.iw_cpc_975_top itop WHERE itop.codigo_da_tarefa = c.tarefa) AND NOT EXISTS (SELECT 1 FROM db_bloco_de_notas.hoteis_x_hospitais hh WHERE hh.id_tarefa = c.tarefa) ) )`;
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
app.get('/pme_notas/api/quotations/suporte', authenticateToken, async (req, res) => {
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
        query += ` AND ( c.origem = 'r_000250' OR ( (c.origem IS NULL OR c.origem = '') AND NOT EXISTS (SELECT 1 FROM db_bloco_de_notas.iw_cpc_975_net inet WHERE inet.codigo_da_tarefa = c.tarefa) AND NOT EXISTS (SELECT 1 FROM db_bloco_de_notas.iw_cpc_975_top itop WHERE itop.codigo_da_tarefa = c.tarefa) AND NOT EXISTS (SELECT 1 FROM db_bloco_de_notas.hoteis_x_hospitais hh WHERE hh.id_tarefa = c.tarefa) ) )`;
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

// API: Listar cotações pendentes de Qualidade/Suporte
app.get('/api/quotations/qualidade/suporte', authenticateToken, async (req, res) => {
  try {
    const { search, dateStart, origem } = req.query;
    let query = `SELECT c.*, r.dsc_cotacao, r.qtd_linhas, r.qtd_linhas_novas, r.qtd_reprovacao, aq.status as auditoria_status, aq.anotacao as auditoria_anotacao 
      FROM db_bloco_de_notas.cotacao c 
      LEFT JOIN db_bloco_de_notas.r_000250 r ON c.tarefa = r.cod_tarefa 
      LEFT JOIN db_bloco_de_notas.auditoria_qualidade aq ON aq.id_qldd = c.id_qldd 
      WHERE c.validacao = $1 AND c.status = $2`;
    const params = ['Ativo', 'pendente-qualidade'];
    let paramIndex = 3;

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
        query += ` AND ( c.origem = 'r_000250' OR ( (c.origem IS NULL OR c.origem = '') AND NOT EXISTS (SELECT 1 FROM db_bloco_de_notas.iw_cpc_975_net inet WHERE inet.codigo_da_tarefa = c.tarefa) AND NOT EXISTS (SELECT 1 FROM db_bloco_de_notas.iw_cpc_975_top itop WHERE itop.codigo_da_tarefa = c.tarefa) AND NOT EXISTS (SELECT 1 FROM db_bloco_de_notas.hoteis_x_hospitais hh WHERE hh.id_tarefa = c.tarefa) ) )`;
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
    console.error('[QUALIDADE_SUPORTE] Erro ao buscar cotações:', error);
    res.status(500).json({ error: 'Erro ao buscar cotações de qualidade/suporte' });
  }
});

// Duplicate route with /pme_notas prefix
app.get('/pme_notas/api/quotations/qualidade/suporte', authenticateToken, async (req, res) => {
  try {
    const { search, dateStart, origem } = req.query;
    let query = `SELECT c.*, r.dsc_cotacao, r.qtd_linhas, r.qtd_linhas_novas, r.qtd_reprovacao, aq.status as auditoria_status, aq.anotacao as auditoria_anotacao 
      FROM db_bloco_de_notas.cotacao c 
      LEFT JOIN db_bloco_de_notas.r_000250 r ON c.tarefa = r.cod_tarefa 
      LEFT JOIN db_bloco_de_notas.auditoria_qualidade aq ON aq.id_qldd = c.id_qldd 
      WHERE c.validacao = $1 AND c.status = $2`;
    const params = ['Ativo', 'pendente-qualidade'];
    let paramIndex = 3;

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
        query += ` AND ( c.origem = 'r_000250' OR ( (c.origem IS NULL OR c.origem = '') AND NOT EXISTS (SELECT 1 FROM db_bloco_de_notas.iw_cpc_975_net inet WHERE inet.codigo_da_tarefa = c.tarefa) AND NOT EXISTS (SELECT 1 FROM db_bloco_de_notas.iw_cpc_975_top itop WHERE itop.codigo_da_tarefa = c.tarefa) AND NOT EXISTS (SELECT 1 FROM db_bloco_de_notas.hoteis_x_hospitais hh WHERE hh.id_tarefa = c.tarefa) ) )`;
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
    console.error('[QUALIDADE_SUPORTE] Erro ao buscar cotações:', error);
    res.status(500).json({ error: 'Erro ao buscar cotações de qualidade/suporte' });
  }
});

// Get all quotations
app.get('/api/quotations', authenticateToken, async (req, res) => {
  try {
    const { search, dateStart } = req.query;
    const usuarioId = req.user.id;
    let query = `SELECT DISTINCT ON (c.tarefa) c.tarefa, c.cotacao, c.anotacao, c.status, c.data_de_criacao, c.data_da_ultima_atualizacao, c.usuario_login, c.origem, r.dsc_cotacao, r.maratona, c.data_historico, r.dat_historico as r_dat_historico, aq.status as auditoria_status, aq.anotacao as auditoria_anotacao FROM db_bloco_de_notas.cotacao c LEFT JOIN db_bloco_de_notas.r_000250 r ON c.tarefa = r.cod_tarefa LEFT JOIN db_bloco_de_notas.auditoria_qualidade aq ON aq.id_qldd = c.id_qldd WHERE c.usuario_id = $1 AND c.validacao = $2`;
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
      maratona: row.maratona || false,
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

    // Buscar status anterior antes de atualizar (linha mais recente da tarefa)
    const beforeRes = await pool.query(
      "SELECT status FROM db_bloco_de_notas.cotacao WHERE tarefa = $1 AND validacao = 'Ativo' ORDER BY data_da_ultima_atualizacao DESC LIMIT 1",
      [req.params.cotacao]
    );
    const statusAnterior = beforeRes.rows.length > 0 ? beforeRes.rows[0].status : null;

    // UPDATE cirurgico (fix "status que nao fixa" input_net/top): mira a linha do
    // dono (usuario_id); sem linha do dono (redistribuicao/legado), mira a mais
    // recente da tarefa. Evita sobrescrever N irmas com o mesmo timestamp e a
    // listagem (DISTINCT ON) exibir linha "errada".
    let result = await pool.query(
      "UPDATE db_bloco_de_notas.cotacao SET anotacao = COALESCE($1, anotacao), status = COALESCE($2, status), data_da_ultima_atualizacao = $3 WHERE tarefa = $4 AND validacao = 'Ativo' AND usuario_id = $5 RETURNING *",
      [anotacao, status, now, req.params.cotacao, usuarioId]
    );
    if (result.rows.length === 0) {
      result = await pool.query(
        "UPDATE db_bloco_de_notas.cotacao SET anotacao = COALESCE($1, anotacao), status = COALESCE($2, status), data_da_ultima_atualizacao = $3 WHERE id_cotacao = (SELECT id_cotacao FROM db_bloco_de_notas.cotacao WHERE tarefa = $4 AND validacao = 'Ativo' ORDER BY data_da_ultima_atualizacao DESC LIMIT 1) RETURNING *",
        [anotacao, status, now, req.params.cotacao]
      );
    }

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

    // Buscar status anterior antes de atualizar (linha mais recente da tarefa)
    const beforeRes = await pool.query(
      "SELECT status FROM db_bloco_de_notas.cotacao WHERE tarefa = $1 AND validacao = 'Ativo' ORDER BY data_da_ultima_atualizacao DESC LIMIT 1",
      [req.params.cotacao]
    );
    const statusAnterior = beforeRes.rows.length > 0 ? beforeRes.rows[0].status : null;

    // UPDATE cirurgico (fix "status que nao fixa" input_net/top): mira a linha do
    // dono (usuario_id); sem linha do dono (redistribuicao/legado), mira a mais
    // recente da tarefa. Evita sobrescrever N irmas com o mesmo timestamp e a
    // listagem (DISTINCT ON) exibir linha "errada".
    let result = await pool.query(
      "UPDATE db_bloco_de_notas.cotacao SET anotacao = COALESCE($1, anotacao), status = COALESCE($2, status), data_da_ultima_atualizacao = $3 WHERE tarefa = $4 AND validacao = 'Ativo' AND usuario_id = $5 RETURNING *",
      [anotacao, status, now, req.params.cotacao, usuarioId]
    );
    if (result.rows.length === 0) {
      result = await pool.query(
        "UPDATE db_bloco_de_notas.cotacao SET anotacao = COALESCE($1, anotacao), status = COALESCE($2, status), data_da_ultima_atualizacao = $3 WHERE id_cotacao = (SELECT id_cotacao FROM db_bloco_de_notas.cotacao WHERE tarefa = $4 AND validacao = 'Ativo' ORDER BY data_da_ultima_atualizacao DESC LIMIT 1) RETURNING *",
        [anotacao, status, now, req.params.cotacao]
      );
    }

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

// Serve trocar-senha page com prefixo /pme_notas (necessário para o fluxo de primeiro acesso)
app.get('/pme_notas/trocar-senha', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'trocar-senha.html'));
});


// Serve the frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});


// Serve quotations page
app.get('/cotacoes', authenticatePage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});





app.get('/cotacoes', authenticatePage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/reprova_padrao', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reprova_padrao.html'));
});



// Atualizar tabela r_000250 a partir do db_claro

// Classificar cotações pendentes manualmente

// Serve dashboard page
app.get('/inpecao/dashboard', authenticatePage, authorizeRoute('/pme_notas/inpecao'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard_inp.html'));
});




// Serve devolucao padrao page
app.get('/devolucoes-padrao', authenticatePage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'devolucao_padrao_web.html'));
});


// ===== ROTAS DE QUALIDADE (auditoria_qualidade) =====

// API: Listar todas as cotações para auditoria de qualidade

// API: Salvar auditoria de qualidade (insere ou atualiza na auditoria_qualidade)

// API: Salvar auditoria de qualidade completa (todos os campos)

// API: Estatísticas de qualidade para o usuário logado


// API: Buscar auditoria de uma cotação específica

// API: Marcar auditoria como lida (atualiza data_leitura)





// API: Calendário de qualidade (tarefas x auditadas por dia do mês)


// Serve calendário page (com autorização de qualidade)
app.get('/qualidade/calendario', authenticatePage, authorizeRoute('/pme_notas/qualidade'), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'qualidade_calendario.html'));
});

app.get('/pme_notas/qualidade/calendario', authenticatePage, authorizeRoute('/pme_notas/qualidade'), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'qualidade_calendario.html'));
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
app.get('/rcv', authenticatePage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'rcv.html'));
});

app.get('/pme_notas/rcv', authenticatePage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'rcv.html'));
});

// Serve qualidade page (com autorização de qualidade)
app.get('/qualidade', authenticatePage, authorizeRoute('/pme_notas/qualidade'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'qualidade.html'));
});

app.get('/pme_notas/qualidade', authenticatePage, authorizeRoute('/pme_notas/qualidade'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'qualidade.html'));
});

// Serve qualidade mensal page (com autorização de qualidade)
app.get('/qualidade/mensal', authenticatePage, authorizeRoute('/pme_notas/qualidade'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'qualidade_mensal.html'));
});

app.get('/pme_notas/qualidade/mensal', authenticatePage, authorizeRoute('/pme_notas/qualidade'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'qualidade_mensal.html'));
});

// ===== ROTAS DE RELATÓRIOS (auditoria_qualidade) =====

// API: Extrair dados de auditoria_qualidade por período de data_qualidade
app.get('/api/reports', authenticateToken, authorizeRoute('/pme_notas/qualidade'), async (req, res) => {
  try {
    const { dataInicio, dataFim } = req.query;

    if (!dataInicio || !dataFim) {
      return res.status(400).json({ error: 'Datas de início e fim são obrigatórias' });
    }

    // Validar formato das datas (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dataInicio) || !dateRegex.test(dataFim)) {
      return res.status(400).json({ error: 'Formato de data inválido. Use YYYY-MM-DD' });
    }

    if (dataFim < dataInicio) {
      return res.status(400).json({ error: 'A data final não pode ser anterior à data inicial' });
    }

    // dataFim + 1 dia para incluir todo o dia final
    const dataFimExclusivo = new Date(dataFim);
    dataFimExclusivo.setDate(dataFimExclusivo.getDate() + 1);
    const dataFimISO = dataFimExclusivo.toISOString().split('T')[0];

    const result = await pool.query(
      `SELECT * FROM (
      SELECT DISTINCT ON (aq.codigo_tarefa)
             aq.id_qldd, aq.anotacao, aq.status, aq.data_qualidade, aq.analista_qualidade_id, aq.reprova_bko,
              aq.codigo_tarefa, aq.data_analise, aq.cotacao, aq.regional, aq.tipo_de_pedido,
              aq.motivo_1_sistema_documento, aq.motivo_2_erro, aq.motivo_3_detalhamento, aq.apontamento,
              aq.tipo_apontamento,
              aq.contestacao, aq.obs, aq.enviado, aq.data_envio, aq.semana, aq.data_leitura,
              TRIM(COALESCE(u_analista.nome, '') || ' ' || COALESCE(u_analista.sobrenome, '')) AS analista,
              TRIM(COALESCE(u_auditado.nome, '') || ' ' || COALESCE(u_auditado.sobrenome, '')) AS auditado_nome
       FROM db_bloco_de_notas.auditoria_qualidade aq
       LEFT JOIN db_bloco_de_notas.cotacao c ON c.tarefa = aq.codigo_tarefa
       LEFT JOIN db_automacao.usuarios u_analista ON u_analista.id::TEXT = c.usuario_id::TEXT
       LEFT JOIN db_automacao.usuarios u_auditado ON u_auditado.id::TEXT = aq.analista_qualidade_id::TEXT
       WHERE aq.data_qualidade >= $1::date AND aq.data_qualidade < $2::date
       ORDER BY aq.codigo_tarefa,
                CASE WHEN c.id_qldd IS NOT NULL AND c.id_qldd = aq.id_qldd THEN 0
                     WHEN COALESCE(aq.anotacao, '') <> '' THEN 1
                     ELSE 2 END,
                aq.id_qldd DESC
       ) sub
       ORDER BY sub.data_qualidade DESC`,
      [dataInicio, dataFimISO]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('[REPORTS] Erro ao extrair relatório:', error);
    res.status(500).json({ error: 'Erro ao extrair relatório' });
  }
});

// Duplicate route with /pme_notas prefix
app.get('/pme_notas/api/reports', authenticateToken, authorizeRoute('/pme_notas/qualidade'), async (req, res) => {
  try {
    const { dataInicio, dataFim } = req.query;

    if (!dataInicio || !dataFim) {
      return res.status(400).json({ error: 'Datas de início e fim são obrigatórias' });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dataInicio) || !dateRegex.test(dataFim)) {
      return res.status(400).json({ error: 'Formato de data inválido. Use YYYY-MM-DD' });
    }

    if (dataFim < dataInicio) {
      return res.status(400).json({ error: 'A data final não pode ser anterior à data inicial' });
    }

    const dataFimExclusivo = new Date(dataFim);
    dataFimExclusivo.setDate(dataFimExclusivo.getDate() + 1);
    const dataFimISO = dataFimExclusivo.toISOString().split('T')[0];

    const result = await pool.query(
      `SELECT * FROM (
      SELECT DISTINCT ON (aq.codigo_tarefa)
             aq.id_qldd, aq.anotacao, aq.status, aq.data_qualidade, aq.analista_qualidade_id, aq.reprova_bko,
              aq.codigo_tarefa, aq.data_analise, aq.cotacao, aq.regional, aq.tipo_de_pedido,
              aq.tipo_apontamento,
              aq.motivo_1_sistema_documento, aq.motivo_2_erro, aq.motivo_3_detalhamento, aq.apontamento,
              aq.contestacao, aq.obs, aq.enviado, aq.data_envio, aq.semana, aq.data_leitura,
              TRIM(COALESCE(u_analista.nome, '') || ' ' || COALESCE(u_analista.sobrenome, '')) AS analista,
              TRIM(COALESCE(u_auditado.nome, '') || ' ' || COALESCE(u_auditado.sobrenome, '')) AS auditado_nome
       FROM db_bloco_de_notas.auditoria_qualidade aq
       LEFT JOIN db_bloco_de_notas.cotacao c ON c.tarefa = aq.codigo_tarefa
       LEFT JOIN db_automacao.usuarios u_analista ON u_analista.id::TEXT = c.usuario_id::TEXT
       LEFT JOIN db_automacao.usuarios u_auditado ON u_auditado.id::TEXT = aq.analista_qualidade_id::TEXT
       WHERE aq.data_qualidade >= $1::date AND aq.data_qualidade < $2::date
       ORDER BY aq.codigo_tarefa,
                CASE WHEN c.id_qldd IS NOT NULL AND c.id_qldd = aq.id_qldd THEN 0
                     WHEN COALESCE(aq.anotacao, '') <> '' THEN 1
                     ELSE 2 END,
                aq.id_qldd DESC
       ) sub
       ORDER BY sub.data_qualidade DESC`,
      [dataInicio, dataFimISO]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('[REPORTS] Erro ao extrair relatório:', error);
    res.status(500).json({ error: 'Erro ao extrair relatório' });
  }
});

// Serve reports page (com autorização de qualidade)
app.get('/reports', authenticatePage, authorizeRoute('/pme_notas/qualidade'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reports.html'));
});

app.get('/pme_notas/reports', authenticatePage, authorizeRoute('/pme_notas/qualidade'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reports.html'));
});


// Serve gestao_input page
app.get('/inpecao_input', authenticatePage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'gestao_input.html'));
});

app.get('/input', authenticatePage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'gestao_input.html'));
});

app.get('/input_top', authenticatePage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'gestao_input_top.html'));
});

app.get('/input_net', authenticatePage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'gestao_input_net.html'));
});

// Serve input_net dashboard page
app.get('/input_net/dashboard', authenticatePage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard_input_net.html'));
});

app.get('/pme_notas/input_net/dashboard', authenticatePage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard_input_net.html'));
});

// Serve input_top dashboard page
app.get('/input_top/dashboard', authenticatePage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard_input_top.html'));
});

app.get('/pme_notas/input_top/dashboard', authenticatePage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard_input_top.html'));
});

// Serve hh dashboard page
app.get('/hh/dashboard', authenticatePage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard_h_x_h.html'));
});

app.get('/pme_notas/hh/dashboard', authenticatePage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard_h_x_h.html'));
});

// Serve cortesia page (distribuicao - padrao gestao_input_net)
app.get('/cortesia', authenticatePage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'gestao_cortesia.html'));
});

app.get('/pme_notas/cortesia', authenticatePage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'gestao_cortesia.html'));
});

app.get('/cortesia/dashboard', authenticatePage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard_cortesia.html'));
});

app.get('/pme_notas/cortesia/dashboard', authenticatePage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard_cortesia.html'));
});
// Usar rotas de inspeção
app.use(inspecaoRoutes);
// Usar rotas de parcial PME
app.use(parcialPmeRoutes);
// Usar rotas de qualidade (montado em /api e /pme_notas/api;
// o router define '/qualidade', '/qualidade/stats', etc.)
app.use('/api', qualidadeRoutes);
app.use('/pme_notas/api', qualidadeRoutes);

// ===== ROTAS DE ACESSOS (gerenciamento de permissões) =====

// Mapeamento de opções para rotas

// Espelho das rotas de acessos com prefixo /pme_notas (acessível tanto por /pme_notas/api/acessos/... quanto por /api/acessos/...)



// API: Buscar usuários por nome/sobrenome

// API: Listar permissões de um usuário

// Espelho da rota POST /api/acessos/usuarios/:id/permissoes com prefixo /pme_notas

// API: Resetar senha de um usuário (volta para senha padrão e marca deve_trocar_senha = true)
// Rota implementada diretamente (sem espelho) para evitar erro 500 com app._router.handle

// Rota com prefixo /pme_notas implementada diretamente (sem espelho)

// API: Salvar permissões de um usuário (sincroniza com base nas opções selecionadas)

// Serve página de acessos
app.get('/acessos', authenticatePage, authorizeRoute('/pme_notas/acessos'), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'acessos.html'));
});

app.get('/pme_notas/acessos', authenticatePage, authorizeRoute('/pme_notas/acessos'), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'acessos.html'));
});

app.get('/suporte', authenticatePage, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'suporte.html'));
});

app.get('/qualidade/suporte', authenticatePage, authorizeRoute('/pme_notas/qualidade'), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'qualidade_suporte.html'));
});

app.get('/pme_notas/qualidade/suporte', authenticatePage, authorizeRoute('/pme_notas/qualidade'), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'qualidade_suporte.html'));
});




// API Tarefas Input TOP (antes do fallback SPA)

// API Tarefas Input NET (antes do fallback SPA)

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

// Atualizar tabela iw_cpc_975_net a partir da esteira (somente dados do dia)

// Distribuir tarefas input_net (iw_cpc_975_net)

// Redistribuir tarefas input_net (iw_cpc_975_net)

// Listar dados da iw_cpc_975

// ===== ROTA: REPROVAS PADRÃO (INSPEÇÃO + INPUT) =====

// API: Listar reprovas padrão com filtro por fonte e termo
app.get('/api/reprovas', async (req, res) => {
  try {
    const { fonte, termo } = req.query;
    let resultados = [];
    let params = [];
    let paramIndex = 1;

    const queryPart = `
      SELECT motivo, texto_reprova
      FROM $1
      WHERE ativo = true
    `;

    // Montar WHERE para termo de busca
    let termoClause = '';
    if (termo && termo.trim()) {
      termoClause = ` AND (motivo ILIKE $${paramIndex} OR texto_reprova ILIKE $${paramIndex} OR cod_reprova ILIKE $${paramIndex})`;
      params.push(`%${termo.trim()}%`);
      paramIndex++;
    }

    const fontes = fonte && fonte.trim().toLowerCase() === 'input' 
      ? [{ nome: 'Input', tabela: 'db_qualidade.reprovas_padrao_input' }]
      : fonte && fonte.trim().toLowerCase() === 'inspeção'
        ? [{ nome: 'Inspeção', tabela: 'db_qualidade.reprovas_padrao' }]
        : [
            { nome: 'Inspeção', tabela: 'db_qualidade.reprovas_padrao' },
            { nome: 'Input', tabela: 'db_qualidade.reprovas_padrao_input' }
          ];

    for (const f of fontes) {
      const sql = `SELECT motivo, texto_reprova FROM ${f.tabela} WHERE ativo = true${termoClause} ORDER BY motivo`;
      const result = await pool.query(sql, params);
      for (const row of result.rows) {
        resultados.push({
          motivo: row.motivo,
          texto_reprova: row.texto_reprova,
          fonte: f.nome
        });
      }
    }

    res.json(resultados);
  } catch (error) {
    console.error('[REPROVAS] Erro ao buscar reprovas:', error);
    res.status(500).json({ error: 'Erro ao buscar reprovas padrão' });
  }
});

// Espelho com prefixo /pme_notas
app.get('/pme_notas/api/reprovas', async (req, res) => {
  req.url = '/api/reprovas' + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');
  req.originalUrl = req.url;
  app._router.handle(req, res);
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
