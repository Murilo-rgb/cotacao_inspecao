const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = 3016;
const JWT_SECRET = 'Lenovo!Hitss!Global';
const LEGACY_SECRET = JWT_SECRET;
const SENHA_PADRAO_TROCA = 'Hitss@2026';

// Função para formatar data no formato brasileiro
function formatDateBR(date) {
    // Se já estiver no formato brasileiro (DD/MM/YYYY HH:MM), retorna como está
    if (typeof date === 'string' && /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(date)) {
        return date;
    }
    // Se for null ou undefined, retorna '-'
    if (!date) {
        return '-';
    }
    // Converte de ISO para brasileiro
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
// Serve static files when app is hosted under a subpath (example: /pme_notas)
app.use('/pme_notas', express.static(path.join(__dirname, 'public'), { index: false }));

// Middleware de autenticação
function authenticateToken(req, res, next) {
    // Verificar token em múltiplas fontes
    let token = null;
    
    // Header Authorization (mais comum)
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7);
    }
    
    // Cookie
    if (!token && req.cookies?.token) {
        token = req.cookies.token;
    }
    
    // Query parameter
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

    let senhaValida = false;
    try {
      senhaValida = await bcrypt.compare(password, user.senha);
    } catch (error) {
      senhaValida = false;
    }

    if (!senhaValida && typeof user.senha === 'string' && user.senha === password) {
      senhaValida = true;
    }

    // Fallback: senha armazenada como hash hex (ex.: sha256 ou md5)
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

    // Se validou por fallback (texto puro / hash) migrar para bcrypt
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

    // Definir cookie com o token
    res.cookie('token', token, {
      httpOnly: true,
      secure: false,
      maxAge: 24 * 60 * 60 * 1000
    });

    // Atualizar último acesso
    await pool.query(
      'UPDATE db_automacao.usuarios SET data_ultimo_acesso = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    res.json({ 
      token, 
      username: user.login, 
      nome: user.nome
    });
  } catch (error) {
    console.error('Erro ao fazer login:', error);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// Get all quotations
app.get('/api/quotations', authenticateToken, async (req, res) => {
  try {
    const { search } = req.query;
    const usuarioId = req.user.id;
    let query = 'SELECT * FROM db_bloco_de_notas.cotacao WHERE usuario_id = $1 AND validacao = $2';
    let params = [usuarioId, 'Ativo'];

    if (search) {
      query += ' AND (cotacao ILIKE $3 OR anotacao ILIKE $3 OR status ILIKE $3)';
      params.push(`%${search}%`);
    }

    query += ' ORDER BY data_de_criacao DESC';

    const result = await pool.query(query, params);
    const serialized = result.rows.map(row => ({
      cotacao: row.cotacao,
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
      'SELECT * FROM db_bloco_de_notas.cotacao WHERE cotacao = $1',
      [req.params.cotacao]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cotação não encontrada' });
    }

    const row = result.rows[0];
    res.json({
      cotacao: row.cotacao,
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
    const result = await pool.query(
      'INSERT INTO db_bloco_de_notas.cotacao (cotacao, anotacao, status, validacao, data_de_criacao, data_da_ultima_atualizacao, usuario_login, usuario_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [cotacao, anotacao || '', 'pendente', 'Ativo', now, now, usuarioLogin, usuarioId]
    );

    const row = result.rows[0];
    res.status(201).json({
      cotacao: row.cotacao,
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
      'UPDATE db_bloco_de_notas.cotacao SET anotacao = COALESCE($1, anotacao), status = COALESCE($2, status), data_da_ultima_atualizacao = $3 WHERE cotacao = $4 AND usuario_id = $5 RETURNING *',
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
      cotacao: row.cotacao,
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
      'UPDATE db_bloco_de_notas.cotacao SET validacao = $1, data_da_ultima_atualizacao = $2 WHERE cotacao = $3 AND usuario_id = $4 RETURNING *',
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

// Serve the frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});


// Serve login page
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Serve quotations page (requires authentication)
app.get('/cotacoes', (req, res) => {
  // Verificar token em cookie ou header
  let token = req.cookies.token || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!token) {
    // Se não houver token, redirecionar para login
    return res.redirect('/pme_notas/login.html');
  }
  
  // Se houver token, servir index.html
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// If the app is mounted under /pme_notas, serve login page
app.get('/pme_notas', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/pme_notas/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Serve quotations page under subpath
app.get('/pme_notas/cotacoes', (req, res) => {
  // Verificar token em cookie ou header
  let token = req.cookies.token || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!token) {
    return res.redirect('/pme_notas/login.html');
  }
  
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// SPA fallback for /pme_notas subpaths (ignore requests for files with extensions)
app.get('/pme_notas/*', (req, res, next) => {
  if (path.extname(req.path)) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
