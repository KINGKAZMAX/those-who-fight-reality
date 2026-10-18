const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '..')
function load(override) {
  let result
  vm.runInNewContext(fs.readFileSync(path.join(root,'vendor/F.LF/game/native-animation.js'),'utf8'), { define(deps, factory) { result = factory(override || { objects: [{ id:11, sheets:[{source:'sprite/davis_0.png',width:800,height:560,columns:10,rows:7,start:0,count:70},{source:'sprite/davis_1.png',width:800,height:560,columns:10,rows:7,start:70,count:70}] }], replacements: { '11:sprite/davis_0.png': {file:'animation/xiaoyi-0.png',rows:7,columns:10,reviewed:true}, '11:sprite/davis_1.png': {file:'animation/xiaoyi-1.png',rows:7,columns:10,reviewed:true} } }) }, Map, Set, Uint8ClampedArray, Math, Number, Object, Array, Promise, Error })
  return result
}
test('every native sheet has its own replacement and original grid; no pose classification', () => {
  const module = load()
  const plan = module.plan({id:11,data:{bmp:{file:[{},{}]}}})
  assert.equal(plan.length,2)
  assert.equal(plan[0].replacement.file,'animation/xiaoyi-0.png')
  assert.equal(plan[1].replacement.file,'animation/xiaoyi-1.png')
  assert.equal(plan[1].start,70)
  assert.equal(plan[0].width,800)
  assert.equal(plan[0].height,560)
})
test('variants select their native motion template and their own artwork identity', () => {
  const module = load()
  const plan = module.plan({id:31,realityNativeId:11,data:{bmp:{file:[{},{}]}}})
  assert.equal(plan[0].source,'sprite/davis_0.png')
  assert.equal(plan[0].replacement,null,'a clone never borrows another character identity')
})
test('alpha bounds preserve native empty pictures and low lying shapes', () => {
  const module = load()
  const pixels=new Uint8ClampedArray(8*8*4)
  assert.equal(module.bounds(pixels,8,8,{x:0,y:0,w:8,h:8}),null)
  for(let y=6;y<8;y++)for(let x=1;x<7;x++)pixels[(y*8+x)*4+3]=255
  assert.deepEqual(JSON.parse(JSON.stringify(module.bounds(pixels,8,8,{x:0,y:0,w:8,h:8}))),{x:1,y:6,w:6,h:2})
})
test('unregistered source data fails explicitly instead of silently reusing16poses', () => {
  assert.throws(()=>load().plan({id:777,data:{bmp:{file:[{}]}}}), /原生动画/)
})

test('shrinking a frame keeps narrow extremities that nearest-neighbour sampling drops', () => {
  const module=load()
  const source={width:8,height:8,pixels:new Uint8ClampedArray(8*8*4)}
  for(const [x,y,r,g,b] of [[0,3,255,0,0],[7,4,0,255,0],[3,0,0,0,255],[4,7,255,255,0]]){
    const i=(y*8+x)*4;source.pixels.set([r,g,b,255],i)
  }
  const result=module.fitPixels(source,{x:0,y:0,w:8,h:8},2,2)
  const actual=module.bounds(result,2,2,{x:0,y:0,w:2,h:2})
  assert.deepEqual(JSON.parse(JSON.stringify(actual)),{x:0,y:0,w:2,h:2})
  assert.equal(result[3],255)
  assert.equal(result[15],255)
})

test('all nine campus characters have complete full-sheet registrations',()=>{
  let catalog
  vm.runInNewContext(fs.readFileSync(path.join(root,'vendor/F.LF/game/native-animation-data.js'),'utf8'),{define(value){catalog=value}})
  for(const id of [11,2,8,4,9,10,30,31,32]){
    const native={31:4,32:6}[id]||id
    const object=catalog.objects.find(o=>o.id===native)
    for(const sheet of object.sheets){
      const entry=catalog.replacements[id+':'+sheet.source]
      assert(entry&&(entry.registered||entry.reviewed),'missing full sheet '+id+':'+sheet.source)
      assert(fs.statSync(path.join(root,'vendor/F.LF/game/art',entry.file)).size>1000)
      assert(Number.isInteger(entry.rows)&&entry.rows>0)
    }
  }
  assert.equal(Object.keys(catalog.replacements).filter(k=>Number(k.split(':')[0])<100).length,27)
  const entry=fs.readFileSync(path.join(root,'vendor/F.LF/game/game.js'),'utf8')
  assert.match(entry,/nativeAnimation: true/)
  assert.match(entry,/then\(NativeAnimation\.prepare\)/)
})

test('shared native filenames with different grids select separate replacement sheets',()=>{
  const module=load({objects:[{id:300,sheets:[{source:'sprite/effect0.png',start:0,count:10},{source:'sprite/effect0.png',start:10,count:30}]}],replacements:{
    '300:sprite/effect0.png:0':{file:'first.png',reviewed:true},
    '300:sprite/effect0.png:10':{file:'second.png',reviewed:true}
  }})
  const plan=module.plan({id:300,data:{bmp:{file:[{},{}]}}})
  assert.equal(plan[0].replacement.file,'first.png')
  assert.equal(plan[1].replacement.file,'second.png')
})

test('effect reskin preserves native alpha and cannot brighten faint disappearance pixels',()=>{
  const module=load()
  const native={width:2,height:1,pixels:new Uint8ClampedArray([20,30,40,80,100,200,255,0])}
  const recolored=new Uint8ClampedArray([255,100,20,255,0,0,0,0])
  const result=module.maskEffectPixels(recolored,native,{x:0,y:0,w:2,h:1})
  assert.equal(result[3],80)
  assert.equal(result[7],0)
  assert(Math.max(result[0],result[1],result[2])<=48)
  assert.equal(result[4]>0,true,'fill a color gap before applying native alpha')
})
