const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');
const { Pool } = require('pg');
const AdmZip = require('adm-zip');

const FILES_DIR = path.join(__dirname, '..', 'files');

const IW_CPC_975_COLUMNS = [
    "fila",
    "codigo_da_tarefa",
    "data_criacao",
    "data_finalizacao",
    "etapa_atual",
    "data_historico",
    "da_etapa",
    "do_usuario_login",
    "do_usuario_nome",
    "para_etapa",
    "para_usuario_login",
    "para_usuario_nome",
    "acao",
    "canal_cliente",
    "segmento_cliente",
    "cnpj_cliente",
    "razao_social_cliente",
    "cliente_cpc",
    "login_gerente_conta",
    "nome_gerente_conta",
    "id_cor",
    "id_cotacao",
    "id_ped",
    "descricao",
    "situacao_sistema",
    "data_carga"
];

const IW_CPC_975_net_CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS db_bloco_de_notas.iw_cpc_975_net (
    fila TEXT NULL,
    codigo_da_tarefa TEXT NULL,
    data_criacao TEXT NULL,
    data_finalizacao TEXT NULL,
    etapa_atual TEXT NULL,
    data_historico TEXT NULL,
    da_etapa TEXT NULL,
    do_usuario_login TEXT NULL,
    do_usuario_nome TEXT NULL,
    para_etapa TEXT NULL,
    para_usuario_login TEXT NULL,
    para_usuario_nome TEXT NULL,
    acao TEXT NULL,
    canal_cliente TEXT NULL,
    segmento_cliente TEXT NULL,
    cnpj_cliente TEXT NULL,
    razao_social_cliente TEXT NULL,
    cliente_cpc TEXT NULL,
    login_gerente_conta TEXT NULL,
    nome_gerente_conta TEXT NULL,
    id_cor TEXT NULL,
    id_cotacao TEXT NULL,
    id_ped TEXT NULL,
    descricao TEXT NULL,
    situacao_sistema TEXT NULL,
    data_carga DATE DEFAULT CURRENT_DATE NULL
);
`;

/**
 * cleanColumnName - normaliza nomes de colunas do CSV para formato padrao
 * - Remove acentos (NFD)
 * - Remove aspas, espacos extras
 * - Remove caracteres especiais: ?, !, (, ), /, \, -, :, ., espaco, etc
 * - Converte para lowercase
 * - Substitui sequencias de underscore por um unico underscore
 * - Remove underscores no inicio e fim
 */
function cleanColumnName(name) {
    let cleaned = (name || '').toString().trim().replace(/"/g, '');
    cleaned = cleaned.toLowerCase();
    cleaned = cleaned.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // Remove caracteres especiais NAO alfanumericos (exceto underscore)
    cleaned = cleaned.replace(/[^a-z0-9_]/g, '_');
    cleaned = cleaned.replace(/_+/g, '_');
    cleaned = cleaned.replace(/^_|_$/g, '');
    return cleaned;
}

function parseCsvLine(line, delim) {
    const fields = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === delim && !inQuotes) {
            fields.push(cur);
            cur = '';
        } else {
            cur += ch;
        }
    }
    fields.push(cur);
    return fields;
}

function quoteFieldIfNeeded(val, delim) {
    if (val == null) return '';
    const needsQuote = String(val).includes(delim) || String(val).includes('"') || String(val).includes('\n');
    let out = String(val);
    out = out.replace(/"/g, '""');
    return needsQuote ? `"${out}"` : out;
}

function splitCsvRecords(content) {
    const records = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < content.length; i++) {
        const ch = content[i];
        if (ch === '"') {
            if (inQuotes && i + 1 < content.length && content[i + 1] === '"') {
                cur += '""';
                i++;
                continue;
            }
            inQuotes = !inQuotes;
            cur += '"';
        } else if (ch === '\r') {
            if (!inQuotes) {
                if (i + 1 < content.length && content[i + 1] === '\n') i++;
                records.push(cur);
                cur = '';
            } else {
                cur += ch;
            }
        } else if (ch === '\n') {
            if (!inQuotes) {
                records.push(cur);
                cur = '';
            } else {
                cur += ch;
            }
        } else {
            cur += ch;
        }
    }
    if (cur.length > 0) records.push(cur);
    return records;
}

/**
 * Constroi um mapa de colunas do CSV para as colunas esperadas da tabela.
 * Retorna um array onde cada indice corresponde a uma coluna esperada,
 * contendo o indice da coluna no CSV ou -1 se nao encontrada.
 */
function buildColumnMapping(csvHeaderColumns, expectedColumns) {
    const csvCleaned = csvHeaderColumns.map(h => cleanColumnName(h));
    const expectedCleaned = expectedColumns.map(h => cleanColumnName(h));
    
    console.log(`\n[COLUNAS] Header CSV (limpado): [${csvCleaned.join(', ')}]`);
    console.log(`[COLUNAS] Colunas esperadas:   [${expectedCleaned.join(', ')}]`);
    
    const mapping = [];
    const unmappedExpected = [];
    
    for (let eIdx = 0; eIdx < expectedCleaned.length; eIdx++) {
        const expCol = expectedCleaned[eIdx];
        // Pular data_carga pois e gerada automaticamente
        if (expCol === 'data_carga') {
            mapping.push(-1);
            continue;
        }
        
        const csvIdx = csvCleaned.findIndex(c => c === expCol);
        if (csvIdx >= 0) {
            mapping.push(csvIdx);
        } else {
            mapping.push(-1);
            unmappedExpected.push(expCol);
        }
    }
    
    if (unmappedExpected.length > 0) {
        console.log(`[AVISO] Colunas nao encontradas no CSV e serao preenchidas com vazio: ${unmappedExpected.join(', ')}`);
    }
    
    // Log de colunas extra do CSV que serao ignoradas
    for (let cIdx = 0; cIdx < csvCleaned.length; cIdx++) {
        if (!expectedCleaned.includes(csvCleaned[cIdx])) {
            console.log(`[AVISO] Coluna extra no CSV ignorada: "${csvCleaned[cIdx]}"`);
        }
    }
    
    return mapping;
}

async function ensureTableColumns(client, schemaName, tableName, columns) {
    const fullTablePath = `"${schemaName}"."${tableName}"`;
    const columnsQuery = `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = $1 AND table_name = $2
    `;
    const result = await client.query(columnsQuery, [schemaName, tableName]);
    const existingColumns = result.rows.map(row => row.column_name.toLowerCase());
    
    for (const column of columns) {
        const columnName = column.toLowerCase();
        if (!existingColumns.includes(columnName)) {
            try {
                await client.query(`ALTER TABLE ${fullTablePath} ADD COLUMN IF NOT EXISTS "${column}" TEXT`);
                console.log(`Coluna adicionada: ${columnName}`);
            } catch (error) {
                console.log(`Erro ao adicionar coluna ${columnName}: ${error.message}`);
            }
        }
    }
}

async function extrairZipSeNecessario(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.zip') {
        console.log(`Extraindo ZIP: ${filePath}`);
        const zip = new AdmZip(filePath);
        const entries = zip.getEntries();
        if (entries.length === 0) throw new Error('ZIP vazio');
        const csvEntry = entries.find(e => e.entryName.toLowerCase().endsWith('.csv'));
        if (!csvEntry) throw new Error('Nenhum CSV encontrado dentro do ZIP');
        const destPath = path.join(FILES_DIR, 'iw_cpc_975.csv');
        zip.extractEntryTo(csvEntry.entryName, FILES_DIR, false, true);
        const extractedPath = path.join(FILES_DIR, csvEntry.entryName);
        if (extractedPath !== destPath && fs.existsSync(extractedPath)) {
            fs.renameSync(extractedPath, destPath);
        }
        return destPath;
    }
    return filePath;
}

async function processarETL_975_net(csvFilePath, pool) {
    console.log('--- INICIANDO ETL IW_CPC_975 ---');
    
    csvFilePath = await extrairZipSeNecessario(csvFilePath);
    
    if (!fs.existsSync(csvFilePath)) {
        throw new Error(`Arquivo nao encontrado: ${csvFilePath}`);
    }
    
    const schemaName = 'db_bloco_de_notas';
    const tableName = 'iw_cpc_975_net';
    const columns = IW_CPC_975_COLUMNS;
    const expectedColumns = columns.length;
    
    // Colunas que serao inseridas via COPY (excluindo data_carga que e DEFAULT)
    const copyColumns = columns.filter(col => col !== 'data_carga');
    
    const rawBuffer = fs.readFileSync(csvFilePath);
    const content = iconv.decode(rawBuffer, 'win1252');
    const rawLines = splitCsvRecords(content);
    
    if (rawLines.length === 0) throw new Error('CSV vazio');
    
    // Detectar delimitador
    const headerSample = rawLines[0];
    const countSemicolon = (headerSample.match(/;/g) || []).length;
    const countComma = (headerSample.match(/,/g) || []).length;
    const usedDelimiter = countComma > countSemicolon ? ',' : ';';
    
    console.log(`Delimitador detectado: "${usedDelimiter}"`);
    console.log(`Linhas no CSV (incluindo cabecalho): ${rawLines.length}`);
    
    // Parsear cabecalho e construir mapeamento
    const headerRaw = rawLines[0].replace(/\r?$/, '');
    const csvHeaderFields = parseCsvLine(headerRaw, usedDelimiter);
    console.log(`Colunas detectadas no CSV: ${csvHeaderFields.length}`);
    
    // Construir mapeamento: para cada coluna esperada, qual indice no CSV
    const columnMapping = buildColumnMapping(csvHeaderFields, copyColumns);
    console.log(`Mapeamento de colunas: [${columnMapping.join(', ')}]`);
    
    // Processar linhas de dados, reordenando conforme mapeamento
    const processedLines = [];
    // Adicionar cabecalho NOVO com os nomes exatos das colunas esperadas
    processedLines.push(copyColumns.join(usedDelimiter));
    
    let linhasProcessadas = 0;
    let linhasIgnoradas = 0;
    
    for (let idx = 1; idx < rawLines.length; idx++) {
        const rawLine = rawLines[idx].replace(/\r?$/, '');
        if (rawLine.trim() === '') {
            linhasIgnoradas++;
            continue;
        }
        
        let fields = parseCsvLine(rawLine, usedDelimiter);
        
        // Se o delimitador parece errado, tentar alternativa
        if (fields.length < Math.min(3, expectedColumns) && usedDelimiter === ';') {
            const altFields = parseCsvLine(rawLine, ',');
            if (altFields.length > fields.length) {
                console.log(`[DEBUG] Linha ${idx}: delimitador alternativo (,) parece mais adequado (${altFields.length} campos vs ${fields.length})`);
                fields = altFields;
            }
        }
        
        // Reordenar campos conforme mapeamento
        const reorderedFields = [];
        for (let cIdx = 0; cIdx < copyColumns.length; cIdx++) {
            const csvSrcIdx = columnMapping[cIdx];
            if (csvSrcIdx >= 0 && csvSrcIdx < fields.length) {
                reorderedFields.push(fields[csvSrcIdx]);
            } else {
                reorderedFields.push('');
            }
        }
        
        const outLine = reorderedFields.map(f => quoteFieldIfNeeded(f, usedDelimiter)).join(usedDelimiter);
        processedLines.push(outLine);
        linhasProcessadas++;
    }
    
    console.log(`Linhas de dados processadas: ${linhasProcessadas}, ignoradas (vazias): ${linhasIgnoradas}`);
    
    const outputFile = path.join(FILES_DIR, 'iw_cpc_975_cleaned.csv');
    fs.writeFileSync(outputFile, processedLines.join('\n'), 'utf8');
    console.log(`Arquivo limpo escrito: ${outputFile}`);
    
    // --- Inicio do carregamento no banco ---
    let client;
    try {
        client = await pool.connect();
        
        const fullTablePath = `"${schemaName}"."${tableName}"`;
        
        await client.query('CREATE SCHEMA IF NOT EXISTS "db_bloco_de_notas";');
        await client.query(IW_CPC_975_net_CREATE_TABLE_SQL);
        console.log('Tabela verificada/criada.');
        
        await ensureTableColumns(client, schemaName, tableName, columns);
        
        // Tentar procedure de limpeza pre-TRUNCATE
        try {
            await client.query(`CALL db_bloco_de_notas.sp_limpar_iw_cpc_975_net();`);
            console.log('Stored procedure sp_limpar_iw_cpc_975_net executada com sucesso (pre-TRUNCATE).');
        } catch (error) {
            console.log(`Aviso: sp_limpar_iw_cpc_975_net nao executada (pre-TRUNCATE): ${error.message}`);
        }
        
        await client.query(`TRUNCATE TABLE ${fullTablePath}`);
        console.log('Dados antigos removidos.');
        
        // Construir COPY com as colunas corretas
        const columnsList = copyColumns.map(col => `"${col}"`).join(', ');
        
        const copyQuery = `
            COPY ${fullTablePath} (${columnsList}) FROM STDIN
            DELIMITER '${usedDelimiter}'
            CSV HEADER
            ENCODING 'UTF8'
        `;
        
        console.log(`Executando COPY: ${copyQuery.substring(0, 200)}...`);
        
        const { from } = require('pg-copy-streams');
        const stream = client.query(from(copyQuery));
        const fileStream = fs.createReadStream(outputFile, { encoding: 'utf8' });
        
        await new Promise((resolve, reject) => {
            fileStream.on('error', (err) => {
                console.error(`Erro no fileStream: ${err.message}`);
                reject(err);
            });
            stream.on('error', (err) => {
                console.error(`Erro no stream COPY: ${err.message}`);
                reject(err);
            });
            stream.on('finish', () => {
                console.log('Stream COPY finalizado com sucesso.');
                resolve();
            });
            fileStream.pipe(stream);
        });
        
        console.log('Dados carregados com sucesso via COPY.');
        
        // Executar procedure de limpeza pos-insert
        try {
            await client.query('CALL db_bloco_de_notas.sp_limpar_iw_cpc_975_net();');
            console.log('Procedimento de limpeza executado.');
        } catch (error) {
            console.log(`Aviso: sp_limpar_iw_cpc_975_net nao executada (pos-carga): ${error.message}`);
        }
        
        const countResult = await client.query(`SELECT COUNT(*) as total FROM ${fullTablePath}`);
        const totalRows = parseInt(countResult.rows[0].total);
        
        console.log(`--- ETL IW_CPC_975 CONCLUIDO: ${totalRows} registros ---`);
        
        return { success: true, totalRows };
        
    } catch (error) {
        console.error(`Erro no ETL: ${error.message}`);
        console.error(`Stack: ${error.stack}`);
        throw error;
    } finally {
        if (client) client.release();
    }
}

module.exports = {
    processarETL_975_net,
    IW_CPC_975_COLUMNS,
    IW_CPC_975_net_CREATE_TABLE_SQL
};