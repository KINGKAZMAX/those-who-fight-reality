const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const digest=require('../tools/native_animation_digest.cjs')
test('editing bitmap bytes or the runtime invalidates the same catalog verification',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lf2-animation-digest-'))
 try{
  for(const file of ['vendor/F.LF/game/native-animation.js','vendor/F.LF/game/reality-art.js','vendor/F.LF/game/game.js','vendor/F.LF/game/art/a.png']){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),'original')}
  fs.mkdirSync(path.join(root,'vendor/LF2_19/data'),{recursive:true});fs.writeFileSync(path.join(root,'vendor/LF2_19/data/data.js'),'define({object:[]})')
  const text='define({objects:[],replacements:{a:{file:"a.png"}},patches:[]})'
  const original=digest(root,text)
  fs.writeFileSync(path.join(root,'vendor/F.LF/game/art/a.png'),'different bitmap bytes')
  const edited=digest(root,text);assert.notEqual(edited,original)
  fs.writeFileSync(path.join(root,'vendor/F.LF/game/native-animation.js'),'different renderer')
  assert.notEqual(digest(root,text),edited)
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})
