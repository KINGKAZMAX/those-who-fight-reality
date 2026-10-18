"""Download official installer in verified byte ranges, without executing it."""
import pathlib,urllib.request,concurrent.futures,hashlib,json
root=pathlib.Path(__file__).resolve().parents[1]
out=root/'assets/reference/lf2-2.0a';out.mkdir(parents=True,exist_ok=True)
url='https://lf2.net/LF2_v2.0a.exe';size=29586263;chunk=524288
def fetch(i):
 start=i*chunk;end=min(size-1,start+chunk-1)
 request=urllib.request.Request(url,headers={'Range':f'bytes={start}-{end}'})
 with urllib.request.urlopen(request,timeout=90) as response:
  if response.status!=206:raise ValueError('Server did not honor range')
  data=response.read()
 if len(data)!=end-start+1:raise ValueError('Incomplete range')
 return i,data
with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
 parts=dict(pool.map(fetch,range((size+chunk-1)//chunk)))
data=b''.join(parts[i] for i in range(len(parts)))
(out/'LF2_v2.0a.exe').write_bytes(data)
(out/'source.json').write_text(json.dumps({'url':url,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'usage':'reference only; not installed or executed'},indent=2))
print('Downloaded official installer:',len(data))
