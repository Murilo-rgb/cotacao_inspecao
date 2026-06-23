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

// Configuração do multer para upload de arquivos
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

// Get all quotations
app.get('/api/quotations', authenticateToken, async (req, res) => {
  try {
    const { search, dateStart } = req.query;
    const usuarioId = req.user.id;
    let query = "SELECT c.*, r.dsc_cotacao FROM db_bloco_de_notas.cotacao c LEFT JOIN db_bloco_de_notas.r_000250 r ON c.tarefa = r.cod_tarefa WHERE c.usuario_id = $1 AND c.validacao = $2";
    let params = [usuarioId, 'Ativo'];
    let paramIndex = 3;

    if (search) {
      query += ` AND (cotacao ILIKE $${paramIndex} OR anotacao ILIKE $${paramIndex} OR status ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (dateStart) {
      // Converter de YYYY-MM-DD para DD/MM/YYYY e filtrar por data específica
      const [year, month, day] = dateStart.split('-');
      const dateStartBR = `${day}/${month}/${year}`;
      query += ` AND data_de_criacao LIKE $${paramIndex}`;
      params.push(`${dateStartBR}%`);
      paramIndex++;
    }

    query += ' ORDER BY data_de_criacao DESC';

    const result = await pool.query(query, params);
    const serialized = result.rows.map(row => ({
      cotacao: row.tarefa, // cod_tarefa (kept in `cotacao` field of API for compatibility)
      dsc_cotacao: row.cotacao || row.dsc_cotacao,
      anotacao: row.anotacao,
      status: row.status,
      createdAt: formatDateBR(row.data_de_criacao),
      updatedAt: formatDateBR(row.data_da_ultima_atualizacao),
      usuarioLogin: row.usuario_login
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
    // Store tarefa (code) and cotacao (dsc) separately. Try to fetch dsc from r_000250.
    let tarefaValue = cotacao;
    let cotacaoDsc = cotacao;
    try {
      const rRes = await pool.query('SELECT dsc_cotacao FROM db_bloco_de_notas.r_000250 WHERE cod_tarefa = $1', [cotacao]);
      if (rRes.rows.length > 0 && rRes.rows[0].dsc_cotacao) {
        cotacaoDsc = rRes.rows[0].dsc_cotacao;
      }
    } catch (e) {
      console.error('Erro ao buscar dsc_cotacao:', e.message);
    }

    const result = await pool.query(
      'INSERT INTO db_bloco_de_notas.cotacao (tarefa, cotacao, anotacao, status, validacao, data_de_criacao, data_da_ultima_atualizacao, usuario_login, usuario_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [tarefaValue, cotacaoDsc, anotacao || '', 'pendente', 'Ativo', now, now, usuarioLogin, usuarioId]
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

// Update quotation
app.put('/api/quotations/:cotacao', authenticateToken, async (req, res) => {
  try {
    const { anotacao, status } = req.body;
    const usuarioLogin = req.user.username;
    const usuarioId = req.user.id;
    const now = formatDateBR(new Date());

    console.log(`[PUT] Atualizando cotação: ${req.params.cotacao}`);
    console.log(`[PUT] Usuário: ${usuarioLogin}`);
    console.log(`[PUT] Dados recebidos:`, { anotacao, status });

    const result = await pool.query(
      "UPDATE db_bloco_de_notas.cotacao SET anotacao = COALESCE($1, anotacao), status = COALESCE($2, status), data_da_ultima_atualizacao = $3 WHERE tarefa = $4 AND usuario_id = $5 RETURNING *",
      [anotacao, status, now, req.params.cotacao, usuarioId]
    );

    console.log(`[PUT] Linhas afetadas: ${result.rowCount}`);

    if (result.rows.length === 0) {
      console.log(`[PUT] Cotação não encontrada ou usuário não é dono: ${req.params.cotacao}`);
      return res.status(404).json({ error: 'Cotação não encontrada' });
    }

    const row = result.rows[0];
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

// Serve trocar-senha page under subpath
app.get('/pme_notas/trocar-senha', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'trocar-senha.html'));
});

// Serve the frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Serve login page
app.get('/login.html', (req, res) => {
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

// If the app is mounted under /pme_notas, serve login page or redirect if already logged in
app.get('/pme_notas', (req, res) => {
  const token = req.cookies?.token;
  if (token) {
    try {
      jwt.verify(token, JWT_SECRET);
      return res.redirect('/pme_notas/cotacoes');
    } catch (err) {
      // Token inválido, continua para o login
    }
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/pme_notas/login.html', (req, res) => {
  const token = req.cookies?.token;
  if (token) {
    try {
      jwt.verify(token, JWT_SECRET);
      return res.redirect('/pme_notas/cotacoes');
    } catch (err) {
      // Token inválido, continua para o login
    }
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/pme_notas/cotacoes', (req, res) => {
  let token = req.cookies.token || req.headers['authorization']?.replace('Bearer ', '');
  if (!token) {
    return res.redirect('/pme_notas/login.html');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== ROTAS DE GESTÃO (r_000250) =====

// Serve gestao page
app.get('/gestao', authenticateToken, authorizeRoute('/pme_notas/gestao'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'gestao.html'));
});

app.get('/pme_notas/gestao', authenticateToken, authorizeRoute('/pme_notas/gestao'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'gestao.html'));
});

// Upload CSV/ZIP e processar ETL
app.post('/api/gestao/upload', authenticateToken, authorizeRoute('/pme_notas/gestao'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }
    
    const filePath = req.file.path;
    console.log(`[GESTAO] Upload recebido: ${req.file.originalname} -> ${filePath}`);
    
    const result = await processarETL_250(filePath, pool);
    
    res.json({
      success: true,
      message: `Arquivo processado com sucesso. ${result.totalRows} registros carregados.`,
      totalRows: result.totalRows
    });
    
  } catch (error) {
    console.error('[GESTAO] Erro no upload/ETL:', error);
    res.status(500).json({ error: `Erro ao processar arquivo: ${error.message}` });
  }
});

// Listar tarefas da r_000250
app.get('/api/gestao/tarefas', authenticateToken, authorizeRoute('/pme_notas/gestao'), async (req, res) => {
  try {
    const query = `
      SELECT r.*, c.status AS cotacao_status,
        CASE WHEN c.cotacao IS NOT NULL THEN 'Enviado' ELSE 'Fila' END as status_distribuicao
      FROM db_bloco_de_notas.r_000250 r
      LEFT JOIN db_bloco_de_notas.cotacao c ON r.cod_tarefa = c.tarefa
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
      assumido_por: row.assumido_por
    }));
    
    res.json(tarefas);
    
  } catch (error) {
    console.error('[GESTAO] Erro ao buscar tarefas:', error);
    res.status(500).json({ error: 'Erro ao buscar tarefas' });
  }
});

// Listar usuários para distribuição
app.get('/api/gestao/usuarios', authenticateToken, authorizeRoute('/pme_notas/gestao'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, login, nome FROM db_automacao.usuarios WHERE ativo = true ORDER BY nome'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('[GESTAO] Erro ao buscar usuários:', error);
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});

// Distribuir tarefas para usuários (inserir em cotacao)
app.post('/api/gestao/distribuir', authenticateToken, authorizeRoute('/pme_notas/gestao'), async (req, res) => {
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

        await pool.query(
          `INSERT INTO db_bloco_de_notas.cotacao (tarefa, cotacao, anotacao, status, validacao, data_de_criacao, data_da_ultima_atualizacao, usuario_login, usuario_id) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [tarefaValue, cotacaoDsc, anotacao, 'pendente', 'Ativo', now, now, usuarioLogin, item.usuario_id]
        );
        
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
    console.error('[GESTAO] Erro ao distribuir tarefas:', error);
    res.status(500).json({ error: `Erro ao distribuir tarefas: ${error.message}` });
  }
});

// SPA fallback for /pme_notas subpaths
app.get('/pme_notas/*', (req, res, next) => {
  if (path.extname(req.path)) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});