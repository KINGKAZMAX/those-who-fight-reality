/* Record actual keyboard-driven gameplay of the completed atlas integration. */
const fs=require('node:fs/promises'),path=require('node:path')
const {chromium}=require(path.join(require('node:os').homedir(),'.codex/skills/develop-web-game/node_modules/playwright'))
;(async()=>{
 const out=path.resolve(__dirname,'../docs/verification/native-animation');await fs.mkdir(out,{recursive:true})
 const browser=await chromium.launch({headless:true})
 const context=await browser.newContext({viewport:{width:1280,height:900},recordVideo:{dir:path.join(out,'raw-video'),size:{width:1280,height:900}}})
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
 const start=Date.now();let intro=0
 try{
  await page.goto('http://127.0.0.1:18765/F.LF/game/game.html')
  await page.waitForFunction(()=>window.realityGame?.animation&&!document.querySelector('#reality-loading'),null,{timeout:60000})
  const heroes=await page.evaluate(()=>window.realityGame.heroes.map(h=>({id:h.id,name:h.name})))
  await page.locator('.urban-start').click()
  await page.locator('.urban-slot').nth(0).click();await page.getByRole('button',{name:'选择 '+heroes.find(h=>h.id===9).name,exact:true}).click()
  await page.locator('.urban-slot').nth(1).click();await page.getByRole('button',{name:'选择 '+heroes.find(h=>h.id===10).name,exact:true}).click()
  await page.locator('.urban-bots').selectOption('6');await page.locator('.urban-stage').selectOption('3')
  await page.locator('.urban-launch').click();await page.waitForFunction(()=>window.realityGame.manager.activeMatch?.time?.t>3)
  intro=(Date.now()-start)/1000
  await page.keyboard.press('d');await page.waitForTimeout(50);await page.keyboard.down('d');await page.waitForTimeout(350);await page.keyboard.press('f');await page.keyboard.up('d')
  await page.keyboard.down('ArrowLeft');await page.waitForTimeout(350);await page.keyboard.up('ArrowLeft');await page.keyboard.press('j')
  await page.waitForTimeout(650);await page.keyboard.press('g');await page.keyboard.press('k');await page.waitForTimeout(650)
  for(const key of ['h','d','f']){await page.keyboard.press(key);await page.waitForTimeout(70)}
  await page.waitForTimeout(750)
  for(const key of ['l','ArrowUp','k']){await page.keyboard.press(key);await page.waitForTimeout(70)}
  await page.waitForTimeout(1200)
  await page.screenshot({path:path.join(out,'gameplay-final.png')})
  const state=await page.evaluate(()=>JSON.parse(window.render_game_to_text()))
  await fs.writeFile(path.join(out,'demo-state.json'),JSON.stringify({intro,errors,state},null,2)+'\n')
  await page.waitForTimeout(1500)
 }finally{const video=page.video();await context.close();await video.saveAs(path.join(out,'gameplay-full.webm'));await video.delete();await browser.close();console.log(JSON.stringify({intro,errors}))}
})()
