# Read-only HTTP verification. Credentials via stdin only; never logged.
import sys,json,urllib.request,urllib.parse,urllib.error,http.cookiejar,subprocess,hashlib
from pathlib import Path
cfg=json.load(sys.stdin)
base=cfg['base'].rstrip('/')+'/'
root=Path(__file__).resolve().parents[2]
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root).decode().strip()
assert cfg['expected_commit']==commit, 'Checkout does not match expected deployment commit'
jar=http.cookiejar.CookieJar()
client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
client.open(cfg['access'],timeout=30).read()
files=subprocess.check_output(['git','ls-tree','-r','--name-only','HEAD'],cwd=root).decode().splitlines()
files=[f for f in files if not f.startswith('security/') and (f.endswith(('.html','.css','.js','.png','.jpeg','.ico','.xml','.webp')) or f=='robots.txt')]
results=[]
def get(path):
 try:
  with client.open(base+urllib.parse.quote(path,safe='/?=&'),timeout=30) as r:return r.status,r.read(),dict(r.headers)
 except urllib.error.HTTPError as e:return e.code,e.read(),dict(e.headers)
for f in files:
 status,body,headers=get('' if f=='index.html' else f)
 expected=(root/f).read_bytes()
 results.append({'check':f,'ok':status==200 and body==expected,'status':status,'bytes':len(body),'expected_sha256':hashlib.sha256(expected).hexdigest(),'received_sha256':hashlib.sha256(body).hexdigest()})
 if f=='index.html':home_headers={k.lower():v for k,v in headers.items()}
config=json.loads((root/'vercel.json').read_text())
for rule in config['headers']:
 if rule['source']=='/(.*)':
  for h in rule['headers']:
   if h['key'].lower().startswith('content-security-policy'):
    results.append({'check':h['key'],'ok':home_headers.get(h['key'].lower())==h['value']})
status,_,headers=get('gracias.html')
results.append({'check':'gracias noindex','ok':status==200 and 'noindex' in {k.lower():v for k,v in headers.items()}.get('x-robots-tag','')})
for p in ['security/preparacion/BLOQUE2.md','security/ui/accessibility.test.mjs','ruta-inexistente-b2']:
 status,_,_=get(p);results.append({'check':p+' excluded','ok':status==404,'status':status})
out={'commit':commit,'base':base,'checks':results,'passed':sum(r['ok'] for r in results),'total':len(results)}
Path(cfg['output']).write_text(json.dumps(out,indent=2))
print(json.dumps({'passed':out['passed'],'total':out['total'],'failures':[x for x in results if not x['ok']]}))
sys.exit(0 if out['passed']==out['total'] else 1)
