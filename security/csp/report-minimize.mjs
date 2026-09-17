/**
 * WP-SEC-13 (preparatorio, DR-W3-08) - Endpoint de reportes PARAMETRIZADO y
 * minimizacion de los reportes de violacion de CSP.
 *
 * Dos cosas, las dos sin efecto externo:
 *
 * 1) Parametrizacion del destino de reportes. `REPORT_ENDPOINT_URL` esta VACIA
 *    a proposito: no existe endpoint y no se inventa ninguno. Mientras este
 *    vacia, `reportingDirectives()` devuelve [] y la politica NO lleva
 *    `report-uri` ni `report-to`; tampoco se emite el header
 *    `Reporting-Endpoints`. Completar esa constante es una decision humana
 *    (donde se reciben los reportes, quien los guarda, cuanto tiempo).
 *
 * 2) Minimizacion. Un reporte de CSP puede llevar datos del visitante y del
 *    codigo: `script-sample` (un fragmento del script bloqueado), `source-file`,
 *    numero de linea/columna, el `referrer` y la URL completa CON query
 *    (parametros de campana, y potencialmente datos de un formulario).
 *    `normalizeReport()` conserva SOLO lo necesario para decidir si un origen
 *    entra en la allowlist:
 *
 *      effective-directive, blocked-uri (origen, sin path ni query),
 *      document-uri (origen + path, sin query ni fragmento), disposition
 *
 *    y descarta todo lo demas. Si manana se conecta un endpoint, lo que se
 *    almacene debe pasar por aca primero.
 *
 * Sin red, sin dependencias. Se prueba en report-minimize.test.mjs.
 */

/** Nombre del grupo de reporte (header Reporting-Endpoints y directiva report-to). */
export const REPORT_ENDPOINT_NAME = 'csp-endpoint';

/**
 * URL del receptor de reportes. VACIA = no hay endpoint todavia (frontera
 * humana). No poner aca una URL de ejemplo: se publicaria en un header real.
 */
export const REPORT_ENDPOINT_URL = '';

/** Campos que sobreviven a la minimizacion, en este orden. */
export const CAMPOS_CONSERVADOS = ['effective-directive', 'blocked-uri', 'document-uri', 'disposition'];

/**
 * Campos que se descartan siempre. Estan enumerados para que quede explicito
 * QUE se esta tirando y por que, no porque el normalizador use la lista
 * (el normalizador reconstruye el objeto desde cero: lo que no esta en
 * CAMPOS_CONSERVADOS no puede colarse).
 */
export const CAMPOS_DESCARTADOS = [
  'script-sample', 'sample',
  'source-file', 'sourceFile',
  'line-number', 'lineNumber',
  'column-number', 'columnNumber',
  'referrer',
  'original-policy', 'originalPolicy',
  'status-code', 'statusCode',
  'status'
];

/** Palabras clave que el navegador manda como blocked-uri en vez de una URL. */
export const BLOCKED_KEYWORDS = ['inline', 'eval', 'self', 'data', 'blob', 'wasm-eval', 'trusted-types-policy', 'trusted-types-sink'];

/** Largo maximo del path conservado; mas alla se trunca (los paths largos suelen ser payload). */
export const MAX_PATH = 120;

/** Directivas `report-uri` / `report-to`. Endpoint vacio => sin directivas. */
export function reportingDirectives(url = REPORT_ENDPOINT_URL, name = REPORT_ENDPOINT_NAME) {
  const destino = String(url || '').trim();
  if (!destino) return [];
  return ['report-uri ' + destino, 'report-to ' + name];
}

/** Header `Reporting-Endpoints`. Endpoint vacio => null (no se emite header). */
export function reportingEndpointsHeader(url = REPORT_ENDPOINT_URL, name = REPORT_ENDPOINT_NAME) {
  const destino = String(url || '').trim();
  if (!destino) return null;
  return { key: 'Reporting-Endpoints', value: name + '="' + destino + '"' };
}

const asString = (v) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));

/** Nombre de la directiva, sin fuentes: "script-src-elem 'self' https://x" -> "script-src-elem". */
export function directiveName(value) {
  const first = asString(value).trim().split(/\s+/)[0] || '';
  return /^[a-z-]+$/.test(first) ? first : 'unknown';
}

/** blocked-uri reducido a origen (o palabra clave). Nunca conserva path ni query. */
export function blockedOrigin(value) {
  const raw = asString(value).trim();
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase();
  if (BLOCKED_KEYWORDS.includes(lower)) return lower;
  for (const esquema of ['data', 'blob', 'filesystem', 'javascript']) {
    if (lower.startsWith(esquema + ':')) return esquema + ':';
  }
  try {
    const u = new URL(raw);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.protocol + '//' + u.host;
    return u.protocol;
  } catch {
    return 'other';
  }
}

/** document-uri reducido a origen + path, sin query, sin fragmento, sin userinfo. */
export function documentPath(value) {
  const raw = asString(value).trim();
  if (!raw) return 'unknown';
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return u.protocol;
    let p = u.pathname || '/';
    if (p.length > MAX_PATH) p = p.slice(0, MAX_PATH) + '...';
    return u.protocol + '//' + u.host + p;
  } catch {
    return 'other';
  }
}

/** disposition declarada por el navegador: solo report o enforce. */
export function dispositionOf(value) {
  const d = asString(value).trim().toLowerCase();
  return d === 'enforce' || d === 'report' ? d : 'unknown';
}

/**
 * Normaliza un reporte de CSP. Acepta las tres formas que llegan en la practica:
 *   - legacy report-uri:      { "csp-report": { "effective-directive": ... } }
 *   - Reporting API (report-to): { type: "csp-violation", body: { effectiveDirective: ... } }
 *   - el cuerpo suelto, en cualquiera de las dos convenciones de nombres.
 * Devuelve SIEMPRE un objeto con exactamente CAMPOS_CONSERVADOS, o null si la
 * entrada no es un objeto.
 */
export function normalizeReport(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const body = (raw['csp-report'] && typeof raw['csp-report'] === 'object' && raw['csp-report'])
    || (raw.body && typeof raw.body === 'object' && raw.body)
    || raw;

  const efectiva = body['effective-directive'] ?? body.effectiveDirective
    ?? body['violated-directive'] ?? body.violatedDirective;
  const bloqueada = body['blocked-uri'] ?? body.blockedURI ?? body.blockedURL;
  const documento = body['document-uri'] ?? body.documentURI ?? body.documentURL ?? body.url;

  return {
    'effective-directive': directiveName(efectiva),
    'blocked-uri': blockedOrigin(bloqueada),
    'document-uri': documentPath(documento),
    disposition: dispositionOf(body.disposition)
  };
}

/** Normaliza una tanda de reportes y descarta lo que no sea un objeto. */
export function normalizeBatch(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeReport).filter(Boolean);
}
