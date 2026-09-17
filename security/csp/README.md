# CSP del sitio publico (WP-SEC-11, preparatorio)

Estado: **PREPARATORIO. NO DESPLEGADO.** Los archivos viven en la rama de trabajo
`work/terra-os-autonomous-v1`. Nadie los publico en Vercel; el deploy es una decision humana.

## Que hay aca

| Archivo | Que es |
| --- | --- |
| `inventory.mjs` | Escanea `index.html`, `gracias.html`, `politicas.html`, `main.js`, `styles.css` y genera `INVENTORY.json`. Solo conteos y hashes: no copia el contenido de los scripts. |
| `INVENTORY.json` | Inventario: origenes externos por directiva, scripts inline con hash sha256, atributos `on*` con hash, inyeccion dinamica de scripts, uso de `eval`, y el header enforcing heredado. |
| `build-policy.mjs` | Construye el valor del header a partir del inventario y lo escribe en `vercel.json`. |
| `check.mjs` | 12 verificaciones sobre el header y el inventario. CLI legible, exit 1 si algo falla. |
| `check.test.mjs` | Los mismos controles como tests (`node --test security/csp/*.test.mjs`). |
| `allowlist.mjs` | WP-SEC-13. Deriva `ALLOWLIST.json` de `INVENTORY.json`: a cada origen le asigna la pieza que lo requiere y su estado de verificacion. |
| `ALLOWLIST.json` | WP-SEC-13. Origenes permitidos por directiva, con pieza responsable (GTM, GA4, Meta Pixel, HubSpot, fuentes, webhook) y estado `INVENTARIADO` / `PROBADO` / `PENDIENTE`. Sin comodines. |
| `report-minimize.mjs` | WP-SEC-13. Destino de reportes parametrizado (hoy vacio) y minimizador: de cada reporte solo sobreviven `effective-directive`, `blocked-uri` (origen), `document-uri` (path sin query) y `disposition`. |
| `allowlist.test.mjs`, `report-minimize.test.mjs` | Tests de las dos piezas anteriores. |
| `HARDENING_PLAN.md` | WP-SEC-13. Fases 1 (report-only + inventario), 2 (allowlist cerrada) y 3 (enforcing), con criterio de salida y quien decide cada paso. |

Regenerar despues de tocar el HTML/JS del sitio:

```
node security/csp/inventory.mjs --write
node security/csp/build-policy.mjs --write
node --test security/csp/*.test.mjs
```

## Que hace el header

`vercel.json` ahora manda **dos** headers CSP en `/(.*)`:

1. `Content-Security-Policy` (el heredado, permisivo: `https:`, `'unsafe-inline'`, `'unsafe-eval'`).
   **No se toco.** Es el unico que bloquea, asi que el comportamiento del sitio no cambia.
   `check.mjs` guarda su sha256 como baseline y falla si alguien lo modifica.
2. `Content-Security-Policy-Report-Only` (nuevo): la politica estricta propuesta.
   El navegador la evalua y **reporta**, pero no bloquea nada.

La politica estricta:

- `default-src 'self'`, `base-uri 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'self'`.
- `script-src`: `'self'` + origenes exactos (`googletagmanager.com`, `connect.facebook.net`,
  `google-analytics.com`) + **un hash sha256 por cada script inline** + `'unsafe-hashes'` con
  **un hash por cada atributo `on*`**. Sin `'unsafe-inline'`, sin `'unsafe-eval'`, sin `https:`, sin `*`.
- `style-src`: `'self' 'unsafe-inline' https://fonts.googleapis.com`.
  **`'unsafe-inline'` es deliberado y es la unica excepcion**: hay 14 atributos `style="..."` en el
  HTML (y GTM inyecta estilos). Hashear atributos de estilo exige `'unsafe-hashes'` + un hash por
  atributo y se rompe con cualquier retoque de maquetado; sacarlo requiere mover esos estilos a
  `styles.css`, que es un cambio de sitio y no entra en este paquete.
- `img-src`, `font-src`, `connect-src`, `frame-src`: origenes exactos del inventario + `data:`
  donde corresponde (favicon/SVG embebidos y fuentes).

`frame-ancestors 'none'`: el sitio es una landing publica autonoma, no hay evidencia en el repo de
que se embeba en ningun iframe (propio o de terceros). Si marketing llegara a embeberla, se pasa a
`'self'` o al origen concreto. Al ser Report-Only, hoy no rompe nada y el reporte lo confirmaria.

`form-action 'self'`: el unico `<form>` (`index.html:604`) no tiene atributo `action` (postea al
mismo documento y el JS intercepta); el envio real a HubSpot es `fetch` y por eso
`https://api.hsforms.com` esta en `connect-src`, no en `form-action`.

## Por que Report-Only

El sitio carga GTM, GA4, Meta Pixel y un webhook de enriquecimiento. Un CSP estricto mal calibrado
rompe tracking o formularios en produccion, en silencio y para todos los visitantes. Report-Only
permite medir el costo real antes de pagarlo. Ademas, `report-uri` / `report-to` estan **pendientes**:
no hay endpoint de reportes (`REPORT_ENDPOINT_URL` vacia en `report-minimize.mjs`, de donde
`build-policy.mjs` la toma), asi que hoy las
violaciones solo se ven en la consola del navegador (DevTools > Console) y no se agregan en ningun lado.

## REQUIERE_DECISION: GTM inyecta scripts dinamicamente

El inventario detecta 4 puntos de inyeccion dinamica (`index.html:7,25`, `gracias.html:7,19`): los
snippets de GTM y de Meta Pixel crean `<script>` en runtime, y GTM ademas ejecuta las etiquetas que
se configuren en la interfaz de GTM (incluidas Custom HTML, que son inline y no estan en el repo).

- Un **nonce** es imposible: el hosting es estatico y el HTML se sirve tal cual; un nonce debe ser
  distinto por respuesta y exigiria middleware/edge function, o sea cambiar la arquitectura del deploy.
- Los **hashes** cubren los scripts inline que estan en el repo, pero **no** las etiquetas Custom HTML
  que GTM inyecte, porque su contenido vive en GTM y puede cambiar sin tocar este repositorio.

Las dos salidas, para decidir con los reportes en la mano:

- **A)** Agregar `'strict-dynamic'` a `script-src`: los scripts cargados por un script ya confiado
  (hash) quedan permitidos. Costo: en navegadores CSP3 los origenes exactos se ignoran, o sea que se
  confia en GTM como raiz y se pierde la lista blanca de hosts.
- **B)** Mantener la lista de origenes exactos y aceptar que las etiquetas Custom HTML de GTM se
  bloqueen al pasar a enforcing (habria que migrarlas a etiquetas nativas o a este repo).

Hoy la politica implementa **B** (sin `'strict-dynamic'`), que es lo mas restrictivo, y el modo
Report-Only hace que la diferencia se vea como reporte y no como rotura.

## Que podria romperse al pasar a enforcing

El header heredado permite origenes que la politica estricta **no** incluye, porque no hay ninguna
evidencia de ellos en el codigo del sitio (los usaria GTM en runtime, si estan activos):

- `*.stape.io`, `*.stapecdn.com` (server-side tagging via Stape) y `*.a.run.app`
- `*.conversionsapigateway.com` (gateway de Conversions API de Meta)
- `*.terraseguridad.com.ar` (posible dominio propio de server-side GTM)
- `*.tagmanager.google.com` (modo vista previa / debug de GTM)
- `*.g.doubleclick.net` (remarketing de Google Ads)
- `*.hsforms.net` / `*.hsforms.com` como **script** (embed de formularios de HubSpot; el sitio hoy
  postea por `fetch` a `api.hsforms.com`, que si esta cubierto)

Otros riesgos:

- `'unsafe-hashes'` no existe en Safari anterior a 15.4: ahi los atributos `on*` (menu movil, FAQ,
  carrusel, envio del formulario) dejarian de funcionar con la politica en enforcing.
- Los hashes se invalidan con **un solo byte** que cambie en un script inline o en un atributo `on*`.
  Hay que regenerar el inventario en el mismo commit que toque el HTML.
- Los hashes se calculan sobre los bytes tal cual estan versionados (hoy **CRLF**). Si alguien agrega
  un `.gitattributes` que normalice finales de linea, los hashes cambian y hay que regenerarlos.
- `connect-src` incluye `https://n8n-production-ec32.up.railway.app` porque `main.js:242` sigue
  llamando a ese webhook. Si ese servicio esta dado de baja, la llamada ya falla hoy por red; la CSP
  no lo empeora, pero conviene revisarlo aparte.

## Checklist para pasar a enforcing

El plan por fases, con criterio de salida y responsable de cada decision, esta en
`security/csp/HARDENING_PLAN.md` (WP-SEC-13). Lo que sigue es el checklist corto.

1. Un humano despliega la rama con el header Report-Only (fuera del alcance de este paquete).
2. Definir endpoint de reportes (`report-uri` + `report-to` + header `Reporting-Endpoints`) y
   completar `REPORT_ENDPOINT_URL` en `report-minimize.mjs`, y minimizar con `normalizeReport`
   todo lo que se almacene. Sin endpoint, la observacion depende de mirar
   la consola a mano.
3. Observar **al menos 14 dias** con trafico real, incluyendo un envio completo del formulario y una
   visita a `gracias.html`, y una sesion en modo vista previa de GTM.
4. Validar por separado: GTM (etiquetas Custom HTML), HubSpot (envio del formulario) y
   Meta (PageView + Purchase/Lead con Advanced Matching).
5. Decidir A o B del apartado anterior y agregar solo los origenes que los reportes demuestren.
6. Recien entonces: reemplazar el header heredado por la politica estricta (renombrar
   `Content-Security-Policy-Report-Only` a `Content-Security-Policy` y borrar el heredado),
   correr `node --test security/csp/*.test.mjs`, y desplegar con alguien mirando.

## Rollback

- Vuelta atras completa: `git revert <sha del commit de WP-SEC-11>`.
- Vuelta atras minima sin tocar las herramientas: borrar de `vercel.json` el objeto
  `{"key": "Content-Security-Policy-Report-Only", ...}` de la regla `/(.*)`. El header heredado
  queda como estaba y el sitio se comporta igual que antes del paquete.
- En ambos casos no hay que redeployar nada si el header nunca se publico.
