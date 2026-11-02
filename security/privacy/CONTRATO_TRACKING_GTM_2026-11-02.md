# Contrato de tracking del sitio ↔ GTM-W65DNSWX — 02/11/2026 (r3, para preview)

> **r3:** incorpora la corrección de ChatGPT `56f252d` (PR #1). Si `dataLayer.push` o `fbq` fallan después de que HubSpot acepta, el visitante igual recibe la confirmación y no puede reenviar. Suma los casos 5 y 6, separa los resultados simulados de los observados y concreta la publicación y la vuelta atrás. Lo que sigue a esta nota es r2, con los cambios marcados.

Para quien opera Tag Manager. Sin credenciales ni datos del CRM. El repositorio del sitio es público.

## Estado (02/11/2026, ~17:00 UTC)
- **Producción:** `main` @ `0b93346`, sin cambios.
  - Sigue cargando `gtag.js` inline.
  - Sigue disparando `fbq('track','Lead')` con value 394738 ARS.
  - No emite `hubspot-form-success`.
- **Candidato:** rama `integracion/nov2026-tracking-privacidad`, ya en GitHub. El commit y la URL exactos del preview están en el mensaje de entrega; cada URL de deployment queda atada a su commit.
  - Código de tracking: `413b805` + **`56f252d`** (try/catch de dataLayer y Pixel tras el OK). El diff `0b93346..413b805` va al final y el de `56f252d` está en el PR #1.
  - Política de privacidad corregida en `7a38e0d`.
  - Los commits posteriores son de documentación y de metadatos CSP regenerados, más `.vercelignore`: la carpeta `security/` deja de publicarse en el sitio.
- **El preview tiene Protección de Deployments de Vercel**: responde con redirección al login.
  - Para abrirlo hace falta una sesión con acceso al equipo de Vercel o un enlace para compartir (Vercel → Deployment → Share).
  - Tag Assistant necesita esa misma sesión en el navegador.
- **Tests:** 69/69 (`node --test security/privacy/*.test.mjs security/csp/*.test.mjs`). Corren sin navegador: no reemplazan la prueba en preview.
- **Campaña Meta** `120252233514280542`: PAUSADA en los 3 niveles, gasto 0. No se toca.

## Lo que emite el sitio candidato (sin cambios desde `413b805`)
- **Evento de éxito:** `dataLayer.push({event: 'hubspot-form-success', terra_event_id})`.
  - Se emite **una vez por envío aceptado por HubSpot**, dentro de `if (response.ok)`.
  - No se emite en el click, en el submit inicial, ante un error ni al visitar `gracias.html`.
  - El objeto no lleva email, teléfono ni nombre.
- **Píxel de Meta:** `fbq('track','Lead', {}, {eventID: terra_event_id})`, solo tras el OK de HubSpot y sin value.
- **Eventos retirados:** ya no existe `terra_form_submit-02`.
- **GA4:** se carga solo desde GTM. No hay `gtag.js` inline.
- **Doble envío e identidad del envío:**
  - Mientras el primer envío está en vuelo, un segundo se descarta.
  - Un reintento tras error con el mismo email mantiene el mismo `terra_event_id`.
  - Con otro email, o después de un éxito, se genera uno nuevo.
- **Fallo de medición después del OK (r3):** `dataLayer.push` y `fbq` están aislados en try/catch, y `fbq` solo se llama si existe. Si alguno falla:
  - queda un `console.warn`;
  - **no se muestra error**;
  - el botón sigue deshabilitado y el guard no se libera, así que un segundo envío se descarta;
  - a los 600 ms se redirige a `gracias.html`.
  - El fallo de uno no impide el otro.
- **Webhook de enriquecimiento:** el sitio llama a `n8n…/webhook/terra-enrichment` después del OK. Ese workflow está apagado a propósito, así que **la consola mostrará un 404 o un error en esa llamada. Es esperado** y no bloquea al visitante.

## Cambios de GTM en el workspace 49 (informados por quien opera GTM; no verificados desde este frente)
1. GA4 directo, sin `server_container_url` (`ss.terraseguridad.com.ar`).
2. `generate_lead` disparado por el activador de `hubspot-form-success`.
3. `event_id` toma la variable existente «DLV - Terra - Event ID.», que lee `terra_event_id`.
4. Interceptor y Listener antiguos pausados: dejan de capturar datos personales del DOM.

Se verifican en la prueba conjunta, con Tag Assistant contra el preview.

## Prueba conjunta en el preview (antes de publicar nada)
Precondiciones:
- **Modo Vista previa de GTM** del workspace 49, conectado a la URL del preview.
- **Meta Events Manager → Probar eventos**, abierto para el píxel `689271596885956`.
- **HubSpot** abierto para leer el contacto.
- **Identidad de prueba:** nombre «PRUEBA PREVIEW» y un alias `+prueba` de la casilla de Terra.
- Cada éxito llega al HubSpot real y al píxel real. Hay que hacer **un solo éxito por caso** y marcar el contacto como PRUEBA.

**Caso 1. Éxito una vez**
- **Cómo:** enviar el formulario normalmente.
- **Esperado:**
  - dataLayer: 1 `hubspot-form-success` con `terra_event_id`.
  - GTM: el tag de `generate_lead` se dispara 1 vez, con `event_id` igual a ese `terra_event_id`. El Interceptor y el Listener no se disparan.
  - GA4 DebugView: 1 `generate_lead` y 1 `page_view` por página.
  - Meta: 1 `Lead` con el mismo `eventID` y sin value.
  - HubSpot: 1 contacto.
  - Redirección a `gracias.html`, sin query.

**Caso 2. Error sin conversión**
- **Cómo:** en DevTools → Network, bloquear `api.hsforms.com` (Request blocking) y enviar.
- **Esperado:**
  - El visitante ve el mensaje de error y el botón vuelve a habilitarse.
  - 0 `hubspot-form-success`, 0 `generate_lead` y 0 `Lead`.
  - Ningún contacto nuevo en HubSpot.

**Caso 3. Doble clic**
- **Cómo:** con la red lenta (throttling «Slow 3G»), hacer doble clic o apretar Enter repetido en «Solicitar».
- **Esperado:**
  - 1 solo POST a `api.hsforms.com`.
  - Todo lo del caso 1, una sola vez.

**Caso 4. Reintento sin duplicar**
- **Cómo:** bloquear `api.hsforms.com` y enviar (falla). Después desbloquear y reenviar con el **mismo email**.
- **Esperado:**
  - 2 POST a HubSpot con el mismo `terra_event_id`.
  - 1 `hubspot-form-success`, 1 `generate_lead` y 1 `Lead`, los tres con ese id.
  - 1 contacto en HubSpot.

**Caso 5. Fallo de dataLayer después de que HubSpot acepta (r3)**
- **Cómo:** con GTM ya cargado, en la consola de DevTools ejecutar `window.dataLayer.push = () => { throw new Error('simulado'); }` y enviar con otro alias `+prueba`. Inmediatamente, tocar «Solicitar» de nuevo o apretar Enter.
- **Esperado:**
  - El visitante no ve un mensaje de error y llega a `gracias.html`.
  - 1 solo POST a `api.hsforms.com` y 1 contacto en HubSpot.
  - 0 `generate_lead`: es lo esperado, porque el push falló.
  - 1 `Lead` en Meta con `eventID`.
  - En la consola, «Medicion de Google no disponible».

**Caso 6. Fallo del Pixel después de que HubSpot acepta (r3)**
- **Cómo:** en la consola ejecutar `window.fbq = () => { throw new Error('simulado'); }` y enviar con otro alias `+prueba`. Inmediatamente, reintentar el envío.
- **Esperado:**
  - El visitante no ve un mensaje de error y llega a `gracias.html`.
  - 1 solo POST y 1 contacto en HubSpot.
  - 1 `hubspot-form-success` y 1 `generate_lead`.
  - 0 `Lead` en Meta.
  - En la consola, «Medicion de Meta no disponible».
- **Variante sin script:** bloquear `connect.facebook.net`. Debe dar el mismo resultado, sin warning.

Los casos 5 y 6 crean un contacto real cada uno: usar alias distintos y marcarlos PRUEBA.

**Separación de resultados.** Al reportar, cada fila lleva su fuente.
- **Simulado:** el arnés `node --test`, sin red ni navegador. Hoy está en verde para los 6 casos: 69/69 pruebas.
- **Observado:** navegador, GA4 DebugView, Meta Probar eventos, HubSpot. **Hoy está todo pendiente.**

Ningún caso se da por aprobado por el resultado simulado.

En cualquier página, además:
- El dataLayer **no** debe contener email, teléfono ni nombre en ningún push.
- No debe haber requests a `ss.terraseguridad.com.ar`.

Si algún caso falla, **no se publica nada**: se corrige y se repite.

## Publicación y vuelta atrás concretas (r3)
**El sitio no tiene paso de build.** No hay `package.json`: Vercel sirve los archivos del commit tal cual.
- Igual, promover o mergear genera un **deployment nuevo**, así que no se asume que sea equivalente al preview probado: se verifica con `node security/deploy/verificar-artefacto.mjs <url> <commit>`.
- El verificador compara byte a byte (SHA-256) cada archivo servido, los headers CSP contra `vercel.json` y que `security/` dé 404.
- Ya se probó contra producción: `0b93346` da 13/13 archivos idénticos, y el control negativo contra el candidato detecta 4 diferencias.

| Paso | Quién | Acción exacta | Comprobación |
|---|---|---|---|
| 0 | ChatGPT | Anotar el **número de la versión publicada actual** de GTM-W65DNSWX, que es el destino de la vuelta atrás | — |
| 1 | Ambos | Casos 1 a 6 en el preview, todos observados en verde | Tabla de resultados con la fuente de cada uno |
| 2 | ChatGPT | Publicar el workspace 49 y avisar el número de versión nueva | Versión publicada visible en GTM |
| 3 | Claude, con OK de Dirección | **Inmediatamente:** `git push origin <commit-probado>:main` (fast-forward; `main` es ancestro). Vercel construye producción desde ese mismo commit | Deployment Production en estado READY |
| 4 | Claude | `node security/deploy/verificar-artefacto.mjs https://www.terraseguridad.com.ar <commit-probado>` | «Equivalente a …» con código 0 |
| 5 | Ambos | Caso 1 una vez en producción (GA4 DebugView, Meta, HubSpot), sin `gtag.js` inline y con `politicas.html` nueva | Observado |

Vuelta atrás:
- **Sitio:** Vercel → Deployments → el de producción de `0b93346` → **Instant Rollback**. No reconstruye.
  - Después, hacer `git revert` en `main` para que el próximo push no vuelva a publicar el candidato.
  - Verificar con `verificar-artefacto.mjs … 0b93346`.
- **GTM:** publicar de nuevo la versión anotada en el paso 0.
- **Combinaciones que no se pueden dejar:**
  - Sitio nuevo con GTM viejo: la tag vieja dispara al click y GA4 queda detrás del sGTM roto.
  - GTM nuevo con sitio viejo: sin `generate_lead`.
  - Si una de las dos partes vuelve atrás, **la otra también vuelve**.

## Orden de publicación (no invertir)
1. Prueba conjunta en el preview, con los 6 casos en verde.
2. **Publicar GTM** (workspace 49). Lo hace quien opera GTM.
3. **Inmediatamente después, desplegar el sitio:** promover a producción **el mismo deployment probado**, o hacer el merge a `main` de ese commit. Requiere el OK de Dirección.
4. **Verificar producción:**
   - Repetir el caso 1 una vez en `https://www.terraseguridad.com.ar/`, con GA4 DebugView y Meta Probar eventos.
   - Confirmar que ya no queda `gtag.js` inline.

Por qué GTM va primero:
- **Sitio antes que GTM:** GA4 quedaría solo detrás del sGTM, que tiene el certificado roto, y la tag vieja seguiría disparando al click.
- **GTM antes que el sitio:** entre los pasos 2 y 3, producción todavía no emite `hubspot-form-success`, así que no sale `generate_lead`, y el `page_view` sale duplicado (inline + GTM). Por eso esos dos pasos van seguidos.

Vuelta atrás:
- **GTM:** volver a la versión publicada anterior.
- **Sitio:** volver en Vercel al deployment de producción anterior (`0b93346`).

Dejar de usar `ss.terraseguridad.com.ar` no repara su certificado autofirmado.

## Política de privacidad en el candidato (`7a38e0d`)
**Corrección técnica:**
- Se quitó la afirmación «no serán compartidos con terceros».
- Se enumeran los servicios realmente usados:
  - HubSpot;
  - n8n en Railway;
  - Píxel de Meta;
  - formularios de Meta (Lead Ads → HubSpot);
  - Google Tag Manager y Analytics;
  - Google Fonts;
  - Vercel;
  - las etiquetas del contenedor GTM.
- Meta CAPI figura como desactivado.

**Sin marcadores:**
- Lo que no consta se omite del texto; no se rellena.
- Eso incluye plazos de conservación, datos del responsable, marco legal y mecanismo de consentimiento.
- Esos datos legales siguen pendientes fuera del sitio, para Dirección.

**Etiquetas de GTM:** la política nombra el contenedor GTM-W65DNSWX. Si se agrega una etiqueta de otro proveedor, avisar para sumarla a la lista.

## Diff `0b93346..413b805` (index.html, main.js), resumido

```diff
--- a/index.html
+++ b/index.html
-  <script async src="https://www.googletagmanager.com/gtag/js?id=G-QRZ0RHZ71N"></script>
-  <script> … gtag('config', 'G-QRZ0RHZ71N'); </script>
+  <!-- 2026-11-01: GA4 G-QRZ0RHZ71N se carga solo via GTM-W65DNSWX (antes duplicado inline). -->
-        <form id="contactForm" onsubmit="handleSubmit(event)">
+        <form id="contactForm" method="post" action="/">
-          <button type="submit" class="form-submit">
+          <button type="submit" class="form-submit" disabled>
-          <p class="form-legal">… Tus datos no serán compartidos con terceros.</p>
+          <p class="form-legal">… registramos tus datos en nuestro CRM (HubSpot) y los procesa nuestra automatización; además, este sitio usa herramientas de medición y publicidad de Meta y de Google. …</p>
+          <p class="form-legal form-fallback" id="formFallback">Si no podés enviar el formulario, escribinos por WhatsApp …</p>
--- a/main.js
+++ b/main.js
+var envioEnCurso = false;
+var envioPendiente = null;
+(function() { /* enlaza submit, habilita el botón, oculta el fallback */ })();
 handleSubmit:
+  if (envioEnCurso) return;
+  envioEnCurso = true;
+  const emailClave = String(new FormData(e.target).get('email') || '').trim().toLowerCase();
+  const eventId = (envioPendiente && envioPendiente.email === emailClave) ? envioPendiente.id : crypto.randomUUID() …;
+  envioPendiente = { id: eventId, email: emailClave };
-  window.dataLayer.push({ event: 'terra_form_submit-02', terra_event_id: eventId });
-  (consulta a ipify y campo client_ip)
 if (response.ok):
+      envioPendiente = null;
+      window.dataLayer.push({ event: 'hubspot-form-success', terra_event_id: eventId });
-      fbq('track', 'Lead', { value: 394738, currency: 'ARS', event_id: eventId });
+      fbq('track', 'Lead', {}, { eventID: eventId });
 showFormError:
+  envioEnCurso = false; // libera el guard para permitir el reintento
```

Diff completo: `git diff 0b93346..413b805 -- index.html main.js` en el repositorio público.
