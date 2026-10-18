"""Read-only detection of missing generated cells; never edits bitmap assets."""
from PIL import Image
from pathlib import Path
import json,math
ROOT=Path(__file__).resolve().parents[1]
nameids={'xiaoyi':11,'linxia':2,'zhouqi':8,'chenye':4,'tangli':9,'shenzhou':10,'paper-monster':30,'stapler-monster':31,'clock-monster':32}
inventory=json.loads((ROOT/'assets/runtime/native-animation-inventory.json').read_text())['objects']
records=[]
for p in (ROOT/'assets/runtime').glob('animation-*.json'):
 if 'patches' in p.name:continue
 data=json.loads(p.read_text());records+=data if isinstance(data,list) else data.get('assets',[])
missing=[]
for r in records:
 oid=r['id'] if isinstance(r['id'],int) else nameids[r['id']]
 nativeid={31:4,32:6}.get(oid,oid)
 spec=next(s for o in inventory if o['id']==nativeid for s in o['sheets'] if s['source']==r['nativeSource'] and ('sheetStart' not in r or s['start']==r['sheetStart']))
 native=Image.open(ROOT/'vendor/LF2_19'/spec['source']).convert('RGBA').getchannel('A')
 gen=Image.open(ROOT/'vendor/F.LF/game/art'/r['replacement']).convert('RGBA').getchannel('A');w,h=gen.size
 def seams(count,axis):
  size=w if axis=='x' else h;step=size/count;cuts=[0]
  for i in range(1,count):
   target=step*i;radius=math.ceil(step*.23)
   def score(cut):
    line=gen.crop((cut,0,cut+1,h) if axis=='x' else (0,cut,w,cut+1));occ=sum(v>24 for v in line.get_flattened_data());return occ*1000+abs(cut-target)
   cuts.append(min(range(max(cuts[-1]+1,math.floor(target-radius)),min(size-1,math.ceil(target+radius))+1),key=score))
  return cuts+[size]
 cols=r['columns'];rows=math.floor(r['rows']);xs=seams(cols,'x');ys=seams(rows,'y')
 cw=spec['width']//spec['columns'];ch=spec['height']//spec['rows']
 for pic in spec['usedPictures']:
  p=pic-spec['start'];col=p%spec['columns'];row=p//spec['columns']
  nb=native.crop((col*cw,row*ch,col*cw+cw-1,row*ch+ch-1)).getbbox()
  if not nb or (nb[2]-nb[0])*(nb[3]-nb[1])<=4:continue
  sr=row-r.get('rowOffset',0);sc=col-r.get('columnOffset',0)
  gb=gen.crop((xs[sc],ys[sr],xs[sc+1],ys[sr+1])).point(lambda a:255 if a>64 else 0).getbbox() if 0<=sr<rows and 0<=sc<cols else None
  if not gb:missing.append({'id':oid,'pic':pic,'file':r['replacement'],'native':r['nativeSource'],'row':row+1,'column':col+1})
print(json.dumps(missing,ensure_ascii=False,indent=2))
(ROOT/'docs/verification/native-animation/missing-cells.json').write_text(json.dumps(missing,ensure_ascii=False,indent=2)+'\n')
