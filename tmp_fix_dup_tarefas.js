const fs = require('fs');
const path = require('path');

const ROOT = 'c:/Users/murilo.trevisan.3/Downloads/cotacao_inspecao';

function readLines(file) {
  const content = fs.readFileSync(file, 'utf8');
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  return { content, eol, lines: content.split(/\r?\n/) };
}

function writeLines(file, state) {
  fs.writeFileSync(file, state.lines.join(state.eol), 'utf8');
  console.log('OK:', file);
}

function findIndex(lines, from, re, label) {
  for (let i = from; i < lines.length; i++) {
    if (re.test(lines[i])) return i;
  }
  throw new Error(label + ' nao encontrado a partir da linha ' + (from + 1));
}

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

// ---------- server.js ----------
const serverPath = path.join(ROOT, 'server.js');
{
  const st = readLines(serverPath);
  const original = st.lines.join(st.eol);

  // 1) Dedup no listarQuotationsSuporte (somente dentro da funcao)
  const fnIdx = findIndex(st.lines, 0, /function listarQuotationsSuporte/, 'server: listarQuotationsSuporte');
  const mapIdx = findIndex(st.lines, fnIdx, /const serialized = result\.rows\.map\(row => \(\{$/, 'server: map serialized');
  const openLines = [
    '    const serialized = [];',
    '    const tarefasVistasS = new Set();',
    '    for (const row of result.rows) {',
    '      if (!row.tarefa || tarefasVistasS.has(row.tarefa)) continue;',
    '      tarefasVistasS.add(row.tarefa);',
    '      serialized.push({'
  ];
  st.lines.splice(mapIdx, 1, ...openLines);
  const closeIdx = findIndex(st.lines, mapIdx + openLines.length - 1, /^\s*\}\)\);\s*$/, 'server: fechamento serialized');
  st.lines.splice(closeIdx, 1, '      });', '    }');

  // 2) DISTINCT ON na carga da r_000250 (unica ocorrencia)
  const ins250 = countOccurrences(st.lines.join(st.eol), 'INSERT INTO db_bloco_de_notas.r_000250');
  if (ins250 !== 1) throw new Error('server: esperava 1 INSERT r_000250, achou ' + ins250);
  const insIdx = findIndex(st.lines, 0, /INSERT INTO db_bloco_de_notas\.r_000250/, 'server: insert r_000250');
  const selIdx = findIndex(st.lines, insIdx, /^\s*SELECT\s*$/, 'server: SELECT');
  const selIndent = st.lines[selIdx].match(/^\s*/)[0];
  st.lines[selIdx] = selIndent + 'SELECT DISTINCT ON (cod_tarefa)';
  const fromIdx = findIndex(st.lines, insIdx, /^\s*FROM db_claro\.r_000250 where data_carga = CURRENT_DATE/, 'server: FROM db_claro');
  st.lines.splice(fromIdx + 1, 0, selIndent + 'ORDER BY cod_tarefa, dat_historico DESC NULLS LAST');

  if (st.lines.join(st.eol) === original) throw new Error('server: nenhuma mudanca');
  writeLines(serverPath, st);
}

// ---------- routes/inspecao.js ----------
const inspecaoPath = path.join(ROOT, 'routes/inspecao.js');
{
  const st = readLines(inspecaoPath);
  const original = st.lines.join(st.eol);
  const ins250 = countOccurrences(original, 'INSERT INTO db_bloco_de_notas.r_000250');
  if (ins250 !== 1) throw new Error('inspecao: esperava 1 INSERT r_000250, achou ' + ins250);
  const insIdx = findIndex(st.lines, 0, /INSERT INTO db_bloco_de_notas\.r_000250/, 'inspecao: insert r_000250');
  const selIdx = findIndex(st.lines, insIdx, /^\s*SELECT\s*$/, 'inspecao: SELECT');
  const selIndent = st.lines[selIdx].match(/^\s*/)[0];
  st.lines[selIdx] = selIndent + 'SELECT DISTINCT ON (cod_tarefa)';
  const fromIdx = findIndex(st.lines, insIdx, /^\s*FROM db_claro\.r_000250 where data_carga = CURRENT_DATE/, 'inspecao: FROM db_claro');
  let insertAfter = fromIdx + 1;
  if (insertAfter < st.lines.length && /^\s*\$\{FILTRO_SEM_LOJA_PROPRIA\}/.test(st.lines[insertAfter])) {
    insertAfter = fromIdx + 2;
  }
  st.lines.splice(insertAfter, 0, selIndent + 'ORDER BY cod_tarefa, dat_historico DESC NULLS LAST');
  if (st.lines.join(st.eol) === original) throw new Error('inspecao: nenhuma mudanca');
  writeLines(inspecaoPath, st);
}

// ---------- routes/inpecao_legado.js ----------
const legadoPath = path.join(ROOT, 'routes/inpecao_legado.js');
{
  const st = readLines(legadoPath);
  const original = st.lines.join(st.eol);
  const ins250 = countOccurrences(original, 'INSERT INTO db_bloco_de_notas.r_000250');
  if (ins250 !== 1) throw new Error('legado: esperava 1 INSERT r_000250, achou ' + ins250);
  const insIdx = findIndex(st.lines, 0, /INSERT INTO db_bloco_de_notas\.r_000250/, 'legado: insert r_000250');
  const selIdx = findIndex(st.lines, insIdx, /^\s*SELECT\s*$/, 'legado: SELECT');
  const selIndent = st.lines[selIdx].match(/^\s*/)[0];
  st.lines[selIdx] = selIndent + 'SELECT DISTINCT ON (cod_tarefa)';
  const fromIdx = findIndex(st.lines, insIdx, /^\s*FROM db_claro\.r_000250 where data_carga = CURRENT_DATE/, 'legado: FROM db_claro');
  st.lines.splice(fromIdx + 1, 0, selIndent + 'ORDER BY cod_tarefa, dat_historico DESC NULLS LAST');
  if (st.lines.join(st.eol) === original) throw new Error('legado: nenhuma mudanca');
  writeLines(legadoPath, st);
}

// ---------- utils/etl_250.js ----------
const etlPath = path.join(ROOT, 'utils/etl_250.js');
{
  const st = readLines(etlPath);
  const original = st.lines.join(st.eol);
  const escIdx = findIndex(st.lines, 0, /^\s*\/\/ Escrever arquivo limpo/, 'etl: escrever');
  const block = [
    '    // Deduplicacao por cod_tarefa (primeira coluna): o arquivo de entrada pode conter',
    '    // a mesma tarefa repetida (ex.: acumulo de cargas/linhas duplicadas). Mantemos a',
    '    // primeira ocorrencia para nao gerar linhas duplicadas na r_000250, que inflam os',
    '    // murals de cotacoes das telas de suporte.',
    '    const tarefasVistas = new Set();',
    '    const linhasSemDuplicatas = [processedLines[0]];',
    '    for (let i = 1; i < processedLines.length; i++) {',
    '        const campos = parseCsvLine(processedLines[i], usedDelimiter);',
    '        const codTarefa = (campos[0] || "").trim();',
    '        if (!codTarefa || tarefasVistas.has(codTarefa)) continue;',
    '        tarefasVistas.add(codTarefa);',
    '        linhasSemDuplicatas.push(processedLines[i]);',
    '    }',
    '    processedLines.splice(0, processedLines.length, ...linhasSemDuplicatas);',
    ''
  ];
  st.lines.splice(escIdx, 0, ...block);
  if (st.lines.join(st.eol) === original) throw new Error('etl: nenhuma mudanca');
  writeLines(etlPath, st);
}

console.log('TODOS OS PATCHES APLICADOS');