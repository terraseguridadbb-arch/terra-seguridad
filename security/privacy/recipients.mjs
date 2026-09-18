/**
 * NEXT-SEC-15 (DIR18-03) - Destinatarios reales de los datos del sitio publico.
 *
 * Fuente unica: security/privacy/DATA_RECIPIENTS.json (derivado por lectura de
 * main.js, index.html, gracias.html y security/csp/INVENTORY.json).
 *
 * De aca sale el bloque de destinatarios que se publica en politicas.html, para
 * que el aviso y el comportamiento no puedan separarse sin que un test lo vea.
 * Donde el dato no consta (retencion, plazos, procedimiento formal) el valor es
 * DATOS_FALTANTES y en el texto publico aparece un marcador visible: nunca se
 * inventa un plazo, un derecho ni una razon social.
 *
 * Determinista, sin red y sin dependencias.
 * Uso:  node security/privacy/recipients.mjs --write
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RECIPIENTS_PATH = path.join(REPO_ROOT, 'security', 'privacy', 'DATA_RECIPIENTS.json');
export const POLITICAS_PATH = path.join(REPO_ROOT, 'politicas.html');
export const INDEX_PATH = path.join(REPO_ROOT, 'index.html');

export const VALOR_FALTANTE = 'DATOS_FALTANTES';
export const MARCADOR = '[DATO_A_COMPLETAR_POR_DIRECCION]';
export const INICIO = '<!-- TERRA:DESTINATARIOS:INICIO -->';
export const FIN = '<!-- TERRA:DESTINATARIOS:FIN -->';

export const normalizarFin = (texto) => texto.split('\r\n').join('\n');

export function leerDestinatarios(file = RECIPIENTS_PATH) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Un dato que no consta nunca se publica como afirmacion: se publica el marcador. */
export function textoPublico(valor) {
  return String(valor).split(VALOR_FALTANTE).join(MARCADOR);
}

export function escaparHtml(texto) {
  return String(texto)
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;');
}

/**
 * Hosts que el navegador del visitante contacta, segun el inventario declarado.
 * Solo cuentan los destinatarios INVENTARIADO: los NO_INVENTARIADO (etiquetas
 * que el contenedor de GTM puede activar) no tienen hosts verificables desde el
 * repositorio y por eso no se declaran como si los tuvieran.
 */
export function hostsDeclarados(datos, transporte = 'navegador') {
  const hosts = [];
  for (const d of datos.destinatarios) {
    if (d.estado === 'NO_INVENTARIADO') continue;
    if (transporte && d.transporte !== transporte) continue;
    for (const h of d.hosts) if (!hosts.includes(h)) hosts.push(h);
  }
  return hosts.sort();
}

/** Hosts que el sitio realmente contacta, leidos del inventario CSP. */
export function hostsDelSitio(inventory) {
  const hosts = [];
  for (const origenes of Object.values(inventory.origins_by_directive)) {
    for (const o of origenes) {
      const h = new URL(o).host;
      if (!hosts.includes(h)) hosts.push(h);
    }
  }
  return hosts.sort();
}

const SANGRIA = '            ';

/** Bloque HTML publicable con un item por destinatario. Sin estilos inline y sin enlaces. */
export function construirBloque(datos) {
  const lineas = [];
  lineas.push(INICIO);
  lineas.push('<!-- Generado por security/privacy/recipients.mjs desde DATA_RECIPIENTS.json. No editar a mano. -->');
  lineas.push('<ul class="politicas-destinatarios">');
  for (const d of datos.destinatarios) {
    const porTransporte = {
      servidor: ' No lo envía tu navegador: lo envía nuestra automatización.',
      alojamiento: ' Es el servidor que entrega esta página.'
    };
    const via = (porTransporte[d.transporte] || '')
      + (d.estado === 'NO_INVENTARIADO'
        ? ' No está inventariado: qué etiquetas tiene ese contenedor se configura fuera del sitio y no puede leerse desde acá.'
        : '');
    lineas.push('  <li>');
    lineas.push('    <strong>' + escaparHtml(d.nombre) + '</strong> — ' + escaparHtml(d.rol) + '.' + escaparHtml(via));
    lineas.push('    <br />Qué recibe: ' + escaparHtml(textoPublico(d.campos.join('; '))) + '.');
    lineas.push('    <br />Para qué: ' + escaparHtml(textoPublico(d.finalidad)));
    lineas.push('    <br />Cuánto tiempo lo conserva: ' + escaparHtml(textoPublico(d.retencion)));
    lineas.push('    <br />Consentimiento: ' + escaparHtml(textoPublico(d.control_consentimiento)));
    lineas.push('    <br />Baja o corrección: ' + escaparHtml(textoPublico(d.control_baja)));
    lineas.push('  </li>');
  }
  lineas.push('</ul>');
  for (const r of datos.retirados) {
    lineas.push('<p class="politicas-block-text">' + escaparHtml(r.nombre) + ': ' + escaparHtml(r.que_recibia)
      + ' ' + escaparHtml(r.estado) + '</p>');
  }
  lineas.push(FIN);
  return lineas.map((l) => (l.length > 0 ? SANGRIA + l : l)).join('\n');
}

export function extraerBloque(html) {
  const texto = normalizarFin(html);
  const a = texto.indexOf(INICIO);
  const b = texto.indexOf(FIN);
  if (a < 0 || b < 0) return null;
  const inicioLinea = texto.lastIndexOf('\n', a) + 1;
  return texto.slice(inicioLinea, b + FIN.length);
}

export function aplicarBloque(html, bloque) {
  const finDeLinea = html.includes('\r\n') ? '\r\n' : '\n';
  const texto = normalizarFin(html);
  const a = texto.indexOf(INICIO);
  const b = texto.indexOf(FIN);
  if (a < 0 || b < 0) throw new Error('politicas.html no tiene las marcas ' + INICIO + ' / ' + FIN);
  const inicioLinea = texto.lastIndexOf('\n', a) + 1;
  const salida = texto.slice(0, inicioLinea) + bloque + texto.slice(b + FIN.length);
  return salida.split('\n').join(finDeLinea);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const datos = leerDestinatarios();
  const bloque = construirBloque(datos);
  if (process.argv.includes('--write')) {
    const html = readFileSync(POLITICAS_PATH, 'utf8');
    writeFileSync(POLITICAS_PATH, aplicarBloque(html, bloque), 'utf8');
    console.log('politicas.html actualizado con ' + datos.destinatarios.length + ' destinatarios');
  } else {
    console.log(bloque);
  }
}
