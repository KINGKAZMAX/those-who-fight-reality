/* Append-only source inventory for Figma authoring; never mutates game assets. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/figma-archive/2026-10-18')
fs.mkdirSync(out,{recursive:true})
const read=p=>fs.readFileSync(path.join(root,p),'utf8')
const hash=b=>crypto.createHash('sha256').update(b).digest('hex')
function walk(dir){return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).filter(e=>e.name!=='.git').flatMap(e=>e.isDirectory()?walk(dir+'/'+e.name):[dir+'/'+e.name])}
function amd(p){let value;vm.runInNewContext(read(p),{define:x=>value=typeof x==='function'?x():x});return value}
const catalog=amd('vendor/F.LF/game/native-animation-data.js'),data=amd('vendor/LF2_19/data/data.js')
const generated=walk('vendor/F.LF/game/art').filter(p=>/\.png$/i.test(p))
const other=walk('assets').filter(p=>/\.png$/i.test(p)&&!p.startsWith('assets/reference/'))
const originals=walk('vendor/LF2_19').filter(p=>/\.png$/i.test(p))
const names={11:'小一 / Davis',2:'林夏 / John',8:'周齐 / Freeze',4:'陈野 / Henry',9:'唐梨 / Dennis',10:'沈舟 / Woody',30:'纸卷怪 / Bandit',31:'訂正獵手 / Henry副本',32:'催促鐘怪 / Louis副本'}
const sources=new Map()
for(const p of walk('assets/runtime').filter(p=>p.endsWith('.json'))){try{const d=JSON.parse(read(p));const rows=Array.isArray(d)?d:d.assets||d.patches||[];for(const r of rows){const key=r.replacement||r.file||r.runtimePath;if(key)sources.set(key,{record:r,manifest:p})}}catch{}}
let num=0
const images=[...generated,...other,...originals].sort().map(p=>{
 const bytes=fs.readFileSync(path.join(root,p)),w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20)
 let category,status,relations=[]
 if(p.startsWith('vendor/LF2_19/')){category=p.includes('/sprite/')?'05 原版 / 角色武器特效':p.includes('/bg/')?'06 原版 / 背景图层':'07 原版 / UI';status='原版参考；保持原文件'}
 else if(p.includes('/art/animation/')){category=p.includes('/patches/')?'02 当前 / 单帧补图':'01 当前 / 完整逐帧图集';status='当前注册图集或补图；以运行目录为准'}
 else if(p.includes('/art/stage-')){category='03 当前 / 场景';status='当前场景美术'}
 else if(p.includes('/art/')){category='04 历史 / 16姿态与身份参考';status='保留旧资产；16姿态不再作为当前战斗动作来源'}
 else if(p.includes('/concept-art/')){category='08 参考 / 概念图';status='设计参考；不是实机或已实现首领'}
 else{category='09 参考 / 原版动作模板';status='从原图渲染的姿势参考；不是新生成角色'}
 const rel=p.replace('vendor/F.LF/game/art/','')
 for(const [key,r]of Object.entries(catalog.replacements)){if(r.file===rel){const id=+key.split(':')[0];relations.push({key,name:names[id]||'原对象'+id,native:r.file?key.slice(key.indexOf(':')+1):null,...r})}}
 for(const r of catalog.patches){if(r.file===rel)relations.push({patch:true,name:names[r.objectId]||'原对象'+r.objectId,...r})}
 if(category==='01 当前 / 完整逐帧图集'&&!relations.length)status='保留候选／旧生成；当前目录未引用'
 const provenance=sources.get(rel)||sources.get(path.basename(p))||sources.get(p)
 return {id:'IMG-'+String(++num).padStart(4,'0'),path:p,name:path.basename(p),category,status,width:w,height:h,bytes:bytes.length,sha256:hash(bytes),relations,provenance:provenance||null}
})
const characters=data.object.filter(o=>o.type==='character').map(o=>{const d=amd('vendor/LF2_19/'+o.file);const moves=new Map();for(const [n,f]of Object.entries(d.frame||{})){for(const [k,v]of Object.entries(f)){if(/^hit_(Fa|Fj|Ua|Uj|Da|Dj|ja)$/.test(k)&&typeof v==='number'&&v>0){const target=d.frame[v];const key=k+':'+v;if(!moves.has(key))moves.set(key,{combo:k,entryFrame:v,entryName:target?.name,mp:target?.mp??0,fromFrames:[]});moves.get(key).fromFrames.push(+n)}}}return {...o,campus:names[o.id]||null,status:names[o.id]?'校园已映射':'原包存在；校园选角未开放',moves:[...moves.values()]}})
const skillguide=amd('vendor/F.LF/game/reality-skills.js').catalog
const codePaths=[...walk('vendor/F.LF/game').filter(p=>/\.(js|css|html)$/.test(p)&&!p.includes('/art/')), ...walk('vendor/LF2_19/data').filter(p=>p.endsWith('.js')), ...['character','match','combo','global','mechanics','specialattack','weapon','background','manager'].map(n=>'vendor/F.LF/LF/'+n+'.js').filter(p=>fs.existsSync(path.join(root,p))), ...walk('assets/runtime').filter(p=>p.endsWith('.json')), ...['docs/完整技能与连招.md','docs/verification/原版逐幀動畫驗收.md','docs/verification/LF2一致性校正.md','docs/美术资产说明.md','docs/資產擴充-角色場景怪物.md','assets/concept-art/生成提示词.md']]
const codes=[...new Set(codePaths)].map(p=>({path:p,sha256:hash(Buffer.from(read(p))),bytes:Buffer.byteLength(read(p)),text:read(p)}))
const result={version:'2026-10-18-v1',fileKey:'f3y5wnMvX7f7M2Xm0pqOAr',policy:'append-only; retain prior files and Figma pages; no runtime edits',images,characters,skillguide,codes,generatedAt:new Date().toISOString()}
fs.writeFileSync(path.join(out,'inventory.json'),JSON.stringify(result,null,2))
fs.writeFileSync(path.join(out,'asset-index.csv'),'ID,类别,文件,状态,宽,高,SHA256\n'+images.map(r=>[r.id,r.category,r.path,r.status,r.width,r.height,r.sha256].map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n'))
console.log(JSON.stringify({images:images.length,categories:Object.fromEntries([...new Set(images.map(r=>r.category))].map(k=>[k,images.filter(r=>r.category===k).length])),characters:characters.length,codeFiles:codes.length}))
