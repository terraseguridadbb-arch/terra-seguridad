# Contrato de tracking del sitio ↔ GTM-W65DNSWX — 02/11/2026 (r2, para preview)

Para quien opera Tag Manager. Sin credenciales ni datos del CRM. El repositorio del sitio es público.

## Estado (02/11/2026, ~17:00 UTC)
- **Producción:** `main` @ `0b93346`, sin cambios.
  - Sigue cargando `gtag.js` inline.
  - Sigue disparando `fbq('track','Lead')` con value 394738 ARS.
  - No emite `hubspot-form-success`.
- **Candidato:** rama `integracion/nov2026-tracking-privacidad`, ya en GitHub. El commit y la URL exactos del preview están en el mensaje de entrega; cada URL de deployment queda atada a su commit.
  - Código de tracking: igual que `413b805`. El diff `0b93346..413b805` va al final.
  - Política de privacidad corregida en `7a38e0d`.
  - Los commits posteriores son solo de documentación.
- **El preview tiene Protección de Deployments de Vercel**: responde con redirección al login.
  - Para abrirlo hace falta una sesión con acceso al equipo de Vercel o un enlace para compartir (Vercel → Deployment → Share).
  - Tag Assistant necesita esa misma sesión en el navegador.
- **Tests:** 67/67 (`node --test security/privacy/*.test.mjs security/csp/*.test.mjs`). Corren sin navegador: no reemplazan la prueba en preview.
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

En cualquier página, además:
- El dataLayer **no** debe contener email, teléfono ni nombre en ningún push.
- No debe haber requests a `ss.terraseguridad.com.ar`.

Si algún caso falla, **no se publica nada**: se corrige y se repite.

## Orden de publicación (no invertir)
1. Prueba conjunta en el preview, con los 4 casos en verde.
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
