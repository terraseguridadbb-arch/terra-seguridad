# Privacidad del sitio publico (NEXT-SEC-15, preparatorio)

Estado: PREPARATORIO. NO DESPLEGADO. Todo vive en la rama de trabajo; publicar el
sitio es una decision humana.

| Archivo | Que es |
| --- | --- |
| `DATA_RECIPIENTS.json` | Inventario de destinatarios reales: quien recibe, que campos, para que, cuanto los conserva (o `DATOS_FALTANTES`) y que control de consentimiento o de baja existe. Cada entrada trae un ancla de texto que tiene que existir en el archivo citado. |
| `recipients.mjs` | Lee ese inventario, genera el bloque publicable de `politicas.html` y expone los cruces que usan los tests. CLI: `node security/privacy/recipients.mjs --write`. |
| `site-harness.mjs` | Ejecuta el `main.js` versionado dentro de `node --test`, con un DOM minimo y un `fetch` controlado. Sin red, sin navegador, sin dependencias. |
| `submit.test.mjs` | El envio del formulario: sin lookup externo de IP, contrato de payload por destino, caidas de red que no bloquean al visitante. |
| `recipients.test.mjs` | Aviso y comportamiento tienen que coincidir: hosts declarados contra hosts reales, bloque publicado al dia, marcadores donde falta el dato. |
| `PROPOSAL_IP_SERVIDOR.md` | Propuesta NO implementada de tomar la IP del lado servidor, con lo que habria que resolver antes. |

Regenerar despues de tocar el inventario o el HTML del sitio:

```
node security/privacy/recipients.mjs --write
node security/csp/inventory.mjs --write
node security/csp/allowlist.mjs --write
node security/csp/build-policy.mjs --write
node --test security/csp/*.test.mjs security/privacy/*.test.mjs
```

Regla del texto publico: donde el dato no consta va el marcador
`[DATO_A_COMPLETAR_POR_DIRECCION]`. No se inventan plazos de retencion, razon
social, derechos ni cumplimiento legal acreditado.
