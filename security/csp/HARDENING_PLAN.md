# Plan de endurecimiento gradual de la CSP (WP-SEC-13, DR-W3-08)

Estado: **PREPARATORIO. NADA DESPLEGADO. NINGUNA DIRECTIVA EN ENFORCING.**
Rama de trabajo `work/terra-os-autonomous-v1` del repo `terra-seguridad`.

DR-W3-08 (direccion delegada 2026-09-17, seccion 3): *"CSP permanece solo-reporte
hasta inventariar/probar tags. Preparar allowlist, reportes minimizados y
endurecimiento gradual; no dar confianza irrestricta a todo GTM ni desplegar
automaticamente."* El criterio de negocio esta resuelto; el efecto externo
(desplegar el sitio) **no** esta autorizado por esa seleccion.

Este plan no fija fechas. Cada fase termina cuando se cumple su criterio de
salida y **una persona** decide pasar a la siguiente. Donde falta un dato, dice
DATOS_FALTANTES en vez de un valor inventado.

## Piezas

| Archivo | Rol en el plan |
| --- | --- |
| `INVENTORY.json` | Que carga el sitio segun el codigo (origenes, hashes). Se regenera con `inventory.mjs`. |
| `ALLOWLIST.json` | Que se permite y **por que**: pieza responsable y estado por origen (`INVENTARIADO` / `PROBADO` / `PENDIENTE`). Se regenera con `allowlist.mjs`. |
| `build-policy.mjs` | Arma el valor del header a partir del inventario. |
| `report-minimize.mjs` | Destino de reportes parametrizado (hoy vacio) y minimizador de los reportes recibidos. |
| `check.mjs` + tests | Verifican que la politica sigue siendo Report-Only, sin comodines y reproducible. |

Estado inicial de la allowlist (generado, no estimado): **16 origenes = 8
INVENTARIADO + 8 PENDIENTE + 0 PROBADO**. Cero PROBADO es correcto: la politica
nunca se publico, asi que ningun origen tiene todavia evidencia de runtime.
Actualizacion NEXT-SEC-15 (2026-09-18): eran 17 hasta que el sitio dejo de
consultar el servicio externo de lookup de IP desde el navegador; ese origen
salio del codigo, del inventario y de la allowlist. El conteo se regenera, no se
edita a mano.

## Fase 1 - Report-Only publicado + inventario con trafico real

Objetivo: medir el costo real de la politica estricta sin romper nada.

Que se hace:
1. Una persona con acceso a Vercel despliega la rama que ya contiene el header
   `Content-Security-Policy-Report-Only`. El header enforcing heredado **no se
   toca** (`check.mjs` C5b falla si cambia).
2. Decidir el destino de los reportes y completar `REPORT_ENDPOINT_URL` en
   `report-minimize.mjs`. Sin destino, los reportes solo se ven a mano en la
   consola del navegador y la fase 1 depende de mirar DevTools.
3. Todo lo que se almacene pasa antes por `normalizeReport()`: se guardan
   `effective-directive`, `blocked-uri` (origen), `document-uri` (path sin
   query) y `disposition`, y nada mas.

DATOS_FALTANTES para el paso 2 (no se inventan aca): quien recibe los reportes,
con que retencion, quien puede leerlos y si ese receptor implica algun costo.
Un receptor externo es un destino de datos nuevo y necesita su propia
autorizacion, igual que cualquier otro efecto externo.

Criterio de salida:
- Al menos **N dias** de trafico real observado. `N` no esta fijado por este
  plan; el criterio ya documentado en `README.md` (WP-SEC-11) es **>= 14 dias**.
  Quien decide `N`: Direccion, con el dato de estacionalidad del trafico.
- Dentro de esa ventana se ejecutaron, y quedaron registradas, al menos: un
  envio completo del formulario, una visita a `gracias.html`, una sesion en modo
  vista previa de GTM y una visita a `politicas.html`.
- Cada origen que aparezca en los reportes quedo clasificado: se agrega a
  `ALLOWLIST.json` con su pieza (y pasa a `PROBADO`), o se documenta por que no
  se agrega.
- Los 8 origenes hoy `PENDIENTE` estan resueltos: `PROBADO` si el trafico los
  mostro, o se retiran si no aparecen nunca.

Riesgo de esta fase: ninguno sobre el comportamiento del sitio (Report-Only no
bloquea). Si el volumen de reportes es alto, el receptor puede recibir ruido:
por eso la minimizacion es obligatoria antes de almacenar.

## Fase 2 - Allowlist cerrada y cero reportes propios

Objetivo: llegar a una politica que no genere violaciones por trafico legitimo.

Que se hace:
1. Se ajusta la allowlist **de a un origen por vez**, cada uno con su pieza y su
   evidencia. Nunca se agrega un comodin para silenciar reportes: si la unica
   forma de cerrar un caso es un comodin, ese caso se escala como decision.
2. Se resuelve la decision abierta de GTM (`README.md`, "REQUIERE_DECISION"):
   - **A)** `'strict-dynamic'`: se confia en GTM como raiz y se pierde la lista
     blanca de hosts en navegadores CSP3.
   - **B)** (la que rige hoy) lista de origenes exactos; las etiquetas Custom
     HTML de GTM se bloquearian al pasar a enforcing y habria que migrarlas.
   Quien decide: Direccion, con el detalle de que etiquetas hay en el contenedor.
   Esa lista de etiquetas es DATOS_FALTANTES: vive en GTM, no en el repositorio.
3. Se decide tambien que hacer con `'unsafe-inline'` en `style-src` (14
   atributos `style="..."` en el HTML). Sacarlo exige mover esos estilos a
   `styles.css`: es un cambio del sitio, no de este paquete.

Criterio de salida:
- **Cero** violaciones atribuibles a trafico legitimo durante **M dias
  consecutivos** de observacion. `M` lo fija Direccion; no se inventa aca.
  "Cero reportes propios" excluye el ruido de extensiones del navegador y de
  inyecciones de terceros ajenas al sitio, que deben quedar identificadas como
  tales antes de contar.
- Cada origen de `ALLOWLIST.json` esta en estado `PROBADO` o fue retirado.
  Ninguno puede quedar en `PENDIENTE` al entrar a la fase 3.
- La decision A/B de GTM esta tomada y registrada, con el efecto que tiene sobre
  las etiquetas existentes.
- `node --test security/csp/*.test.mjs` en verde y `check.mjs` sin fallas.

## Fase 3 - Enforcing

Objetivo: que la politica bloquee de verdad.

Que se hace:
1. Se renombra `Content-Security-Policy-Report-Only` a
   `Content-Security-Policy` y se **elimina el header heredado permisivo**
   (`https:`, `'unsafe-inline'`, `'unsafe-eval'`). Los dos pasos van juntos: con
   los dos headers presentes, el heredado sigue mandando.
2. Se actualiza `LEGACY_ENFORCING_CSP_SHA256` y los tests que hoy verifican que
   el heredado esta intacto: dejan de tener sentido cuando se lo retira.
3. Se despliega **con alguien mirando** y con capacidad de revertir en el momento.

Criterio de entrada (todo junto, no parcial):
- Fase 2 cerrada con su criterio cumplido.
- Validado por separado: GTM (incluidas las etiquetas Custom HTML), HubSpot
  (envio real del formulario) y Meta (PageView y el evento de conversion).
- Decidido que hacer con los navegadores sin `'unsafe-hashes'` (Safari anterior
  a 15.4): ahi los atributos `on*` del menu movil, las FAQ, el carrusel y el
  envio del formulario dejarian de funcionar con la politica en enforcing.
- Un humano autoriza el despliegue. Ninguna IA pasa esta fase por su cuenta.

Rollback de la fase 3: volver a poner el header heredado y renombrar el estricto
a Report-Only, o revertir el commit. Requiere un despliegue nuevo, es decir
minutos con la politica estricta activa: por eso el criterio de entrada es
estricto y el despliegue es asistido.

## Quien decide que

| Decision | Quien |
| --- | --- |
| Desplegar cualquier fase | Berenise / Direccion (efecto externo) |
| Destino de los reportes, retencion y acceso | Berenise / Direccion |
| Valores de `N` y `M` (dias de observacion) | Berenise / Direccion |
| Opcion A o B para GTM | Berenise / Direccion, con el inventario de etiquetas |
| Agregar un origen a la allowlist con su evidencia | IA prepara, Direccion acepta al aprobar la fase |
| Agregar un comodin | Nadie: esta fuera de la politica. Si hiciera falta, se escala. |

## Lo que este plan NO hace

- No despliega, no toca Vercel, no llama a ninguna API y no crea ningun endpoint.
- No promueve ninguna directiva a enforcing.
- No declara probado ningun origen sin evidencia de runtime.
- No fija fechas: usa criterios de salida y parametros a definir por Direccion.
