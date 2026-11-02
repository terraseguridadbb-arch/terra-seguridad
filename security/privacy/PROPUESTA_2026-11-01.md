# Propuesta 2026-11-01 — privacidad, consentimiento, GA4/GTM y formulario Meta

Rama `integracion/nov2026-tracking-privacidad` (base `50c4b05`, la del frente `work/terra-os-autonomous-v1`).
No se publicó nada. No certifica cumplimiento legal: ordena los datos verificados y marca los faltantes.

## Nota para el frente `work/terra-os-autonomous-v1`

- Su copia de trabajo local **no se tocó**. Sus cambios sin commitear (form-resilience) se integraron aquí como commit `29edfb4`, copiados literalmente. Hacía falta regenerar el inventario CSP y se regeneró con `security/csp/README`.
- Mis commits encima: `4f2cc67` (Lead con `eventID`, sin value ficticio, evento de éxito), `6b3428c` (CSP regenerada), `3059f95` (GA4 solo vía GTM). El 02/11 el evento de éxito se renombró a `hubspot-form-success` (activador GTM existente), se quitó `terra_form_submit-02` del submit, el reintento conserva el `terra_event_id` y `showFormError` libera el guard (su parche lo dejaba bloqueado).
- Tests: 67/67 (`node --test security/privacy/*.test.mjs security/csp/*.test.mjs`).
- Si retoman su rama: rebase sobre esta o cherry-pick de los 3 commits; descartar su diff local (ya está en `29edfb4`).

## 1. Política de privacidad (`politicas.html`) — qué está verificado y qué falta

Base: la política generada desde `DATA_RECIPIENTS.json` (8 destinatarios del navegador, con evidencia en código). Verificado el 01/11:

| Ítem | Estado | Evidencia / acción |
|---|---|---|
| Destinatarios del navegador (HubSpot, n8n/Railway, Meta pixel, Google GTM/GA4, Google Fonts, Vercel…) | VERIFICADO en código | `DATA_RECIPIENTS.json` + tests |
| Meta CAPI desde servidor | Describe la capacidad, pero **hoy está apagado** (WF1/WF14 sin CAPI, decisión de dueño único) | Propuesta: «cuando está activa…» en lugar de «se dispara» |
| Destinatarios fuera del navegador: Google Sheets (logs n8n: IDs y prefijos de hash), bot WhatsApp Agustina (Railway, hoy apagado), agencia/ADT al contratar | VERIFICADO que existen en el código n8n o en documentos comerciales; **falta que Dirección decida cómo declararlos** | Agregar sección «Después del contacto» |
| Responsable: razón social, CUIT, domicilio legal | **FALTA**: no figura en ninguna fuente leída | Berenise debe aportarlo; no se inventa |
| Contacto publicado | En el sitio: WhatsApp +54 9 11 3008-9046, «Estomba 666, Bahía Blanca», `terra@serviciosmx.com` (otro dominio) | **Confirmar** que el email y el domicilio son canales vigentes del responsable |
| Conservación por destinatario | FALTA (`[DATO_A_COMPLETAR_POR_DIRECCION]`) | Dirección define plazos |
| Derechos (acceso, rectificación, supresión) y autoridad de control (AAIP, Ley 25.326) | La política no los nombra | Propuesta de texto informativo (abajo), sin afirmar cumplimiento |
| Fecha de actualización | «2026» | Poner la fecha exacta al publicar |

Texto propuesto para agregar (completar los corchetes, no publicar con corchetes):

> **Responsable.** [RAZÓN SOCIAL], CUIT [CUIT], domicilio [DOMICILIO]. Contacto para consultas sobre tus datos: [EMAIL VIGENTE].
> **Tus derechos.** Podés solicitar acceso, rectificación o supresión de tus datos escribiendo a [EMAIL VIGENTE]. La Agencia de Acceso a la Información Pública (AAIP) es el órgano de control de la Ley 25.326.
> **Después del contacto.** Si avanzás con una contratación, los datos necesarios para el alta se comparten con [AGENCIA/ADT — confirmar]. Los registros técnicos de nuestra automatización se guardan en Google Sheets sin tu correo ni teléfono en claro.

## 2. Consentimiento — dos opciones para decidir (no implementadas)

Hoy no hay banner: Pixel (con advanced matching), GTM y GA4 cargan al abrir la página.

| | A. Aviso + control (opt-out) | B. Consentimiento previo (opt-in) |
|---|---|---|
| Comportamiento | Banner informativo con «Rechazar»; al rechazar: `fbq('consent','revoke')` y `gtag('consent','update',{ad_storage:'denied',analytics_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'})`, guardado 6 meses | Default `denied` + `fbq('consent','revoke')` antes de cualquier tag; recién con «Aceptar», `grant`/`update granted` |
| Efecto en la campaña | Medición casi intacta | Menos Lead del píxel atribuidos: afecta la optimización de la campaña N03 |
| Cambio de código | `index.html`/`gracias.html` (banner + consent) + GTM: Consent Mode en la etiqueta Google | Igual, más el orden de carga |

Decisión de Berenise (comercial/legal). Cualquiera de las dos respeta la elección del visitante en todas las etiquetas, incluidas las de GTM.

## 3. GA4 / GTM — coordinación (actualizado 2026-11-02)

Tag Manager lo opera ChatGPT; desde este frente no se edita ni se publica el contenedor. Borrador de ChatGPT en GTM-W65DNSWX, workspace 49, sin publicar:
- tag 110 sin `server_container_url`;
- tag 118 (GA4 `generate_lead`) con el activador existente «Web -Trigger - Exito Formulario HubSpot» (`hubspot-form-success`).

El sitio emite exactamente `{event: 'hubspot-form-success', terra_event_id}`, una vez por envío aceptado por HubSpot (commit de alineación del 02/11). Contrato completo y orden de publicación: `security/privacy/CONTRATO_TRACKING_GTM_2026-11-02.md`.

Quitar el tráfico de GA4 de `ss.terraseguridad.com.ar` **no arregla su certificado**: ese subdominio sigue sirviendo un certificado autofirmado hasta que se retire o renueve el registro.

## 4. Formulario Meta 1585698662738057 — comparación para autorización (no creado)

Los formularios publicados en Meta no admiten edición: corregir el enlace exige una **copia nueva**. Se conserva todo salvo **una** modificación:

| Campo | Actual (1585698662738057) | Copia propuesta |
|---|---|---|
| Preguntas | EMAIL `email`, FULL_NAME `full_name`, PHONE `phone_number` | idénticas |
| Idioma | en_US | idéntico |
| Pantalla de introducción | título «Terra Seguridad - Agente Oficial ADT», texto actual | idéntica (ver nota) |
| Título de preguntas | «Usaremos tus datos solo para contactarte por la promoción» | idéntico |
| Agradecimiento | «¡Todo listo! Recibimos tus datos.» + botón VIEW_WEBSITE → https://www.terraseguridad.com.ar/ | idéntico |
| Filtros | `block_display_for_non_targeted_viewer: true`, `allow_organic_lead: false`, `is_optimized_for_quality: false` | idénticos |
| **Política de privacidad** | `https://www.terraseguridad.com.ar/` («Política de Privacidad») | **`https://www.terraseguridad.com.ar/politicas.html`** ← única modificación |

Precondición: publicar antes la política corregida (hoy `politicas.html` en producción dice que los datos «no serán compartidos con terceros»).

**Nota aparte (no es parte de la copia):** la introducción y el título del formulario prometen «PLAN DE ACCESO EXCLUSIVO, Bonificación especial… te congelamos el precio del equipo» y «por la promoción», firmado «Soy Lean». Los anuncios N03 no ofrecen descuentos, y las fuentes de marketing del 25-30/10 piden no prometer bonificaciones sin confirmar. Si esas promesas no están vigentes, la copia debería cambiarlas también, pero eso ya sería una segunda modificación y la decisión es tuya.
