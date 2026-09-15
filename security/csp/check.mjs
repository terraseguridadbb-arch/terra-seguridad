/**
 * WP-SEC-11 (preparatorio) - Verificacion de la politica CSP Report-Only.
 *
 * No hace red ni despliega: solo lee vercel.json, INVENTORY.json y los archivos
 * del sitio. Se usa desde check.test.mjs (node --test) y como CLI:
 *
 *   node security/csp/check.mjs      (salida legible, exit 1 si algo falla)
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { REPO_ROOT, HEADER_NAME_FIELD, DIRECTIVES, buildInventory, readInventory, serialize, INVENTORY_PATH } from './inventory.mjs';
import { buildPolicy, applyPolicy, REPORT_ONLY_HEADER_NAME, LEGACY_HEADER_NAME, ALL_ROUTES, VERCEL_CONFIG_PATH } from './build-policy.mjs';

/**
 * Baseline del header CSP enforcing heredado (el que ya estaba en produccion
 * antes de WP-SEC-11). WP-SEC-11 NO lo modifica: agrega uno Report-Only al lado.
 * Si este sha256 cambia, alguien cambio el comportamiento real del sitio.
 */
export const LEGACY_ENFORCING_CSP_SHA256 = 'c14cbc3928257e9b1d9378f1060fa02a3ec393cdc1d3b4a7b1238be418b5355a';

/** Fuentes literales permitidas ademas de origenes y hashes. */
const ALLOWED_KEYWORDS = ["'self'", "'none'", "'unsafe-hashes'", "'unsafe-inline'", 'data:'];

/**
 * El repositorio se clona en Windows con core.autocrlf=true, asi que
 * INVENTORY.json puede quedar en disco con CRLF aunque el generador escriba LF.
 * La comparacion de "inventario al dia" normaliza finales de linea: lo que
 * importa es el contenido, no como lo materializo git.
 * OJO: esto NO aplica a los hashes de los scripts inline, que se calculan sobre
 * los bytes tal cual estan versionados (hoy CRLF). Ver README.md.
 */
export const normalizeEol = (text) => text.replace(/\r\n/g, '\n');

export function loadVercelConfig(file = VERCEL_CONFIG_PATH) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function allRoutesHeaders(config) {
  const rule = (config.headers || []).find((h) => h.source === ALL_ROUTES);
  return (rule && rule.headers) || [];
}

export function findHeader(config, name) {
  return allRoutesHeaders(config).find((h) => h[HEADER_NAME_FIELD] === name) || null;
}

export function parsePolicy(value) {
  const parsed = {};
  for (const part of value.split(';')) {
    const pieces = part.trim().split(/\s+/).filter(Boolean);
    if (pieces.length === 0) continue;
    parsed[pieces[0]] = pieces.slice(1);
  }
  return parsed;
}

const isHash = (s) => /^'(sha256|sha384|sha512)-[A-Za-z0-9+/=]+'$/.test(s);
const isOrigin = (s) => /^https?:\/\//.test(s);

export function runChecks(repoRoot = REPO_ROOT) {
  const results = [];
  const add = (id, title, ok, details = []) => results.push({ id, title, ok, details });

  const configPath = path.join(repoRoot, 'vercel.json');
  const raw = readFileSync(configPath, 'utf8');

  let config = null;
  let jsonError = null;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    jsonError = err.message;
  }

  if (!config) {
    add('C0', 'vercel.json es JSON valido', false, ['JSON.parse fallo: ' + jsonError]);
    return results;
  }
  add('C0', 'vercel.json es JSON valido', true, []);

  const inventory = readInventory(path.join(repoRoot, 'security', 'csp', 'INVENTORY.json'));
  const reportOnly = findHeader(config, REPORT_ONLY_HEADER_NAME);
  const legacy = findHeader(config, LEGACY_HEADER_NAME);

  // C5a: el header es Report-Only (no bloqueante) y cubre todas las rutas.
  add('C5', 'El header CSP nuevo es Report-Only y aplica a ' + ALL_ROUTES, Boolean(reportOnly),
    reportOnly ? ['header presente: ' + REPORT_ONLY_HEADER_NAME] : ['falta el header ' + REPORT_ONLY_HEADER_NAME + ' en la regla ' + ALL_ROUTES]);

  if (!reportOnly) return results;

  const policy = parsePolicy(reportOnly.value);
  const flat = Object.values(policy).flat();

  // C5b: el header enforcing heredado sigue intacto (sin cambio de comportamiento).
  const legacySha = legacy ? createHash('sha256').update(Buffer.from(legacy.value, 'utf8')).digest('hex') : null;
  add('C5b', 'El header enforcing heredado sigue intacto (sha256 baseline)', legacySha === LEGACY_ENFORCING_CSP_SHA256,
    [legacy ? 'sha256 actual: ' + legacySha : 'el header ' + LEGACY_HEADER_NAME + ' fue removido: eso SI cambia el comportamiento del sitio',
      'sha256 esperado: ' + LEGACY_ENFORCING_CSP_SHA256]);

  // C1: todo origen del inventario aparece en su directiva.
  const missing = [];
  for (const d of DIRECTIVES) {
    for (const origin of inventory.origins_by_directive[d] || []) {
      if (!(policy[d] || []).includes(origin)) missing.push(d + ' <- ' + origin);
    }
  }
  add('C1', 'Todo origen del inventario esta en su directiva', missing.length === 0, missing);

  // C2: sin comodin de esquema ni asterisco.
  const wildcards = flat.filter((s) => s === 'https:' || s === 'http:' || s === '*' || (!isHash(s) && s.includes('*')));
  add('C2', "Sin comodin 'https:' ni '*' como fuente", wildcards.length === 0, wildcards);

  // C3: sin unsafe-eval; unsafe-inline solo tolerado en style-src.
  const evalHits = flat.filter((s) => s === "'unsafe-eval'" || s === "'wasm-unsafe-eval'");
  const inlineHits = Object.entries(policy)
    .filter(([name, sources]) => name !== 'style-src' && sources.includes("'unsafe-inline'"))
    .map(([name]) => name);
  add('C3', "Sin 'unsafe-eval'; 'unsafe-inline' solo en style-src", evalHits.length === 0 && inlineHits.length === 0,
    [...evalHits, ...inlineHits.map((d) => "'unsafe-inline' en " + d)]);

  // C4: cada script inline y cada atributo on* tiene su hash en script-src.
  const scriptSrc = policy['script-src'] || [];
  const missingHashes = [
    ...inventory.inline_script_hashes.filter((h) => !scriptSrc.includes("'" + h + "'")).map((h) => 'inline script ' + h),
    ...inventory.event_handler_hashes.filter((h) => !scriptSrc.includes("'" + h + "'")).map((h) => 'atributo on* ' + h)
  ];
  if (inventory.event_handler_hashes.length > 0 && !scriptSrc.includes("'unsafe-hashes'")) {
    missingHashes.push("faltan 'unsafe-hashes': los hashes de atributos on* no aplican sin esa palabra clave");
  }
  add('C4', 'Cada script inline y atributo on* esta cubierto por hash', missingHashes.length === 0, missingHashes);

  // C6: el inventario esta al dia (se regenera en memoria y se compara).
  const regenerated = normalizeEol(serialize(buildInventory(repoRoot)));
  const onDisk = normalizeEol(readFileSync(path.join(repoRoot, 'security', 'csp', 'INVENTORY.json'), 'utf8'));
  add('C6', 'INVENTORY.json coincide con el estado actual del sitio', regenerated === onDisk,
    regenerated === onDisk ? [] : ['regenerar con: node security/csp/inventory.mjs --write']);

  // C7: el header es reproducible desde el inventario.
  const expected = buildPolicy(inventory);
  add('C7', 'El header Report-Only es reproducible desde INVENTORY.json', reportOnly.value === expected,
    reportOnly.value === expected ? [] : ['regenerar con: node security/csp/build-policy.mjs --write']);

  // C8: no hay fuentes sin respaldo en el inventario.
  const known = DIRECTIVES.reduce((acc, d) => acc.concat(inventory.origins_by_directive[d] || []), []);
  const hashes = [...inventory.inline_script_hashes, ...inventory.event_handler_hashes].map((h) => "'" + h + "'");
  const unexplained = [];
  for (const [name, sources] of Object.entries(policy)) {
    for (const s of sources) {
      if (ALLOWED_KEYWORDS.includes(s) || hashes.includes(s)) continue;
      if (isOrigin(s) && known.includes(s)) continue;
      unexplained.push(name + ' ' + s);
    }
  }
  add('C8', 'Ninguna fuente del header carece de respaldo en el inventario', unexplained.length === 0, unexplained);

  // C9: directivas de contencion presentes.
  const required = ['default-src', 'base-uri', 'object-src', 'frame-ancestors', 'form-action'];
  const absent = required.filter((d) => !policy[d]);
  add('C9', 'Directivas de contencion presentes (' + required.join(', ') + ')', absent.length === 0, absent);

  // C10: escribir la politica no rompe el resto de vercel.json.
  const reapplied = applyPolicy(config, expected);
  add('C10', 'applyPolicy es idempotente y conserva los headers existentes',
    JSON.stringify(reapplied) === JSON.stringify(config), []);

  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = runChecks();
  for (const r of results) {
    console.log((r.ok ? 'OK   ' : 'FALLA') + ' ' + r.id + ' ' + r.title);
    for (const d of r.details) console.log('        - ' + d);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' verificaciones OK');
  process.exitCode = failed === 0 ? 0 : 1;
}
