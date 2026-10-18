"""Independently check every converted original BMP against FFmpeg RGB output."""
import pathlib,json,subprocess,concurrent.futures,hashlib
from PIL import Image
root=pathlib.Path(__file__).resolve().parents[1]
data=json.loads((root/'assets/reference/lf2-2.0a/reference-index.json').read_text())
def check(r):
 p=subprocess.run(['/opt/homebrew/bin/ffmpeg','-v','error','-i',str(root/r['original']),'-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True)
 with Image.open(root/r['path']) as im:rgb=im.convert('RGB').tobytes()
 return {'path':r['path'],'passed':p.returncode==0 and rgb==p.stdout,'originalSha256':r['originalSha256'],'pngSha256':r['sha256'],'decoder':r['decoder'],'error':p.stderr.decode()[:200] if p.returncode else None}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:results=list(pool.map(check,data['images']))
report={'passed':all(r['passed'] for r in results),'count':len(results),'results':results}
(root/'docs/figma-archive/2026-10-18/original-conversion-verification.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'passed':report['passed'],'count':len(results),'errors':[r for r in results if not r['passed']]}))
if not report['passed']:raise SystemExit(1)
