/**
 * WP-SEC-13 - Tests de la allowlist CSP (DR-W3-08).
 * Ejecutar:  node --test security/csp/*.test.mjs
 * No hacen red, no despliegan y no modifican archivos.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DIRECTIVES, readInventory } from './inventory.mjs';
import { buildPolicy } from './build-policy.mjs';
import { parsePolicy, normalizeEol } from './check.mjs';
import {
  ALLOWLIST_PATH,
  ESTADOS,
  COMPONENTES,
  COMPONENTE_POR_ORIGEN,
  VERIFICADOS_POR_REPORTE,
  buildAllowlist,
  readAllowlist,
  serializeAllowlist,
  esOrigenExacto
} from './allowlist.mjs';

const inventory = readInventory();
const allowlist = readAllowlist();
const entradas = Object.values(allowlist.por_directiva).flat();
const politica = parsePolicy(buildPolicy(inventory));

test('ALLOWLIST.json esta al dia respecto de INVENTORY.json', () => {
  const regenerada = normalizeEol(serializeAllowlist(buildAllowlist(inventory)));
  const enDisco = normalizeEol(readFileSync(ALLOWLIST_PATH, 'utf8'));
  assert.equal(regenerada, enDisco, 'regenerar con: node security/csp/allowlist.mjs --write');
});

test('cubre todas las directivas del inventario y ningun origen de mas', () => {
  assert.deepEqual(Object.keys(allowlist.por_directiva).sort(), [...DIRECTIVES].sort());
  for (const d of DIRECTIVES) {
    const esperados = [...(inventory.origins_by_directive[d] || [])].sort();
    const listados = allowlist.por_directiva[d].map((e) => e.origin).sort();
    assert.deepEqual(listados, esperados, 'divergencia en ' + d);
  }
});

test('cada origen declara la pieza que lo requiere y un estado valido', () => {
  assert.ok(entradas.length > 0);
  for (const e of entradas) {
    assert.ok(COMPONENTES[e.componente], 'pieza desconocida: ' + e.componente + ' (' + e.origin + ')');
    assert.equal(e.componente_label, COMPONENTES[e.componente]);
    assert.ok(ESTADOS.includes(e.estado), 'estado invalido: ' + e.estado);
    assert.ok(Array.isArray(e.evidencia) && e.evidencia.length > 0, 'origen sin evidencia: ' + e.origin);
  }
});

test('ningun comodin en la allowlist', () => {
  for (const e of entradas) {
    assert.ok(esOrigenExacto(e.origin), 'origen no exacto: ' + e.origin);
    assert.ok(e.origin.startsWith('https://'), 'origen sin TLS: ' + e.origin);
  }
  const texto = JSON.stringify(allowlist.por_directiva);
  assert.ok(!texto.includes('*'), 'aparecio un comodin en por_directiva');
});

test('un origen solo puede ser PROBADO con evidencia registrada', () => {
  const probados = entradas.filter((e) => e.estado === 'PROBADO');
  assert.equal(probados.length, VERIFICADOS_POR_REPORTE.length, 'hay PROBADO sin entrada en VERIFICADOS_POR_REPORTE');
  for (const p of probados) {
    assert.equal(p.evidencia[0].tipo, 'reporte-o-prueba-registrada');
    assert.ok(String(p.evidencia[0].evidencia).length > 0);
  }
  assert.equal(allowlist.resumen.por_estado.PROBADO, probados.length);
  assert.equal(allowlist.resumen.total, entradas.length);
});

test('los PENDIENTE son exactamente los que solo se esperan en runtime', () => {
  const runtime = new global.Set((inventory.runtime_expected_origins || []).map((r) => r.directive + '@' + r.origin));
  const estaticos = new global.Set((inventory.origin_details || []).map((r) => r.directive + '@' + r.origin));
  const derivados = new global.Set((inventory.derived_origins || []).map((r) => r.directive + '@' + r.origin));
  for (const [d, lista] of Object.entries(allowlist.por_directiva)) {
    for (const e of lista) {
      const clave = d + '@' + e.origin;
      if (e.estado === 'PENDIENTE') {
        assert.ok(runtime.has(clave), 'PENDIENTE sin respaldo de runtime_expected: ' + clave);
        assert.ok(!estaticos.has(clave), 'tiene evidencia estatica y quedo PENDIENTE: ' + clave);
      }
      if (e.estado === 'INVENTARIADO') {
        assert.ok(estaticos.has(clave) || derivados.has(clave), 'INVENTARIADO sin evidencia estatica: ' + clave);
      }
    }
  }
});

test('la allowlist y el header Report-Only coinciden origen a origen', () => {
  const permitidos = new global.Set(entradas.map((e) => e.origin));
  for (const [directiva, fuentes] of Object.entries(politica)) {
    for (const s of fuentes) {
      if (s.startsWith("'") || s === 'data:') continue;
      assert.ok(permitidos.has(s), 'el header trae ' + s + ' en ' + directiva + ' y no esta en la allowlist');
      const enEsaDirectiva = (allowlist.por_directiva[directiva] || []).some((e) => e.origin === s);
      assert.ok(enEsaDirectiva, s + ' no esta permitido en ' + directiva);
    }
  }
});

test('GTM entra por hash del snippet, no por confianza irrestricta', () => {
  assert.ok((politica['script-src'] || []).includes('https://www.googletagmanager.com'));
  assert.ok(!(politica['script-src'] || []).includes("'unsafe-inline'"));
  assert.ok(!(politica['script-src'] || []).includes("'strict-dynamic'"));
  const hashes = (politica['script-src'] || []).filter((s) => s.startsWith("'sha256-"));
  assert.ok(hashes.length >= inventory.inline_script_hashes.length, 'faltan hashes de scripts inline');
  assert.equal(allowlist.hashes.inline_script_hashes, inventory.inline_script_hashes.length);
  assert.equal(allowlist.hashes.event_handler_hashes, inventory.event_handler_hashes.length);
  assert.ok(allowlist.confianza_gtm.consecuencia.includes('reportes'), 'debe documentar que las etiquetas de GTM se agregan de a una');
});

test('las fuentes del header heredado que no se adoptan quedan fuera de la politica', () => {
  const fuera = allowlist.no_incluidos.fuentes;
  assert.ok(Array.isArray(fuera) && fuera.length > 0);
  const enPolitica = new global.Set(Object.values(politica).flat());
  for (const f of fuera) assert.ok(!enPolitica.has(f), 'una fuente no adoptada aparecio en la politica: ' + f);
  const permitidos = new global.Set(entradas.map((e) => e.origin));
  for (const f of fuera) assert.ok(!permitidos.has(f), 'una fuente no adoptada aparecio en la allowlist: ' + f);
});

test('toda pieza declarada se usa y todo origen mapeado existe en el inventario', () => {
  const usadas = new global.Set(entradas.map((e) => e.componente));
  for (const id of Object.keys(COMPONENTES)) assert.ok(usadas.has(id), 'pieza declarada y no usada: ' + id);
  const delInventario = new global.Set(DIRECTIVES.flatMap((d) => inventory.origins_by_directive[d] || []));
  for (const origin of Object.keys(COMPONENTE_POR_ORIGEN)) {
    assert.ok(delInventario.has(origin), 'origen mapeado que ya no esta en el inventario: ' + origin);
  }
});

test('la allowlist declara su modo y no se presenta como enforcing', () => {
  assert.ok(allowlist.modo.includes('Report-Only'));
  assert.ok(allowlist.modo.includes('NO esta en enforcing'));
});
