/**
 * NEXT-SEC-15 (DIR18-03) - El aviso publicado y el comportamiento del sitio
 * tienen que decir lo mismo. Estos tests cruzan las dos cosas.
 *
 * Ejecutar:  node --test security/privacy/*.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  REPO_ROOT, POLITICAS_PATH, INDEX_PATH, MARCADOR, VALOR_FALTANTE,
  leerDestinatarios, hostsDeclarados, hostsDelSitio, construirBloque,
  extraerBloque, normalizarFin
} from './recipients.mjs';
import { cargarSitio, crearEventoSubmit, respuesta, CAMPOS_DEMO } from './site-harness.mjs';

const datos = leerDestinatarios();
const inventario = JSON.parse(readFileSync(path.join(REPO_ROOT, 'security', 'csp', 'INVENTORY.json'), 'utf8'));
const politicas = readFileSync(POLITICAS_PATH, 'utf8');
const indice = readFileSync(INDEX_PATH, 'utf8');

const CAMPOS_OBLIGATORIOS = ['id', 'nombre', 'rol', 'transporte', 'hosts', 'campos', 'finalidad',
  'retencion', 'control_consentimiento', 'control_baja', 'evidencia'];

test('cada destinatario declara todo lo que el aviso necesita', () => {
  assert.ok(datos.destinatarios.length >= 5);
  for (const d of datos.destinatarios) {
    for (const campo of CAMPOS_OBLIGATORIOS) {
      assert.ok(d[campo] !== undefined && d[campo] !== '', 'falta ' + campo + ' en ' + d.id);
    }
    assert.ok(['navegador', 'servidor'].includes(d.transporte), 'transporte invalido en ' + d.id);
    assert.ok(Array.isArray(d.campos) && d.campos.length > 0, 'sin campos: ' + d.id);
    assert.ok(Array.isArray(d.evidencia) && d.evidencia.length > 0, 'sin evidencia: ' + d.id);
  }
});

test('la evidencia de cada destinatario existe de verdad en el archivo citado', () => {
  for (const d of datos.destinatarios.concat(datos.retirados)) {
    const evidencias = d.evidencia || d.evidencia_de_retiro || [];
    for (const e of evidencias) {
      const contenido = readFileSync(path.join(REPO_ROOT, e.archivo), 'utf8');
      assert.ok(contenido.includes(e.ancla),
        'la evidencia de ' + d.id + ' ya no esta en ' + e.archivo + ': ' + e.ancla);
    }
  }
});

test('los destinatarios declarados son exactamente los hosts que el sitio contacta', () => {
  const declarados = hostsDeclarados(datos, 'navegador');
  const reales = hostsDelSitio(inventario);
  assert.deepEqual(declarados, reales,
    'el aviso y el comportamiento divergen. Declarados: ' + declarados.join(', ') + ' | reales: ' + reales.join(', '));
});

test('los hosts de un envio real estan todos declarados en el aviso', async () => {
  const declarados = hostsDeclarados(datos, 'navegador');
  const arnes = cargarSitio({ fetchImpl: async () => respuesta(true) });
  const { evento } = crearEventoSubmit(CAMPOS_DEMO);
  await arnes.handleSubmit(evento);
  arnes.correrTemporizadores();
  assert.ok(arnes.peticiones.length > 0);
  for (const p of arnes.peticiones) {
    assert.ok(declarados.includes(p.host), 'el sitio contacta un host que el aviso no declara: ' + p.host);
  }
});

test('ningun archivo del sitio ni de la politica CSP menciona el lookup externo de IP', () => {
  const archivos = ['main.js', 'index.html', 'gracias.html', 'politicas.html', 'vercel.json',
    'security/csp/INVENTORY.json', 'security/csp/ALLOWLIST.json', 'security/csp/allowlist.mjs'];
  for (const rel of archivos) {
    const contenido = readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    assert.ok(!/ipify/i.test(contenido), 'reaparecio el servicio de lookup en ' + rel);
  }
});

test('politicas.html publica el bloque generado y esta al dia', () => {
  const enDisco = extraerBloque(politicas);
  assert.ok(enDisco, 'faltan las marcas del bloque de destinatarios en politicas.html');
  assert.equal(enDisco, construirBloque(datos),
    'regenerar con: node security/privacy/recipients.mjs --write');
});

test('el aviso ya no dice que los datos no se comparten con terceros', () => {
  for (const [nombre, html] of [['politicas.html', politicas], ['index.html', indice]]) {
    assert.ok(!/no ser[aá]n compartidos/i.test(html), nombre + ' sigue afirmando que no se comparten');
    assert.ok(!/no ser[aá]n? (?:compartidos|vendidos|cedidos)/i.test(html), nombre + ' mantiene la afirmacion vieja');
  }
});

test('la politica nombra a cada destinatario publicado', () => {
  for (const d of datos.destinatarios) {
    assert.ok(politicas.includes(d.nombre), 'politicas.html no nombra a ' + d.nombre);
  }
});

test('el texto previo al envio nombra a los proveedores y enlaza la politica', () => {
  const inicio = indice.indexOf('<p class="form-legal">');
  assert.ok(inicio > 0, 'no esta el texto previo al envio');
  const texto = indice.slice(inicio, indice.indexOf('</p>', inicio));
  for (const palabra of ['HubSpot', 'Meta', 'Google', 'politicas.html']) {
    assert.ok(texto.includes(palabra), 'el texto del formulario no menciona ' + palabra);
  }
});

test('donde el dato no consta hay marcador visible y ningun plazo inventado', () => {
  const faltantes = datos.destinatarios.filter((d) => d.retencion === VALOR_FALTANTE);
  assert.ok(faltantes.length > 0, 'si alguna retencion se completa, actualizar este test');
  const apariciones = politicas.split(MARCADOR).length - 1;
  assert.ok(apariciones >= faltantes.length,
    'faltan marcadores visibles: ' + apariciones + ' para ' + faltantes.length + ' retenciones sin dato');
  assert.ok(!politicas.includes(VALOR_FALTANTE), 'el valor interno se filtro al texto publico');
  const bloque = extraerBloque(politicas);
  assert.ok(!/\d+\s*(d[ií]as|meses|a[ñn]os)/i.test(bloque), 'aparecio un plazo de retencion inventado');
  assert.ok(!/(ley|GDPR|habeas data|ARCO)/i.test(bloque), 'el bloque generado invoca un marco legal no acreditado');
});

test('el bloque publicado no agrega estilos inline, scripts ni enlaces nuevos', () => {
  const bloque = normalizarFin(extraerBloque(politicas));
  assert.ok(!bloque.includes('style='), 'el bloque agrego un atributo de estilo');
  assert.ok(!/<script|<a\s|on[a-z]+=/i.test(bloque), 'el bloque agrego script, enlace o manejador');
});
