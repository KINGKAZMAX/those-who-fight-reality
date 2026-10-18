const fs=require('node:fs'),path=require('node:path');const dir=path.resolve(__dirname,'../docs/figma-archive/2026-10-18');const inv=JSON.parse(fs.readFileSync(path.join(dir,'inventory.json')));
const chunks=[];
for(const f of inv.codes){const lines=f.text.split('\n');let body='',start=1,n=1;function add(){if(!body)return;chunks.push({title:f.path+' / L'+start+'–'+(n-1),body:'SHA-256 '+f.sha256+'\n原文件快照；代码为可编辑文本；源文件才是执行入口。\n\n'+body,source:f.path});body='';start=n;}for(const line of lines){if(body.length+line.length>6500)add();body+=line+'\n';n++;}add();}
for(let i=0;i<chunks.length;i+=10)fs.writeFileSync(path.join(dir,'text-batch-'+i/10+'.json'),JSON.stringify(chunks.slice(i,i+10)));
fs.writeFileSync(path.join(dir,'text-batches.json'),JSON.stringify({chunks:chunks.length,batches:Math.ceil(chunks.length/10)}));console.log({files:inv.codes.length,chunks:chunks.length,batches:Math.ceil(chunks.length/10)});
