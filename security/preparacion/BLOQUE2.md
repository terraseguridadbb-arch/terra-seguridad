# Bloque 2 — Preview independiente, no publicar

Base: 381425532417f747aeadd2c6ac81d1595a3b638f, candidato SEO del PR #4.
Esta rama depende de esa base para revisión; no modifica el PR #4 ni autoriza su publicación.

## Alcance de esta candidata

- Menú móvil desplazable en pantallas bajas; cierre con Escape, foco y estados ARIA.
- Contenido cubierto por el menú fuera del recorrido del teclado mientras está abierto.
- Restitución de la página al cerrar o pasar a escritorio.
- Estados de FAQ y ajuste de respuesta al cambiar ancho o terminar de cargar fuentes.
- Áreas táctiles de llamada/WhatsApp y contraste del pie.
- Dimensiones de imágenes y carga diferida de las que están bajo el primer pantallazo.
- Preferencia de movimiento reducido en CSS.

`main.js`, formularios, scripts inline de medición, destinos de contacto y CSP no cambian.
`ui.js` contiene exclusivamente mejoras de navegación; no hace solicitudes ni envía eventos.
Los archivos bajo `security/` están excluidos del despliegue por `.vercelignore`.

No se declara resuelto el CLS de escritorio: Lighthouse identifica `.hero-inner`, pero la causa raíz sigue pendiente. No se aplicó una reserva de altura arbitraria ni se sustituyeron tipografías sin medir.
No se cambió el formato/peso de las imágenes. Se preservaron los originales; carga diferida no equivale a compresión.

## Search Console — ejecución preparada, configuración no aplicada

Cuenta de Terra autenticada, sin propiedades accesibles en la revisión del 06/11.
DNS autoritativo: Cloudflare (`edna.ns.cloudflare.com`, `shane.ns.cloudflare.com`).
Propiedad propuesta: dominio `terraseguridad.com.ar`.
Método propuesto: TXT en `@`, con el valor real que genere Google, conservando todos los registros existentes.
No hay un token generado ni un cambio DNS aprobado/aplicado en esta candidata.
Alternativa: recuperar acceso de un propietario existente antes de duplicar una propiedad.

Después de la publicación autorizada del bloque 1: verificar HTTP 200 del sitemap, enviar su URL canónica, inspeccionar portada y política; confirmar que `/index.html` redirige y que gracias tiene noindex.
No enviar el Preview protegido a indexación. Revisar control e informe generativo de Search Console solo cuando exista acceso.

## GEO/AEO — borradores para revisión comercial

Mantener identidad Terra Seguridad, contacto 1124808478 y la frase «Somos agentes oficiales de ADT».
Pendiente validar cobertura por localidad, condiciones por equipo/plan, protocolo, descuentos y testimonios antes de ampliar contenido público.
No trasladar beneficios o protocolos de otros proveedores a Terra. No prometer llegada de emergencias, plazos ni autonomía de todos los equipos.

### Hogares — borrador de apertura

**Título:** Alarmas para hogares y departamentos | Terra Seguridad

**H1:** Alarmas para tu hogar: elegí según tus espacios y tu rutina.

Para elegir una alarma conviene empezar por tu casa: qué accesos tiene, cómo usás sus ambientes y qué necesitás poder consultar o manejar. En Terra Seguridad conversamos con vos para revisar opciones y confirmar disponibilidad en tu localidad. Somos agentes oficiales de ADT.

**Secciones previstas:** accesos y ambientes; rutina cotidiana; opciones verificadas; condiciones por equipo; preguntas antes de contratar.

**Preguntas:** ¿Qué cambia entre casa y departamento? ¿Qué funciones hay desde el celular? ¿Qué depende de la electricidad o internet? ¿Cómo confirmo cobertura?

**CTA existente a reutilizar:** asesoramiento en `/#contacto`; no crear otro formulario.

### Comercios — borrador de apertura

**Título:** Alarmas para comercios y negocios | Terra Seguridad

**H1:** Una alarma para la rutina de tu comercio.

Tu local tiene horarios, accesos y personas que lo usan todos los días. Antes de elegir una propuesta conviene revisar esos detalles, además del espacio de atención y el depósito, si lo tenés. En Terra Seguridad te ayudamos a ordenar esa información y consultar opciones para tu localidad. Somos agentes oficiales de ADT.

**Secciones previstas:** accesos; usuarios autorizados; apertura y cierre del sistema; cámaras según propuesta; información para cotizar.

**Preguntas:** ¿Pueden usar la alarma distintas personas? ¿Qué registra el armado/desarmado? ¿Puedo sumar cámaras? ¿Qué cambia si tengo depósito?

No equiparar los registros de alarma con control de asistencia laboral. CTA al contacto existente.

### Monitoreo — borrador de apertura

**Título:** Alarmas monitoreadas: cómo funcionan | Terra Seguridad

**H1:** Qué conviene preguntar antes de contratar una alarma monitoreada.

Al comparar propuestas, no alcanza con mirar los equipos. También conviene entender qué incluye el servicio, qué depende de la conectividad y cuáles son sus condiciones. En Terra Seguridad te acompañamos a revisar esas preguntas antes de avanzar. Somos agentes oficiales de ADT.

**Secciones previstas:** definición de monitoreo respaldada por el plan; diferencias con cámaras y sistemas autónomos; conectividad; abono; protocolo confirmado.

No publicar respuestas técnicas completas hasta contar con la documentación del plan correspondiente. No usar un FAQ enriquecido como promesa de posicionamiento; las preguntas tienen valor por su contenido.

## Criterios de revisión

- Pruebas existentes y tests de navegación sin red.
- Artefacto HTTP idéntico al commit; rutas internas excluidas; encabezados intactos.
- Menú de baja altura: última opción alcanzable y cierre sin dejar la página inert.
- FAQ abierta: estado y altura correctos con teclado y al cambiar ancho.
- Contactos con número y URLs actuales, sin disparar envíos reales en este bloque.
- Probar Android/iOS físicos antes de aprobar publicación.
- Mantener el bloqueo de Producción mientras existan verificaciones pendientes del bloque correspondiente.

La aprobación del bloque 1 no publica esta rama. Necesita revisión independiente.
