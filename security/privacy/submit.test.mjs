/**
 * NEXT-SEC-15 (DIR18-03) - El envio del formulario, probado sobre el main.js
 * versionado, sin red y sin navegador.
 *
 * Que se prueba:
 *   1. el submit se completa sin consultar ningun servicio externo de IP;
 *   2. el contrato de payload de cada destino (campo por campo);
 *   3. que una caida de red no deje al visitante bloqueado.
 *
 * Ejecutar:  node --test security/privacy/*.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cargarSitio, crearEventoSubmit, respuesta, CAMPOS_DEMO } from './site-harness.mjs';

const HUBSPOT = 'api.hsforms.com';
const WEBHOOK = 'n8n-production-ec32.up.railway.app';

/** Hosts que el test acepta. Cualquier otro (lookup de IP incluido) es un fallo. */
const HOSTS_DECLARADOS = [HUBSPOT, WEBHOOK];

function fetchDeTest({ hubspotOk = true, hubspotLanza = false, webhookLanza = false } = {}) {
  const vistos = [];
  const fn = async (url) => {
    vistos.push(url);
    const host = new URL(url).host;
    if (!HOSTS_DECLARADOS.includes(host)) {
      throw new Error('el sitio contacto un host no declarado: ' + host);
    }
    if (host === HUBSPOT) {
      if (hubspotLanza) throw new TypeError('Failed to fetch');
      return respuesta(hubspotOk);
    }
    if (webhookLanza) throw new TypeError('Failed to fetch');
    return respuesta(true);
  };
  fn.vistos = vistos;
  return fn;
}

async function enviar(opciones = {}) {
  const arnes = cargarSitio({
    fetchImpl: fetchDeTest(opciones),
    cookies: opciones.cookies === undefined ? { _fbc: 'fb.1.1700000000.AbC', _fbp: 'fb.1.1700000000.987' } : opciones.cookies,
    userAgent: 'Mozilla/5.0 (arnes de test)'
  });
  const { evento, boton } = crearEventoSubmit(CAMPOS_DEMO);
  await arnes.handleSubmit(evento);
  arnes.correrTemporizadores();
  return { arnes, boton };
}

const aHubspot = (arnes) => arnes.peticiones.find((p) => p.host === HUBSPOT);
const alWebhook = (arnes) => arnes.peticiones.find((p) => p.host === WEBHOOK);

test('el submit se completa sin consultar ningun servicio externo de IP', async () => {
  const { arnes } = await enviar();
  const hosts = arnes.peticiones.map((p) => p.host);
  assert.deepEqual(hosts, [HUBSPOT, WEBHOOK], 'hosts contactados: ' + hosts.join(', '));
  for (const p of arnes.peticiones) {
    assert.ok(!/ipify/i.test(p.url), 'peticion a un servicio de lookup de IP: ' + p.url);
  }
  assert.equal(arnes.window.location.href, 'gracias.html', 'el visitante deberia terminar en gracias.html');
  assert.equal(arnes.errorVisible(), null);
});

test('contrato de payload a HubSpot Forms: campos exactos, sin la IP', async () => {
  const { arnes } = await enviar();
  const cuerpo = aHubspot(arnes).cuerpo;
  const nombres = cuerpo.fields.map((f) => f.name);
  assert.deepEqual(nombres, [
    'firstname', 'lastname', 'email', 'phone', 'terra_event_id', 'fbc', 'fbp', 'client_user_agent'
  ]);
  assert.ok(!nombres.includes('client_ip'), 'la IP volvio al payload de HubSpot');
  assert.ok(!JSON.stringify(cuerpo).includes('client_ip'));
  assert.deepEqual(Object.keys(cuerpo).sort(), ['context', 'fields']);
  assert.deepEqual(Object.keys(cuerpo.context).sort(), ['pageName', 'pageUri']);
});

test('contrato de payload al webhook de enrichment: claves exactas, sin la IP', async () => {
  const { arnes } = await enviar();
  const cuerpo = alWebhook(arnes).cuerpo;
  assert.deepEqual(Object.keys(cuerpo), ['email', 'terra_event_id', 'fbc', 'fbp', 'client_user_agent']);
  assert.ok(!('client_ip' in cuerpo), 'la IP volvio al payload del webhook');
  assert.ok(!JSON.stringify(cuerpo).includes('client_ip'));
});

test('las demas senales del lead se conservan tal cual', async () => {
  const { arnes } = await enviar();
  const hubspot = aHubspot(arnes).cuerpo.fields;
  const valor = (n) => (hubspot.find((f) => f.name === n) || {}).value;
  assert.equal(valor('firstname'), CAMPOS_DEMO.nombre);
  assert.equal(valor('email'), CAMPOS_DEMO.email);
  assert.equal(valor('phone'), CAMPOS_DEMO.codarea + ' ' + CAMPOS_DEMO.telefono);
  assert.equal(valor('fbc'), 'fb.1.1700000000.AbC');
  assert.equal(valor('fbp'), 'fb.1.1700000000.987');
  assert.equal(valor('client_user_agent'), 'Mozilla/5.0 (arnes de test)');
  const webhook = alWebhook(arnes).cuerpo;
  assert.equal(webhook.terra_event_id, valor('terra_event_id'));
  assert.ok(String(webhook.terra_event_id).length > 0);
  assert.equal(arnes.eventosFbq.length, 1, 'deberia dispararse un unico Lead');
  assert.equal(arnes.eventosFbq[0][1], 'Lead');
  assert.equal(arnes.eventosFbq[0][2].event_id, webhook.terra_event_id);
});

test('sin cookies de Meta el submit igual funciona y no inventa valores', async () => {
  const { arnes } = await enviar({ cookies: {} });
  const hubspot = aHubspot(arnes).cuerpo.fields;
  assert.equal(hubspot.find((f) => f.name === 'fbc').value, '');
  assert.equal(hubspot.find((f) => f.name === 'fbp').value, '');
  assert.equal(alWebhook(arnes).cuerpo.fbc, null);
  assert.equal(arnes.window.location.href, 'gracias.html');
});

test('si HubSpot responde error el visitante ve un mensaje y puede reintentar', async () => {
  const { arnes, boton } = await enviar({ hubspotOk: false });
  assert.equal(arnes.window.location.href, 'https://ejemplo.invalid/', 'no deberia redirigir');
  assert.equal(boton.disabled, false, 'el boton tiene que volver a habilitarse');
  assert.match(arnes.errorVisible() || '', /error al enviar/i);
  assert.equal(alWebhook(arnes), undefined, 'sin alta en HubSpot no se llama al webhook');
});

test('si la red hacia HubSpot se cae el submit no lanza y avisa al visitante', async () => {
  const { arnes, boton } = await enviar({ hubspotLanza: true });
  assert.equal(boton.disabled, false);
  assert.match(arnes.errorVisible() || '', /no se pudo conectar/i);
  assert.equal(arnes.window.location.href, 'https://ejemplo.invalid/');
});

test('si el webhook de enrichment se cae el visitante igual llega a gracias.html', async () => {
  const { arnes } = await enviar({ webhookLanza: true });
  assert.equal(arnes.window.location.href, 'gracias.html');
  assert.equal(arnes.errorVisible(), null, 'un fallo de enrichment no es un error del visitante');
  assert.ok(alWebhook(arnes), 'igual se intento el envio');
});

test('el codigo del sitio no contiene ninguna llamada a un lookup externo de IP', async () => {
  const { readFileSync } = await import('node:fs');
  const { MAIN_JS_PATH } = await import('./site-harness.mjs');
  const fuente = readFileSync(MAIN_JS_PATH, 'utf8');
  assert.ok(!/ipify/i.test(fuente), 'main.js volvio a mencionar el servicio de lookup');
  const ejecutable = fuente.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.ok(!/client_ip/.test(ejecutable), 'main.js volvio a enviar la IP en algun payload');
});
