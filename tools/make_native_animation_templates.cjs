/* Render native atlas cells as reference screenshots for image generation. */
const fs=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm')
const {chromium}=require(path.join(require('node:os').homedir(),'.codex/skills/develop-web-game/node_modules/playwright'))
const root=path.resolve(__dirname,'..')
;(async()=>{
 const inventory=JSON.parse(await fs.readFile(path.join(root,'assets/runtime/native-animation-inventory.json'),'utf8'))
 const browser=await chromium.launch({headless:true});const page=await browser.newPage()
 const out=path.join(root,'assets/source/native-animation-templates');await fs.mkdir(out,{recursive:true})
 try{
 await page.route('**/template-render',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Original native frame reference</title>'}))
 await page.goto('http://127.0.0.1:18765/template-render')
 const records=[]
 for(const object of inventory.objects.filter(o=>o.type!=='character'))for(const sheet of object.sheets){
  if(!sheet.usedPictures.length)continue
  const rowOffset=Math.min(...sheet.usedPictures.map(p=>Math.floor((p-sheet.start)/sheet.columns)))
  const columnOffset=Math.min(...sheet.usedPictures.map(p=>(p-sheet.start)%sheet.columns))
  const columns=Math.max(...sheet.usedPictures.map(p=>(p-sheet.start)%sheet.columns))-columnOffset+1
  const rows=Math.floor((Math.max(...sheet.usedPictures)-sheet.start)/sheet.columns)-rowOffset+1
  const rendered=await page.evaluate(async({sheet,rows,columns,rowOffset,columnOffset})=>{
   const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src='/LF2_19/'+sheet.source})
   const canvas=document.createElement('canvas');canvas.width=sheet.width/sheet.columns*columns;canvas.height=sheet.height/sheet.rows*rows
   const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;const w=sheet.width/sheet.columns,h=sheet.height/sheet.rows
   for(const pic of sheet.usedPictures){const local=pic-sheet.start,x=local%sheet.columns*w,y=Math.floor(local/sheet.columns)*h;ctx.drawImage(image,x,y,w-1,h-1,x-columnOffset*w,y-rowOffset*h,w-1,h-1)}
   return canvas.toDataURL('image/png').split(',')[1]
  },{sheet,rows,columns,rowOffset,columnOffset})
  const file=object.id+'-'+sheet.start+'.png';await fs.writeFile(path.join(out,file),Buffer.from(rendered,'base64'))
  records.push({id:object.id,nativeSource:sheet.source,sheetStart:sheet.start,columns,rows,rowOffset,columnOffset,nativeColumns:sheet.columns,template:'assets/source/native-animation-templates/'+file})
 }
 await fs.writeFile(path.join(out,'index.json'),JSON.stringify(records,null,2)+'\n');console.log('Native reference atlas renders:',records.length)
 }finally{await browser.close()}
})()
