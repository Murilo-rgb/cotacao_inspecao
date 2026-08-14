const fs = require('fs');
const iconv = require('iconv-lite');
const path = require('path');

const FILES_DIR = 's:/geo-pme-notas/files';

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

function cleanColumnName(name) {
    let cleaned = name.trim().replace(/"/g, '');
    cleaned = cleaned.toLowerCase();
    cleaned = cleaned.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    cleaned = cleaned.replace(/[^a-z0-9_]/g, '_');
    cleaned = cleaned.replace(/_+/g, '_');
    cleaned = cleaned.replace(/^_|_$/g, '');
    return cleaned;
}

async function main() {
    const csvFilePath = path.join(FILES_DIR, 'hoteis_hospitais.csv');
    const rawBuffer = fs.readFileSync(csvFilePath);
    const content = iconv.decode(rawBuffer, 'win1252');
    const rawLines = splitCsvRecords(content);

    console.log('=== RAW LINES via splitCsvRecords ===');
    console.log('Total rawLines:', rawLines.length);

    const headerSample = rawLines[0];
    const countSemicolon = (headerSample.match(/;/g) || []).length;
    const countComma = (headerSample.match(/,/g) || []).length;
    const usedDelimiter = countComma > countSemicolon ? ',' : ';';
    console.log('Delimitador:', usedDelimiter);

    const headerFields = parseCsvLine(rawLines[0].replace(/\r?$/, ''), usedDelimiter).map(h => cleanColumnName(h));
    console.log('Header cleaned:');
    headerFields.forEach((h, i) => console.log(`  [${i}] ${h}`));

    // Verificar quantas linhas têm o número correto de campos
    let countOk = 0;
    let countShort = 0;
    let countLong = 0;
    let examples = [];
    
    for (let idx = 1; idx < rawLines.length; idx++) {
        const rawLine = rawLines[idx].replace(/\r?$/, '');
        if (rawLine.trim() === '') continue;
        let fields = parseCsvLine(rawLine, usedDelimiter);
        if (fields.length === headerFields.length) countOk++;
        else if (fields.length < headerFields.length) {
            countShort++;
            if (examples.length < 3) examples.push({ idx, len: fields.length, preview: rawLine.substring(0, 200) });
        }
        else {
            countLong++;
            if (examples.length < 3) examples.push({ idx, len: fields.length, preview: rawLine.substring(0, 200) });
        }
    }

    console.log('=== CONTAGEM ===');
    console.log('Campos corretos:', countOk);
    console.log('Campos curtos:', countShort);
    console.log('Campos longos:', countLong);
    console.log('Exemplos de problemas:');
    examples.forEach(e => console.log(JSON.stringify(e, null, 2)));
}

main();