// ============================================================
// Deps compartilhadas dos routers (item 3): um unico objeto, sem
// mudar comportamento. O server.js monta via getRouteDeps() e cada
// modulo de routes/* aceita (deps) ou a assinatura posicional antiga.
// ============================================================
function asDeps(args, names) {
  const first = args && args[0];
  if (first && typeof first === 'object' && !Array.isArray(first) && !(first.query && typeof first.query === 'function')) return first;
  const deps = {};
  for (let i = 0; i < names.length; i++) deps[names[i]] = args[i];
  return deps;
}

// Recebe os valores explicitamente (o modulo nao enxerga o escopo do server.js).
function buildRouteDeps(values) {
  return Object.assign({ config: require('./config') }, values || {});
}

module.exports = { asDeps, buildRouteDeps };
