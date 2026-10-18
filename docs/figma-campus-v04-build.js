// Campus v0.4 review document; native text/layout, discrete local artwork only.
// Discovery: no Code Connect files; existing Review / Board heading reused.
// Existing spacing/text styles inspected; campus colors are from urban-ui.css.
// No linked product library, and campus blue variable search returned no result.
// This is a review document, not a reconstructed game UI. No UI screenshot embeds.
const page = await figma.getNodeByIdAsync('15:99');
await figma.setCurrentPageAsync(page);
const wrapper = await figma.getNodeByIdAsync('15:100');
if (wrapper.children.length) throw new Error('Inspect existing campus content before retrying.');
const headingMaster = await figma.getNodeByIdAsync('2:32');
const cn = {family:'Noto Sans SC',style:'Regular'};
const bold = {family:'Noto Sans SC',style:'Bold'};
await Promise.all([cn,bold].map(f=>figma.loadFontAsync(f)));
const created=[], images=[], boards={};
const color={ink:'#07172f',deep:'#102b61',blue:'#2455ae',paper:'#fff3d4',muted:'#b8c8e7',edge:'#d7e3ef',red:'#e35850',green:'#a8d8bc',panel:'#17386d'};
function paint(key){let h=color[key];return {type:'SOLID',color:{r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255}};}
function track(n){created.push(n.id);return n;}
function box(parent,name,width,direction='VERTICAL',fill=null,pad=0,gap=20){const n=track(figma.createAutoLayout(direction));parent.appendChild(n);n.name=name;n.resize(width,10);n.layoutSizingHorizontal='FIXED';n.layoutSizingVertical='HUG';n.itemSpacing=gap;n.paddingLeft=n.paddingRight=n.paddingTop=n.paddingBottom=pad;n.fills=fill?[paint(fill)]:[];n.clipsContent=false;return n;}
function text(parent,name,value,width,size=24,heavy=false,tone='paper'){const n=track(figma.createText());n.fontName=heavy?bold:cn;n.characters=value;n.name=name;n.fontSize=size;n.lineHeight={unit:'PERCENT',value:150};n.fills=[paint(tone)];parent.appendChild(n);n.textAutoResize='HEIGHT';n.resize(width,Math.max(20,n.height));n.layoutSizingHorizontal='FIXED';n.layoutSizingVertical='HUG';return n;}
function image(parent,id,file,width,height){const n=track(figma.createRectangle());parent.appendChild(n);n.name='PNG / '+id+' / '+file;n.resize(width,height);n.fills=[paint('ink')];images.push({id,file,nodeId:n.id,width,height});return n;}
function head(parent,num,title,sub){const n=track(headingMaster.createInstance());parent.appendChild(n);n.setProperties({'章节#2:0':num,'标题#2:1':title,'说明#2:2':sub});n.findAllWithCriteria({types:['TEXT']}).forEach(t=>{created.push(t.id);t.fills=[paint(t.name==='章节编号'?'green':t.name==='章节说明'?'muted':'paper')];});return n;}
function board(parent,id,title,sub){const n=box(parent,id,1440,'VERTICAL','deep',48,28);boards[id]=n.id;head(n,id,title,sub);return n;}
function note(parent,name,title,body,width=1344){const n=box(parent,name,width,'VERTICAL','panel',24,12);text(n,name+' / 标题',title,width-48,26,true,'green');text(n,name+' / 说明',body,width-48,23);return n;}
const row1=box(wrapper,'第一行 / 世界观与当前开发',2944,'HORIZONTAL',null,0,64);
const world=board(row1,'01 / 世界观','与名为现实的怪物战斗的人们','A Gift for Player One · 校园篇 v0.4 · 2026-10-17');
text(world,'世界观核心','在前程市，现实是会长出手脚的。',1344,48,true);
text(world,'故事说明','一群普通孩子，从小学一路走到大学毕业。\n他们要上课、考试、升学，也会一起打散挡在校门口的怪物。',1344,28);
note(world,'现实怪物规则','要求挤占生活，才会变成怪物。','“不能落后”长成红线；“必须一样”挤压每个人的空间。\n战斗把压力恢复到人能处理的大小，考试与选择仍由角色自己完成。');
note(world,'组队的意义','过来一下，帮我一把。','并肩开路、交替掩护、扶起倒地同伴。每个角色都有完整的攻击、防御与脱困手段，合作不依赖固定职业配比。');
note(world,'礼物与成长','给长大的我。你可以改。','童年的画、地图、信与未完成的小发明，在各自毕业节点归还。礼物不受战绩或纪念物数量影响。');
text(world,'主线与现有素材边界','主线设定：小学 → 初中 → 高中 → 大学\n现有运行场景：小学、初中、大学。高中场景与完整成长主线尚未实装。',1344,24,false,'muted');
text(world,'当前与历史边界','当前采用校园像素美术与蓝色界面。旧《失物招领局》及荧光黄都市 UI 留在“历史”页，不代表当前版本。',1344,24,false,'green');

const chapter=board(row1,'04 / 第一章','第一章 · 不要掉队','从可操作美术试玩，推进到有目标、有援护、有保存的合作遭遇。');
const status=text(chapter,'v0.4 实施状态','本轮实现中 · 待实际浏览器验收',1344,32,true,'green');
note(chapter,'第一章玩法目标','第一场胜利：大家一起进了校门。','开学广播重复“新同学，请不要掉队”。清理挡路的纸卷怪，来到校门口；老师说：“先坐下，名字慢慢写。”');
const flow=box(chapter,'第一章流程',1344,'HORIZONTAL',null,0,24);
for(const [i,t,b]of [[1,'第一段','2 只纸卷怪\n熟悉移动与攻击'],[2,'检查点','记录已通过的路段\n失败保留进度'],[3,'第二段','3 只纸卷怪\n并肩打开入口'],[4,'第一张合照','完成第一章\n留下共同纪念']]){const c=box(flow,'流程 '+i,318,'VERTICAL','panel',20,12);text(c,'步骤','0'+i,278,22,true,'green');text(c,'名称',t,278,28,true);text(c,'内容',b,278,22);}
note(chapter,'援护与失败','靠近同伴，按住防御 1.5 秒援护。','本轮目标：倒地伙伴可以扶起；全队倒下后从本段重试。单人也能完成第一章。存档记住检查点与第一张合照。');
note(chapter,'已经运行的基础','已接入：4 位伙伴 × 3 处场景 × 双人同键盘','P1：WASD 移动，F 攻击，G 跳跃，H 防御\nP2：方向键移动，J 攻击，K 跳跃，L 防御\nP 暂停；Esc 返回。自由对战保留。');
text(chapter,'本轮不冒充完成的内容','尚未实装：四学段完整剧情、章节巨像与首领、角色年龄变化、专属新动作和新音频。当前第一章采用现有纸卷怪与已生成校园资产。',1344,24,false,'muted');
const validation=text(chapter,'v0.4 验证记录','验证记录：本轮实现中，完成后回填实际检查结果。\n此前美术与双人基础版：8 人同屏 8 秒采样均为 30 FPS；不代表本轮机制已验证。',1344,24,false,'muted');

const row2=box(wrapper,'第二行 / 资产检索',2944,'HORIZONTAL',null,0,64);
const heroes=board(row2,'02 / 四位伙伴','一起长大的人','4 张透明角色表 · 每张 4×4，共 16 个独立姿态 · 下方为原始 PNG 素材');
const heroData=[['xiaoyi','小一','近身 · 书包冲锋','总想跟上大家，也会回身接住同伴。','Davis'],['linxia','林夏','支援 · 粉笔守护','为同伴留出喘息，也有自己的烦恼和选择。','John'],['zhouqi','周齐','控场 · 三角尺阵','喜欢学习，认真观察，也学着开口求助。','Freeze'],['chenye','陈野','远程 · 手工弹射','喜欢拆东西，也愿意认真修好。','Henry']];
for(let r=0;r<2;r++){const row=box(heroes,'伙伴第 '+(r+1)+' 行',1344,'HORIZONTAL',null,0,32);for(const h of heroData.slice(r*2,r*2+2)){const c=box(row,h[1]+' / '+h[0],656,'VERTICAL','panel',24,12);text(c,h[1]+' / 名称与战斗表达',h[1]+'  /  '+h[2],608,28,true);image(c,h[0],h[0]+'.png',608,350);text(c,h[1]+' / 人物线',h[3],608,22);text(c,h[1]+' / 资产索引','game/art/'+h[0]+'.png\n已接入 · 沿用 '+h[4]+' 动作机制',608,20,false,'muted');}}
text(heroes,'动作映射说明','左右朝向由引擎翻转；16 姿态映射到 LF2 动作时间线。65 张运行图集、3459 个映射格是复用结果，不等于独立绘制 3459 帧。',1344,23,false,'muted');

const assets=board(row2,'03 / 场景与道具','前程市 · 已接入的美术','嵌入实际运行 PNG。文字、索引和布局可编辑；PNG 像素内容不属于原生图层。');
for(const s of [['stage-primary','小学 · 不要掉队','晴天校门与操场。第一章使用此场地。'],['stage-ranking','初中 · 名次巨像','雨夜校园与排名楼层。当前是自由对战场地，巨像尚未实装。'],['stage-graduation','大学 · 前途无量','日落校门与毕业街道。毕业礼物剧情与门框首领尚未实装。']]){const row=box(assets,s[1],1344,'HORIZONTAL','panel',20,24);image(row,s[0],s[0]+'.png',680,260);const detail=box(row,s[1]+' / 索引',600,'VERTICAL',null,0,16);text(detail,'场景名',s[1],600,28,true);text(detail,'用途',s[2],600,23);text(detail,'路径','game/art/'+s[0]+'.png',600,20,false,'muted');}
const extras=box(assets,'敌人与道具资源',1344,'HORIZONTAL',null,0,32);
for(const a of [['paper-monster','纸卷怪','敌人表 · 16 姿态 · 已接入'],['props','道具与特效','16 格透明素材 · 已接入']]){const c=box(extras,a[1],656,'VERTICAL','panel',20,10);text(c,a[1]+' / 标题',a[1],616,26,true);image(c,a[0],a[0]+'.png',616,210);text(c,a[1]+' / 来源',a[2]+'\ngame/art/'+a[0]+'.png',616,20,false,'muted');}
text(assets,'素材来源与 Tripo 判断','9 张运行 PNG 由内置 image_gen 生成，来源与提示词见 reality-art-manifest.json。当前 2D 试玩与本轮援护机制不需要 Tripo。',1344,23,false,'muted');
const footer=box(wrapper,'检索与编辑说明',2944,'HORIZONTAL',null,0,32);
text(footer,'字体与可编辑性','审阅字体：Noto Sans SC；运行端：Courier New / 系统中文。此板是原生审阅文档，不是游戏 UI 像素复刻。',1456,22,false,'muted');
text(footer,'来源文件','来源：世界观.md / 美术资产说明.md / reality-art-manifest.json / urban-ui.js / reality-art.js',1456,22,false,'muted');
return {createdNodeIds:created,mutatedNodeIds:[wrapper.id],pageId:page.id,wrapperId:wrapper.id,boards,images,statusNodeId:status.id,validationNodeId:validation.id,counts:{texts:wrapper.findAllWithCriteria({types:['TEXT']}).length,instances:wrapper.findAllWithCriteria({types:['INSTANCE']}).length},size:{width:wrapper.width,height:wrapper.height}};
