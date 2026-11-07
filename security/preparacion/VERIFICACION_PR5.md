# Continuación PR #5 — imágenes y estabilidad visual

Alcance: rama `feat/terra-rendimiento-movil-preview`; no producción ni configuración de integraciones.

## Cambios

- Seis PNG se sirven como WebP lossless. Originales conservados, incluidas las URLs de logo usadas por metadatos y Schema.
- Mismas dimensiones y mismos píxeles RGBA (comparación completa, no estimación perceptual). Revisión visual de los seis pares: sin cambios de nitidez, color, transparencia o composición.
- `equipo.jpeg` permanece intacta: su conversión lossless a WebP crecía de 87.487 a 325.956 bytes.
- Imágenes utilizadas por la página: 418.091 → 275.509 bytes, ahorro de 142.582 bytes (34,1%). Esto no equivale a reducir ese porcentaje el peso total de la web.
- Fallbacks métricos locales para Sora y Mulish. Las tipografías finales, su proveedor y el contenido permanecen iguales. Los ajustes se calcularon a partir de las métricas de los WOFF2 actuales y Arial/Liberation Sans; se verificaron en Chromium.

## Evidencia de CLS

Prueba local controlada, Chromium, 1363 × 936, retraso de 2 segundos al entregar fuentes. Se conservan HTML/CSS/JS del sitio, salvo que el arnés excluye los dos bootstrap de medición y agrega un observador visual. El arnés no se publica ni sirve para certificar integraciones.

- Antes: CLS 0,144532; `hero-inner` aumenta 72 px de altura al cambiar las fuentes y se desplaza verticalmente.
- Después: CLS inferior a 0,001 en las ejecuciones observadas; no se desplaza `hero-inner`. Quedan movimientos mínimos en navegación.
- Móvil 390 × 844: CLS 0, sin desbordamiento horizontal.
- Matriz adicional 320, 390, 768 y 1280 px: sin desbordamiento. Son viewports de Chromium; no dispositivos físicos ni datos CrUX.
- Mantener como pendiente la medición equivalente del deployment final de Vercel con todas sus integraciones y una revisión real Android/iOS.

## Regresión

80/80 tests Node y 12/12 controles CSP. Comparación con `b5de04c`: `main.js`, `ui.js`, `gracias.html`, `politicas.html`, `vercel.json`, `robots.txt`, `sitemap.xml`, formulario completo, hrefs y scripts inline idénticos. Menú móvil, Escape y FAQ comprobados en navegador local. No se envían consultas reales desde el arnés.

## HTTP protegido: pendiente, no aprobado

Las 22 comprobaciones de la entrega anterior correspondían a `4ff608c`, no a `b5de04c` ni a esta continuación. No trasladar ese aprobado a otro commit.

La revisión automática rechazó crear el enlace temporal de acceso al Preview protegido porque amplía acceso a cualquier poseedor del enlace durante hasta 23 horas. No se desactivó la protección ni se eludió el bloqueo. Hace falta autorización explícita para ese enlace o un acceso automatizado autorizado existente.

`security/deploy/check-preview-http.py` prepara la repetición: comprueba el SHA esperado, compara bytes y hashes, headers CSP, noindex de gracias y rutas privadas/inexistentes. Se conservan las 22 comprobaciones originales y se agregan los seis WebP: 28 controles en total. La URL de acceso se recibe por stdin y no se imprime. El resultado se escribe en la ruta indicada por `output`.

Ejemplo de campos de entrada (sin secretos): `base`, `access`, `expected_commit`, `output`.

No mergear ni publicar mientras falte esta comprobación, la regresión del Preview final o la autorización de Dirección para producción.
