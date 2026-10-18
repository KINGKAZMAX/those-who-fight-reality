/* Capture an exact native-picture strip for targeted redraw reference. */
const fs=require('node:fs/promises'),path=require('node:path')
const {chromium}=require(path.join(require('node:os').homedir(),'.codex/skills/develop-web-game/node_modules/playwright'))
;(async()=>{
 const id=Number(process.argv[2]),pics=process.argv[3].split(',').map(Number)
 const inv=JSON.parse(await fs.readFile(path.resolve(__dirname,'../assets/runtime/native-animation-inventory.json'),'utf8'))
 const object=inv.objects.find(o=>o.id===id)
 const cells=pics.map(pic=>{const s=object.sheets.find(s=>pic>=s.start&&pic<s.start+s.count),w=s.width/s.columns,h=s.height/s.rows,p=pic-s.start;return {pic,source:s.source,x:p%s.columns*w,y:Math.floor(p/s.columns)*h,w,h}})
 const browser=await chromium.launch();const page=await browser.newPage()
 try{
 await page.route('**/native-patch-reference',r=>r.fulfill({contentType:'text/html',body:'<!doctype html>'}))
 await page.goto('http://127.0.0.1:18765/native-patch-reference')
 const data=await page.evaluate(async cells=>{
 const cw=Math.max(...cells.map(c=>c.w)),ch=Math.max(...cells.map(c=>c.h));const canvas=document.createElement('canvas');canvas.width=cw*cells.length;canvas.height=ch
 const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false
 for(let index=0;index<cells.length;index++){const c=cells[index],image=new Image();await new Promise((r,j)=>{image.onload=r;image.onerror=j;image.src='/LF2_19/'+c.source});ctx.drawImage(image,c.x,c.y,c.w-1,c.h-1,index*cw,0,c.w-1,c.h-1)}
 return canvas.toDataURL().split(',')[1]
 },cells)
 const file=path.resolve(__dirname,'../assets/source/native-animation-templates/'+id+'-patch-'+pics[0]+'-'+pics.at(-1)+'.png')
 await fs.writeFile(file,Buffer.from(data,'base64'));console.log(file)
 }finally{await browser.close()}
})()
