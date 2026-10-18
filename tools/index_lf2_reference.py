"""Lossless BMP→PNG display copies and decoded DAT text; original bytes retained.
DAT format reference: OpenLF2/src/resources/data_file.cpp (MIT).
"""
import pathlib,json,hashlib,re,struct
from PIL import Image
root=pathlib.Path(__file__).resolve().parents[1];base=root/'assets/reference/lf2-2.0a';src=base/'original';preview=base/'preview';decoded=base/'decoded'
sha=lambda b:hashlib.sha256(b).hexdigest()
images=[]
def rle8(p):
 b=p.read_bytes();w,h=struct.unpack_from('<ii',b,18);bits=struct.unpack_from('<H',b,28)[0];method=struct.unpack_from('<I',b,30)[0]
 assert bits==8 and method==1 and h>0
 start=14+struct.unpack_from('<I',b,14)[0];offset=struct.unpack_from('<I',b,10)[0]
 palette=[tuple(b[i:i+3][::-1]) for i in range(start,offset,4)];pixels=bytearray(w*h);x=y=0;i=offset
 while i+1<len(b):
  n,v=b[i:i+2];i+=2
  if n:
   for _ in range(n):
    if x<w and y<h:pixels[(h-1-y)*w+x]=v
    x+=1
  elif v==0:x=0;y+=1
  elif v==1:break
  elif v==2:x+=b[i];y+=b[i+1];i+=2
  else:
   for q in b[i:i+v]:
    if x<w and y<h:pixels[(h-1-y)*w+x]=q
    x+=1
   i+=v+(v%2)
 result=Image.new('RGB',(w,h));result.putdata([palette[q] for q in pixels]);return result
for p in sorted(src.rglob('*.bmp')):
 rel=p.relative_to(src);target=preview/rel.with_suffix('.png');target.parent.mkdir(parents=True,exist_ok=True)
 decoder='Pillow'
 try:
  with Image.open(p) as im:rgb=im.convert('RGB');width,height=im.size
 except ValueError:
  rgb=rle8(p);width,height=rgb.size;decoder='BMP RLE8; explicit skipped pixels use palette index 0'
 rgb.save(target)
 with Image.open(target) as check:assert check.convert('RGB').tobytes()==rgb.tobytes()
 images.append({'path':str(target.relative_to(root)),'original':str(p.relative_to(root)),'originalSha256':sha(p.read_bytes()),'sha256':sha(target.read_bytes()),'width':width,'height':height,'bytes':target.stat().st_size,'name':str(rel),'decoder':decoder,'status':'LF2 2.0a官方原版；只读参考；原BMP保留；PNG格式转换'})
key=b'SiuHungIsAGoodBearBecauseHeIsVeryGood';files=[]
for p in sorted(src.rglob('*.dat')):
 b=p.read_bytes();d=bytes((b[i]-key[i%len(key)])%256 for i in range(123,len(b)))
 target=decoded/p.relative_to(src).with_suffix('.txt');target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(d)
 files.append({'path':str(target.relative_to(root)),'original':str(p.relative_to(root)),'sha256':sha(d),'text':d.decode('latin1')})
characters=[]
for ident,typ,file in re.findall(r'id:\s*(\d+)\s+type:\s*(\d+)\s+file:\s*(\S+)',(src/'data/data.txt').read_text()):
 if typ!='0':continue
 text=(decoded/pathlib.Path(file.replace('\\','/')).with_suffix('.txt')).read_text('latin1');frames={}
 for n,name,body in re.findall(r'<frame>\s*(\d+)\s+([^\r\n]+)[\r\n]+(.*?)<frame_end>',text,re.S):frames[int(n)]={'name':name.strip(),'body':body}
 moves={}
 for n,f in frames.items():
  for combo,target in re.findall(r'\b(hit_(?:Fa|Fj|Ua|Uj|Da|Dj|ja)):\s*(-?\d+)',f['body']):
   target=int(target)
   if target<=0:continue
   to=frames.get(target,{});mp=re.search(r'\bmp:\s*(-?\d+)',to.get('body',''))
   k=(combo,target)
   if k not in moves:moves[k]={'combo':combo,'entryFrame':target,'entryName':to.get('name'),'mp':int(mp[1]) if mp else 0,'fromFrames':[]}
   moves[k]['fromFrames'].append(n)
 characters.append({'id':int(ident),'name':pathlib.Path(file.replace('\\','/')).stem,'dataFile':file,'frames':len(frames),'moves':list(moves.values()),'hidden':30<=int(ident)<=59})
result={'source':json.loads((base/'source.json').read_text()),'images':images,'decodedFiles':files,'characters':characters,'note':'2.0a参考包与当前LF2_19运行包分开；并非把隐藏角色接入游戏；PNG与原BMP RGB像素逐一相同。'}
(base/'reference-index.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps({'images':len(images),'decodedFiles':len(files),'characters':len(characters),'hidden':sum(c['hidden'] for c in characters)}))
