"""Read-only public audit. Bounded requests, no analytics events, cookies or form submissions."""
import argparse
import hashlib
import json
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

HOST = 'https://www.terraseguridad.com.ar'
MAX_BYTES = 2_000_000

class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.canonical=[]; self.robots=[]; self.headings=[]; self.links=[]; self.ids=set()
        self.title=''; self.description=''; self.schema=[]; self._capture=None; self._buf=[]
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if 'id' in a: self.ids.add(a['id'])
        if tag=='link' and a.get('rel')=='canonical': self.canonical.append(a.get('href',''))
        if tag=='meta' and a.get('name','').lower()=='robots': self.robots.append(a.get('content','').lower())
        if tag=='meta' and a.get('name','').lower()=='description': self.description=a.get('content','')
        if tag=='a': self.links.append(a.get('href',''))
        if tag in ['title','h1'] or (tag=='script' and a.get('type')=='application/ld+json'):
            self._capture=tag; self._buf=[]

    def handle_data(self, data):
        if self._capture: self._buf.append(data)

    def handle_endtag(self, tag):
        if self._capture!=tag: return
        value=''.join(self._buf).strip()
        if tag=='title': self.title=value
        elif tag=='h1': self.headings.append(value)
        else:
            try: self.schema.append(json.loads(value))
            except json.JSONDecodeError: self.schema.append({'invalid_json': True})
        self._capture=None

def checks(text, expected_url, headers=None):
    p=Page(text); headers=headers or {}
    return {
        'canonical':p.canonical==[expected_url],
        'indexable_directive':'noindex' not in ','.join(p.robots) + headers.get('x-robots-tag','').lower(),
        'one_h1':len(p.headings)==1,
        'title':bool(p.title), 'description':bool(p.description),
        'schema_json': all('invalid_json' not in x for x in p.schema),
        'contact_path':any(x in p.links for x in ['/#contacto','#contacto','https://wa.me/5491130089046']),
    }

class SameOriginRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urllib.parse.urlsplit(newurl).netloc != urllib.parse.urlsplit(HOST).netloc:
            raise ValueError('cross_origin_redirect')
        return super().redirect_request(req,fp,code,msg,headers,newurl)

def fetch(url):
    u=urllib.parse.urlsplit(url)
    if u.scheme!='https' or u.netloc!=urllib.parse.urlsplit(HOST).netloc or u.query or u.username:
        raise ValueError('Only canonical Terra public URLs without query are allowed')
    start=time.monotonic()
    request=urllib.request.Request(url,headers={'User-Agent':'Terra-Organic-Audit/1.0 (read-only)'})
    opener=urllib.request.build_opener(SameOriginRedirect(),urllib.request.HTTPSHandler(context=ssl.create_default_context()))
    try:
        with opener.open(request,timeout=20) as response:
            body=response.read(MAX_BYTES+1)
            if len(body)>MAX_BYTES: raise ValueError('response_too_large')
            return {'status':response.status,'final_url':response.url,'elapsed_ms':round((time.monotonic()-start)*1000), 'sha256':hashlib.sha256(body).hexdigest(), 'headers':{k.lower():v for k,v in response.headers.items() if k.lower() in ['content-type','x-robots-tag','strict-transport-security']}, 'text':body.decode('utf8','replace')}
    except urllib.error.HTTPError as exc: return {'status':exc.code,'error':'http_error'}
    except (urllib.error.URLError,TimeoutError,ValueError) as exc: return {'status':None,'error':type(exc).__name__}

def audit():
    result={'checked_at':datetime.now(timezone.utc).isoformat(),'scope':'HTTP/directives; not proof of indexing, ranking, rendering or delivery of a lead','host':HOST,'pages':[],'errors':[]}
    robots=fetch(HOST+'/robots.txt'); sitemap=fetch(HOST+'/sitemap.xml')
    result['robots_http']=robots.get('status'); result['sitemap_http']=sitemap.get('status')
    if robots.get('status')==200:
        parser=urllib.robotparser.RobotFileParser(); parser.parse(robots['text'].splitlines())
        result['crawler_directives']={bot:parser.can_fetch(bot,HOST+'/') for bot in ['Googlebot','Bingbot','OAI-SearchBot','PerplexityBot']}
    else: result['errors'].append('robots_unavailable')
    try:
        if sitemap.get('status')!=200: raise ValueError('sitemap_unavailable')
        locs=[n.text for n in ET.fromstring(sitemap['text']).iter() if n.tag.endswith('}loc') or n.tag=='loc']
        if not locs or len(locs)>40 or len(set(locs))!=len(locs): raise ValueError('sitemap_empty_duplicate_or_over_limit')
        for url in locs:
            u=urllib.parse.urlsplit(url)
            if u.scheme!='https' or u.netloc!=urllib.parse.urlsplit(HOST).netloc or u.query or u.fragment or u.username: raise ValueError('sitemap_off_origin_or_noncanonical')
        for url in locs:
            f=fetch(url); row={'url':url,**{k:v for k,v in f.items() if k not in ['text','headers']}}
            if f.get('status')==200:
                row['checks']=checks(f['text'],url,f['headers'])
                # Privacy page has no contact CTA requirement.
                if url.endswith('/politicas.html'): row['checks'].pop('contact_path')
                if url.endswith('/gracias.html'): row['checks']['not_thank_you']=False
                row['checks']['no_redirect']=f['final_url']==url
            result['pages'].append(row)
    except (ET.ParseError,ValueError,TypeError) as exc: result['errors'].append(str(exc))
    thanks=fetch(HOST+'/gracias.html')
    result['thank_you_noindex']=thanks.get('status')==200 and 'noindex' in (thanks.get('headers',{}).get('x-robots-tag','').lower()+','.join(Page(thanks.get('text','')).robots))
    result['ok']=not result['errors'] and result['thank_you_noindex'] and bool(result['pages']) and all(p.get('status')==200 and all(p.get('checks',{}).values()) for p in result['pages'])
    return result

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--output',type=Path,required=True); args=parser.parse_args()
    result=audit(); args.output.parent.mkdir(parents=True,exist_ok=True); args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'ok':result['ok'],'pages':len(result['pages']),'errors':result['errors'],'output':str(args.output)}))
    raise SystemExit(0 if result['ok'] else 1)
