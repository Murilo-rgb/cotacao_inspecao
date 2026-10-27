// Validação one-off: compara a regra do frontend (getPortabilidade) com a coluna
// persistida no banco (ind_portabilidade), usando os dados reais de /api/inspecao/tarefas.
// Usado para diagnosticar o bug em que o front marcava todos como "NAO" porque
// `tipo_pedido_categoria` (normalizado) engolia o texto bruto de `tipo_pedido`.
const jwt = require('jsonwebtoken');
const config = require('../app/config');

// Réplica EXATA de getPortabilidade (public/inspecao.html)
const getPortabilidade = (t) => {
  try {
    const campos = [
      t && t.tipo_pedido,
      t && t.tipo_pedido_categoria,
      t && t.ind_portabilidade
    ];
    for (const campo of campos) {
      const v = String(campo || '').trim().toUpperCase();
      if (!v) continue;
      if (v === 'SIM' || v === 'S') return 'SIM';
      if (v === 'NAO' || v === 'NÃO' || v === 'N') return 'NAO';
      if (v.includes('PORT')) return 'SIM';
    }
    return 'NAO';
  } catch { return 'NAO'; }
};

// Regra ANTIGA (bugada) — mantida apenas para comprovar o bug corrigido
const getPortabilidadeAntiga = (t) => {
  try {
    const tipo = String((t && (t.tipo_pedido_categoria || t.tipo_pedido)) || '');
    return /port/i.test(tipo) ? 'SIM' : 'NAO';
  } catch { return 'NAO'; }
};

// Réplica de classificarTipoPedido / getCategoriaTipoPedido (public/inspecao.html)
const classificarTipoPedido = (tipo) => {
  try {
    const s = String(tipo || '').toLowerCase();
    if (!s) return 'DEMAIS';
    if (s.includes('novo')) return 'NOVO';
    if (s.includes('reno')) return 'RENOVACAO';
    if (s.includes('incre')) return 'INCREMENTO';
    if (s.includes('trans')) return 'TRANSFERENCIA';
    return 'DEMAIS';
  } catch { return 'DEMAIS'; }
};

const getCategoriaTipoPedido = (tarefa) => {
  try {
    const catBackend = String((tarefa && tarefa.tipo_pedido_categoria) || '').trim();
    if (catBackend && catBackend.toUpperCase() !== 'DEMAIS') return catBackend.toUpperCase();
    const classificado = classificarTipoPedido((tarefa && tarefa.tipo_pedido) || '');
    return classificado !== 'DEMAIS' ? classificado : (catBackend.toUpperCase() || 'DEMAIS');
  } catch { return 'DEMAIS'; }
};

(async () => {
  const token = jwt.sign(
    { username: 'admin', id: 123, nome: 'Administrador' },
    config.JWT_SECRET,
    { expiresIn: '1h' }
  );
  const resp = await fetch('http://127.0.0.1:3016/api/inspecao/tarefas', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const tarefas = await resp.json();

  const simDB = tarefas.filter(x => x.ind_portabilidade === 'SIM').length;
  const simNovo = tarefas.filter(x => getPortabilidade(x) === 'SIM').length;
  const simAntigo = tarefas.filter(x => getPortabilidadeAntiga(x) === 'SIM').length;
  const divergentes = tarefas.filter(x => getPortabilidade(x) !== x.ind_portabilidade);

  console.log('=== VALIDACAO FRONTEND vs BANCO ===');
  console.log('total linhas API      :', tarefas.length);
  console.log('SIM no banco          :', simDB);
  console.log('SIM regra ANTIGA(bug) :', simAntigo, simAntigo === 0 ? '<== BUG reproduzido' : '');
  console.log('SIM regra NOVA        :', simNovo, simNovo === simDB ? '<== OK' : '<== DIVERGE');
  console.log('divergencias          :', divergentes.length);
  // Confere se a categoria exibida na coluna "Pedido" respeita a do backend
  const catDivergentes = tarefas.filter(x => {
    const esperada = String(x.tipo_pedido_categoria || '').trim().toUpperCase();
    if (!esperada || esperada === 'DEMAIS') return false;
    return getCategoriaTipoPedido(x) !== esperada;
  }).length;

  console.log('coluna Pedido OK      :', catDivergentes === 0, `(${catDivergentes} divergentes)`);
  console.log('RESULTADO             :', divergentes.length === 0 && simNovo === simDB && simNovo > 0
    ? `OK - ${simNovo} badges SIM renderizam no front`
    : 'FALHA');
  process.exit(0);
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
