// ============================================================
// Config central (item 4): valores compartilhados por server.js e routes/*.
// Mantem os mesmos valores em uso (sem mudanca de comportamento).
// ============================================================
const JWT_SECRET = process.env.JWT_SECRET || 'Lenovo!Hitss!Global';
const LEGACY_SECRET = JWT_SECRET;
const SENHA_PADRAO_TROCA = process.env.SENHA_PADRAO_TROCA || 'Hitss@2026';

const JIRA_SITE = process.env.JIRA_SITE || 'https://clarobr-jsm-negocios.atlassian.net';
const JIRA_EMAIL = process.env.JIRA_EMAIL || 'felipe.holanda.terceiros@claro.com.br';
const JIRA_FILTRO = process.env.JIRA_FILTRO || '10288';
const JIRA_DIAS_ATRAS = parseInt(process.env.JIRA_DIAS_ATRAS || '60', 10);

module.exports = {
  JWT_SECRET,
  LEGACY_SECRET,
  SENHA_PADRAO_TROCA,
  JIRA_SITE,
  JIRA_EMAIL,
  JIRA_FILTRO,
  JIRA_DIAS_ATRAS
};
