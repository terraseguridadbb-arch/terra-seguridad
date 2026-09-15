/**
 * WP-SEC-11 (preparatorio) - Tests de la politica CSP Report-Only.
 * Ejecutar:  node --test security/csp/*.test.mjs
 * No hacen red, no despliegan y no modifican archivos.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, HEADER_NAME_FIELD, DIRECTIVES, buildInventory, readInventory, serialize } from './inventory.mjs';
import { buildPolicy, REPORT_ONLY_HEADER_NAME, LEGACY_HEADER_NAME, ALL_ROUTES, REPORT_ENDPOINT } from './build-policy.mjs';
import { runChecks, parsePolicy, findHeader, loadVercelConfig, normalizeEol, LEGACY_ENFORCING_CSP_SHA256 } from './check.mjs';

const results = runChecks();
const resultOf = (id) => {
  const r = results.find((x) => x.id === id);
  assert.ok(r, 'no existe la verificacion ' + id);
  return r;
};
const expectOk = (id) => {
  const r = resultOf(id);
  assert.equal(r.ok, true, r.id + ' ' + r.title + ' -> ' + r.details.join(' | '));
};

const config = loadVercelConfig();
const inventory = readInventory();
const reportOnly = findHeader(config, REPORT_ONLY_HEADER_NAME);
const policy = parsePolicy(reportOnly.value);

test('vercel.json sigue siendo JSON valido', () => {
  expectOk('C0');
  assert.doesNotThrow(() => JSON.parse(readFileSync(path.join(REPO_ROOT, 'vercel.json'), 'utf8')));
});

test('el header es Report-Only (no bloqueante) y aplica a todas las rutas', () => {
  expectOk('C5');
  assert.equal(reportOnly[HEADER_NAME_FIELD], REPORT_ONLY_HEADER_NAME);
  const rule = config.headers.find((h) => h.source === ALL_ROUTES);
  assert.ok(rule, 'falta la regla de headers para ' + ALL_ROUTES);
  assert.ok(rule.headers.includes(reportOnly));
});

test('el header enforcing heredado no fue modificado', () => {
  expectOk('C5b');
  const legacy = findHeader(config, LEGACY_HEADER_NAME);
  assert.ok(legacy, 'el header enforcing heredado desaparecio: eso cambia el comportamiento del sitio');
  assert.equal(typeof LEGACY_ENFORCING_CSP_SHA256, 'string');
});

test('todo origen externo del inventario aparece en su directiva', () => {
  expectOk('C1');
  for (const d of DIRECTIVES) {
    for (const origin of inventory.origins_by_directive[d] || []) {
      assert.ok((policy[d] || []).includes(origin), 'falta ' + origin + ' en ' + d);
    }
  }
});

test("no hay 'https:' ni '*' como fuente", () => {
  expectOk('C2');
  const flat = Object.values(policy).flat();
  assert.ok(!flat.includes('https:'), "la politica contiene el comodin 'https:'");
  assert.ok(!flat.includes('http:'), "la politica contiene el comodin 'http:'");
  for (const s of flat) {
    if (/^'(sha256|sha384|sha512)-/.test(s)) continue;
    assert.ok(!s.includes('*'), 'fuente con comodin: ' + s);
  }
});

test("no hay 'unsafe-eval' y 'unsafe-inline' solo se tolera en style-src", () => {
  expectOk('C3');
  assert.ok(!(policy['script-src'] || []).includes("'unsafe-inline'"));
  assert.equal(inventory.eval_or_new_function_occurrences, 0, 'aparecio eval/new Function en el sitio');
});

test('cada script inline tiene su hash en script-src', () => {
  expectOk('C4');
  assert.ok(inventory.inline_script_hashes.length > 0, 'el inventario no detecto scripts inline');
  for (const h of inventory.inline_script_hashes) {
    assert.ok(policy['script-src'].includes("'" + h + "'"), 'falta el hash ' + h);
  }
});

test("cada atributo on* tiene su hash y la politica incluye 'unsafe-hashes'", () => {
  assert.ok(inventory.event_handler_hashes.length > 0, 'el inventario no detecto atributos on*');
  assert.ok(policy['script-src'].includes("'unsafe-hashes'"));
  for (const h of inventory.event_handler_hashes) {
    assert.ok(policy['script-src'].includes("'" + h + "'"), 'falta el hash de atributo ' + h);
  }
  for (const h of inventory.event_handler_attributes) {
    assert.equal(h.has_html_entities, false, 'atributo con entidades HTML: el hash no coincidiria con el valor decodificado (' + h.file + ':' + h.lines.join(',') + ')');
  }
});

test('el inventario esta al dia (regenerado en memoria)', () => {
  expectOk('C6');
  const regenerated = serialize(buildInventory());
  const onDisk = readFileSync(path.join(REPO_ROOT, 'security', 'csp', 'INVENTORY.json'), 'utf8');
  // Normalizado: con core.autocrlf=true el archivo en disco puede quedar en CRLF.
  assert.equal(normalizeEol(regenerated), normalizeEol(onDisk), 'regenerar con: node security/csp/inventory.mjs --write');
  assert.deepEqual(buildInventory(), JSON.parse(onDisk));
});

test('el header es reproducible desde el inventario', () => {
  expectOk('C7');
  assert.equal(reportOnly.value, buildPolicy(inventory));
});

test('ninguna fuente del header carece de respaldo en el inventario', () => expectOk('C8'));

test('estan las directivas de contencion', () => {
  expectOk('C9');
  assert.deepEqual(policy['frame-ancestors'], ["'none'"]);
  assert.deepEqual(policy['form-action'], ["'self'"]);
  assert.deepEqual(policy['default-src'], ["'self'"]);
  assert.deepEqual(policy['base-uri'], ["'self'"]);
});

test('aplicar la politica conserva el resto de vercel.json', () => expectOk('C10'));

test('el endpoint de reportes sigue pendiente y no se declara en el header', () => {
  assert.equal(REPORT_ENDPOINT, null, 'si ya hay endpoint, actualizar README y este test');
  assert.ok(!reportOnly.value.includes('report-uri'));
  assert.ok(!reportOnly.value.includes('report-to'));
});

test('todas las verificaciones de check.mjs pasan', () => {
  const failed = results.filter((r) => !r.ok);
  assert.deepEqual(failed.map((r) => r.id + ': ' + r.details.join(' | ')), []);
});
