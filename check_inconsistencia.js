const { Pool } = require('pg');
const fs = require('fs');
const iconv = require('iconv-lite');

const pool = new Pool({
    user: 'jose_faria',
    host: '10.230.43.181',
    database: 'db_operacao',
    password: 'vXsEha3PYB',
    port: 5432,
});

async function main() {
    try {
        // 1. Total de registros na tabela
        const total = await pool.query('SELECT COUNT(*) as total FROM db_bloco_de_notas.hoteis_x_hospitais');
        console.log('=== TOTAL REGISTROS TABELA ===');
        console.log(total.rows[0].total);

        // 2. Total de tarefas distintas
        const distinct = await pool.query('SELECT COUNT(DISTINCT id_tarefa) as total FROM db_bloco_de_notas.hoteis_x_hospitais');
        console.log('\n=== TOTAL TAREFAS DISTINTAS ===');
        console.log(distinct.rows[0].total);

        // 3. Colunas da tabela
        const cols = await pool.query(
            "SELECT column_name FROM information_schema.columns WHERE table_schema = 'db_bloco_de_notas' AND table_name = 'hoteis_x_hospitais' ORDER BY ordinal_position"
        );
        console.log('\n=== COLUNAS TABELA ===');
        console.log(JSON.stringify(cols.rows.map(r => r.column_name), null, 2));

        // 4. Lendo o CSV original para contar linhas e colunas
        const rawBuffer = fs.readFileSync('s:/geo-pme-notas/files/hoteis_hospitais.csv');
        const content = iconv.decode(rawBuffer, 'win1252');
        const lines = content.split(/\r?\n/).filter(l => l.trim() !== '');
        console.log('\n=== CSV ORIGINAL ===');
        console.log('Total linhas (incluindo header):', lines.length);
        console.log('Total dados (sem header):', lines.length - 1);
        
        // Colunas do CSV original
        const headerLine = lines[0];
        const countSemicolon = (headerLine.match(/;/g) || []).length;
        const countComma = (headerLine.match(/,/g) || []).length;
        const delim = countComma > countSemicolon ? ',' : ';';
        const headerFields = parseCsv(headerLine, delim);
        console.log('Colunas CSV original:', JSON.stringify(headerFields, null, 2));
        console.log('Total colunas CSV:', headerFields.length);

        // 5. Lendo o CSV cleaned
        const cleanContent = fs.readFileSync('s:/geo-pme-notas/files/hoteis_hospitais_cleaned.csv', 'utf8');
        const cleanLines = cleanContent.split(/\r?\n/).filter(l => l.trim() !== '');
        console.log('\n=== CSV CLEANED ===');
        console.log('Total linhas (incluindo header):', cleanLines.length);
        console.log('Total dados (sem header):', cleanLines.length - 1);
        
        const cleanHeaderFields = parseCsv(cleanLines[0], delim);
        console.log('Colunas CSV cleaned:', JSON.stringify(cleanHeaderFields, null, 2));
        console.log('Total colunas cleaned:', cleanHeaderFields.length);

        // 6. Amostra de tarefas distintas na tabela
        const sample = await pool.query('SELECT DISTINCT id_tarefa, count(*) as qtd FROM db_bloco_de_notas.hoteis_x_hospitais GROUP BY id_tarefa ORDER BY id_tarefa LIMIT 10');
        console.log('\n=== AMOSTRA TAREFAS ===');
        console.log(JSON.stringify(sample.rows, null, 2));

    } catch (e) {
        console.error('ERRO:', e.message);
    } finally {
        pool.end();
    }
}

function parseCsv(line, delim) {
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

main();