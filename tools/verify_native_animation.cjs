/* Real Canvas validation of every referenced atlas picture and atomic setup. */
const fs = require('node:fs/promises')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const { chromium } = require(path.join(require('node:os').homedir(),'.codex/skills/develop-web-game/node_modules/playwright'))
const root = path.resolve(__dirname,'..')
async function amd(file) { let result; vm.runInNewContext(await fs.readFile(path.join(root,file),'utf8'),{define(data){result=data}});return JSON.parse(JSON.stringify(result)) }
;(async()=>{
  const candidate='vendor/F.LF/game/native-animation-candidate.js'
  const catalogFile=await fs.access(path.join(root,candidate)).then(()=>candidate,()=> 'vendor/F.LF/game/native-animation-data.js')
  const catalog=await amd(catalogFile)
  const catalogText=await fs.readFile(path.join(root,catalogFile),'utf8')
  const catalogHash=require('node:crypto').createHash('sha256').update(catalogText).digest('hex')
  const verificationHash=require('./native_animation_digest.cjs')(root,catalogText)
  const definition = await amd('vendor/LF2_19/data/data.js')
  const objects = await Promise.all(definition.object.map(async entry=>Object.assign({},entry,{data:await amd('vendor/LF2_19/'+entry.file)})))
  for (const [id,native] of [[31,4],[32,6]]) { const original=objects.find(o=>o.id===native);objects.push(Object.assign({},original,{id,realityNativeId:native,data:JSON.parse(JSON.stringify(original.data))})) }
  const script=await fs.readFile(path.join(root,'vendor/F.LF/game/native-animation.js'),'utf8')
  const browser=await chromium.launch({headless:true})
  const page=await browser.newPage({viewport:{width:1280,height:900}})
  const out=path.join(root,'docs/verification/native-animation')
  await fs.mkdir(out,{recursive:true})
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text())})
  try {
    await page.route('**/native-animation-audit',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="margin:0;background:#283241;color:white;font:16px sans-serif"><h1>Native picture atlas verification</h1></body></html>'}))
    await page.goto('http://127.0.0.1:18765/native-animation-audit')
    const report=await page.evaluate(async({catalog,objects,script})=>{
      let animation
      window.define=(deps,factory)=>{animation=factory(catalog)}
      eval(script)
      const pack={data:{object:objects},reality:{diagnostics:{characterMapping:[]}}}
      const before=objects.map(o=>JSON.stringify(o.data.frame))
      await animation.prepare(pack)
      if(objects.some((o,i)=>JSON.stringify(o.data.frame)!==before[i]))throw new Error('Frame logic mutated')
      const report=pack.reality.animation
      report.boundErrors=[];report.alphaErrors=[];report.calibratedCells=0;report.emptyCells=0;report.patchCells=0
      const ids=[11,2,8,4,9,10,30,31,32]
      const sheets=report.sheets.filter(s=>s.artwork)
      async function imageData(url) {
        const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url})
        const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight
        const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0)
        return {canvas,pixels:ctx.getImageData(0,0,canvas.width,canvas.height).data,width:canvas.width,height:canvas.height}
      }
      for(const sheet of sheets){
        const object=objects.find(o=>o.id===sheet.object)
        const record=object.data.bmp.file[sheet.sheet]
        const key=Object.keys(record).find(k=>k.startsWith('file'))
        const actual=await imageData(record[key])
        const original=sheet.lockAlpha?await imageData('/LF2_19/'+sheet.source):null
        const cw=record.w+1,ch=record.h+1
        for(const cell of sheet.cells){
          const local=cell.pic-sheet.start
          const rect={x:local%record.row*cw,y:Math.floor(local/record.row)*ch,w:cw-1,h:ch-1}
          const b=animation.bounds(actual.pixels,actual.width,actual.height,rect)
          if(cell.empty){report.emptyCells++;if(b)report.boundErrors.push({object:sheet.object,pic:cell.pic,reason:'nonempty native empty frame'});continue}
          report.calibratedCells++
          if(original){
            let mismatches=0
            for(let y=0;y<rect.h;y++)for(let x=0;x<rect.w;x++){
              const gx=rect.x+x,gy=rect.y+y
              const alpha=gx<original.width&&gy<original.height?original.pixels[(gy*original.width+gx)*4+3]:0
              if(actual.pixels[(gy*actual.width+gx)*4+3]!==alpha)mismatches++
            }
            if(mismatches)report.alphaErrors.push({object:sheet.object,pic:cell.pic,mismatches})
          }
          if(cell.patch)report.patchCells++
          const n=cell.nativeBounds
          if(!b||Math.max(...['x','y','w','h'].map(k=>Math.abs(b[k]-n[k])))>0)report.boundErrors.push({object:sheet.object,pic:cell.pic,native:n,actual:b})
        }
        {
          const section=document.createElement('section');section.dataset.object=sheet.object;section.dataset.sheet=sheet.sheet
          const heading=document.createElement('h2');heading.textContent='ID '+sheet.object+' | '+sheet.artwork+' | native pics '+sheet.start+'–'+(sheet.start+sheet.count-1)
          section.append(heading,actual.canvas);document.body.append(section)
        }
      }
      // Exercise missing-cell rejection and confirm zero partial bitmap updates.
      const victim=objects.find(o=>o.id===11)
      const saved=JSON.stringify(victim.data.bmp.file)
      const spec=animation.plan(victim)[0]
      let rejected=false
      try{animation.normalize({image:null,width:1,height:1,pixels:new Uint8ClampedArray([0,0,0,255])},{image:null,width:1,height:1,pixels:new Uint8ClampedArray(4)},Object.assign({},spec,{width:80,height:80,columns:1,rows:1,count:1,usedPictures:[0],replacement:{file:'missing',columns:1,rows:1}}))}catch(e){rejected=true}
      if(!rejected||JSON.stringify(victim.data.bmp.file)!==saved)throw new Error('Missing-cell safety failed')
      report.missingCellRejected=rejected
      report.frameDataUnchanged=true
      report.referencedPictures=report.sheets.filter(s=>s.artwork).reduce((n,s)=>n+s.cells.filter(c=>!c.unused).length,0)
      return report
    },{catalog,objects,script})
    const transparent=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=1;return c.toDataURL('image/png').split(',')[1]})
    await page.route('**/animation/invalid-fixture.png',route=>route.fulfill({contentType:'image/png',body:Buffer.from(transparent,'base64')}))
    report.atomicReject=await page.evaluate(async({catalog,objects,script})=>{
      const broken=JSON.parse(JSON.stringify(catalog))
      const key=Object.keys(broken.replacements).find(key=>key.startsWith('11:'))
      broken.replacements[key].file='animation/invalid-fixture.png'
      let runtime;window.define=(deps,factory)=>{runtime=factory(broken)};eval(script)
      const pack={data:{object:objects},reality:{diagnostics:{characterMapping:[]}}}
      const before=JSON.stringify(objects.map(o=>o.data.bmp.file))
      let rejected=false
      try{await runtime.prepare(pack)}catch(e){rejected=/缺少动作/.test(e.message)}
      return rejected&&before===JSON.stringify(objects.map(o=>o.data.bmp.file))
    },{catalog,objects,script})
    assert.equal(report.atomicReject,true,'a missing picture must reject without replacing any object atlas')
    report.catalogHash=catalogHash
    report.verificationHash=verificationHash
    report.errors=errors
    report.passed=false
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n')
    assert.equal(report.generatedSheets,Object.keys(catalog.replacements).length)
    assert.equal(report.boundErrors.length,0,JSON.stringify(report.boundErrors.slice(0,8)))
    assert.equal(report.alphaErrors.length,0,JSON.stringify(report.alphaErrors.slice(0,8)))
    assert.deepEqual(errors,[])
    for(const id of [...new Set(report.sheets.filter(s=>s.artwork).map(s=>s.object))])await page.locator('section[data-object="'+id+'"]').first().screenshot({path:path.join(out,'atlas-'+id+'.png')})
    report.passed=true
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n')
    console.log(JSON.stringify({generatedSheets:report.generatedSheets,originalSheets:report.originalSheets,calibratedCells:report.calibratedCells,emptyCells:report.emptyCells,patchCells:report.patchCells,boundErrors:report.boundErrors.length,errors},null,2))
  }catch(e){console.error(e);process.exitCode=1;await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{})}finally{await browser.close()}
})()
