"""Read-only Clickteam resource extraction, based on OpenLF2 MIT installer.cpp.
Reference: github.com/OpenLF2/OpenLF2/blob/main/src/resources/installer.cpp
Copyright (c) 2026 OpenLF2 contributors; adapted for this archive.
No installer instructions or executable files are executed.
"""
import pathlib,struct,zlib,bz2,hashlib,json
root=pathlib.Path(__file__).resolve().parents[1];base=root/'assets/reference/lf2-2.0a'
b=(base/'LF2_v2.0a.exe').read_bytes()
assert hashlib.sha256(b).hexdigest()=='540c485547e234b0d09595f54d067aafd7176092c308aca61868f3cbc03030e1'
u16=lambda b,p:struct.unpack_from('<H',b,p)[0]
u32=lambda b,p:struct.unpack_from('<I',b,p)[0]
def decode(b,method,size):
 d=b if method==0 else zlib.decompress(b) if method==1 else bz2.decompress(b) if method==2 else None
 assert d is not None and len(d)==size
 return d
pe=u32(b,60);sections=pe+24+u16(b,pe+20)
overlay=max(u32(b,sections+i*40+20)+u32(b,sections+i*40+16) for i in range(u16(b,pe+6)))
assert b[overlay:overlay+6]==b'wwgT)H'
cursor=overlay+6;table=None
while cursor<len(b):
 ident,flags,size=struct.unpack_from('<HHI',b,cursor);body=cursor+8
 if ident==0x7f7f:
  payload=body+4;assert u32(b,body)==size and payload+size==len(b);break
 if ident==0x143a:table=decode(b[body+5:body+size],b[body+4],u32(b,body))
 cursor=body+size
assert table
cursor=4;records=[];out=base/'original'
for i in range(u32(table,0)):
 size=u16(table,cursor);r=table[cursor:cursor+size];cursor+=size
 if u16(r,2)!=0:continue
 name=r[62:].split(b'\0')[0].decode('latin1').replace('\\','/')
 p=pathlib.PurePosixPath(name);assert not p.is_absolute() and '..' not in p.parts
 off,compressed,expected=u32(r,6),u32(r,10),u32(r,18)
 d=decode(b[payload+off+1:payload+off+compressed],b[payload+off],expected)
 target=out/p;target.parent.mkdir(parents=True,exist_ok=True)
 if target.exists():assert target.read_bytes()==d
 else:target.write_bytes(d)
 records.append({'path':name,'bytes':len(d),'sha256':hashlib.sha256(d).hexdigest()})
(base/'extracted-files.json').write_text(json.dumps(records,indent=2))
print(json.dumps({'files':len(records),'bmps':sum(r['path'].lower().endswith('.bmp') for r in records),'data':sum(r['path'].lower().endswith('.dat') for r in records)}))
