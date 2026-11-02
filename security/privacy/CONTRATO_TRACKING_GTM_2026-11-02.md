# Contrato de tracking del sitio ↔ GTM-W65DNSWX — checkpoint 02/11/2026

Para coordinar con quien opera Tag Manager. Sin credenciales. El código del sitio es público; el diff no contiene secretos.

## Checkpoint recuperado tras el corte (verificado 02/11 12:40 UTC)
- Repo del sitio: `terraseguridadbb-arch/terra-seguridad`. **Producción = `main` @ `0b93346`** (deploy Vercel `dpl_DT6x5t59…`, 02/06/2026).
- Código preparado: rama **`integracion/nov2026-tracking-privacidad` @ `413b805`**, **solo local** (worktree `C:\Users\Usuario\terra-seguridad-integracion`). **No está en GitHub**: por eso la búsqueda remota no la encontró. No se perdió.
  - Base `50c4b05`: rama del frente de privacidad `work/terra-os-autonomous-v1`.
- Pruebas: 67/67 (`node --test security/privacy/*.test.mjs security/csp/*.test.mjs`). Son pruebas sobre el `main.js` real con un arnés sin red ni navegador: **no reemplazan una prueba en preview**.
- Campaña Meta `120252233514280542`: los 3 niveles en PAUSA, gasto 0. n8n: 0/45 workflows activos.

## Respuestas a lo pedido
1. **Versión y diff:** `0b93346..413b805`, archivos `index.html` y `main.js`. Diff completo al final.
2. **GA4 se inicializa una sola vez, vía GTM.** El candidato **quita** el `gtag.js` + `gtag('config','G-QRZ0RHZ71N')` inline de `index.html`. El sitio no llama a `gtag('event', …)` en ningún lado: el único dueño de `generate_lead` es la tag 118 de GTM. `gracias.html` ya solo tenía GTM.
3. **Evento posterior a la confirmación de HubSpot:** `window.dataLayer.push({event: 'hubspot-form-success', terra_event_id: eventId})`.
   - Se emite dentro de `if (response.ok)` del POST a `api.hsforms.com/submissions/v3/integration/submit/…`, **una vez por envío aceptado**.
   - Objeto sin email, teléfono ni nombre.
   - No se emite en click, submit inicial, error, abandono ni al visitar `gracias.html`.
   - Se **eliminó** el push `terra_form_submit-02`, que salía en el submit antes de la respuesta.
   - El mismo `eventId` va como `eventID` en `fbq('track','Lead',{}, {eventID})`, que también se dispara solo tras el OK. Se quitó el value ficticio.
4. **Identidad y doble envío:**
   - `envioEnCurso` descarta un segundo submit mientras el primero está en vuelo.
   - Si un intento falla, `showFormError` libera el guard. El reintento con el **mismo email** reutiliza el mismo `terra_event_id`; con otro email se genera uno nuevo. Tras el éxito se renueva.
   - El email solo se compara en memoria y no se guarda.
   - Probado: reintento ⇒ 2 POST a HubSpot con el mismo id, 1 `hubspot-form-success`, 1 Lead; doble submit ⇒ 1 POST.
5. **Consentimiento y URLs:**
   - **No hay señales de consentimiento implementadas**: sin banner, sin `gtag('consent','default',…)`, sin `fbq('consent',…)`. Las dos opciones están en `PROPUESTA_2026-11-01.md` §2, pendientes de decisión de Dirección.
   - URLs sin datos personales: el `<form>` pasa a `method="post" action="/"` y el botón viene deshabilitado hasta que `main.js` enlaza el handler, así que no hay GET nativo con `?email=…`. La redirección va a `gracias.html` sin query. Se eliminó la consulta a ipify.
   - **Sigue existiendo** el advanced matching del píxel: hashes SHA-256 en `localStorage.terra_am`, enviados en el `fbq('init')`.

## Puntos para GTM (los opera quien tiene el contenedor)
- `{{Unique Event ID}}` es la variable integrada de GTM: un número interno por cada push al dataLayer, **no** el `terra_event_id`. Para trazar con Meta/CRM conviene una variable de capa de datos `terra_event_id`. GA4 no deduplica por `event_id`.
- La tag 14 («Interceptor - Terra Form Submit») lee del DOM y empuja email, teléfono y nombre al dataLayer en el submit. El sitio **no** la usa ni la alimenta. Mientras siga activa, esos datos personales siguen en el dataLayer: decide quien opera GTM.
- El activador «Exito Formulario HubSpot» escucha `hubspot-form-success`. **El sitio en producción (`0b93346`) nunca emite ese evento**: con solo GTM publicado, `generate_lead` deja de dispararse hasta desplegar `413b805`.
- Dejar de usar `ss.terraseguridad.com.ar` **no** repara su certificado autofirmado.

## Orden de publicación (coincide con el propuesto)
1. **Preview conjunto antes de publicar nada.** Tag Assistant contra una URL que sirva `413b805`. Requiere subir la rama a GitHub, lo que genera un **Preview de Vercel** (no producción). Esa subida **todavía no se hizo**: espera autorización de Berenise.
   - Una prueba de envío en preview llega al HubSpot real y al píxel real: hacer una sola, con un contacto de prueba identificado y con HubSpot accesible para verificarla.
2. Publicar GTM (tags 110 y 118).
3. **Inmediatamente después**, desplegar `413b805` a producción.
4. Verificar juntos: GA4 DebugView (1 `page_view` por página, 1 `generate_lead` por envío aceptado, 0 ante error) y Meta Test Events (1 Lead con `eventID`).

Por qué GTM va primero:
- Si se despliega primero el sitio, sin la tag 110 corregida, GA4 queda solo detrás del sGTM con certificado roto y se pierden page_views. Además la tag 118 vieja sigue disparando al click.
- En el orden inverso, el costo es acotado: entre los pasos 2 y 3 hay `page_view` duplicado (inline + GTM) y no sale `generate_lead`. Por eso 2 y 3 van seguidos.

## Diff saneado `0b93346..413b805` (index.html, main.js)

```diff
diff --git a/index.html b/index.html
index b70dd61..748a412 100644
--- a/index.html
+++ b/index.html
@@ -9,13 +9,7 @@
     })(window,document,'script','dataLayer','GTM-W65DNSWX');
   </script>
 
-  <script async src="https://www.googletagmanager.com/gtag/js?id=G-QRZ0RHZ71N"></script>
-  <script>
-    window.dataLayer = window.dataLayer || [];
-    function gtag(){dataLayer.push(arguments);}
-    gtag('js', new Date());
-    gtag('config', 'G-QRZ0RHZ71N');
-  </script>
+  <!-- 2026-11-01: GA4 G-QRZ0RHZ71N se carga solo via GTM-W65DNSWX (antes duplicado inline). Desplegar DESPUES de quitar server_container_url en GTM. -->
   <!-- Meta Pixel Base Code with Advanced Matching desde localStorage -->
   <script>
     !function(f,b,e,v,n,t,s)
@@ -601,7 +595,7 @@
       <div class="form-card" id="formCard">
         <div class="form-title">Solicitá tu cotización gratuita</div>
         <p class="form-sub">Te respondemos en menos de 24 horas hábiles</p>
-        <form id="contactForm" onsubmit="handleSubmit(event)">
+        <form id="contactForm" method="post" action="/">
           <div class="form-group form-two-col">
             <div>
               <label class="form-label" for="nombreContacto">Nombre *</label>
@@ -626,11 +620,12 @@
               <input class="form-input" type="number" id="telefonoContacto" name="telefono" placeholder="Ej: 4523-6789" required />
             </div>
           </div>
-          <button type="submit" class="form-submit">
+          <button type="submit" class="form-submit" disabled>
             <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
             Solicitar mi cotización gratis
           </button>
-          <p class="form-legal">Al enviar este formulario aceptás nuestras <a href="politicas.html" target="_blank" style="color:var(--blue);text-decoration:underline;">políticas de privacidad</a>. Tus datos no serán compartidos con terceros.</p>
+          <p class="form-legal">Al enviar este formulario aceptás nuestras <a href="politicas.html" target="_blank" style="color:var(--blue);text-decoration:underline;">políticas de privacidad</a>. Para atenderte registramos tus datos en nuestro CRM (HubSpot) y los procesa nuestra automatización; además, este sitio usa herramientas de medición y publicidad de Meta y de Google. En las políticas está el detalle de quién recibe qué, y también lo que no podemos enumerar desde el sitio.</p>
+          <p class="form-legal form-fallback" id="formFallback">Si no podés enviar el formulario, escribinos por WhatsApp al <a href="https://wa.me/5491130089046" target="_blank">+54 9 11 3008-9046</a>.</p>
         </form>
         <div class="form-success" id="formSuccess">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
diff --git a/main.js b/main.js
index 837cae0..2777141 100644
--- a/main.js
+++ b/main.js
@@ -1,5 +1,26 @@
 document.body.classList.add('js-loaded');
 
+/* ── FORM BINDING (WP-WEB-FORM-RESILIENCE-01) ── */
+// El boton de envio viene deshabilitado en el HTML y el <form> no tiene handler
+// inline: si este archivo no carga o falla antes de llegar aca, no hay envio
+// nativo posible (y por lo tanto ninguna URL con datos personales). Se enlaza
+// primero para que un fallo en el resto del archivo no deje el form inutil.
+// `var` a proposito: se eleva, asi handleSubmit nunca cae en zona muerta temporal.
+var envioEnCurso = false;
+// 2026-11-01: identidad estable del envio. Si un intento falla, el reintento con el mismo
+// email reutiliza el mismo terra_event_id (no se crea una conversion nueva); se renueva al
+// confirmarse el envio. El email solo se compara en memoria, no se guarda.
+var envioPendiente = null;
+(function() {
+  const form = document.getElementById('contactForm');
+  if (!form) return;
+  form.addEventListener('submit', handleSubmit);
+  const btn = form.querySelector('.form-submit');
+  if (btn) btn.disabled = false;
+  const fallback = document.getElementById('formFallback');
+  if (fallback) fallback.hidden = true;
+})();
+
 /* ── TRACKING: terra_eid + fbc cookies ── */
 (function() {
   function getCookie(name) {
@@ -172,19 +193,24 @@ document.getElementById('equipCarousel').addEventListener('mouseleave', () => {
 /* ── FORM SUBMIT ── */
 async function handleSubmit(e) {
   e.preventDefault();
-
-  // Generar nuevo terra_eid para este submit (deduplicación CAPI)
-  const eventId = typeof crypto !== 'undefined' && crypto.randomUUID
-    ? crypto.randomUUID()
-    : 'terra_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
+  // Un solo envio a HubSpot por click: un segundo submit (p. ej. Enter) mientras
+  // el primero esta en vuelo se descarta. Solo showFormError libera el guard.
+  if (envioEnCurso) return;
+  envioEnCurso = true;
+
+  // terra_eid del envio (deduplicacion CAPI). Se reutiliza en reintentos del mismo email.
+  const emailClave = String(new FormData(e.target).get('email') || '').trim().toLowerCase();
+  const eventId = (envioPendiente && envioPendiente.email === emailClave)
+    ? envioPendiente.id
+    : (typeof crypto !== 'undefined' && crypto.randomUUID
+      ? crypto.randomUUID()
+      : 'terra_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));
+  envioPendiente = { id: eventId, email: emailClave };
   document.cookie = 'terra_eid=' + eventId + ';path=/;max-age=1800;SameSite=Lax';
   window.terra_eid = eventId;
+  // 2026-11-01: sin evento al dataLayer en el submit: el unico evento de formulario
+  // es hubspot-form-success, despues de que HubSpot acepta el envio.
 
-  window.dataLayer = window.dataLayer || [];
-  window.dataLayer.push({
-    event: 'terra_form_submit-02',
-    terra_event_id: eventId
-  });
 
   const btn = e.target.querySelector('.form-submit');
   const originalText = btn.innerHTML;
@@ -202,11 +228,17 @@ async function handleSubmit(e) {
     var m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
     return m ? m[2] : null;
   }
-  let clientIp = '';
-  try {
-    const ipRes = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(2000) });
-    if (ipRes.ok) clientIp = (await ipRes.json()).ip || '';
-  } catch (_) { /* ipify timeout/fail — seguir sin client_ip */ }
+  // NEXT-SEC-15 (DIR18-03): el navegador ya NO consulta ningun servicio externo
+  // de lookup de IP. El formulario no depende de la IP del visitante: el submit
+  // se completa sin ella y la IP deja de capturarse como dato y de adjuntarse a
+  // los envios. OJO: eso no la hace invisible. Todo servidor al que el navegador
+  // se conecta directo (HubSpot, el webhook, Meta, Google, el alojamiento) sigue
+  // viendo la IP de la conexion: lo que cambia es que ya no viaja como campo.
+  // Contrato de payload: ese campo queda AUSENTE (no vacio, no nulo) tanto en
+  // HubSpot Forms como en el webhook de enrichment; los consumidores aguas
+  // abajo ya lo tratan como opcional.
+  // Tomar la IP del lado servidor NO esta implementado: es una PROPUESTA
+  // pendiente de decision humana (security/privacy/PROPOSAL_IP_SERVIDOR.md).
 
   const requestBody = {
     fields: [
@@ -217,7 +249,6 @@ async function handleSubmit(e) {
       { name: "terra_event_id", value: eventId },
       { name: "fbc", value: getCookie('_fbc') || '' },
       { name: "fbp", value: getCookie('_fbp') || '' },
-      { name: "client_ip", value: clientIp },
       { name: "client_user_agent", value: navigator.userAgent || '' }
     ],
     context: {
@@ -234,7 +265,13 @@ async function handleSubmit(e) {
     });
 
     if (response.ok) {
-      // ENRICHMENT 2026-05-28: backfill fbc/fbp/client_ip/client_user_agent al contacto HubSpot.
+      // FIX 2026-11-01: evento de exito real (HubSpot acepto el envio). Lo escucha el activador
+      // existente de GTM "Web -Trigger - Exito Formulario HubSpot". Sin datos personales.
+      envioPendiente = null;
+      window.dataLayer = window.dataLayer || [];
+      window.dataLayer.push({ event: 'hubspot-form-success', terra_event_id: eventId });
+      // ENRICHMENT 2026-05-28: backfill de fbc/fbp/user agent al contacto HubSpot.
+      // NEXT-SEC-15: la IP del visitante salio de este payload.
       // El Forms API descarta esos hidden fields (catch-22 v3/v4 documentado), workaround: PATCH via Contacts API.
       // HOTFIX: fetch + keepalive (reemplaza sendBeacon que no llegaba al webhook en pruebas reales).
       // keepalive: true le dice al browser que comprometa el request aun si la pagina se descarga.
@@ -247,7 +284,6 @@ async function handleSubmit(e) {
             terra_event_id: eventId,
             fbc: getCookie('_fbc') || null,
             fbp: getCookie('_fbp') || null,
-            client_ip: clientIp || null,
             client_user_agent: navigator.userAgent || null
           }),
           keepalive: true
@@ -258,17 +294,16 @@ async function handleSubmit(e) {
       // que causaba warning "Duplicate Pixel ID" en consola.
       // Ahora el init único ocurre en index.html con AM desde localStorage['terra_am'].
       // Para first-time submits, el browser Lead va sin AM en user_data — pero
-      // WF1 server-side envía el mismo Lead via CAPI con em/ph/fn/ln/fbc/fbp/ip/ua/country
+      // WF1 server-side envía el mismo Lead via CAPI con em/ph/fn/ln/fbc/fbp/ua/country
+      // (desde NEXT-SEC-15 ya no viaja la IP del visitante: el navegador no la obtiene)
       // y Meta deduplica via event_id, mergeando los user_data. Sin pérdida real de match quality.
       //
       // HOTFIX 2026-05-28: setTimeout en lugar de eventCallback.
       // eventCallback NO dispara con ad-blockers o si Pixel se carga lento -> user queda bloqueado en el form.
       // setTimeout 600ms da margen al Pixel beacon (~200-300ms tipico) y al sendBeacon de enrichment, sin depender del Pixel.
-      fbq('track', 'Lead', {
-        value: 394738,
-        currency: 'ARS',
-        event_id: eventId
-      });
+      // FIX 2026-11-01: eventID como 4.o argumento (unico campo que Meta usa para deduplicar
+      // contra CAPI). Sin value/currency: 394738 ARS era un precio estimado, no ingreso de Terra.
+      fbq('track', 'Lead', {}, { eventID: eventId });
 
       // Advanced Matching persist 2026-06-02:
       // guardar hashes SHA-256 (trim+lowercase) en localStorage para que el PageView
@@ -335,6 +370,7 @@ async function handleSubmit(e) {
 }
 
 function showFormError(btn, originalText, msg) {
+  envioEnCurso = false; // 2026-11-01: libera el guard para permitir el reintento
   btn.disabled = false;
   btn.innerHTML = originalText;
   const existing = document.getElementById('formError');
```
