const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');
const { Pool } = require('pg');
const AdmZip = require('adm-zip');

const FILES_DIR = path.join(__dirname, '..', 'files');

const HOTEIS_HOSPITAIS_COLUMNS = [
    "fila",
    "id_tarefa",
    "nome_tarefa",
    "data_de_abertura",
    "data_de_historico",
    "data_de_conclusao",
    "de_etapa",
    "de_usuario",
    "acao",
    "para_etapa",
    "para_usuario_grupo",
    "tempo_de_permanencia_na_etapa_horas",
    "observacoes",
    "cnpj",
    "razao_social",
    "uf_do_cartao_cnpj_do_cliente",
    "codigo_da_revenda",
    "territorio",
    "nome_demandante",
    "login_do_vendedor",
    "nome_do_vendedor_responsavel_pela_venda",
    "banda_larga",
    "tv",
    "produtos_agregados",
    "total_de_pontos",
    "valor_contratado_individual",
    "valor_contratado_total",
    "negociacao_com_desconto"
];

const HOTEIS_HOSPITAIS_CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS db_bloco_de_notas.hoteis_x_hospitais (
    fila TEXT NULL,
    id_tarefa TEXT NULL,
    nome_tarefa TEXT NULL,
    data_de_abertura TIMESTAMP NULL,
    data_de_historico TIMESTAMP NULL,
    data_de_conclusao TIMESTAMP NULL,
    de_etapa TEXT NULL,
    de_usuario TEXT NULL,
    acao TEXT NULL,
    para_etapa TEXT NULL,
    para_usuario_grupo TEXT NULL,
    tempo_de_permanencia_na_etapa_horas TEXT NULL,
    observacoes TEXT NULL,
    cnpj TEXT NULL,
    razao_social TEXT NULL,
    uf_do_cartao_cnpj_do_cliente TEXT NULL,
    codigo_da_revenda TEXT NULL,
    territorio TEXT NULL,
    nome_demandante TEXT NULL,
    login_do_vendedor TEXT NULL,
    nome_do_vendedor_responsavel_pela_venda TEXT NULL,
    banda_larga TEXT NULL,
    tv TEXT NULL,
    produtos_agregados TEXT NULL,
    total_de_pontos TEXT NULL,
    valor_contratado_individual TEXT NULL,
    valor_contratado_total TEXT NULL,
    negociacao_com_desconto TEXT NULL
);
`;

function convertDateBRtoISO(value) {
    if (!value || value.trim() === '') return '';
    const text = value.trim();
    // Formato: DD/MM/YYYY HH:MM ou DD/MM/YYYY HH:MM:SS ou DD/MM/YYYY
    const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!match) return text; // Se não for data BR, mantém como está
    const [, day, month, year, hour = '00', minute = '00', second = '00'] = match;
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function cleanColumnName(name) {
    let cleaned = name.trim().replace(/"/g, '');
    cleaned = cleaned.toLowerCase();
    cleaned = cleaned.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // Remover todos os caracteres que não sejam letras minúsculas, dígitos ou underscore
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
        const destPath = path.join(FILES_DIR, 'hoteis_hospitais.csv');
        zip.extractEntryTo(csvEntry.entryName, FILES_DIR, false, true);
        const extractedPath = path.join(FILES_DIR, csvEntry.entryName);
        if (extractedPath !== destPath && fs.existsSync(extractedPath)) {
            fs.renameSync(extractedPath, destPath);
        }
        return destPath;
    }
    return filePath;
}

async function processarETL_HoteisHospitais(csvFilePath, pool) {
    console.log('--- INICIANDO ETL HOTEIS_X_HOSPITAIS ---');
    
    csvFilePath = await extrairZipSeNecessario(csvFilePath);
    
    if (!fs.existsSync(csvFilePath)) {
        throw new Error(`Arquivo não encontrado: ${csvFilePath}`);
    }
    
    const schemaName = 'db_bloco_de_notas';
    const tableName = 'hoteis_x_hospitais';
    const columns = HOTEIS_HOSPITAIS_COLUMNS;
    const expectedColumns = columns.length;
    
    const rawBuffer = fs.readFileSync(csvFilePath);
    const content = iconv.decode(rawBuffer, 'win1252');
    const rawLines = splitCsvRecords(content);
    
    if (rawLines.length === 0) throw new Error('CSV vazio');
    
    const headerSample = rawLines[0];
    const countSemicolon = (headerSample.match(/;/g) || []).length;
    const countComma = (headerSample.match(/,/g) || []).length;
    const usedDelimiter = countComma > countSemicolon ? ',' : ';';
    
    console.log(`Delimitador detectado: "${usedDelimiter}"`);
    
    const processedLines = [];
    const headerFields = parseCsvLine(rawLines[0].replace(/\r?$/, ''), usedDelimiter).map(h => cleanColumnName(h));
    processedLines.push(headerFields.join(usedDelimiter));
    
    // Índices das colunas de data no CSV (data_de_abertura, data_de_historico, data_de_conclusao)
    const DATE_COLUMNS = [3, 4, 5];

    for (let idx = 1; idx < rawLines.length; idx++) {
        const rawLine = rawLines[idx].replace(/\r?$/, '');
        if (rawLine.trim() === '') continue;
        
        let fields = parseCsvLine(rawLine, usedDelimiter);
        
        if (fields.length < Math.min(3, expectedColumns) && usedDelimiter === ';') {
            const altFields = parseCsvLine(rawLine, ',');
            if (altFields.length > fields.length) fields = altFields;
        }
        
        if (fields.length > expectedColumns) {
            const head = fields.slice(0, expectedColumns - 1);
            const tail = fields.slice(expectedColumns - 1).join(usedDelimiter);
            fields = head.concat([tail]);
        }
        
        if (fields.length < expectedColumns) {
            while (fields.length < expectedColumns) fields.push('');
        }
        
        // Converter datas do formato BR (DD/MM/YYYY HH:MM) para ISO (YYYY-MM-DD HH:MM:SS)
        DATE_COLUMNS.forEach(idx => {
            if (fields[idx]) fields[idx] = convertDateBRtoISO(fields[idx]);
        });
        
        const outLine = fields.map(f => quoteFieldIfNeeded(f, usedDelimiter)).join(usedDelimiter);
        processedLines.push(outLine);
    }
    
    const outputFile = path.join(FILES_DIR, 'hoteis_hospitais_cleaned.csv');
    fs.writeFileSync(outputFile, processedLines.join('\n'), 'utf8');
    console.log(`Arquivo limpo escrito: ${outputFile}`);
    
    let client;
    try {
        client = await pool.connect();
        
        const fullTablePath = `"${schemaName}"."${tableName}"`;
        
        await client.query('CREATE SCHEMA IF NOT EXISTS "db_bloco_de_notas";');
        await client.query(HOTEIS_HOSPITAIS_CREATE_TABLE_SQL);
        console.log('Tabela verificada/criada.');
        
        await ensureTableColumns(client, schemaName, tableName, columns);
        
        await client.query(`TRUNCATE TABLE ${fullTablePath}`);
        console.log('Dados antigos removidos.');
        
        const columnsList = columns.map(col => `"${col}"`).join(', ');
        
        const copyQuery = `
            COPY ${fullTablePath} (${columnsList}) FROM STDIN
            DELIMITER '${usedDelimiter}'
            CSV HEADER
            ENCODING 'UTF8'
        `;
        
        const { from } = require('pg-copy-streams');
        const stream = client.query(from(copyQuery));
        const fileStream = fs.createReadStream(outputFile, { encoding: 'utf8' });
        
        await new Promise((resolve, reject) => {
            fileStream.on('error', reject);
            stream.on('error', reject);
            stream.on('finish', resolve);
            fileStream.pipe(stream);
        });
        
        console.log('Dados carregados com sucesso via COPY.');
        
        const countResult = await client.query(`SELECT COUNT(*) as total FROM ${fullTablePath}`);
        const totalRows = parseInt(countResult.rows[0].total);
        
        console.log(`--- ETL HOTEIS_X_HOSPITAIS CONCLUÍDO: ${totalRows} registros ---`);
        
        return { success: true, totalRows };
        
    } catch (error) {
        console.error(`Erro no ETL: ${error.message}`);
        throw error;
    } finally {
        if (client) client.release();
    }
}

module.exports = {
    processarETL_HoteisHospitais,
    HOTEIS_HOSPITAIS_COLUMNS,
    HOTEIS_HOSPITAIS_CREATE_TABLE_SQL
};