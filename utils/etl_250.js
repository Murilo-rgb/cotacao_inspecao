const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const AdmZip = require('adm-zip');

// Configuração do banco de dados (mesmo pool do server.js)
const FILES_DIR = path.join(__dirname, '..', 'files');

const R_000250_COLUMNS = [
"cod_tarefa",
    "dat_criacao",
    "dat_historico",
    "criado_por",
    "pendente_com",
    "nom_statuswf",
    "regional",
    "nom_tarefa",
    "nom_fila",
    "dsc_cotacao",
    "tipo_pedido",
    "qtd_linhas",
    "qtd_linhas_novas",
    "nom_territorio",
    "ind_portabilidade",
    "qtd_reprovacao"
];

const R_000250_CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS db_bloco_de_notas.r_000250 (
    cod_tarefa TEXT NULL,
    dat_criacao TEXT NULL,
    dat_historico TEXT NULL,
    criado_por TEXT NULL,
    pendente_com TEXT NULL,
    nom_statuswf TEXT NULL,
    regional TEXT NULL,
    nom_tarefa TEXT NULL,
    nom_fila TEXT NULL,
    dsc_cotacao TEXT NULL,
    tipo_pedido TEXT NULL,
    qtd_linhas TEXT NULL,
    qtd_linhas_novas TEXT NULL,
    nom_territorio TEXT NULL,
    ind_portabilidade TEXT NULL,
    qtd_reprovacao TEXT NULL,
    data_carga DATE DEFAULT CURRENT_DATE NULL
);
`;

function cleanColumnName(name) {
    let cleaned = name.trim().replace(/"/g, '');
    cleaned = cleaned.toLowerCase();
    cleaned = cleaned.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    cleaned = cleaned.replace(/[ .]/g, '_');
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
        const destPath = path.join(FILES_DIR, 'r_000250.csv');
        zip.extractEntryTo(csvEntry.entryName, FILES_DIR, false, true);
        // rename if extracted name is different
        const extractedPath = path.join(FILES_DIR, csvEntry.entryName);
        if (extractedPath !== destPath && fs.existsSync(extractedPath)) {
            fs.renameSync(extractedPath, destPath);
        }
        return destPath;
    }
    return filePath;
}

async function processarETL_250(csvFilePath, pool) {
    console.log('--- INICIANDO ETL R_000250 ---');
    
    // Se for ZIP, extrair
    csvFilePath = await extrairZipSeNecessario(csvFilePath);
    
    if (!fs.existsSync(csvFilePath)) {
        throw new Error(`Arquivo não encontrado: ${csvFilePath}`);
    }
    
    const schemaName = 'db_bloco_de_notas';
    const tableName = 'r_000250';
    const columns = R_000250_COLUMNS;
    const expectedColumns = columns.length;
    
    // Ler arquivo
    const content = fs.readFileSync(csvFilePath, 'latin1');
    const rawLines = splitCsvRecords(content);
    
    if (rawLines.length === 0) throw new Error('CSV vazio');
    
    // Detectar delimitador
    const headerSample = rawLines[0];
    const countSemicolon = (headerSample.match(/;/g) || []).length;
    const countComma = (headerSample.match(/,/g) || []).length;
    const usedDelimiter = countComma > countSemicolon ? ',' : ';';
    
    console.log(`Delimitador detectado: "${usedDelimiter}"`);
    
    // Processar linhas
    const processedLines = [];
    const headerFields = parseCsvLine(rawLines[0].replace(/\r?$/, ''), usedDelimiter).map(h => cleanColumnName(h));
    processedLines.push(headerFields.join(usedDelimiter));
    
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
        
        const outLine = fields.map(f => quoteFieldIfNeeded(f, usedDelimiter)).join(usedDelimiter);
        processedLines.push(outLine);
    }
    
    // Escrever arquivo limpo
    const outputFile = path.join(FILES_DIR, 'r_000250_cleaned.csv');
    fs.writeFileSync(outputFile, processedLines.join('\n'), 'utf8');
    console.log(`Arquivo limpo escrito: ${outputFile}`);
    
    // Upload para PostgreSQL
    let client;
    try {
        client = await pool.connect();
        
        const fullTablePath = `"${schemaName}"."${tableName}"`;
        
        // Criar schema e tabela
        await client.query('CREATE SCHEMA IF NOT EXISTS "db_bloco_de_notas";');
        await client.query(R_000250_CREATE_TABLE_SQL);
        console.log('Tabela verificada/criada.');
        
        // Garantir colunas
        await ensureTableColumns(client, schemaName, tableName, columns);
        
        // Limpar dados existentes (carga fresca)
        await client.query(`TRUNCATE TABLE ${fullTablePath}`);
        console.log('Dados antigos removidos.');
        
        // COPY
        const copyColumns = columns.filter(col => col !== 'data_carga');
        const columnsList = copyColumns.map(col => `"${col}"`).join(', ');
        
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
        
        // Contar registros
        const countResult = await client.query(`SELECT COUNT(*) as total FROM ${fullTablePath}`);
        const totalRows = parseInt(countResult.rows[0].total);
        
        console.log(`--- ETL R_000250 CONCLUÍDO: ${totalRows} registros ---`);
        
        return { success: true, totalRows };
        
    } catch (error) {
        console.error(`Erro no ETL: ${error.message}`);
        throw error;
    } finally {
        if (client) client.release();
    }
}

module.exports = {
    processarETL_250,
    R_000250_COLUMNS,
    R_000250_CREATE_TABLE_SQL
};