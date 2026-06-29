const fs = require('fs');
const h = fs.readFileSync('public/gestao_input_top.html', 'utf8');
try {
  new Function(h);
  console.log('ok');
} catch (e) {
  console.log('line', e.lineNumber, 'msg', e.message);
}