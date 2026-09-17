/**
 * WP-SEC-13 - Tests del endpoint parametrizado y del minimizador de reportes.
 * Ejecutar:  node --test security/csp/*.test.mjs
 * No hacen red, no despliegan y no modifican archivos.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readInventory } from './inventory.mjs';
import { buildPolicy, REPORT_ENDPOINT, REPORT_ONLY_HEADER_NAME, LEGACY_HEADER_NAME } from './build-policy.mjs';
import { findHeader, loadVercelConfig, parsePolicy } from './check.mjs';
import {
  REPORT_ENDPOINT_URL,
  REPORT_ENDPOINT_NAME,
  CAMPOS_CONSERVADOS,
  CAMPOS_DESCARTADOS,
  reportingDirectives,
  reportingEndpointsHeader,
  normalizeReport,
  normalizeBatch,
  blockedOrigin,
  documentPath,
  directiveName,
  MAX_PATH
} from './report-minimize.mjs';

/**
 * Destino de prueba. `.invalid` es un TLD reservado por RFC 2606 que nunca
 * resuelve: no es un endpoint real ni una propuesta de endpoint. Solo existe
 * dentro de este test para comprobar la parametrizacion.
 */
const DESTINO_DE_PRUEBA = 'https://reportes.invalid/csp';

const politica = buildPolicy(readInventory());

test('el endpoint de reportes esta parametrizado y hoy esta vacio', () => {
  assert.equal(REPORT_ENDPOINT_URL, '', 'no inventar un endpoint: completarlo es una decision humana');
  assert.equal(REPORT_ENDPOINT, null, 'build-policy debe seguir viendo el endpoint como ausente');
  assert.deepEqual(reportingDirectives(), []);
  assert.equal(reportingEndpointsHeader(), null);
});

test('sin endpoint, la politica no declara report-uri ni report-to', () => {
  assert.ok(!politica.includes('report-uri'), politica);
  assert.ok(!politica.includes('report-to'), politica);
});

test('con un endpoint parametrizado se generan las dos directivas y el header', () => {
  assert.deepEqual(reportingDirectives(DESTINO_DE_PRUEBA), [
    'report-uri ' + DESTINO_DE_PRUEBA,
    'report-to ' + REPORT_ENDPOINT_NAME
  ]);
  assert.deepEqual(reportingEndpointsHeader(DESTINO_DE_PRUEBA), {
    key: 'Reporting-Endpoints',
    value: REPORT_ENDPOINT_NAME + '="' + DESTINO_DE_PRUEBA + '"'
  });
  // Espacios en blanco tampoco son un endpoint.
  assert.deepEqual(reportingDirectives('   '), []);
});

test('la politica publicada sigue siendo Report-Only (no bloquea)', () => {
  const config = loadVercelConfig();
  const reportOnly = findHeader(config, REPORT_ONLY_HEADER_NAME);
  assert.ok(reportOnly, 'falta el header Report-Only');
  assert.equal(reportOnly.value, politica, 'el header no es reproducible desde el inventario');
  const legacy = findHeader(config, LEGACY_HEADER_NAME);
  assert.ok(legacy, 'el header enforcing heredado no debe tocarse en este paquete');
});

test('la politica no tiene comodines y no confia en scripts inline arbitrarios', () => {
  const parsed = parsePolicy(politica);
  const fuentes = Object.values(parsed).flat();
  const comodines = fuentes.filter((s) => s === 'https:' || s === 'http:' || (!s.startsWith("'") && s.includes('*')));
  assert.deepEqual(comodines, []);
  assert.ok(!(parsed['script-src'] || []).includes("'unsafe-inline'"));
  assert.ok(!(parsed['script-src'] || []).includes("'unsafe-eval'"));
  assert.ok(!(parsed['script-src'] || []).includes("'strict-dynamic'"), 'strict-dynamic confiaria en todo lo que GTM cargue: es una decision abierta (README, opcion A)');
});

test('el normalizador conserva exactamente los cuatro campos declarados', () => {
  const crudo = {
    'csp-report': {
      'document-uri': 'https://terraseguridad.com.ar/gracias.html?utm_source=meta&email=alguien%40ejemplo.com',
      referrer: 'https://www.google.com/search?q=alarmas',
      'violated-directive': "script-src-elem 'self'",
      'effective-directive': 'script-src-elem',
      'original-policy': "default-src 'self'; script-src 'self'",
      disposition: 'report',
      'blocked-uri': 'https://cdn.tercero.example/tag.js?id=GTM-XXXX&u=123',
      'line-number': 42,
      'column-number': 17,
      'source-file': 'https://terraseguridad.com.ar/main.js',
      'status-code': 200,
      'script-sample': 'const token = "valor-sensible"'
    }
  };
  const limpio = normalizeReport(crudo);
  assert.deepEqual(Object.keys(limpio).sort(), [...CAMPOS_CONSERVADOS].sort());
  assert.equal(limpio['effective-directive'], 'script-src-elem');
  assert.equal(limpio['blocked-uri'], 'https://cdn.tercero.example');
  assert.equal(limpio['document-uri'], 'https://terraseguridad.com.ar/gracias.html');
  assert.equal(limpio.disposition, 'report');

  const serializado = JSON.stringify(limpio);
  for (const campo of CAMPOS_DESCARTADOS) assert.ok(!serializado.includes(campo), 'quedo el campo ' + campo);
  for (const rastro of ['token', 'valor-sensible', 'utm_source', 'email', 'ejemplo.com', 'main.js', 'google.com', 'GTM-XXXX', '42', '17']) {
    assert.ok(!serializado.includes(rastro), 'el reporte minimizado todavia contiene: ' + rastro);
  }
});

test('el normalizador entiende el formato de la Reporting API (report-to)', () => {
  const limpio = normalizeReport({
    type: 'csp-violation',
    age: 12,
    url: 'https://terraseguridad.com.ar/?utm_campaign=x',
    user_agent: 'Mozilla/5.0 (huella del visitante)',
    body: {
      documentURL: 'https://terraseguridad.com.ar/?utm_campaign=x',
      referrer: 'https://www.facebook.com/',
      blockedURL: 'https://connect.facebook.net/es_LA/fbevents.js',
      effectiveDirective: 'script-src-elem',
      originalPolicy: "script-src 'self'",
      sourceFile: 'https://terraseguridad.com.ar/index.html',
      sample: 'fbq("track","Lead")',
      lineNumber: 28,
      columnNumber: 5,
      statusCode: 200,
      disposition: 'report'
    }
  });
  assert.deepEqual(Object.keys(limpio).sort(), [...CAMPOS_CONSERVADOS].sort());
  assert.equal(limpio['blocked-uri'], 'https://connect.facebook.net');
  assert.equal(limpio['document-uri'], 'https://terraseguridad.com.ar/');
  const serializado = JSON.stringify(limpio);
  for (const rastro of ['fbq', 'Mozilla', 'utm_campaign', 'index.html', 'sample']) {
    assert.ok(!serializado.includes(rastro), 'el reporte minimizado todavia contiene: ' + rastro);
  }
});

test('blocked-uri nunca conserva path, query ni payload', () => {
  assert.equal(blockedOrigin('https://www.google-analytics.com/g/collect?v=2&cid=999'), 'https://www.google-analytics.com');
  assert.equal(blockedOrigin('http://localhost:3000/x/y'), 'http://localhost:3000');
  assert.equal(blockedOrigin('inline'), 'inline');
  assert.equal(blockedOrigin('eval'), 'eval');
  assert.equal(blockedOrigin('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmc='), 'data:');
  assert.equal(blockedOrigin('blob:https://terraseguridad.com.ar/9f0a-1111'), 'blob:');
  assert.equal(blockedOrigin(''), 'unknown');
  assert.equal(blockedOrigin('no-es-una-url /etc'), 'other');
});

test('document-uri conserva el path pero nunca la query ni el fragmento, y se trunca', () => {
  assert.equal(documentPath('https://terraseguridad.com.ar/politicas.html?x=1#seccion'), 'https://terraseguridad.com.ar/politicas.html');
  assert.equal(documentPath('https://terraseguridad.com.ar'), 'https://terraseguridad.com.ar/');
  const largo = 'https://terraseguridad.com.ar/' + 'a'.repeat(MAX_PATH + 50) + '?token=x';
  const salida = documentPath(largo);
  assert.ok(salida.endsWith('...'), salida.slice(0, 60));
  assert.ok(!salida.includes('token'));
  assert.equal(documentPath(''), 'unknown');
});

test('directiveName se queda con el nombre y descarta las fuentes', () => {
  assert.equal(directiveName("script-src 'self' https://www.googletagmanager.com"), 'script-src');
  assert.equal(directiveName('style-src-elem'), 'style-src-elem');
  assert.equal(directiveName(undefined), 'unknown');
  assert.equal(directiveName(12345), 'unknown');
});

test('la minimizacion es idempotente y descarta entradas invalidas', () => {
  const unaVez = normalizeReport({ 'csp-report': { 'effective-directive': 'img-src', 'blocked-uri': 'https://x.example/a?b=c', 'document-uri': 'https://terraseguridad.com.ar/?q=1', disposition: 'report' } });
  assert.deepEqual(normalizeReport(unaVez), unaVez);
  assert.equal(normalizeReport(null), null);
  assert.equal(normalizeReport('texto'), null);
  assert.equal(normalizeReport([1, 2]), null);
  assert.deepEqual(normalizeBatch([null, 'x', unaVez]), [unaVez]);
  assert.deepEqual(normalizeBatch('no es lista'), []);
});

test('un reporte sin campos conocidos no revienta y no inventa datos', () => {
  const limpio = normalizeReport({});
  assert.deepEqual(limpio, {
    'effective-directive': 'unknown',
    'blocked-uri': 'unknown',
    'document-uri': 'unknown',
    disposition: 'unknown'
  });
});
