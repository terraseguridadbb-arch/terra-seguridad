/**
 * WP-SEC-13 (preparatorio, DR-W3-08) - Allowlist CSP por directiva, derivada de
 * security/csp/INVENTORY.json.
 *
 * Que agrega sobre INVENTORY.json: para cada origen, QUE PIEZA lo requiere
 * (contenedor de GTM, GA4, Meta Pixel, HubSpot, fuentes, webhook) y en que
 * ESTADO de verificacion esta:
 *
 *   INVENTARIADO -> hay evidencia estatica en el repo (archivo:linea) o una
 *                   derivacion documentada de esa evidencia.
 *   PENDIENTE    -> se espera en runtime (lo inyecta GTM/gtag/Pixel) pero NO
 *                   esta probado: no hay despliegue ni reportes.
 *   PROBADO      -> un reporte real de la politica Report-Only, o una prueba
 *                   manual registrada, confirmo el origen. Hoy: ninguno.
 *
 * Reglas duras (las verifica allowlist.test.mjs):
 *   - Ningun comodin de esquema ni de host en ninguna fuente.
 *   - Ningun 'unsafe-inline' para scripts. GTM entra por el HASH de su snippet,
 *     no por confianza irrestricta en todo lo que GTM cargue.
 *   - Un origen no puede declararse PROBADO sin evidencia de prueba.
 *
 * Determinista y sin red. Uso:  node security/csp/allowlist.mjs --write
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { REPO_ROOT, DIRECTIVES, readInventory } from './inventory.mjs';

export const ALLOWLIST_PATH = path.join(REPO_ROOT, 'security', 'csp', 'ALLOWLIST.json');

export const ESTADOS = ['INVENTARIADO', 'PROBADO', 'PENDIENTE'];

/** Piezas que justifican un origen. Sin esto, un origen no entra en la allowlist. */
export const COMPONENTES = {
  'gtm-contenedor': 'GTM: contenedor y gtag/js (snippet inline hasheado en index.html y gracias.html)',
  'ga4': 'Google Analytics 4 (cargado por el contenedor de GTM)',
  'meta-pixel': 'Meta Pixel / fbevents.js (snippet inline hasheado)',
  'hubspot-forms': 'HubSpot Forms API: envio del formulario por fetch desde main.js',
  'fuentes-google': 'Google Fonts: hoja de estilos y archivos de fuente',
  'webhook-n8n': 'Webhook de n8n en Railway invocado desde main.js'
};

/**
 * Origen -> pieza que lo requiere. Cada entrada se sostiene en evidencia del
 * INVENTORY.json (origin_details / derived_origins / runtime_expected_origins).
 * Si aparece un origen nuevo sin entrada aca, buildAllowlist falla: obliga a
 * decidir de quien es antes de permitirlo.
 */
export const COMPONENTE_POR_ORIGEN = {
  'https://www.googletagmanager.com': 'gtm-contenedor',
  'https://www.google-analytics.com': 'ga4',
  'https://region1.google-analytics.com': 'ga4',
  'https://analytics.google.com': 'ga4',
  'https://connect.facebook.net': 'meta-pixel',
  'https://www.facebook.com': 'meta-pixel',
  'https://api.hsforms.com': 'hubspot-forms',
  'https://fonts.googleapis.com': 'fuentes-google',
  'https://fonts.gstatic.com': 'fuentes-google',
  'https://n8n-production-ec32.up.railway.app': 'webhook-n8n'
};

/**
 * Origenes confirmados por un reporte real de la politica Report-Only o por una
 * prueba manual registrada. VACIO A PROPOSITO: la politica nunca se desplego,
 * no hay endpoint de reportes y no existe ninguna sesion de prueba registrada.
 * Formato cuando se complete: { origin, directive, evidencia: 'que lo prueba' }.
 * Completarlo sin evidencia real seria inventar una verificacion.
 */
export const VERIFICADOS_POR_REPORTE = [];

const KEYWORDS_PERMITIDAS = ["'self'", "'none'", "'unsafe-hashes'", "'unsafe-inline'", 'data:'];

/** Un origen valido es esquema mas host exacto, sin comodin y sin path. */
export function esOrigenExacto(s) {
  const str = String(s);
  if (str.indexOf('*') >= 0) return false;
  return /^https:\/\/[a-z0-9.-]+(?::\d+)?$/.test(str);
}

const uniq = (arr) => Array.from(new global.Set(arr));

function fuentesDelHeaderHeredado(inventory) {
  const legacy = inventory.legacy_enforcing_csp || {};
  const fuentes = uniq((legacy.wildcard_sources || []).map((s) => s.split(/\s+/).slice(1).join(' ')));
  return fuentes.sort();
}

export function buildAllowlist(inventory) {
  const detallePorClave = new global.Map();
  for (const d of inventory.origin_details || []) {
    const clave = d.directive + '@' + d.origin;
    if (!detallePorClave.has(clave)) detallePorClave.set(clave, []);
    detallePorClave.get(clave).push({ tipo: d.source, evidencia: d.file + ':' + d.line });
  }
  const derivadoPorClave = new global.Map();
  for (const d of inventory.derived_origins || []) derivadoPorClave.set(d.directive + '@' + d.origin, d.reason);
  const runtimePorClave = new global.Map();
  for (const d of inventory.runtime_expected_origins || []) runtimePorClave.set(d.directive + '@' + d.origin, d.reason);
  const probadoPorClave = new global.Map();
  for (const v of VERIFICADOS_POR_REPORTE) probadoPorClave.set(v.directive + '@' + v.origin, v.evidencia);

  const porDirectiva = {};
  for (const directive of DIRECTIVES) {
    const entradas = [];
    for (const origin of inventory.origins_by_directive[directive] || []) {
      if (!esOrigenExacto(origin)) {
        throw new Error('origen no exacto o con comodin en ' + directive + ': ' + origin);
      }
      const componente = COMPONENTE_POR_ORIGEN[origin];
      if (!componente) {
        throw new Error('origen sin pieza declarada en COMPONENTE_POR_ORIGEN: ' + origin + ' (' + directive + '). Decidir quien lo requiere antes de permitirlo.');
      }
      const clave = directive + '@' + origin;
      const estatico = detallePorClave.get(clave) || [];
      const derivado = derivadoPorClave.get(clave);
      const runtime = runtimePorClave.get(clave);
      const probado = probadoPorClave.get(clave);

      let estado = 'PENDIENTE';
      let evidencia = [];
      if (probado) {
        estado = 'PROBADO';
        evidencia = [{ tipo: 'reporte-o-prueba-registrada', evidencia: probado }];
      } else if (estatico.length > 0) {
        estado = 'INVENTARIADO';
        evidencia = estatico.map((e) => ({ tipo: e.tipo, evidencia: e.evidencia }));
      } else if (derivado) {
        estado = 'INVENTARIADO';
        evidencia = [{ tipo: 'derivado-de-evidencia-estatica', evidencia: derivado }];
      } else if (runtime) {
        estado = 'PENDIENTE';
        evidencia = [{ tipo: 'esperado-en-runtime-no-probado', evidencia: runtime }];
      }
      entradas.push({
        origin,
        componente,
        componente_label: COMPONENTES[componente],
        estado,
        evidencia
      });
    }
    porDirectiva[directive] = entradas.sort((a, b) => a.origin.localeCompare(b.origin));
  }

  const todas = Object.values(porDirectiva).flat();
  const conteo = { INVENTARIADO: 0, PROBADO: 0, PENDIENTE: 0 };
  for (const e of todas) conteo[e.estado] += 1;

  return {
    _about: 'Allowlist CSP (WP-SEC-13, DR-W3-08). Regenerar: node security/csp/allowlist.mjs --write. De donde sale cada cosa: ver _procedencia.',
    _procedencia: {
      origenes: 'VERIFIED_REPO. Cada origen sale de INVENTORY.json (origin_details, derived_origins, runtime_expected_origins), que inventory.mjs genera leyendo el HTML y el JS del repo. Ninguno se escribio a mano: buildAllowlist falla si aparece un origen que el inventario no tiene.',
      pieza_componente: 'DECLARED (criterio del worker, no del inventario). Las etiquetas componente y componente_label las asigna el mapa COMPONENTE_POR_ORIGEN de allowlist.mjs (aprox. lineas 50-62), escrito segun donde aparece cada origen en el codigo. Es una atribucion revisable: si una pieza esta mal asignada se corrige ahi y se regenera, y la lista de origenes permitidos no cambia.',
      estados: 'INVENTARIADO y PENDIENTE salen del inventario (origen presente en el codigo vs origen esperado en runtime). PROBADO exige una entrada en VERIFICADOS_POR_REPORTE, hoy vacia porque la politica nunca se desplego.'
    },
    schema_version: 1,
    modo: 'Report-Only. Esta allowlist NO esta en enforcing y no bloquea nada.',
    reglas: [
      'Sin comodines: ninguna fuente de esquema abierto ni de subdominio abierto entra en esta lista.',
      "Sin 'unsafe-inline' en script-src: los scripts inline del repo entran por hash sha256 y los atributos on* por hash mas 'unsafe-hashes'.",
      'Un origen solo pasa a PROBADO con evidencia de un reporte real o de una prueba registrada.'
    ],
    confianza_gtm: {
      decision: "El contenedor de GTM entra por el HASH del snippet inline y por el origen exacto www.googletagmanager.com. NO se usa 'strict-dynamic' ni se confia en todo lo que GTM cargue.",
      consecuencia: 'Las etiquetas que GTM inyecte en runtime (Custom HTML, pixeles de terceros, server-side tagging) NO estan permitidas por esta lista: apareceran como violaciones en los reportes y se agregaran de a una, con su pieza y su evidencia.',
      referencia: 'security/csp/README.md, apartado "REQUIERE_DECISION: GTM inyecta scripts dinamicamente" (opciones A/B; hoy rige B).'
    },
    keywords_permitidas: KEYWORDS_PERMITIDAS,
    resumen: { total: todas.length, por_estado: conteo },
    por_directiva: porDirectiva,
    hashes: {
      _nota: 'Los hashes viven en INVENTORY.json (inline_script_hashes, event_handler_hashes) y se regeneran con inventory.mjs. Aca solo se cuentan.',
      inline_script_hashes: (inventory.inline_script_hashes || []).length,
      event_handler_hashes: (inventory.event_handler_hashes || []).length
    },
    no_incluidos: {
      _nota: 'Fuentes del header enforcing HEREDADO que esta allowlist NO adopta. Estan aca para que la diferencia sea visible antes de cualquier endurecimiento, no para permitirlas.',
      motivo: 'Son comodines o dominios sin ninguna evidencia en el repositorio. Si el sitio los usa de verdad, los reportes de la fase 1 lo van a mostrar y se evaluaran de a uno.',
      fuentes: fuentesDelHeaderHeredado(inventory)
    }
  };
}

export function readAllowlist(file = ALLOWLIST_PATH) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export const serializeAllowlist = (a) => JSON.stringify(a, null, 2) + '\n';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const allowlist = buildAllowlist(readInventory());
  if (process.argv.includes('--write')) {
    writeFileSync(ALLOWLIST_PATH, serializeAllowlist(allowlist), 'utf8');
    console.log('ALLOWLIST.json actualizado: ' + allowlist.resumen.total + ' origenes');
  } else {
    console.log(serializeAllowlist(allowlist));
  }
}
