const fs=require('fs');
const html=fs.readFileSync('public/qualidade.html','utf8');
const start=html.indexOf('<script>')+8;
const end=html.indexOf('</script>',start);
const script=html.slice(start,end);
let open=0,close=0;
for(let i=0;i<script.length;i++){
  const c=script[i];
  if(c==='(') open++;
  else if(c===')') close++;
}
console.log('open',open,'close',close);