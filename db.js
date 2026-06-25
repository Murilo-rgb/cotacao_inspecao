const { Pool } = require('pg');

const pool = new Pool({
  host: '10.230.43.181',
  port: 5432,
  user: 'jose_faria',
  password: 'vXsEha3PYB',
  database: 'db_operacao',
});

const SCHEMA_TABELA = 'db_qualidade.reprovas_padrao';

/**
 * Busca todos os registros de reprovas padrão.
 * @param {string} termo - Termo para filtrar (opcional)
 * @returns {Array} Lista de registros
 */
async function listarReprovas(termo = null) {
  const client = await pool.connect();
  try {
    let query = `SELECT id, motivo, texto_reprova, cod_reprova, ativo, criado_em, atualizado_em 
                 FROM ${SCHEMA_TABELA}`;
    const params = [];

    if (termo && termo.trim()) {
      query += ` WHERE LOWER(motivo) LIKE LOWER($1) 
                  OR LOWER(texto_reprova) LIKE LOWER($1) 
                  OR LOWER(cod_reprova) LIKE LOWER($1)`;
      params.push(`%${termo.trim()}%`);
    }

    query += ' ORDER BY id ASC';
    const result = await client.query(query, params);
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Verifica se um registro duplicado já existe.
 */
async function verificarDuplicado(cod_reprova, motivo, texto_reprova) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id FROM ${SCHEMA_TABELA} 
       WHERE cod_reprova = $1 AND motivo = $2 AND texto_reprova = $3`,
      [cod_reprova, motivo, texto_reprova]
    );
    return result.rows.length > 0;
  } finally {
    client.release();
  }
}

/**
 * Insere um novo registro de reprova.
 */
async function inserirReprova(motivo, texto_reprova, cod_reprova) {
  const client = await pool.connect();
  try {
    const agora = new Date();
    const result = await client.query(
      `INSERT INTO ${SCHEMA_TABELA} 
       (motivo, texto_reprova, cod_reprova, ativo, criado_em, atualizado_em)
       VALUES ($1, $2, $3, TRUE, $4, $5)
       RETURNING id`,
      [motivo, texto_reprova, cod_reprova, agora, agora]
    );
    return result.rows[0].id;
  } finally {
    client.release();
  }
}

/**
 * Retorna o total de registros na tabela.
 */
async function contarReprovas() {
  const client = await pool.connect();
  try {
    const result = await client.query(`SELECT COUNT(*) as total FROM ${SCHEMA_TABELA}`);
    return parseInt(result.rows[0].total, 10);
  } finally {
    client.release();
  }
}

module.exports = { pool, listarReprovas, verificarDuplicado, inserirReprova, contarReprovas };