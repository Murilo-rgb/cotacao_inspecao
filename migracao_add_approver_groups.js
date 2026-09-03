// migracao_add_approver_groups.js
// Adiciona a coluna approver_groups na tabela db_bloco_de_notas.cortesia.
// Uso: node migracao_add_approver_groups.js
'use strict';
const { Client } = require('pg');

const DB = {
  host: '10.230.43.181',
  port: 5432,
  user: 'jose_faria',
  password: 'vXsEha3PYB',
  database: 'db_operacao'
};

(async function main() {
  const c = new Client(DB);
  try {
    await c.connect();
    await c.query('ALTER TABLE db_bloco_de_notas.cortesia ADD COLUMN IF NOT EXISTS approver_groups TEXT');
    const r = await c.query(
      "SELECT column_name, data_type FROM information_schema.columns " +
      "WHERE table_schema = 'db_bloco_de_notas' AND table_name = 'cortesia' " +
      "AND column_name = 'approver_groups'"
    );
    if (r.rows.length) {
      console.log('OK: coluna approver_groups presente (' + r.rows[0].data_type + ').');
    } else {
      console.log('ATENCAO: coluna approver_groups nao encontrada apos ALTER.');
    }
  } catch (e) {
    console.error('ERRO: ' + e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();