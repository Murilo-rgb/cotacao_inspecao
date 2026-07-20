const fs=require('fs');
const html=fs.readFileSync('public/qualidade.html','utf8');
const start=html.indexOf('<script>')+8;
const end=html.indexOf('</script>',start);
const script=html.slice(start,end);
const lines=script.split('\n');
for(let i=1070;i<=1085;i++){
  console.log(i+1, JSON.stringify(lines[i]));
}