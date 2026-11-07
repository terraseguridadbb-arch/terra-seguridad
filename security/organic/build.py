"""Static, deterministic pages from reviewed content. No API, keys or runtime backend."""
import json
import re
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HOST = 'https://www.terraseguridad.com.ar'

def render_all(root=ROOT):
    data = json.loads((root / 'security/organic/content.json').read_text())
    pages = {p['slug']: p for p in data['pages']}
    home = (root / 'index.html').read_text()
    # Reuse the current approved tracker bytes. Never add a second GA4 or Lead producer.
    scripts = re.findall(r'<script>([\s\S]*?)</script>', home)[:2]
    assert len(scripts) == 2 and 'GTM-W65DNSWX' in scripts[0] and "'PageView'" in scripts[1]
    tracking = ''.join('<script>' + s + '</script>\n' for s in scripts)
    noscript = '\n'.join(re.findall(r'<noscript>[\s\S]*?</noscript>', home))
    outputs = {}
    for slug, p in pages.items():
        canonical = HOST + '/' + slug + '.html'
        e = escape
        sections = []
        for n, section in enumerate(p['sections'], 1):
            text = '<p>' + e(section['text']) + '</p>' if section.get('text') else ''
            items = '<ul>' + ''.join('<li>' + e(x) + '</li>' for x in section['items']) + '</ul>' if section.get('items') else ''
            sections.append(f'<section id="tema-{n}"><h2>{e(section["title"])}</h2>{text}{items}</section>')
        faq = ''
        if p['faqs']:
            faq = '<section aria-labelledby="preguntas"><h2 id="preguntas">Preguntas frecuentes</h2>' + ''.join(f'<details><summary>{e(q)}</summary><p>{e(a)}</p></details>' for q,a in p['faqs']) + '</section>'
        cards = ''.join(f'<a class="guide-card" href="/{other}.html"><span>{e(pages[other]["topic"])}</span><strong>{e(pages[other]["h1"])}</strong><span aria-hidden="true">Leer guía →</span></a>' for other in p['related'])
        graph = [
            {'@type': 'Organization', '@id': HOST + '/#organizacion', 'name': 'Terra Seguridad', 'url': HOST + '/', 'logo': HOST + '/assets/images/blueTerraLogo.png', 'telephone': '+5491124808478'},
            {'@type': 'WebPage', '@id': canonical + '#pagina', 'url': canonical, 'name': p['title'], 'description': p['description'], 'inLanguage': 'es-AR', 'publisher': {'@id': HOST + '/#organizacion'}, 'breadcrumb': {'@id': canonical + '#migas'}},
            {'@type': 'BreadcrumbList', '@id': canonical + '#migas', 'itemListElement': [{'@type':'ListItem','position':1,'name':'Inicio','item':HOST+'/'}, {'@type':'ListItem','position':2,'name':p['label'],'item':canonical}]}
        ]
        # Do not claim rich-result eligibility through FAQPage, ratings, LocalBusiness or fabricated offers.
        schema = json.dumps({'@context':'https://schema.org','@graph':graph},ensure_ascii=False,indent=2).replace('</','<\\/')
        toc = ''.join(f'<a href="#tema-{n}">{e(s["title"])}</a>' for n,s in enumerate(p['sections'],1))
        outputs[slug+'.html'] = f'''<!DOCTYPE html>
<html lang="es-AR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{e(p['title'])}</title>
  <meta name="description" content="{e(p['description'])}" />
  <link rel="canonical" href="{canonical}" />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="es_AR" />
  <meta property="og:site_name" content="Terra Seguridad" />
  <meta property="og:title" content="{e(p['title'])}" />
  <meta property="og:description" content="{e(p['description'])}" />
  <meta property="og:url" content="{canonical}" />
  <meta property="og:image" content="{HOST}/assets/images/blueTerraLogo.png" />
  <meta property="og:image:alt" content="Terra Seguridad" />
  <meta name="twitter:card" content="summary" />
  <link rel="icon" href="/assets/favicon/favicon.ico" />
  <link rel="stylesheet" href="/guias.css" />
  <script type="application/ld+json">{schema}</script>
  {tracking}
</head>
<body>
{noscript}
<a class="skip" href="#contenido">Saltar al contenido</a>
<header class="site-header"><div class="header-inner">
  <a class="brand" href="/" aria-label="Terra Seguridad, inicio"><img src="/assets/images/blueTerraLogo.webp" alt="Terra Seguridad" width="859" height="853" /></a>
  <nav aria-label="Navegación principal"><a href="/guias.html">Guías</a><a href="/cobertura.html">Cobertura</a><a class="button small" href="/#contacto">Consultar</a></nav>
</div></header>
<main id="contenido">
  <section class="guide-hero"><div class="wrap">
    <nav class="breadcrumbs" aria-label="Ubicación"><a href="/">Inicio</a><span aria-hidden="true">/</span><span aria-current="page">{e(p['label'])}</span></nav>
    <p class="eyebrow">{e(p['topic'])}</p><h1>{e(p['h1'])}</h1>
    <p class="intro">{e(p['answer'])}</p>
    <a class="button" href="/#contacto">{e(p['cta'])}</a>
    <p class="identity">Somos agentes oficiales de ADT.</p>
  </div></section>
  <div class="wrap reading-layout">
    <aside class="contents"><p>En esta guía</p><nav aria-label="Contenido de esta guía">{toc}</nav></aside>
    <article class="article" aria-label="{e(p['label'])}">{''.join(sections)}{faq}
      <p class="editor">Preparado por {e(data['editor'])}. Actualización editorial: <time datetime="{data['reviewed']}">7 de noviembre de 2026</time>. Las prestaciones se confirman en la propuesta según equipo, plan y disponibilidad.</p>
    </article>
  </div>
  <section class="related wrap" aria-labelledby="seguir"><p class="eyebrow">Seguí explorando</p><h2 id="seguir">Información que te puede ayudar</h2><div class="cards">{cards}</div></section>
  <section class="contact-band"><div class="wrap"><p class="eyebrow">Tu próxima decisión, con compañía</p><h2>{e(p['cta'])}</h2><p>Contanos qué necesitás. Un asesor de Terra puede ayudarte a revisar las opciones por teléfono.</p><div class="actions"><a class="button" href="/#contacto">Solicitar asesoramiento</a><a class="button secondary" href="https://wa.me/5491130089046">Escribir por WhatsApp</a><a class="call" href="tel:+5491124808478">Llamar al 11 2480 8478</a></div></div></section>
</main>
<footer class="site-footer"><div class="wrap"><strong>Terra Seguridad</strong><p>Somos agentes oficiales de ADT.</p><nav aria-label="Enlaces del pie"><a href="/">Inicio</a><a href="/guias.html">Guías</a><a href="/cobertura.html">Cobertura</a><a href="/politicas.html">Privacidad</a></nav></div></footer>
</body>
</html>
'''
    locs = [HOST+'/', HOST+'/politicas.html'] + [HOST+'/'+s+'.html' for s in pages]
    outputs['sitemap.xml'] = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join('  <url><loc>'+x+'</loc></url>\n' for x in locs) + '</urlset>\n'
    return outputs

if __name__ == '__main__':
    import sys
    outputs = render_all()
    if '--check' in sys.argv:
        stale = [p for p,v in outputs.items() if not (ROOT/p).exists() or (ROOT/p).read_text()!=v]
        if stale: raise SystemExit('Generated files differ: ' + ', '.join(stale))
        print(f'{len(outputs)} generated files current')
    else:
        for name, content in outputs.items(): (ROOT/name).write_text(content)
        print(f'{len(outputs)} generated files written')
