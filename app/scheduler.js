// ============================================================
// Agendador da procedure db_bloco_de_notas.net_ate_3_linhas().
// Roda uma vez por dia, as 03:00 (horario do servidor), mantendo
// cotacao/qtd_linhas de db_bloco_de_notas.cotacao sincronizados com as
// cargas de db_claro.r_000247 e db_claro.input_pedido_pme.
//
// Sem dependencia externa (nao usa node-cron): setTimeout recursivo que
// reavalia o proximo alvo a cada ciclo, entao virada de mes/ano continua
// correta e o horario nunca "desalinha".
//
// Variaveis de ambiente:
//   NET_ATE_3_LINHAS_AGENDADOR=off   desliga o agendador
//   NET_ATE_3_LINHAS_HORA=3          hora da execucao (0-23)
//   NET_ATE_3_LINHAS_MINUTO=0        minuto da execucao (0-59)
// ============================================================
const PROCEDURE_SQL = 'CALL db_bloco_de_notas.net_ate_3_linhas()';

function horaAlvo() {
  const hora = parseInt(process.env.NET_ATE_3_LINHAS_HORA || '3', 10);
  const minuto = parseInt(process.env.NET_ATE_3_LINHAS_MINUTO || '0', 10);
  return {
    hora: Number.isInteger(hora) && hora >= 0 && hora <= 23 ? hora : 3,
    minuto: Number.isInteger(minuto) && minuto >= 0 && minuto <= 59 ? minuto : 0
  };
}

// Milissegundos ate a proxima ocorrencia de HH:MM: hoje, se ainda nao passou;
// amanha, caso contrario.
function msAteProximaExecucao(agora = new Date()) {
  const { hora, minuto } = horaAlvo();
  const alvo = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), hora, minuto, 0, 0);
  if (alvo.getTime() <= agora.getTime()) alvo.setDate(alvo.getDate() + 1);
  return alvo.getTime() - agora.getTime();
}

function formatarDuracao(ms) {
  if (ms < 60000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin}min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}min` : `${h}h`;
}

// Executa a procedure numa conexao dedicada. Nao lanca excecao: devolve
// { ok, duracaoMs, erro } para o agendador poder seguir agendando o dia seguinte.
async function executarNetAte3Linhas(pool) {
  const inicio = Date.now();
  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error('[NET_ATE_3_LINHAS] Sem conexao com o banco:', err.message);
    return { ok: false, duracaoMs: Date.now() - inicio, erro: err.message };
  }
  try {
    // A procedure varre as origens de db_claro (milhoes de linhas): roda em
    // transacao propria e sem statement_timeout para nao ser interrompida no meio.
    await client.query('BEGIN');
    await client.query('SET LOCAL statement_timeout = 0');
    await client.query(PROCEDURE_SQL);
    await client.query('COMMIT');
    const duracaoMs = Date.now() - inicio;
    console.log(`[NET_ATE_3_LINHAS] Procedure executada com sucesso em ${formatarDuracao(duracaoMs)}.`);
    return { ok: true, duracaoMs };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (rollbackErr) { /* conexao perdida: ignora */ }
    const duracaoMs = Date.now() - inicio;
    console.error(`[NET_ATE_3_LINHAS] Falha ao executar a procedure apos ${formatarDuracao(duracaoMs)}:`, err.message);
    return { ok: false, duracaoMs, erro: err.message };
  } finally {
    client.release();
  }
}

// Liga o agendador diario. Devolve handle com executarAgora()/proximaExecucao()/parar().
function iniciarAgendadorNetAte3Linhas(pool, opcoes = {}) {
  const desligadoPorEnv = String(process.env.NET_ATE_3_LINHAS_AGENDADOR || '').toLowerCase() === 'off';
  if (desligadoPorEnv || opcoes.habilitado === false) {
    console.log('[NET_ATE_3_LINHAS] Agendador desativado.');
    return null;
  }

  const { hora, minuto } = horaAlvo();
  let timer = null;
  let parado = false;
  let emExecucao = false;

  function agendar() {
    if (parado) return;
    timer = setTimeout(ciclo, msAteProximaExecucao());
    // Nao segura o event loop: se o processo for encerrado, o timer nao bloqueia o shutdown.
    if (timer && typeof timer.unref === 'function') timer.unref();
  }

  async function ciclo() {
    if (parado) return;
    if (emExecucao) {
      console.warn('[NET_ATE_3_LINHAS] Ciclo anterior ainda em execucao; execucao de hoje ignorada.');
    } else {
      emExecucao = true;
      try {
        await executarNetAte3Linhas(pool);
      } finally {
        emExecucao = false;
      }
    }
    agendar();
  }

  agendar();
  console.log(`[NET_ATE_3_LINHAS] Agendador ativo: todos os dias as ${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')} (horario do servidor).`);

  return {
    executarAgora: () => executarNetAte3Linhas(pool),
    proximaExecucao: () => new Date(Date.now() + msAteProximaExecucao()),
    parar: () => {
      parado = true;
      if (timer) clearTimeout(timer);
      timer = null;
      console.log('[NET_ATE_3_LINHAS] Agendador parado.');
    }
  };
}

module.exports = {
  PROCEDURE_SQL,
  executarNetAte3Linhas,
  iniciarAgendadorNetAte3Linhas,
  msAteProximaExecucao,
  horaAlvo
};