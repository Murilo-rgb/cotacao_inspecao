const XLSX = require('xlsx');
const path = require('path');

// Caminho do arquivo Excel
const EXCEL_PATH = path.join(__dirname, 'Reprova Padrão 1.xlsx');

/**
 * Lê os dados do arquivo Excel "Reprova Padrão 1.xlsx".
 * 
 * Estrutura do Excel:
 *   Coluna A: MOTIVO
 *   Coluna B: CÓDIGO
 *   Coluna C: DESCRIÇÃO
 *   Coluna D: REPROVAS (código + descrição concatenados - não usada)
 * 
 * @returns {Array} Lista de objetos { motivo, cod_reprova, texto_reprova }
 */
function lerDadosExcel() {
  console.log(`\n📂 Lendo arquivo: Reprova Padrão 1.xlsx`);
  
  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Converter para JSON, pulando cabeçalho (min_row=2)
  const rawData = XLSX.utils.sheet_to_json(worksheet, {
    header: ['motivo', 'codigo', 'descricao', 'reprovas'],
    range: 1, // Pula a primeira linha (cabeçalho)
    defval: ''
  });
  
  const dados = [];
  
  for (const row of rawData) {
    const motivo = (row.motivo || '').toString().trim();
    const codigo = (row.codigo || '').toString().trim();
    const descricao = (row.descricao || '').toString().trim();
    
    // Pular linhas completamente vazias
    if (!motivo && !codigo && !descricao) continue;
    
    // Só adicionar se tiver pelo menos código ou descrição
    if (codigo || descricao) {
      dados.push({ motivo, cod_reprova: codigo, texto_reprova: descricao });
    }
  }
  
  return dados;
}

module.exports = { lerDadosExcel, EXCEL_PATH };