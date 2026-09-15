/**
 * WP-SEC-11 (preparatorio) - Construye el header CSP en modo Report-Only a
 * partir de security/csp/INVENTORY.json y lo escribe en vercel.json.
 *
 * Reglas de la politica (ver security/csp/README.md):
 *   - Sin comodin `https:` y sin `*` en ninguna fuente.
 *   - Sin 'unsafe-eval' y sin 'unsafe-inline' en script-src: los scripts inline
 *     se habilitan por hash sha256 y los atributos on* por hash + 'unsafe-hashes'.
 *   - 'unsafe-inline' SOLO en style-src, porque hay 14 atributos style="..."
 *     en el HTML y GTM inyecta estilos: no es hasheable sin reescribir el sitio.
 *   - Report-Only: se observa, no bloquea. Nada del sitio cambia de comportamiento.
 *
 * Uso:  node security/csp/build-policy.mjs --write
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { REPO_ROOT, HEADER_NAME_FIELD, readInventory } from './inventory.mjs';

export const REPORT_ONLY_HEADER_NAME = 'Content-Security-Policy-Report-Only';
export const LEGACY_HEADER_NAME = 'Content-Security-Policy';
export const ALL_ROUTES = '/(.*)';
export const VERCEL_CONFIG_PATH = path.join(REPO_ROOT, 'vercel.json');

/**
 * PENDIENTE (frontera humana): no existe endpoint de reportes.
 * Cuando exista, agregar a la politica:
 *   report-uri <https://endpoint/csp>;  report-to csp-endpoint;
 * y el header Reporting-Endpoints: csp-endpoint="<https://endpoint/csp>".
 * Mientras REPORT_ENDPOINT sea null, las violaciones solo se ven en la consola
 * del navegador (DevTools), no se agregan en ningun lado.
 */
export const REPORT_ENDPOINT = null;

/** Directivas sin fuentes de origen, fijas por politica. */
export const FIXED_DIRECTIVES = [
  ['default-src', ["'self'"]],
  ['base-uri', ["'self'"]],
  ['object-src', ["'none'"]],
  // El sitio es una landing publica autonoma: no hay evidencia de que se embeba
  // en ningun iframe propio ni de terceros, por eso 'none' y no 'self'.
  ['frame-ancestors', ["'none'"]],
  // El unico <form> (index.html:604) no tiene atributo action: postea al mismo
  // documento y el JS lo intercepta; el envio real a HubSpot es fetch (connect-src).
  ['form-action', ["'self'"]]
];

export function buildPolicy(inventory) {
  const byDirective = inventory.origins_by_directive;
  const scriptHashes = [...inventory.inline_script_hashes].map((h) => "'" + h + "'");
  const handlerHashes = [...inventory.event_handler_hashes].map((h) => "'" + h + "'");
  const hasHandlers = handlerHashes.length > 0;

  const scriptSrc = ["'self'", ...byDirective['script-src']];
  if (hasHandlers) scriptSrc.push("'unsafe-hashes'");
  scriptSrc.push(...scriptHashes, ...handlerHashes);

  const directives = [
    ...FIXED_DIRECTIVES,
    ['script-src', scriptSrc],
    // 'unsafe-inline' documentado: atributos style="..." no hasheables.
    ['style-src', ["'self'", "'unsafe-inline'", ...byDirective['style-src']]],
    ['img-src', ["'self'", 'data:', ...byDirective['img-src']]],
    ['font-src', ["'self'", 'data:', ...byDirective['font-src']]],
    ['connect-src', ["'self'", ...byDirective['connect-src']]],
    ['frame-src', ["'self'", ...byDirective['frame-src']]]
  ];

  const order = ['default-src', 'base-uri', 'object-src', 'script-src', 'style-src', 'img-src', 'font-src', 'connect-src', 'frame-src', 'frame-ancestors', 'form-action'];
  const rendered = order
    .map((name) => {
      const entry = directives.find((d) => d[0] === name);
      return entry ? name + ' ' + entry[1].join(' ') : null;
    })
    .filter(Boolean);

  if (REPORT_ENDPOINT) rendered.push('report-uri ' + REPORT_ENDPOINT, 'report-to csp-endpoint');

  return rendered.join('; ') + ';';
}

export function loadConfig(file = VERCEL_CONFIG_PATH) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Inserta o actualiza el header Report-Only sin tocar los headers existentes. */
export function applyPolicy(config, value) {
  const next = JSON.parse(JSON.stringify(config));
  const rule = (next.headers || []).find((h) => h.source === ALL_ROUTES);
  if (!rule) throw new Error('vercel.json: no existe una regla de headers para ' + ALL_ROUTES);
  const existing = rule.headers.find((h) => h[HEADER_NAME_FIELD] === REPORT_ONLY_HEADER_NAME);
  if (existing) existing.value = value;
  else rule.headers.push({ [HEADER_NAME_FIELD]: REPORT_ONLY_HEADER_NAME, value });
  return next;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const value = buildPolicy(readInventory());
  if (process.argv.includes('--write')) {
    const next = applyPolicy(loadConfig(), value);
    writeFileSync(VERCEL_CONFIG_PATH, JSON.stringify(next, null, 2) + '\n', 'utf8');
    console.log('vercel.json actualizado con ' + REPORT_ONLY_HEADER_NAME);
  } else {
    console.log(value);
  }
}
