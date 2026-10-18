// Figma UI v0.2 synchronization. Scope: existing board 05 + new board 07 only.
// Source: vendor/F.LF/game/urban-ui.css/js and urban-hud.css/js.
// Requires figma-use, figma-generate-design and figma-generate-library skills.
const page=await figma.getNodeByIdAsync('0:1');
await figma.setCurrentPageAsync(page);
const board5=await figma.getNodeByIdAsync('2:183');
const board7=await figma.getNodeByIdAsync('8:78');
if (!board5||!board7||board7.children.length) throw new Error('Inspect existing v0.2 content before retrying.');
const created=[],mutated=[],removed=[],components=[],styles=[],variables=[];
const cn={family:'Noto Sans SC',style:'Regular'},cnBold={family:'Noto Sans SC',style:'Black'},en={family:'Inter',style:'Regular'},enBold={family:'Inter',style:'Black'},italic={family:'Inter',style:'Black Italic'};
const oldFonts=board5.findAllWithCriteria({types:['TEXT']}).flatMap(n=>n.getStyledTextSegments(['fontName']).map(s=>s.fontName));
await Promise.all([...new Map([...oldFonts,cn,cnBold,en,enBold,italic].map(f=>[JSON.stringify(f),f])).values()].map(f=>figma.loadFontAsync(f)));
const color={acid:'#DFFF00',paper:'#F4F3E8',ink:'#141513',background:'#11120F',muted:'#92938C',panel:'#272921',secondary:'#2D2F27',line:'#494B42',hover:'#EFFF87',mp:'#D1D4C6'};
function rgb(h){return{r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255};}
// Adapted from bundled createVariableCollection.js and createSemanticTokens.js helpers.
const collection=figma.variables.createVariableCollection('Urban UI v0.2 / 来源 CSS');
collection.renameMode(collection.defaultModeId,'Dark');
const vars={};
for(const [key,value] of Object.entries(color)){
  const p=figma.variables.createVariable('primitive/'+key,collection,'COLOR');p.scopes=[];p.setValueForMode(collection.defaultModeId,rgb(value));variables.push(p.id);
  const v=figma.variables.createVariable('color/'+key,collection,'COLOR');v.scopes=['FRAME_FILL','SHAPE_FILL','TEXT_FILL','STROKE_COLOR'];v.setValueForMode(collection.defaultModeId,{type:'VARIABLE_ALIAS',id:p.id});
  v.setVariableCodeSyntax('WEB',['acid','paper','ink','muted'].includes(key)?'var(--'+key+')':value);vars[key]=v;variables.push(v.id);
}
const spaces={};for(const v of [8,12,16,20,24,32,64]){const n=figma.variables.createVariable('space/'+v,collection,'FLOAT');n.scopes=['GAP'];n.setValueForMode(collection.defaultModeId,v);spaces[v]=n;variables.push(n.id);}
function paint(key){return figma.variables.setBoundVariableForPaint({type:'SOLID',color:rgb(color[key])},'color',vars[key]);}
const ts={};
for(const[key,font,size,line]of[['label',enBold,16,125],['body',cn,22,145],['small',cn,18,145],['heading',cnBold,42,125],['title',cnBold,54,120],['italic',italic,58,110],['hud',enBold,24,120],['button',cnBold,17,100],['secondary',cnBold,12,100]]){
  const s=figma.createTextStyle();s.name='Urban v0.2/'+key;s.fontName=font;s.fontSize=size;s.lineHeight={unit:'PERCENT',value:line};ts[key]=s;styles.push(s.id);
}
function track(n){created.push(n.id);return n;}
function frame(parent,name,width,dir='VERTICAL',fill=null,pad=0,gap=24,height=null){
  const n=track(figma.createAutoLayout(dir));n.name=name;parent.appendChild(n);n.resize(width,height||10);n.layoutSizingHorizontal='FIXED';n.layoutSizingVertical=height?'FIXED':'HUG';n.fills=fill?[paint(fill)]:[];n.clipsContent=false;
  if(pad)for(const p of ['paddingLeft','paddingRight','paddingTop','paddingBottom'])n.setBoundVariable(p,spaces[pad]);
  n.setBoundVariable('itemSpacing',spaces[gap]);return n;
}
function txt(parent,name,content,width,style='body',fill='paper',skew=false){
  const n=track(figma.createText());n.fontName=ts[style].fontName;n.textStyleId=ts[style].id;n.characters=content;n.name=name;n.fills=[paint(fill)];parent.appendChild(n);n.textAutoResize='HEIGHT';n.resize(width,Math.max(n.height,20));n.layoutSizingHorizontal='FIXED';n.layoutSizingVertical='HUG';
  if(skew)n.relativeTransform=[[1,-0.13917310096,0],[0,0.99026806874,0]];
  return n;
}
function rect(parent,name,width,height,key){const n=track(figma.createRectangle());n.name=name;parent.appendChild(n);n.resize(width,height);n.fills=[paint(key)];return n;}
function cp(comp,node,label){const key=comp.addComponentProperty(label,'TEXT',node.characters);node.componentPropertyReferences={characters:key};return key;}
function boardHeader(parent,kicker,title,sub){txt(parent,'章节',kicker,1312,'label','acid');txt(parent,'标题',title,1312,'heading');txt(parent,'说明',sub,1312,'small','muted');}

const masters=frame(page,'组件 / Urban UI v0.2',1440,'VERTICAL','background',64,32);masters.x=3320;masters.y=1440;
txt(masters,'组件标题','URBAN UI / NATIVE COMPONENTS',1312,'italic','paper');
txt(masters,'组件说明','按当前 CSS 创建的主按钮、次按钮与 HUD 信息卡。未包含人物图像。',1312,'small','muted');
function button(name,width,height,key,style,label,cut){
  const c=track(figma.createComponent());c.name=name;c.layoutMode='HORIZONTAL';masters.appendChild(c);c.resize(width,height);c.layoutSizingHorizontal='FIXED';c.layoutSizingVertical='FIXED';c.primaryAxisAlignItems='CENTER';c.counterAxisAlignItems='CENTER';c.fills=[];c.clipsContent=false;
  c.description='对应 urban-ui.css 的原生可编辑按钮；几何来自源 CSS clip-path。';
  const v=track(figma.createVector());c.appendChild(v);v.name='CSS clip-path / 背景';v.layoutPositioning='ABSOLUTE';v.vectorPaths=[{windingRule:'NONZERO',data:cut?`M 0 0 L ${width} 0 L ${width} ${height*.72} L ${width*.94} ${height} L 0 ${height} Z`:`M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z`}];v.fills=[paint(key)];v.strokes=[];v.x=0;v.y=0;
  const labelNode=txt(c,'按钮标签',label,width-28,style,key==='acid'||key==='hover'?'ink':'paper');labelNode.textAlignHorizontal='CENTER';
  const prop=cp(c,labelNode,'文字');components.push(c.id);return{node:c,prop};
}
const primary=button('Urban / Primary / Default',180,45,'acid','button','开始值班  ↗',true);
const hover=button('Urban / Primary / Hover',180,45,'hover','button','开始值班  ↗',true);
const secondary=button('Urban / Secondary',90,45,'secondary','secondary','操作设置',false);
function instance(parent,source,label,scale=1){const n=track(source.node.createInstance());parent.appendChild(n);if(label)n.setProperties({[source.prop]:label});if(scale!==1)n.rescale(scale);return n;}

const player=track(figma.createComponent());player.name='Urban / HUD / Player info';masters.appendChild(player);player.layoutMode='VERTICAL';player.resize(612,160);player.layoutSizingHorizontal='FIXED';player.layoutSizingVertical='HUG';player.fills=[paint('panel')];player.strokes=[paint('line')];player.strokeWeight=1;for(const p of ['paddingLeft','paddingRight','paddingTop','paddingBottom'])player.setBoundVariable(p,spaces[20]);player.setBoundVariable('itemSpacing',spaces[12]);player.description='urban-hud 角色数据结构；静态演示值，不含原版头像。';components.push(player.id);
const playerRow=frame(player,'姓名与生命值',572,'HORIZONTAL',null,0,16);
const name=txt(playerRow,'角色','P1  DAVIS',300,'hud');const health=txt(playerRow,'HP数值','500 / 500',256,'hud');health.textAlignHorizontal='RIGHT';
rect(player,'HP/荧光黄',572,10,'acid');
const mpRow=frame(player,'MP状态',572,'HORIZONTAL',null,0,12);txt(mpRow,'MP标签','MP',40,'label','muted');rect(mpRow,'MP/灰白',442,5,'mp');const mpValue=txt(mpRow,'MP数值','200',66,'label','muted');
const playerProps={name:cp(player,name,'角色'),hp:cp(player,health,'HP'),mp:cp(player,mpValue,'MP')};
function playerInstance(parent,label,hp,mp){const n=track(player.createInstance());parent.appendChild(n);n.setProperties({[playerProps.name]:label,[playerProps.hp]:hp,[playerProps.mp]:mp});return n;}

// Remove only the exact old UI-only subtree IDs that were inspected above.
for(const id of ['2:184','2:188','2:198','2:219','2:226']){const n=await figma.getNodeByIdAsync(id);if(n&&n.parent.id===board5.id){removed.push(n.id,...('findAll'in n?n.findAll(()=>true).map(c=>c.id):[]));n.remove();}}
board5.name='05 UI v0.2｜黑白荧光黄与斜切卡片';board5.fills=[paint('background')];board5.itemSpacing=24;mutated.push(board5.id);
boardHeader(board5,'05 / UI V0.2 / CODE-SYNCED','黑白底色，荧光黄发声。','已按绝区零式都市街机视觉更新：高对比、粗斜体、斜切角、紧凑的信息层级。');
const identity=frame(board5,'视觉语言',1312,'HORIZONTAL',null,0,32);
const type=frame(identity,'文字样本',640,'VERTICAL','ink',32,16);
txt(type,'英文粗斜体','AFTER HOURS',576,'italic');
txt(type,'中文标题','今晚，\n打个痛快。',576,'title','paper',true);
txt(type,'文案','集结你的搭档，进入街头乱斗。',576,'small','muted');
const palette=frame(identity,'源代码色板',640,'VERTICAL','ink',32,16);
for(const [label,key,code]of[['荧光黄 / 主要操作','acid','#DFFF00'],['暖白 / 主要文字','paper','#F4F3E8'],['墨黑 / 界面底色','ink','#141513']]){const s=frame(palette,label,576,'HORIZONTAL',null,0,16);rect(s,'色样',56,56,key);txt(s,'名称与色值',label+'\n'+code,504,'small');}
txt(palette,'辅助色说明','面板 #272921   /   次级文字 #92938C',576,'small','muted');
txt(board5,'按钮层级标题','ACTIONS / 主要与次要操作',1312,'label','acid');
const actions=frame(board5,'可编辑按钮示例',1312,'HORIZONTAL',null,0,16);
instance(actions,primary,'开始值班  ↗',2);instance(actions,secondary,'操作设置',2);instance(actions,primary,'出发 / FIGHT  ↗',2);instance(actions,hover,'悬停状态  ↗',2);
const rules=frame(board5,'形状与排版规则',1312,'HORIZONTAL',null,0,32);
const geometry=frame(rules,'形状',640,'VERTICAL','panel',24,16);txt(geometry,'形状标题','斜切角 + 状态高亮',592,'heading');txt(geometry,'形状说明','主按钮右下切角；选角卡斜切收边。\n选中用荧光黄边框；次要操作留在暗面板。',592,'small');
const typography=frame(rules,'排版',640,'VERTICAL','panel',24,16);txt(typography,'排版标题','粗斜体 + 紧凑数据',592,'heading');txt(typography,'排版说明','标题用粗体与倾斜；字号主次分明。\nHUD 维持姓名、HP、MP、计时与暂停可读。',592,'small');
txt(board5,'实施边界','已替换主菜单、选角、HUD、设置与结算；人物、场景仍沿用 LF2 原版素材。',1312,'small','acid');

board7.fills=[paint('background')];board7.resize(1440,1280);mutated.push(board7.id);
boardHeader(board7,'07 / IMPLEMENTATION / V0.2','先换界面，继续使用 LF2 战斗。','以下为原生可编辑的信息结构与实施说明；静态数值示意不代表正在运行的对局。');
const statusRow=frame(board7,'已实施界面',1312,'HORIZONTAL',null,0,16);
for(const [i,label]of ['主菜单','选角','HUD','设置','结算'].entries()){const c=frame(statusRow,label,249.6,'VERTICAL','panel',20,8);txt(c,'编号','0'+(i+1)+' / IMPLEMENTED',209.6,'label','acid');txt(c,'界面',label,209.6,'heading');}
const hud=frame(board7,'HUD 信息结构 / 非截图',1312,'VERTICAL','ink',32,20);
const top=frame(hud,'HUD顶栏',1248,'HORIZONTAL',null,0,24);txt(top,'标志','LF2 / VS',320,'hud','acid');txt(top,'状态','● 对战进行中',412,'body');txt(top,'时钟与操作','00:42    Ⅱ 暂停    返回选角',468,'small');
const players=frame(hud,'双人数据结构',1248,'HORIZONTAL',null,0,24);playerInstance(players,'P1  DAVIS','500 / 500','200');playerInstance(players,'CPU  DENNIS','500 / 500','200');
txt(hud,'HUD数值边界','生命 / 法力 / 对战计时由原游戏数据更新；本板仅展示结构，不复制运行中的角色头像。',1248,'small','muted');
const implementation=frame(board7,'实施与验证两栏',1312,'HORIZONTAL',null,0,32);
const done=frame(implementation,'当前实施',640,'VERTICAL','panel',24,16);txt(done,'实施标题','已接入的交互',592,'heading');txt(done,'实施详情','主菜单 → 选角 → 战斗 → 结算\n设置支持改键并保存\nHUD 支持暂停、继续与返回选角\n结算读取击倒、伤害、承伤等原版数据',592,'small');
const validation=frame(implementation,'实测范围',640,'VERTICAL','panel',24,16);txt(validation,'验证标题','本轮检查范围',592,'heading');txt(validation,'验证详情','8 人同屏短测 8 秒：逐秒均为 30 FPS\n8 人自然结算 / 返回、改键保存已验证\n700 × 600 视窗、下拉键盘操作已检查\n短测不等于长时间性能保证',592,'small');
txt(board7,'待制作边界','仍待制作：原创人物动作、场景美术，以及“失物招领局”的三分钟关卡。',1312,'small','acid');
txt(board7,'字体映射','字体映射：运行端主 UI 为 Arial / 系统中文，HUD 为 Inter；Figma 中文以 Noto Sans SC 替代。',1312,'small','muted');
const link=txt(board7,'本机试玩','http://127.0.0.1:18765/F.LF/game/game.html',1312,'small','acid');link.hyperlink={type:'URL',value:link.characters};
txt(board7,'来源','本机服务运行时可打开。来源：urban-ui.css/js、urban-hud.css/js；无收费生成。',1312,'small','muted');

function audit(b){const nodes=b.findAll(()=>true),counts={};for(const n of nodes)counts[n.type]=(counts[n.type]||0)+1;return{id:b.id,name:b.name,width:b.width,height:b.height,descendantCount:nodes.length,counts,imageNodes:nodes.filter(n=>'fills'in n&&Array.isArray(n.fills)&&n.fills.some(p=>p.type==='IMAGE')).map(n=>({id:n.id,name:n.name,width:n.width,height:n.height})),overflow:b.children.filter(n=>n.x<0||n.y<0||n.x+n.width>b.width+1||n.y+n.height>b.height+1).map(n=>({id:n.id,name:n.name,y:n.y,height:n.height})),fonts:[...new Set(nodes.filter(n=>n.type==='TEXT').flatMap(n=>n.getStyledTextSegments(['fontName']).map(s=>s.fontName.family)))]};}
figma.viewport.scrollAndZoomIntoView([board5,board7]);
return{createdNodeIds:[...new Set([...created,...board5.findAll(()=>true).map(n=>n.id),...board7.findAll(()=>true).map(n=>n.id),...masters.findAll(()=>true).map(n=>n.id)])],mutatedNodeIds:mutated,removedNodeIds:removed,componentIds:components,styleIds:styles,variableCollectionId:collection.id,variableIds:variables,mastersId:masters.id,boards:[audit(board5),audit(board7)],preservedBoardIds:['2:57','2:74','2:100','2:133','2:227']};
