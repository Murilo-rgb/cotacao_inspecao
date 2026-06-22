const http = require('http');

function makeRequest(method, path, headers, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3016,
      path: path,
      method: method,
      headers: headers || {}
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  try {
    // Login with user's credentials
    const body = JSON.stringify({ username: 'murilo.trevisan.3', password: 'Murilo1211!' });
    const res = await makeRequest('POST', '/api/login', 
      { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, 
      body
    );
    
    console.log(`Login => ${res.status}`);
    
    try {
      const data = JSON.parse(res.data);
      if (data.token) {
        console.log('TOKEN OBTIDO!');
        
        // Test quotations API
        const qRes = await makeRequest('GET', '/api/quotations', 
          { 'Authorization': `Bearer ${data.token}` }
        );
        
        if (qRes.status === 200) {
          const quotations = JSON.parse(qRes.data);
          console.log(`\nTotal de cotações: ${quotations.length}`);
          
          if (quotations.length > 0) {
            console.log('\nPrimeiros 20 registros:');
            quotations.slice(0, 20).forEach((q, i) => {
              console.log(`[${i+1}] dsc_cotacao="${q.dsc_cotacao}" | cotacao="${q.cotacao}" | display="${q.dsc_cotacao ? q.dsc_cotacao + ' - ' : ''}${q.cotacao}"`);
            });
            
            const withDsc = quotations.filter(q => q.dsc_cotacao);
            console.log(`\nCom dsc_cotacao: ${withDsc.length}`);
            console.log(`Sem dsc_cotacao: ${quotations.length - withDsc.length}`);
          }
        } else {
          console.log(`Erro na API de cotações: ${qRes.status}`);
          console.log(qRes.data.substring(0, 500));
        }
        
        // Test gestao API
        const gRes = await makeRequest('GET', '/api/gestao/tarefas',
          { 'Authorization': `Bearer ${data.token}` }
        );
        
        if (gRes.status === 200) {
          const tarefas = JSON.parse(gRes.data);
          console.log(`\nTotal de tarefas (gestão): ${tarefas.length}`);
          if (tarefas.length > 0) {
            console.log('\nPrimeiras 10 tarefas:');
            tarefas.slice(0, 10).forEach((t, i) => {
              console.log(`[${i+1}] dsc_cotacao="${t.dsc_cotacao}" | cod_tarefa="${t.cod_tarefa}"`);
            });
            
            // Check which cod_tarefa from gestão exist in quotations
            const cotacaoSet = new Set(quotations.map(q => q.cotacao));
            console.log(`\nTarefas da gestão que existem como cotação:`);
            tarefas.filter(t => cotacaoSet.has(t.cod_tarefa)).forEach(t => {
              console.log(`  "${t.dsc_cotacao} - ${t.cod_tarefa}"`);
            });
          }
        } else {
          console.log(`Erro na API de gestão: ${gRes.status}`);
        }
        
      } else {
        console.log('Falha no login:', res.data);
      }
    } catch(e) {
      console.error('Erro parse:', e.message);
      console.log('Raw:', res.data.substring(0, 500));
    }
    
  } catch (err) {
    console.error('Erro:', err.message);
  }
}

main();