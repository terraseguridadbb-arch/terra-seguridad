/**
 * WP-SEC-11 (preparatorio) - Inventario CSP del sitio estatico terra-seguridad.
 *
 * Escanea los archivos publicados y produce, SIN copiar el contenido de los
 * scripts, el material necesario para construir una politica CSP:
 *   - origenes externos agrupados por directiva
 *   - scripts inline con su hash sha256 en formato CSP
 *   - atributos de evento inline (on*) con su hash sha256
 *   - uso de eval / new Function
 *   - inyeccion dinamica de scripts (GTM / Meta Pixel)
 *
 * Determinista: no incluye marcas de tiempo, para que el test pueda regenerar
 * el inventario en memoria y compararlo con INVENTORY.json.
 *
 * Uso:  node security/csp/inventory.mjs --write
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const INVENTORY_PATH = path.join(REPO_ROOT, 'security', 'csp', 'INVENTORY.json');

/** Nombre del campo que Vercel usa para el nombre del header. */
export const HEADER_NAME_FIELD = 'key';

/** Archivos publicados que forman la superficie del sitio. */
export const SITE_FILES = ['index.html', 'gracias.html', 'politicas.html', 'main.js', 'styles.css'];

/**
 * Origenes que el navegador contacta en runtime y que NO aparecen como literal
 * en el repositorio porque los inyectan GTM / gtag / Meta Pixel. Se declaran a
 * mano, con motivo, para que queden auditados igual que los demas.
 */
export const RUNTIME_EXPECTED = [
  { origin: 'https://www.googletagmanager.com', directive: 'script-src', reason: 'GTM carga gtag/js y el contenedor desde el mismo host' },
  { origin: 'https://www.google-analytics.com', directive: 'script-src', reason: 'GA4 puede cargar analytics.js / ga-audiences desde este host' },
  { origin: 'https://www.google-analytics.com', directive: 'connect-src', reason: 'GA4 envia hits por beacon/fetch' },
  { origin: 'https://region1.google-analytics.com', directive: 'connect-src', reason: 'GA4 rutea hits a endpoints regionales' },
  { origin: 'https://analytics.google.com', directive: 'connect-src', reason: 'GA4 sincroniza audiencias y consent' },
  { origin: 'https://www.googletagmanager.com', directive: 'connect-src', reason: 'GTM descarga la configuracion del contenedor' },
  { origin: 'https://www.facebook.com', directive: 'connect-src', reason: 'fbevents.js envia eventos a /tr por fetch o imagen' },
  { origin: 'https://www.google-analytics.com', directive: 'img-src', reason: 'GA4 usa pixeles de fallback' },
  { origin: 'https://www.googletagmanager.com', directive: 'img-src', reason: 'GTM usa pixeles de fallback' }
];

/** Directivas de fetch/navegacion que la politica administra. */
export const DIRECTIVES = ['script-src', 'style-src', 'img-src', 'font-src', 'connect-src', 'frame-src', 'form-action'];

const uniqSorted = (arr) => Array.from(new global.Set(arr)).sort();
const sha256Csp = (text) => 'sha256-' + createHash('sha256').update(Buffer.from(text, 'utf8')).digest('base64');
const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const pad = (n) => String(n).padStart(6, '0');

function getAttr(attrs, name) {
  const m = attrs.match(new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i'));
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? '';
}

function commentRanges(html) {
  const ranges = [];
  const re = /<!--[\s\S]*?-->/g;
  let m;
  while ((m = re.exec(html)) !== null) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

const inComment = (ranges, index) => ranges.some(([a, b]) => index >= a && index < b);

function originOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Literales http(s) dentro de codigo JS, clasificados de forma conservadora. */
function jsUrlLiterals(code, file, line0, out) {
  const re = /https?:\/\/[^\s'"`)]+/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const raw = m[0].replace(/[.,;]+$/, '');
    const origin = originOf(raw);
    if (!origin) continue;
    // Un literal que apunta a un .js es una carga de script; el resto se trata
    // como trafico XHR/fetch/beacon, la lectura mas restrictiva razonable.
    const isScript = /\.js(?:[?#]|$)/.test(raw);
    out.push({
      origin,
      directive: isScript ? 'script-src' : 'connect-src',
      file,
      line: line0 + lineOf(code, m.index) - 1,
      source: isScript ? 'js-literal-script-url' : 'js-literal-network-url'
    });
  }
}

function detectInjection(code, file, line0) {
  const hits = [];
  const re = /createElement\s*\(/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    hits.push({
      file,
      line: line0 + lineOf(code, m.index) - 1,
      pattern: 'createElement(...) con asignacion de src: carga dinamica de script'
    });
  }
  return /\.src\s*=/.test(code) ? hits : [];
}

const countEval = (code) => (code.match(/\beval\s*\(|new\s+Function\s*\(/g) || []).length;

function scanHtml(file, html, acc) {
  const ranges = commentRanges(html);

  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  let idx = 0;
  while ((m = scriptRe.exec(html)) !== null) {
    if (inComment(ranges, m.index)) continue;
    const src = getAttr(m[1], 'src');
    const line = lineOf(html, m.index);
    if (src) {
      const origin = originOf(src);
      if (origin) acc.origins.push({ origin, directive: 'script-src', file, line, source: 'script[src]' });
    } else {
      const body = m[2];
      acc.inlineScripts.push({
        file,
        index: idx++,
        line,
        bytes: Buffer.byteLength(body, 'utf8'),
        sha256_csp: sha256Csp(body)
      });
      jsUrlLiterals(body, file, line, acc.origins);
      acc.dynamicInjection.push(...detectInjection(body, file, line));
      acc.evalUsage += countEval(body);
    }
  }

  const styleRe = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;
  let sidx = 0;
  while ((m = styleRe.exec(html)) !== null) {
    if (inComment(ranges, m.index)) continue;
    acc.inlineStyleElements.push({
      file,
      index: sidx++,
      line: lineOf(html, m.index),
      bytes: Buffer.byteLength(m[2], 'utf8'),
      sha256_csp: sha256Csp(m[2])
    });
  }

  const tagRe = /<(link|img|iframe|form|a)\b([^>]*)>/gi;
  while ((m = tagRe.exec(html)) !== null) {
    if (inComment(ranges, m.index)) continue;
    const tag = m[1].toLowerCase();
    const attrs = m[2];
    const line = lineOf(html, m.index);
    if (tag === 'link') {
      const href = getAttr(attrs, 'href');
      const rel = (getAttr(attrs, 'rel') || '').toLowerCase();
      const origin = originOf(href || '');
      if (!origin) continue;
      if (rel.includes('stylesheet')) acc.origins.push({ origin, directive: 'style-src', file, line, source: 'link[rel=stylesheet]' });
      else if (rel.includes('icon')) acc.origins.push({ origin, directive: 'img-src', file, line, source: 'link[rel=icon]' });
      else acc.nonDirective.push({ origin, file, line, source: 'link[rel=' + rel + ']: preconnect/dns-prefetch no requiere directiva' });
    } else if (tag === 'img') {
      const origin = originOf(getAttr(attrs, 'src') || '');
      if (origin) acc.origins.push({ origin, directive: 'img-src', file, line, source: 'img[src]' });
    } else if (tag === 'iframe') {
      const origin = originOf(getAttr(attrs, 'src') || '');
      if (origin) acc.origins.push({ origin, directive: 'frame-src', file, line, source: 'iframe[src]' });
    } else if (tag === 'form') {
      const action = getAttr(attrs, 'action');
      const origin = action ? originOf(action) : null;
      acc.forms.push({ file, line, has_action_attribute: Boolean(action), action_origin: origin });
      if (origin) acc.origins.push({ origin, directive: 'form-action', file, line, source: 'form[action]' });
    } else if (tag === 'a') {
      const origin = originOf(getAttr(attrs, 'href') || '');
      if (origin) acc.nonDirective.push({ origin, file, line, source: 'a[href]: navegacion de usuario, CSP no la cubre' });
    }
  }

  const handlerRe = /\s(on[a-zA-Z]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  while ((m = handlerRe.exec(html)) !== null) {
    if (inComment(ranges, m.index)) continue;
    const value = m[2] ?? m[3] ?? '';
    acc.handlers.push({
      file,
      attribute: m[1].toLowerCase(),
      line: lineOf(html, m.index),
      sha256_csp: sha256Csp(value),
      has_html_entities: /&[a-zA-Z#][a-zA-Z0-9]*;/.test(value)
    });
  }

  acc.inlineStyleAttributes += (html.match(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*')/g) || []).length;
}

function scanJs(file, code, acc) {
  jsUrlLiterals(code, file, 1, acc.origins);
  acc.dynamicInjection.push(...detectInjection(code, file, 1));
  acc.evalUsage += countEval(code);
}

function scanCss(file, css, acc) {
  const re = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\)/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    const origin = originOf(raw);
    if (origin) acc.origins.push({ origin, directive: 'img-src', file, line: lineOf(css, m.index), source: 'css url()' });
    else if (raw.startsWith('data:')) acc.cssDataUrls += 1;
  }
  const imp = /@import\s+(?:url\()?\s*["']?(https?:\/\/[^"')\s]+)/g;
  while ((m = imp.exec(css)) !== null) {
    const origin = originOf(m[1]);
    if (origin) acc.origins.push({ origin, directive: 'style-src', file, line: lineOf(css, m.index), source: 'css @import' });
  }
}

/** Origenes que se deducen de otros (no aparecen como URL en el repositorio). */
function derivedOrigins(origins) {
  const derived = [];
  const hasGoogleFontsCss = origins.some((o) => o.directive === 'style-src' && o.origin === 'https://fonts.googleapis.com');
  if (hasGoogleFontsCss) {
    derived.push({
      origin: 'https://fonts.gstatic.com',
      directive: 'font-src',
      reason: 'la hoja de fonts.googleapis.com referencia archivos de fuente alojados en fonts.gstatic.com'
    });
  }
  return derived;
}

/** Fuentes declaradas en el header CSP heredado (enforcing) de vercel.json. */
function legacyHeaderSources(repoRoot) {
  const parsed = JSON.parse(readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'));
  const rule = (parsed.headers || []).find((h) => h.source === '/(.*)');
  const header = ((rule && rule.headers) || []).find((h) => h[HEADER_NAME_FIELD] === 'Content-Security-Policy');
  if (!header) return { present: false, sha256: null, sources_by_directive: {}, wildcard_sources: [] };
  const byDirective = {};
  const wildcards = [];
  for (const part of header.value.split(';')) {
    const pieces = part.trim().split(/\s+/).filter(Boolean);
    if (pieces.length === 0) continue;
    byDirective[pieces[0]] = pieces.slice(1);
    for (const s of pieces.slice(1)) {
      if (s === 'https:' || s === 'http:' || s.includes('*')) wildcards.push(pieces[0] + ' ' + s);
    }
  }
  return {
    present: true,
    sha256: createHash('sha256').update(Buffer.from(header.value, 'utf8')).digest('hex'),
    sources_by_directive: byDirective,
    wildcard_sources: uniqSorted(wildcards)
  };
}

export function buildInventory(repoRoot = REPO_ROOT) {
  const acc = {
    origins: [],
    nonDirective: [],
    inlineScripts: [],
    inlineStyleElements: [],
    inlineStyleAttributes: 0,
    handlers: [],
    dynamicInjection: [],
    forms: [],
    evalUsage: 0,
    cssDataUrls: 0
  };

  const files = [];
  for (const rel of SITE_FILES) {
    const buf = readFileSync(path.join(repoRoot, rel));
    const text = buf.toString('utf8');
    files.push({
      path: rel,
      bytes: buf.length,
      sha256: createHash('sha256').update(buf).digest('hex'),
      line_endings: text.includes('\r\n') ? 'CRLF' : 'LF'
    });
    if (rel.endsWith('.html')) scanHtml(rel, text, acc);
    else if (rel.endsWith('.js')) scanJs(rel, text, acc);
    else if (rel.endsWith('.css')) scanCss(rel, text, acc);
  }

  const derived = derivedOrigins(acc.origins);

  const originsByDirective = {};
  for (const d of DIRECTIVES) {
    originsByDirective[d] = uniqSorted([
      ...acc.origins.filter((o) => o.directive === d).map((o) => o.origin),
      ...derived.filter((o) => o.directive === d).map((o) => o.origin),
      ...RUNTIME_EXPECTED.filter((o) => o.directive === d).map((o) => o.origin)
    ]);
  }

  const originDetails = acc.origins
    .map((o) => ({ origin: o.origin, directive: o.directive, file: o.file, line: o.line, source: o.source }))
    .sort((a, b) => (a.directive + a.origin + a.file + pad(a.line)).localeCompare(b.directive + b.origin + b.file + pad(b.line)));

  const handlers = [];
  for (const h of acc.handlers) {
    const prev = handlers.find((x) => x.file === h.file && x.attribute === h.attribute && x.sha256_csp === h.sha256_csp);
    if (prev) {
      prev.count += 1;
      prev.lines.push(h.line);
    } else {
      handlers.push({
        file: h.file,
        attribute: h.attribute,
        sha256_csp: h.sha256_csp,
        has_html_entities: h.has_html_entities,
        count: 1,
        lines: [h.line]
      });
    }
  }
  for (const h of handlers) h.lines.sort((a, b) => a - b);
  handlers.sort((a, b) => (a.file + a.attribute + a.sha256_csp).localeCompare(b.file + b.attribute + b.sha256_csp));

  const nonDirective = uniqSorted(acc.nonDirective.map((o) => o.origin)).map((origin) => ({
    origin,
    occurrences: acc.nonDirective.filter((o) => o.origin === origin).length,
    note: acc.nonDirective.find((o) => o.origin === origin).source
  }));

  return {
    _about: 'Inventario CSP generado por security/csp/inventory.mjs (WP-SEC-11). Solo conteos y hashes: no contiene el contenido de los scripts. Regenerar: node security/csp/inventory.mjs --write',
    schema_version: 1,
    files,
    origins_by_directive: originsByDirective,
    origin_details: originDetails,
    derived_origins: derived,
    runtime_expected_origins: RUNTIME_EXPECTED,
    non_directive_origins: nonDirective,
    inline_scripts: acc.inlineScripts,
    inline_script_hashes: uniqSorted(acc.inlineScripts.map((s) => s.sha256_csp)),
    inline_style_elements: acc.inlineStyleElements,
    inline_style_attribute_count: acc.inlineStyleAttributes,
    event_handler_attributes: handlers,
    event_handler_hashes: uniqSorted(acc.handlers.map((h) => h.sha256_csp)),
    dynamic_script_injection: acc.dynamicInjection.sort((a, b) => (a.file + pad(a.line)).localeCompare(b.file + pad(b.line))),
    forms: acc.forms,
    eval_or_new_function_occurrences: acc.evalUsage,
    css_data_url_count: acc.cssDataUrls,
    legacy_enforcing_csp: legacyHeaderSources(repoRoot)
  };
}

export function readInventory(file = INVENTORY_PATH) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export const serialize = (inv) => JSON.stringify(inv, null, 2) + '\n';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inv = buildInventory();
  if (process.argv.includes('--write')) {
    writeFileSync(INVENTORY_PATH, serialize(inv), 'utf8');
    console.log('INVENTORY.json actualizado: ' + INVENTORY_PATH);
  } else {
    console.log(serialize(inv));
  }
}
