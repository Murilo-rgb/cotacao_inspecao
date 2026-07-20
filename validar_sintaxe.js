const fs = require('fs');
const html = fs.readFileSync('public/qualidade.html', 'utf8');
const start = html.indexOf('<script>');
const end = html.indexOf('</script>', start + 8);
const script = html.slice(start + 8, end);
try {
    new Function(script);
    console.log('OK_Node');
} catch (e) {
    console.log('ERRO_Node: ' + e.message);
}
try {
    require('acorn').parse(script, {ecmaVersion: 'latest'});
    console.log('OK_Acorn');
} catch (e) {
    console.log('ERRO_Acorn: ' + e.message + ' line:' + e.loc.line + ' col:' + e.loc.column);
}