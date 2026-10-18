"""Upload original bytes to explicit single-use Figma URLs; save receipts."""
import json, pathlib, urllib.request, concurrent.futures, sys
root=pathlib.Path.cwd()
jobs=json.loads((root/(sys.argv[1] if len(sys.argv)>1 else 'docs/figma-archive/2026-10-18-public-brand-v2/upload-jobs.json')).read_text())
def upload(job):
    data=(root/job['path']).read_bytes()
    request=urllib.request.Request(job['submitUrl'],data=data,headers={'Content-Type':'image/png'},method='POST')
    try:
        with urllib.request.urlopen(request,timeout=120) as response:
            result=json.loads(response.read())
        return dict(id=job['id'],path=job['path'],nodeId=job['nodeId'],result=result)
    except Exception as error:
        return dict(id=job['id'],path=job['path'],nodeId=job['nodeId'],error=str(error))
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    results=list(pool.map(upload,jobs))
receipt=root/'docs/figma-archive/2026-10-18-public-brand-v2/upload-receipts.jsonl'
with receipt.open('a') as f:
    for r in results:f.write(json.dumps(r,ensure_ascii=False)+'\n')
errors=[r for r in results if 'error' in r]
print(json.dumps(dict(count=len(results),errors=errors),ensure_ascii=False))
if errors:sys.exit(1)
