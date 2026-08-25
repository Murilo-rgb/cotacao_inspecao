// Temporary helper to safely apply UTF-8-safe edits (ASCII only) via Node.
const fs = require('fs');

function apply(path, replacements) {
  let c = fs.readFileSync(path, 'utf8');
  const orig = c;
  for (const [from, to] of replacements) {
    if (!c.includes(from)) {
      console.error('NAO ENCONTROU em ' + path + ': ' + JSON.stringify(from.slice(0, 60)));
    }
    c = c.split(from).join(to);
  }
  if (c !== orig) {
    fs.writeFileSync(path, c, 'utf8');
    console.log('EDITADO: ' + path);
  } else {
    console.log('sem mudancas: ' + path);
  }
}

// ---- BACKEND inspecao.js ----
const NL = '\n';

const inspecaoPath = 'S:/geo-pme-notas/routes/inspecao.js';
const inspecaoBackup = fs.readFileSync(inspecaoPath, 'utf8');
// Normalize CRLF to LF for matching, apply, then write preserving CRLF is complex,
// so we operate on the raw content with explicit \r?\n handling via split/join on the actual newline.
// Instead, operate directly on the normalized LF version and convert back.

function applyNormalized(path, replacements) {
  let c = fs.readFileSync(path, 'utf8');
  const hasCRLF = c.includes('\r\n');
  if (hasCRLF) c = c.replace(/\r\n/g, '\n');
  const orig = c;
  let foundAny = false;
  for (const [from, to] of replacements) {
    if (c.includes(from)) foundAny = true;
    c = c.split(from).join(to);
  }
  if (hasCRLF) c = c.replace(/\n/g, '\r\n');
  if (c !== orig) {
    fs.writeFileSync(path, c, 'utf8');
    console.log('EDITADO: ' + path);
  } else if (foundAny) {
    console.log('aplicado mas semelhou: ' + path);
  } else {
    console.log('sem mudou: ' + path);
  }
}

// TOP stats
const topBlockFrom =
  'END) as desconsiderar,\n          COUNT(DISTINCT codigo_da_tarefa) as total';
const topBlockTo =
  'END) as desconsiderar,\n          COUNT(DISTINCT CASE\n            WHEN NOT EXISTS (\n              SELECT 1 FROM db_bloco_de_notas.cotacao c2\n              WHERE c2.tarefa = codigo_da_tarefa AND c2.validacao = \'Ativo\'\n            ) THEN codigo_da_tarefa\n          END) as fila,\n          COUNT(DISTINCT codigo_da_tarefa) as total';

// NET replacement
const netBlockFrom =
  'END) as desconsiderar,\n          COUNT(DISTINCT foto_recente.cod_tarefa) as total';
const netBlockTo =
  'END) as desconsiderar,\n          COUNT(DISTINCT CASE\n            WHEN NOT EXISTS (\n              SELECT 1 FROM db_bloco_de_notas.cotacao c2\n              WHERE c2.tarefa = foto_recente.cod_tarefa AND c2.validacao = \'Ativo\'\n            ) THEN foto_recente.cod_tarefa\n          END) as fila,\n          COUNT(DISTINCT foto_recente.cod_tarefa) as total';

applyNormalized(inspecaoPath, [
  [topBlockFrom, topBlockTo],
  [netBlockFrom, netBlockTo]
]);

console.log('DONE');