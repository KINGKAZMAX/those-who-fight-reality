// Update only the chapter status and scope after browser verification.
const page=await figma.getNodeByIdAsync('15:99');
await figma.setCurrentPageAsync(page);
const wrapper=await figma.getNodeByIdAsync('15:100');
const updates=[
  ['16:26','已实现并验证 · 第一章合作试玩 v0.4'],
  ['16:54','浏览器链路通过：援护与暂停冻结、检查点保存与刷新续关、全队倒下重试、通关合照持久化、700×600 结算及自由对战切换。\n正常 AI 6 秒短测：逐秒 30 FPS；0 页面异常、0 失败资源。21 项章节/控制单测通过。\n清场检查使用 HP=1 敌人夹具与真实攻击命中，未代替自然难度与长期性能验收。技能专项另行检查。']
];
const byName={
 '援护与失败 / 说明':'已实现：倒地伙伴可由队友扶起；全队倒下后从本段重试。存档记住检查点与第一张合照，退出后可以继续旅程。',
 '本轮不冒充完成的内容':'尚未实装：四学段完整剧情、章节巨像与首领、角色年龄变化、完整专属动画与新音频。新增技能 UI / 特效正在专项接入，不计入上述第一章验收。',
 '素材来源与 Tripo 判断':'本板同步 9 张基础运行 PNG，来源与提示词见 reality-art-manifest.json。新增技能特效专项另行同步与验收。当前 2D 第一章机制不需要 Tripo。'
};
for(const [name,value] of Object.entries(byName)){const n=wrapper.findOne(n=>n.type==='TEXT'&&n.name===name);if(!n)throw new Error('Missing text '+name);updates.push([n.id,value]);}
const nodes=await Promise.all(updates.map(([id])=>figma.getNodeByIdAsync(id)));
const fonts=new Map();for(const n of nodes){if(!n||n.type!=='TEXT')throw new Error('Missing text node');for(const s of n.getStyledTextSegments(['fontName']))fonts.set(JSON.stringify(s.fontName),s.fontName);}
await Promise.all([...fonts.values()].map(f=>figma.loadFontAsync(f)));
nodes.forEach((n,i)=>n.characters=updates[i][1]);
const all=wrapper.findAll(()=>true),counts={};all.forEach(n=>counts[n.type]=(counts[n.type]||0)+1);
const outside=all.filter(n=>n.parent&&n.parent.type!=='PAGE'&&n.parent.type!=='INSTANCE'&&(n.x < -1||n.y < -1||n.x+n.width>n.parent.width+1||n.y+n.height>n.parent.height+1)).map(n=>({id:n.id,name:n.name}));
return {mutatedNodeIds:nodes.map(n=>n.id),texts:nodes.map(n=>({id:n.id,name:n.name,text:n.characters})),size:{width:wrapper.width,height:wrapper.height},counts,imageFillCount:all.filter(n=>Array.isArray(n.fills)&&n.fills.some(f=>f.type==='IMAGE')).length,outOfBounds:outside};
