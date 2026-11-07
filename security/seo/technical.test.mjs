import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildInventory } from '../csp/inventory.mjs';
const root = new URL('../../', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8');
const host = 'https://www.terraseguridad.com.ar';
const htmls = ['index.html', 'politicas.html', 'gracias.html'].map(file => [file, read(file)]);

test('sitemap advertises only canonical, indexable existing pages', () => {
  const locs = [...read('sitemap.xml').matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
  assert.equal(new Set(locs).size, locs.length);
  assert.ok(locs.includes(host + '/'));
  for (const loc of locs) {
    const url = new URL(loc);
    assert.equal(url.origin, host);
    assert.equal(url.search + url.hash, '');
    const html = read(url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
    assert.ok(html.includes(`rel="canonical" href="${loc}"`));
    assert.ok(!/<meta[^>]+name="robots"[^>]+noindex/.test(html));
  }
  assert.ok(!locs.some(loc => /index.html|gracias|vercel.app/.test(loc)));
});

test('thank-you page stays crawlable so robots can read noindex', () => {
  const robots = read('robots.txt');
  assert.match(robots, /User-agent: \*\s+Allow: \//);
  assert.match(robots, /Sitemap: https:\/\/www\.terraseguridad\.com\.ar\/sitemap.xml/);
  assert.ok(!/Disallow:\s*\/(?:\s|gracias)/.test(robots));
  assert.match(read('gracias.html'), /<meta name="robots" content="noindex, follow"/);
  assert.ok(!read('gracias.html').includes('rel="canonical"'));
  const config = JSON.parse(read('vercel.json'));
  const rule = config.headers.find(r => r.source === '/gracias.html');
  assert.ok(rule.headers.some(h => h.key === 'X-Robots-Tag' && h.value === 'noindex, follow'));
});

test('internal links resolve to existing files and anchors, without the old home URL', () => {
  for (const [file, html] of htmls) {
    for (const [, href] of html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)) {
      const url = new URL(href, host + (file === 'index.html' ? '/' : '/' + file));
      if (url.origin !== host) continue;
      assert.notEqual(url.pathname, '/index.html');
      const target = read(url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
      if (url.hash) assert.ok(target.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`), `${file}: missing ${href}`);
    }
  }
});

test('structured identity agrees with the visible official phone and existing logo', () => {
  const html = read('index.html');
  const data = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(data['@type'], 'Organization');
  assert.equal(data.name, 'Terra Seguridad');
  assert.equal(data.url, host + '/');
  assert.equal(data.telephone, '+5491124808478');
  assert.ok(html.includes(`href="tel:${data.telephone}"`));
  assert.ok(existsSync(fileURLToPath(new URL(new URL(data.logo).pathname.slice(1), root))));
  assert.ok(!('address' in data || 'areaServed' in data || 'aggregateRating' in data));
  const inventory = buildInventory();
  assert.ok(!Object.values(inventory.origins_by_directive).flat().includes('https://schema.org'), 'schema identifiers must not widen CSP network permissions');
});

test('metadata remains in the head and semantics preserve one main and one H1', () => {
  for (const [file, html] of htmls) {
    const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
    assert.equal((html.match(/<main\b/g) || []).length, 1, file);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, file);
    assert.ok(html.indexOf('<meta charset="UTF-8"') < 1024);
    assert.ok(!/<noscript>\s*<img/.test(head));
    if (file === 'gracias.html') continue;
    assert.equal((head.match(/rel="canonical"/g) || []).length, 1);
    for (const name of ['og:title', 'og:description', 'og:url', 'og:image']) assert.ok(head.includes(`property="${name}"`));
  }
  assert.equal((read('index.html').match(/<h3\b/g) || []).length, 8);
});

test('contact destinations and tracking identifiers retain the current configuration', () => {
  const all = htmls.map(([, html]) => html).join('\n');
  const wa = [...all.matchAll(/href="(https:\/\/wa\.me\/[^\"]+)"/g)].map(m => new URL(m[1]));
  assert.equal(wa.length, 8);
  assert.ok(wa.every(url => url.pathname === '/5491124808478'));
  assert.ok(!/1130089046|11 3008|11-3008/.test(all));
  for (const file of ['index.html', 'gracias.html']) {
    assert.ok(read(file).includes('GTM-W65DNSWX'));
    assert.ok(read(file).includes("fbq('init', '689271596885956'"));
  }
});
