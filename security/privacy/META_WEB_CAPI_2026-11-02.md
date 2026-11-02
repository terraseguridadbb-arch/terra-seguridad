# API de conversiones con Meta para eventos web — 02/11/2026

Registro de configuración observado en la interfaz de Meta; no cambia la integración.

- Portfolio: TERRA Seguridad y Monitoreo.
- Dataset 689271596885956: conectado a la API de conversiones con Meta para eventos web.
- Events Manager → Configuración: «API de conversiones · Solo web · Negocio conectado · Activo».
- «Acciones → Ver detalles» abre la administración de API de conversiones para eventos web del portfolio. El dataset figura entre los conectados.
- La interfaz registra la activación de esta conexión el 13/04/2025.
- Esta conexión es distinta de los envíos CAPI propios de n8n, que siguen desactivados.

## Alcance de la evidencia

La conexión activa se observó directamente en Meta. En la QA de navegador reportada por el frente de producción se observaron entregas de navegador y servidor con el mismo identificador, marcadas como deduplicadas por Meta. El origen exacto de una entrega no se atribuye solo por sus estadísticas agregadas.

El repositorio carga el píxel con coincidencias avanzadas a partir de `terra_am` y conserva valores SHA-256 de datos del formulario. El hash permite coincidencias; no se describe como anonimización.

Este registro incorpora la conexión web activa al aviso de destinatarios. No habilita envíos nuevos, no reactiva n8n, no cambia las coincidencias avanzadas ni acredita cumplimiento legal.

La copia automática de un evento no debe contarse como un hecho distinto: el criterio de control es una conversión por consulta, con identificadores compartidos cuando hay entregas por navegador y servidor.
