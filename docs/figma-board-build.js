// Prepend: const CONTENT = <contents of figma-board-content.json>;
// Replace __WRAPPER_NODE_ID__ with the exact ID returned by wrapper creation.
// This creates a six-board editable composition. It never deletes existing nodes.
// Run only after required Figma discovery; abort and inspect on any partial failure.
const wrapper = await figma.getNodeByIdAsync("__WRAPPER_NODE_ID__");
if (!wrapper || wrapper.type !== "FRAME") throw new Error("Expected returned wrapper frame.");
if (wrapper.children.length) throw new Error("Wrapper is not empty; inspect before retrying.");
const page = wrapper.parent;
if (!page || page.type !== "PAGE") throw new Error("Wrapper must belong to the intended page.");
await figma.setCurrentPageAsync(page);
const createdNodeIds = [];
const componentIds = [];
const variableIds = [];
const styleIds = [];
const boards = [];
const allFonts = await figma.listAvailableFontsAsync();
const preferred = ["Noto Sans SC", "Source Han Sans SC", "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", "Arial Unicode MS"];
const family = preferred.find(f => allFonts.some(x => x.fontName.family === f));
if (!family) throw new Error("No verified Chinese font available; inspect available fonts before building.");
const familyFonts = allFonts.filter(x => x.fontName.family === family).map(x => x.fontName);
const regular = familyFonts.find(x => /^(Regular|Normal|Book)$/i.test(x.style)) || familyFonts[0];
const bold = familyFonts.find(x => /^(Bold|Heavy)$/i.test(x.style)) || familyFonts.find(x => /Medium/.test(x.style)) || regular;
await Promise.all([figma.loadFontAsync(regular), figma.loadFontAsync(bold)]);

// Adapted from the supplied createVariableCollection.js helper.
async function createVariableCollection(name, modeNames) {
  const collection = figma.variables.createVariableCollection(name);
  const modeIds = {};
  const defaultMode = collection.modes[0];
  collection.renameMode(defaultMode.modeId, modeNames[0]);
  modeIds[modeNames[0]] = defaultMode.modeId;
  for (let i = 1; i < modeNames.length; i++) modeIds[modeNames[i]] = collection.addMode(modeNames[i]);
  return { collection, modeIds };
}
function rgb(hex) { return {r:parseInt(hex.slice(1,3),16)/255,g:parseInt(hex.slice(3,5),16)/255,b:parseInt(hex.slice(5,7),16)/255}; }
const {collection, modeIds} = await createVariableCollection("失物招领局 / 审阅板基础", ["票据"]);
const vars = {};
function token(name, type, value, scopes) {
  const v = figma.variables.createVariable(name, collection, type);
  v.scopes = scopes;
  v.setValueForMode(modeIds["票据"], value);
  v.setVariableCodeSyntax("WEB", "var(--lf-review-" + name.replaceAll("/", "-") + ")");
  vars[name] = v; variableIds.push(v.id); return v;
}
for (const [key, value] of Object.entries(CONTENT.palette)) {
  const raw = token("primitive/"+key,"COLOR",rgb(value),[]);
  token("color/"+key,"COLOR",{type:"VARIABLE_ALIAS",id:raw.id},["FRAME_FILL","SHAPE_FILL","TEXT_FILL","STROKE_COLOR"]);
}
for (const value of [8,12,16,24,32,48,64,80]) token("space/"+value,"FLOAT",value,["GAP"]);
function paint(key) { return figma.variables.setBoundVariableForPaint({type:"SOLID",color:rgb(CONTENT.palette[key])},"color",vars["color/"+key]); }
function track(n) { createdNodeIds.push(n.id); return n; }
function spacing(n, p, g) {
  for (const prop of ["paddingLeft","paddingRight","paddingTop","paddingBottom"]) n.setBoundVariable(prop,vars["space/"+p]);
  n.setBoundVariable("itemSpacing",vars["space/"+g]);
}
const textStyles = {};
for (const [key,size,weight] of [["label",16,false],["body",22,false],["title",42,true],["headline",76,true],["subhead",30,true],["small",18,false]]) {
  const s = figma.createTextStyle(); s.name="失物招领局/"+key;
  s.fontName=weight?bold:regular; s.fontSize=size; s.lineHeight={unit:"PERCENT",value:145};
  textStyles[key]=s; styleIds.push(s.id);
}
function box(parent,name,width,direction="VERTICAL",fill=null,pad=0,gap=24,height=null) {
  const n=track(figma.createAutoLayout(direction)); n.name=name;
  parent.appendChild(n); n.resize(width,height||10);
  n.layoutSizingHorizontal="FIXED"; n.layoutSizingVertical=height?"FIXED":"HUG";
  n.fills=fill?[paint(fill)]:[]; n.clipsContent=false;
  if (pad) spacing(n,pad,gap); else n.setBoundVariable("itemSpacing",vars["space/"+gap]);
  return n;
}
function text(parent,name,characters,width,style="body",color="ink") {
  const n=track(figma.createText()); n.name=name; n.fontName=textStyles[style].fontName;
  n.textStyleId=textStyles[style].id; n.characters=characters;
  n.fills=[paint(color)]; parent.appendChild(n); n.textAutoResize="HEIGHT"; n.resize(width,Math.max(24,n.height));
  n.layoutSizingHorizontal="FIXED"; n.layoutSizingVertical="HUG"; return n;
}
function rect(parent,name,width,height,color) {
  const n=track(figma.createRectangle()); n.name=name; parent.appendChild(n); n.resize(width,height); n.fills=[paint(color)]; return n;
}
function rule(parent,width=1312) { return rect(parent,"分隔线",width,1,"line"); }
function prop(comp,node,name) { const key=comp.addComponentProperty(name,"TEXT",node.characters); node.componentPropertyReferences={characters:key}; return key; }
function component(name,width,direction="VERTICAL",fill=null,pad=24,gap=16) {
  const n=track(figma.createComponent()); n.name=name; n.description="失物招领局审阅板的可编辑复用元素；内容为概念提案。";
  n.layoutMode=direction; n.resize(width,10); n.layoutSizingHorizontal="FIXED"; n.layoutSizingVertical="HUG";
  n.fills=fill?[paint(fill)]:[]; spacing(n,pad,gap); componentIds.push(n.id); return n;
}
const masters=box(page,"组件 / 审阅板可复用元素",1440,"VERTICAL","paper",64,32);
masters.x=wrapper.x+wrapper.width+160; masters.y=wrapper.y;
text(masters,"组件区说明","可编辑复用元素 / 主组件",1312,"title");

const header=component("Review / Board heading",1312,"VERTICAL",null,8,8); masters.appendChild(header);
const hp={};
hp.label=prop(header,text(header,"章节编号","01 / 概览",1296,"label","red"),"章节");
hp.title=prop(header,text(header,"章节标题","标题",1296,"title"),"标题");
hp.desc=prop(header,text(header,"章节说明","说明",1296,"small","muted"),"说明");
function heading(parent,serial,title,desc) {
  const n=track(header.createInstance()); parent.appendChild(n); n.setProperties({[hp.label]:serial,[hp.title]:title,[hp.desc]:desc}); return n;
}

const rowComp=component("Review / Asset row",1312,"HORIZONTAL",null,16,16); masters.appendChild(rowComp);
rowComp.strokes=[paint("line")]; rowComp.strokeWeight=1;
const widths=[150,260,220,470,52], rowKeys=[];
for(let i=0;i<widths.length;i++) rowKeys.push(prop(rowComp,text(rowComp,"列"+i,["编号","资产","状态","下一步","级别"][i],widths[i],"small"),"列"+i));
function assetRow(parent,values) {
  const n=track(rowComp.createInstance()); parent.appendChild(n);
  n.setProperties(Object.fromEntries(values.map((v,i)=>[rowKeys[i],v]))); return n;
}

const ticket=component("UI / 角色行李票",640,"VERTICAL","pale",32,16); masters.appendChild(ticket);
const tp={};
tp.id=prop(ticket,text(ticket,"票号","CHAR-01   /   CREW PASS",576,"label","red"),"票号");
tp.name=prop(ticket,text(ticket,"姓名","拆箱员",576,"title"),"姓名");
tp.role=prop(ticket,text(ticket,"角色定位","近战 / 控场",576,"subhead"),"定位");
rule(ticket,576);
tp.line=prop(ticket,text(ticket,"宣言","把散落的东西，打包回家。",576,"body"),"宣言");
tp.detail=prop(ticket,text(ticket,"动作说明","武器 / 捆包带与旧行李箱",576,"small"),"说明");
tp.status=prop(ticket,text(ticket,"资产状态","角色立绘与动作：待接入",576,"label","muted"),"资产状态");
function characterTicket(parent,role,detail) {
  const n=track(ticket.createInstance()); parent.appendChild(n);
  n.setProperties({[tp.id]:role.id+"   /   CREW PASS",[tp.name]:role.name,[tp.role]:role.style,[tp.line]:role.tag,[tp.detail]:detail,[tp.status]:"提案 · 立绘与动作尚未接入"}); return n;
}

const stage=component("Review / 三分钟阶段",310,"VERTICAL","pale",24,16); masters.appendChild(stage);
const sp={};
sp.time=prop(stage,text(stage,"时间","00:00—00:20",262,"label","red"),"时间");
sp.title=prop(stage,text(stage,"阶段","接单",262,"title"),"阶段");
sp.body=prop(stage,text(stage,"内容","移动、攻击、拾取",262,"body"),"内容");
function stageCard(parent,item) { const n=track(stage.createInstance()); parent.appendChild(n); n.setProperties({[sp.time]:item.time,[sp.title]:item.title,[sp.body]:item.body}); return n; }

const row1=box(wrapper,"第一行 / 概览与角色",2960,"HORIZONTAL",null,0,80);
const row2=box(wrapper,"第二行 / 玩法与资产",2960,"HORIZONTAL",null,0,80);
const row3=box(wrapper,"第三行 / UI 与试玩",2960,"HORIZONTAL",null,0,80);
function board(parent,name) { const b=box(parent,name,1440,"VERTICAL","paper",64,24,1160); b.clipsContent=false; boards.push(b); return b; }

const b1=board(row1,"01 概览｜世界观与决策");
text(b1,"档案编号","LF2 REMIX   /   SHANGHAI HACKATHON   /   CASE 001",1312,"label","red");
text(b1,"主标题","失物招领局\n末班归还",1312,"headline");
text(b1,"核心宣言","三分钟，把失物送回家。",1312,"subhead");
rule(b1);
text(b1,"世界观",CONTENT.world,1312,"body");
const decisions=box(b1,"范围与技术",1312,"HORIZONTAL",null,0,32);
const d1=box(decisions,"本次范围",640,"VERTICAL","pale",24,16);
text(d1,"范围标签","范围锁定",592,"label","red");
text(d1,"范围","目标：2 名角色 / 1 场景 / 180 秒",592,"subhead");
text(d1,"范围说明","首个切片：1 名玩家、1 种敌人、1 个场景；第二角色随后接入。",592,"body");
const d2=box(decisions,"技术决策",640,"VERTICAL","ink",24,16);
text(d2,"决策标签","实现路线",592,"label","paper");
text(d2,"路线","F.LF 原版 VS 已试玩\nTripo 道具 → 2D 精灵",592,"subhead","paper");
text(d2,"路线说明","OpenLF2 作为备选。",592,"small","paper");
text(b1,"状态提醒","本板为世界观、玩法与 UI 提案，未声明新玩法或新美术已经实现。",1312,"small","red");
text(b1,"版本",CONTENT.version,1312,"label","muted");

const b2=board(row1,"02 角色｜近远程搭档");
heading(b2,"02 / CHARACTERS","两份临时工证，两种打法","角色名与技能均为提案；先保留可用战斗动作，再逐个替换美术。 ");
const chars=box(b2,"双角色行李票",1312,"HORIZONTAL",null,0,32);
for (const r of CONTENT.roles) characterTicket(chars,r,"武器 / "+r.weapon+"\n普通 / "+r.basic+"\n技能 / "+r.skill);
const coop=box(b2,"配合说明",1312,"VERTICAL","ink",32,16);
text(coop,"合作标题","配合目标：一个开路，一个认领。",1248,"subhead","paper");
text(coop,"合作内容","拆箱员制造安全区域，贴签员优先处理远处目标。\n首轮只保留一项招牌技能，让三分钟试玩能感知差异。",1248,"body","paper");
text(b2,"动作限制","资产检查：一张角色立绘不能直接代替跑、跳、攻击、受击、倒地等完整动作。",1312,"small","red");

const b3=board(row2,"03 玩法｜三分钟关卡提案");
heading(b3,"03 / ONE RUN","180 秒，一张归还回执","以下是关卡节奏提案，尚未实现；数值与敌人数在试玩后收敛。 ");
const stages=box(b3,"时间轴",1312,"HORIZONTAL",null,0,24);
CONTENT.timeline.forEach(s=>stageCard(stages,s));
const goals=box(b3,"成败与核心循环",1312,"HORIZONTAL",null,0,32);
const success=box(goals,"完成条件",640,"VERTICAL","ink",32,16);
text(success,"胜利标签","完成条件 / 提案",576,"label","paper");
text(success,"胜利内容","最后一件失物进入归还区。",576,"subhead","paper");
text(success,"失败内容","超时或全员倒地，显示未完成回执。",576,"small","paper");
const loop=box(goals,"核心循环",640,"VERTICAL","pale",32,16);
text(loop,"循环标签","核心循环",576,"label","red");
text(loop,"循环内容","打散 → 拾取 → 投掷 → 归还",576,"subhead");
text(loop,"循环说明","利用 LF2 式横版多人乱斗，减少新增系统。",576,"small");
text(b3,"最小演示","最小切片：1 名玩家、1 种敌人、1 个场景；完成开局—战斗—结算，再加第二角色。",1312,"body");
text(b3,"状态","玩法节奏与胜负条件仍需开发；不是当前 F.LF 原版的完成状态。",1312,"small","red");

const b4=board(row2,"04 资产｜台账与渐进替换");
heading(b4,"04 / ASSET REGISTER","先让每一件素材都有去处","当前目录未发现用户自有 AI 原图；以下明确区分已有底座、待接入素材和设计提案。 ");
assetRow(b4,["编号","资产 / 用途","当前状态","下一步","级别"]);
CONTENT.assets.forEach(r=>assetRow(b4,r));
text(b4,"替换顺序","替换顺序  ① 标题与 UI  →  ② 背景与道具  →  ③ 单角色完整动作",1312,"body");
text(b4,"素材验收","每项记录：原文件路径 / 来源与使用许可 / 尺寸 / 透明背景 / 动作帧 / 接入状态。",1312,"small","muted");
text(b4,"缺图声明","本板没有把供应商原版精灵或文字占位冒充为用户已有 AI 图片。",1312,"small","red");

const b5=board(row3,"05 UI｜票据与行李票方向");
heading(b5,"05 / UI DIRECTION","一套深夜中转站的票据语言","米白承载信息，墨黑保持秩序，朱红标记选择、危险与归还。示意数值不代表实机。 ");
const swatches=box(b5,"色板",1312,"HORIZONTAL",null,0,24);
for (const [name,key] of [["票据米白","paper"],["墨黑","ink"],["朱红","red"]]) {
  const sw=box(swatches,name,421,"HORIZONTAL","pale",16,16);
  rect(sw,name+"色样",56,56,key); text(sw,"色值",name+"  "+CONTENT.palette[key].toUpperCase(),317,"small");
}
const hud=box(b5,"HUD / 生命体力与归还进度示意",1312,"HORIZONTAL","ink",32,32);
const hpBox=box(hud,"左侧角色状态",570,"VERTICAL",null,0,12);
text(hpBox,"玩家名","P1  拆箱员",570,"subhead","paper");
text(hpBox,"生命数值","生命  100 / 100",570,"label","paper");
rect(hpBox,"生命条示意",550,12,"red");
text(hpBox,"体力数值","体力  70 / 100",570,"label","paper");
rect(hpBox,"体力条示意",385,8,"paper");
const progress=box(hud,"右侧关卡进度",646,"VERTICAL",null,0,12);
text(progress,"时间与归还","02:18      归还  3 / 5",646,"title","paper");
text(progress,"目标说明","当前委托 / 将最后一件失物送至归还区",646,"small","paper");
const marks=box(progress,"归还印章",646,"HORIZONTAL",null,0,12);
for(let i=0;i<5;i++){const mark=box(marks,"回执"+(i+1),100,"VERTICAL",i<3?"red":"muted",8,8);text(mark,"序号",i<3?"已归还":"待认领",84,"label","paper");}
const uiNotes=box(b5,"选角与交互方向",1312,"HORIZONTAL",null,0,32);
const choice=box(uiNotes,"行李票选角",640,"VERTICAL","pale",24,16);
text(choice,"选角标题","行李票卡选角",592,"subhead");
text(choice,"选角说明","姓名与打法优先；立绘接入后置于票面。\n选中状态使用朱红盖章与清楚的文字。",592,"body");
const result=box(uiNotes,"结算回执",640,"VERTICAL","pale",24,16);
text(result,"结算标题","盖章式结算",592,"subhead");
text(result,"结算说明","显示本局找回的失物与主人的短留言。\n让街机乱斗保留一点人情味。",592,"body");
text(b5,"UI边界","此处为原生 Figma 文字、形状与可复用组件，不是游戏界面截图。",1312,"small","red");

const b6=board(row3,"06 交付｜Tripo 路线与本机试玩");
heading(b6,"06 / DELIVERY","先打起来，再逐步换装","原版 2 名电脑角色短测 8 秒：30–31 FPS；开局→战斗→结算已跑通。原创换皮仍待开发。");
const tech=box(b6,"技术两栏",1312,"HORIZONTAL",null,0,32);
const tripo=box(tech,"Tripo 用途",640,"VERTICAL","ink",32,16);
text(tripo,"Tripo 标题","Tripo：优先做旧物与道具",576,"subhead","paper");
text(tripo,"Tripo 管线","旧箱 / 武器 / 摆件\n→ 生成与整理模型\n→ 固定镜头、光照预渲染\n→ 透明精灵图集\n→ 接入二维碰撞与动作",576,"body","paper");
text(tripo,"Tripo 注意","模型生成 ≠ 角色绑骨、动画与战斗适配。\n本板未调用付费生成。",576,"small","paper");
const perf=box(tech,"技术与性能",640,"VERTICAL","pale",32,16);
text(perf,"性能标题","F.LF 首选 / OpenLF2 备选",576,"subhead");
text(perf,"性能说明","30 fps 逻辑\n预加载资产与精灵图集\n限制同屏敌人与特效\n运行时不生成资产\n在目标 Mac 上检查卡顿与输入",576,"body");
text(perf,"性能边界","30 fps 指逻辑节拍，不承诺未测试的渲染性能。",576,"small","muted");
const linkBox=box(b6,"本机试玩入口",1312,"VERTICAL",null,0,12);
text(linkBox,"试玩标题","打开本机试玩",1312,"subhead");
const link=text(linkBox,"试玩链接",CONTENT.playUrl,1312,"body","red");
link.hyperlink={type:"URL",value:CONTENT.playUrl};
text(linkBox,"本机链接范围","仅当前电脑可达，且需要本地服务保持运行；不能作为他人的在线试玩地址。",1312,"small","muted");
text(b6,"验收清单","短测通过不等于换皮后六人连续三分钟通过；接入原创素材后仍须复测。",1312,"small");

const descendants=wrapper.findAll(()=>true);
const counts={}; for(const n of descendants) counts[n.type]=(counts[n.type]||0)+1;
const imageNodes=descendants.filter(n=>"fills" in n && Array.isArray(n.fills) && n.fills.some(p=>p.type==="IMAGE")).map(n=>({id:n.id,name:n.name,type:n.type,width:n.width,height:n.height}));
const fontFamilies=[...new Set(descendants.filter(n=>n.type==="TEXT").flatMap(n=>n.getStyledTextSegments(["fontName"]).map(s=>s.fontName.family)))];
figma.viewport.scrollAndZoomIntoView([wrapper]);
return {createdNodeIds:[...new Set([...createdNodeIds,...wrapper.findAll(()=>true).map(n=>n.id),...masters.findAll(()=>true).map(n=>n.id)])],mutatedNodeIds:[wrapper.id],pageId:page.id,wrapperId:wrapper.id,componentIds,variableCollectionId:collection.id,variableIds,styleIds,fontFamily:family,fontFamilies,boards:boards.map(b=>({id:b.id,name:b.name,width:b.width,height:b.height,childCount:b.children.length})),descendantCount:descendants.length,nodeTypeCounts:counts,imageNodes,width:wrapper.width,height:wrapper.height};
