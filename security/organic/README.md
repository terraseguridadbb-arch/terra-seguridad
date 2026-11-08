# Departamento SEO + GEO + AEO — Terra

Responsable: Dirección Terra. Implementación inicial del 7/11/2026. **Candidata para revisión; no autorizada todavía para producción.** Una aprobación de PR8/PR9 no aprueba esta tanda editorial.

## Un solo sistema

Fuente comercial y catálogo → registro de intenciones → contenido revisado → HTML estático y enlaces → QA → Preview → aprobación de Dirección → producción → observación y nuevas propuestas.

SEO sostiene rastreo, indexación e intención comercial. AEO hace explícitas las respuestas y condiciones. GEO trabaja identidad, fuentes y posibilidad de ser citado. Los tres usan el mismo contenido y las mismas conversiones; no se crean tres calendarios ni tres emisores de leads.

Vive en el repositorio web existente, `security/organic/`. Esa carpeta se excluye de Vercel. Solo se publican las siete páginas, `guias.css`, el sitemap y los enlaces desde el pie de la home. La home, formularios, políticas, etiquetas de conversión y servicios de otros frentes mantienen su comportamiento. El CSP Report-Only se regenera con los hashes de las páginas; no se amplía la lista de dominios ni se cambia la política enforcing.

## Componentes implementados

| Archivo | Función | Límite |
|---|---|---|
| content.json | Fuente editorial única, siete páginas, fuentes y briefs | No equivale a aprobación comercial |
| build.py | Generación determinista de HTML y sitemap | Se ejecuta al cambiar contenido, antes de commit |
| operations.json | Activos, permisos, estados, alertas y panel fijo de preguntas | Las fuentes pendientes no se declaran conectadas |
| backlog.csv | Los 18 briefs recuperados, sin perder pendientes | Una intención puede resolverse dentro de otra página |
| monitor.py | Lectura HTTP acotada de sitemap, robots, canonicals, HTML y gracias | No ejecuta JS; no prueba indexación, ventas ni render |
| metrics.py | Valida agregados y calcula tasas/ROI con base compatible | No descarga datos ni une personas; necesita fuentes reales |
| test_organic.py | Pruebas de publicación, fallas de monitor y métricas | Complementa la batería existente, no reemplaza QA visual |
| evidence/ | Resultados técnicos saneados y panel sin números inventados | Sin datos de clientes, cookies ni credenciales |

## Ejecución reproducible

```bash
python security/organic/build.py
node security/csp/inventory.mjs --write
node security/csp/allowlist.mjs --write
node security/csp/build-policy.mjs --write
python security/organic/build.py --check
python -m unittest discover -s security/organic -p 'test_*.py' -v
node --test security/ui/*.test.mjs security/seo/*.test.mjs security/privacy/*.test.mjs security/csp/*.test.mjs
node security/csp/check.mjs
python security/organic/monitor.py --output security/organic/evidence/production-baseline.json
python security/organic/metrics.py security/organic/evidence/metrics-input.json --output security/organic/evidence/metrics-status.json
```

El monitor solo acepta HTTPS del dominio canónico sin querystring; máximo 40 URL de sitemap, 2 MB por respuesta y 20 segundos por solicitud. No envía formularios ni dispara píxeles. Un fallo de acceso es desconocido/error, no una caída comercial certificada. Confirmar una anomalía desde una segunda lectura antes de alertar caída; nunca reparar producción por un único fallo de red. `elapsed_ms` es tiempo de esta prueba de red, **no LCP ni PageSpeed**. La página de privacidad no necesita schema; JSON-LD, si existe, debe ser válido.

## Contrato de medición

Un registro agregado tiene exactamente: `source`, `period_start`, `period_end`, `timezone`, `cohort`, `currency`, `metric`, `value`, `status`. Fuentes/métricas admitidas están en `metrics.py`. Fechas ISO; conservar la zona IANA real de la fuente y el corte de sus días. La presentación y horarios operativos usan `America/Argentina/Buenos_Aires`, pero no se reetiquetan agregados diarios de otra zona como argentinos; cohortes `period`, `lead_created_period`, `fixed_prompt_panel_v1`; moneda null para conteos o ARS/USD para finanzas. Sin nombres, emails, teléfonos, direcciones, textos libres ni IDs de clientes. No guardar exportaciones crudas en Git.

Cada importación necesita evidencia de origen y definiciones fuera del registro: propiedad, consulta, fecha de extracción, filtros, completitud, zona horaria real y límites del período. Si no se dispone de granularidad para convertir una ventana, conservar la ventana nativa y no unirla con otra incompatible. Las filas con estado distinto de `verified` llevan `value:null`. La entrada vacía inicial indica ausencia de datos conectados; no actividad cero. No cargar datos de demostración como línea base.

- Search Console: consultas y páginas, clics e impresiones; separar marca/no marca mediante reglas documentadas y comparar ventanas equivalentes. La posición media no es un ranking fijo.
- GA4: sesiones orgánicas y sesiones con lead confirmado, usando filtros compatibles. `click_whatsapp` es un microevento, no un mensaje; `generate_lead` depende del envío confirmado existente. No sumar eventos de inicio de formulario a leads.
- HubSpot: contactos válidos, calificados y activaciones atribuibles a cohorte orgánica. La atribución de origen actual y su conservación deben conciliarse con el otro frente. La cadena cerrada hasta venta **no está certificada** en esta implementación.
- Finanzas: comisión de Terra cobrada/devengada separadas, costos de adquisición completos y margen atribuible. ROI = (margen antes de adquisición − costo adquisición) / costo adquisición. Sin costos completos/margen real, no hay ROI calculable. No sumar ARS y USD ni usar el abono del cliente como ingreso Terra.
- GEO: 12 preguntas fijas por motor, sesión neutral, idioma/localidad/modelo/fecha/evidencia registrados. `brand_mentions` cuenta respuestas observadas que mencionan Terra al menos una vez, no apariciones del nombre. Mención y cita son distintas. Un motor no consultado es `unobserved`, no cero. El panel no representa cuota de mercado. Los referidos identificables de IA en GA4 no capturan todo el tráfico influido por IA.

La aplicación `metrics.py` valida consistencia formal y rechaza PII/campos desconocidos, duplicados, valores no finitos y cruces de fuente incorrectos. No puede certificar que una fuente sea verdadera ni que un filtro orgánico esté bien definido: esa conciliación es obligatoria antes de importar.

## Plan de puesta en marcha

1. **Ahora:** siete páginas y hub; revisión independiente, QA, Preview; evidencia y revisión de Dirección. Monitoreo público y propuestas pueden empezar antes de publicar.
2. **Tras aprobar la tanda:** integrar la candidata exacta, confirmar deployment READY y alias, HTTP completo, navegación móvil/escritorio, formulario/canales sin pruebas comerciales innecesarias, sitemap con nueve URL. Conservar versión previa para rollback. Solicitar revisión de sitemap en propiedad Search Console existente si el acceso lo permite; no crear otra propiedad ni forzar indexación masiva.
3. **Primeras dos semanas:** conectar lectura de GSC/GA4 en cuentas existentes; comprobar consulta acotada y conciliar una fila; resolver contrato de atribución orgánico→CRM con el frente propietario. Completar panel neutral GEO y fuentes del backlog. No instalar un proveedor pago sin evaluar costo y aprobarlo.
4. **Semanas 3–4:** elegir siguiente tanda a partir de preguntas/impresiones reales y objeciones comerciales; candidatos costos/instalación/mascotas solo con fuentes. No producir páginas locales por sustituir nombres de ciudad.
5. **Días 30–60:** observar indexación y consultas, mejorar respuestas/títulos/enlaces con evidencia; publicar caso autorizado si existe y un piloto local elegible. Proponer alianzas/menciones auténticas; contactos externos solo con instrucción expresa.
6. **Días 60–90:** decidir expansión por intención y localidad, evaluar cohortes maduras de consultas calificadas/activaciones/costos. Escalar lo que tenga utilidad y señales observadas, sin metas de posiciones garantizadas.

## Operación y decisiones

Diario: salud técnica y cambios materiales de visibilidad/menciones cuando existan fuentes. Semanal: revisar hasta tres competidores pertinentes, nuevas preguntas y oportunidades; proponer una tanda breve con fuente y justificación. Mensual: consolidar búsqueda, consultas calificadas, conversiones y costos por cohorte; distinguir resultado observado, hipótesis y acceso faltante. Los avisos se entregan en esta conversación, no a terceros.

Se crearon y habilitaron tres tareas: control diario desde 8/11/2026 por la mañana, propuesta semanal desde lunes 9/11 y revisión mensual desde 1/12. Registro técnico: evidence/scheduled-jobs.json. Primera ejecución todavía no observada. La automatización programada debe registrar su última ejecución, resultado y fuente. Una tarea habilitada no prueba que ya corrió. Un prompt programado no es una integración API: GSC/GA4 siguen pendientes hasta probar lectura. Si no hay fuente privada, el trabajo público continúa y el indicador queda desconocido. No reactivar n8n ni servicios de Agustina para suplir esta dependencia.

Google Business Profile: **elegibilidad no confirmada**. Validar atención presencial/área de servicio y la naturaleza real del negocio antes de crear o modificar un perfil; una empresa de generación de leads no es elegible por esa función. No usar dirección virtual ni crear una ficha por ciudad. No se hizo alta.

## Publicación y recuperación

Antes de aprobar: título/alcance de PR, commit exacto, Preview, prueba del contenido renderizado, links, contactos, comparación de CSP, evidencia y limitaciones. No se aprueba por pasar pruebas.

Producción anterior: commit `c32793d4e1c32d34d21d0ee3f1de50da44a770b1`, deployment `dpl_255PCSLFKesYXSbctV43KWUYtFGf`. Ante una regresión atribuible a esta tanda, restaurar ese deployment o revertir solo el commit de la tanda, conservando cambios posteriores de otros frentes. GTM v51 no cambia. Rollback no borra visitas ni datos ya enviados. Repetir controles HTTP y canales tras recuperar.

## Fuentes de criterio y observaciones

Consultadas el 7/11/2026: Google Search Central, https://developers.google.com/search/docs/fundamentals/ai-optimization-guide ; OpenAI, https://developers.openai.com/api/docs/bots ; Google Business Profile, https://support.google.com/business/answer/13763036 . Los fundamentos de SEO siguen siendo relevantes en búsqueda generativa; no hay garantía de aparecer por añadir schema o un archivo especial. Robots abiertos no prueban acceso a través de todas las capas ni inclusión en un motor.

Comparación cualitativa de estructura, no ranking/ventas: ADT https://www.adt.com.ar/alarma-hogar/ ; Verisure https://www.verisure.com.ar/alarmas-hogar ; Prosegur https://www.prosegur.com.ar/hogares/alarmas-hogar/sistema-de-alarmas-monitoreadas . Tienen páginas por intención y recorridos de consulta. La oportunidad de Terra es explicar diferencias y condiciones de forma clara junto al asesoramiento; esta es una hipótesis estratégica, no una superioridad acreditada.

Preservados: investigación previa de 40 consultas hipotéticas y 18 briefs, Search Console verificada, PR8/PR9, GTM51 y las salvedades del bloque 2. La deduplicación publicitaria Meta sigue sin certificación y no se confunde con idempotencia de recepción de WhatsApp.

## QA del Preview inicial

PR #10; commit 521f2738709b4c3ea6c6cfb7dfaaf4e6fbe74247; deployment dpl_ACK8Vw7H6dJrnchDSrLSZvTN7FrC READY. Siete páginas cargadas en navegador autenticado a 337px CSS vía zoom, sin overflow y con logo; muestra de escritorio a 1348px. FAQ y llegada al formulario observadas. No prueba física Android/iOS ni nuevos envíos. El cliente HTTP sin sesión recibe una redirección al login de Vercel (200 de login, no de la guía); por eso no se afirma comparación HTTP completa del Preview. La última auditoría HTTP de producción actual pasó, pero esa producción todavía no contiene esta tanda. No se crearon enlaces de bypass ni se debilitó la protección.

Control editorial separado E01–E04 y técnico T01–T06 cerrados. 19/19 pruebas nuevas, 80/80 existentes, 12/12 CSP. El archivo evidence/review-gate.json comprueba el registro editorial y no certifica el diseño ni autoriza publicación.
