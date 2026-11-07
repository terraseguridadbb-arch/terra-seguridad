/**
 * Verifica que un deployment sirve exactamente los archivos de un commit.
 *
 * Uso: node security/deploy/verificar-artefacto.mjs <url-base> <commit>
 *   Para un preview protegido: VERIFY_COOKIE='_vercel_jwt=...' (enlace "Share" de Vercel).
 *
 * Compara el SHA-256 de cada archivo servido con el blob del commit, controla que
 * los headers CSP coincidan con vercel.json y que security/ no se publique.
 * Sale con código 1 ante cualquier diferencia. Sin dependencias.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const [base, commit] = process.argv.slice(2);
if (!base || !commit) { console.error('uso: verificar-artefacto.mjs <url-base> <commit>'); process.exit(2); }
const git = (...a) => execFileSync('git', a, { maxBuffer: 64 << 20 });
const sha = (b) => createHash('sha256').update(b).digest('hex');
const headers = process.env.VERIFY_COOKIE ? { cookie: process.env.VERIFY_COOKIE } : {};
const NO_SERVIDOS = /^(security\/|\.gitignore$|\.vercelignore$|package-lock\.json$|vercel\.json$)/;

const archivos = git('ls-tree', '-r', '--name-only', commit).toString().split('\n').filter((f) => f && !NO_SERVIDOS.test(f));
let fallas = 0;
const pedir = async (ruta) => fetch(new URL(ruta.split('/').map(encodeURIComponent).join('/'), base.replace(/\/?$/, '/')), { headers, redirect: 'manual' });

for (const f of archivos) {
  // index.html is consolidated at /; compare its bytes at the canonical route.
  const r = await pedir(f === 'index.html' ? '' : f);
  const servido = Buffer.from(await r.arrayBuffer());
  const esperado = git('show', commit + ':' + f);
  const ok = r.status === 200 && sha(servido) === sha(esperado);
  if (!ok) fallas++;
  console.log((ok ? 'OK   ' : 'FALLA') + ' ' + r.status + ' ' + sha(esperado).slice(0, 12) + ' ' + f);
}

const config = JSON.parse(git('show', commit + ':vercel.json').toString());
const raiz = await pedir('');
for (const regla of config.headers || []) for (const h of regla.headers) {
  if (!/content-security-policy/i.test(h.key)) continue;
  const ok = raiz.headers.get(h.key) === h.value;
  if (!ok) fallas++;
  console.log((ok ? 'OK   ' : 'FALLA') + ' header ' + h.key + ' (' + regla.source + ')');
}

// Check the permanent redirect and attribution parameters separately.
if (config.redirects?.some((r) => r.source === '/index.html' && r.destination === '/' && r.permanent)) {
  const probe = new URL('index.html?utm_source=seo_qa&utm_campaign=preview&fbclid=TEST_SEO', base.replace(/\/?$/, '/'));
  const response = await fetch(probe, { headers, redirect: 'manual' });
  const location = response.headers.get('location');
  const destination = location ? new URL(location, probe) : null;
  const ok = response.status === 308 && destination?.origin === probe.origin &&
    destination?.pathname === '/' && [...probe.searchParams].every(([key, value]) => destination.searchParams.get(key) === value);
  if (!ok) fallas++;
  console.log((ok ? 'OK   ' : 'FALLA') + ' redireccion 308 de index.html conserva parametros');
}
const thanks = await pedir('gracias.html');
if (config.headers?.some((r) => r.source === '/gracias.html')) {
  const ok = thanks.headers.get('x-robots-tag') === 'noindex, follow';
  if (!ok) fallas++;
  console.log((ok ? 'OK   ' : 'FALLA') + ' gracias.html X-Robots-Tag');
}

const interno = await pedir('security/privacy/README.md');
const oculto = interno.status === 404;
if (!oculto) fallas++;
console.log((oculto ? 'OK   ' : 'FALLA') + ' ' + interno.status + ' security/ no publicado');

console.log(fallas ? `\n${fallas} diferencia(s): NO es equivalente a ${commit}` : `\nEquivalente a ${commit}: ${archivos.length} archivos idénticos`);
process.exit(fallas ? 1 : 0);
