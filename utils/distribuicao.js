/**
 * Utilitários centrais de distribuição de tarefas para a tabela cotacao.
 *
 * Garante a regra geral de negócio: para uma mesma tarefa, não pode haver mais
 * de uma cotação "Ativo" com a MESMA data_historico (tarefa + data_historico).
 *
 * A checagem de duplicidade é feita com "data_historico IS NOT DISTINCT FROM"
 * (trata corretamente NULL), e o INSERT é atômico — o SELECT de verificação e
 * o INSERT acontecem no MESMO statement (INSERT ... SELECT ... WHERE NOT EXISTS),
 * eliminando a janela de corrida (race condition) entre checar e inserir.
 */

const VALIDACAO_ATIVO = 'Ativo';

/** Normaliza data_historico para comparação consistente com a coluna timestamp. */
function normalizarDataHistorico(value) {
  // Valores que representam "sem histórico" viram NULL.
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === '' || text === '-') return null;
  return text;
}

/**
 * Verifica se já existe cotação Ativa para a tarefa + data_historico.
 * @param {import('pg').Pool|import('pg').PoolClient} cliente
 * @returns {Promise<boolean>}
 */
async function jaDistribuida(cliente, tarefa, dataHistorico, validacao = VALIDACAO_ATIVO) {
  const dh = normalizarDataHistorico(dataHistorico);
  const result = await cliente.query(
    `SELECT 1
       FROM db_bloco_de_notas.cotacao
      WHERE tarefa = $1
        AND validacao = $2
        AND data_historico IS NOT DISTINCT FROM NULLIF($3, '-')::timestamp`,
    [tarefa, validacao, dh]
  );
  return result.rows.length > 0;
}

/**
 * Insere uma cotação de forma atômica, garantindo que não haja (tarefa +
 * data_historico) duplicado. Retorna `true` se inseriu, `false` se já existia.
 *
 * Como a checagem e o INSERT estão na mesma instrução, duas requisições
 * simultâneas (ex.: distribuições para colaboradores diferentes) não conseguem
 * coincidir e duplicar a tarefa+data_historico.
 *
 * @param {import('pg').PoolClient} cliente
 * @param {object} dados
 * @returns {Promise<boolean>}
 */
async function inserirDistribuicaoAtomica(cliente, dados) {
  const {
    tarefa,
    cotacao,
    anotacao = '',
    status = 'pendente',
    validacao = VALIDACAO_ATIVO,
    agora,
    usuarioLogin = null,
    usuarioId = null,
    origem = null,
    dataHistorico = null,
  } = dados;

  const dataHistoricoNorm = normalizarDataHistorico(dataHistorico);

  const result = await cliente.query(
    `INSERT INTO db_bloco_de_notas.cotacao
      (tarefa, cotacao, anotacao, status, validacao, data_de_criacao,
       data_da_ultima_atualizacao, usuario_login, usuario_id, origem, data_historico)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamp
      WHERE NOT EXISTS (
        SELECT 1
          FROM db_bloco_de_notas.cotacao
         WHERE tarefa = $1
           AND validacao = $5
           AND data_historico IS NOT DISTINCT FROM $11::timestamp
      )`,
    [
      tarefa,
      dados.cotacao || tarefa,
      anotacao,
      status,
      validacao,
      agora,
      agora,
      usuarioLogin,
      usuarioId,
      origem,
      dataHistoricoNorm,
    ]
  );

  return result.rowCount > 0;
}

module.exports = {
  VALIDACAO_ATIVO,
  normalizarDataHistorico,
  jaDistribuida,
  inserirDistribuicaoAtomica,
};