/**
 * NEXT-SEC-15 (DIR18-03) - Arnes para ejecutar main.js del sitio publico dentro
 * de node --test, SIN navegador y SIN red.
 *
 * Por que existe: main.js es un script clasico que el navegador carga con
 * <script src>. Para probar el envio del formulario de verdad (y no una copia
 * del codigo) se lo ejecuta tal cual esta versionado, inyectando un DOM minimo
 * y un fetch controlado por el test. Si el codigo intentara contactar un origen
 * no declarado, el fetch del test lo registra y el test falla.
 *
 * Sin red, sin escritura de archivos y sin dependencias externas.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MAIN_JS_PATH = path.join(REPO_ROOT, 'main.js');

export function hostDe(url) {
  try { return new URL(url).host; } catch { return null; }
}

function crearClassList() {
  const clases = [];
  return {
    add(c) { if (!clases.includes(c)) clases.push(c); },
    remove(c) { const i = clases.indexOf(c); if (i >= 0) clases.splice(i, 1); },
    contains(c) { return clases.includes(c); },
    toggle(c, forzar) {
      const debe = forzar === undefined ? !clases.includes(c) : Boolean(forzar);
      if (debe) this.add(c); else this.remove(c);
      return debe;
    }
  };
}

/** Elemento minimo: solo lo que main.js usa. No pretende ser un DOM completo. */
export function crearElemento(tag = 'div', props = {}) {
  const nodo = {
    tagName: String(tag).toUpperCase(),
    id: '',
    className: '',
    innerHTML: '',
    textContent: '',
    disabled: false,
    style: { cssText: '' },
    classList: crearClassList(),
    hijos: [],
    parentNode: null,
    nextSibling: null,
    addEventListener() {},
    removeEventListener() {},
    querySelector(sel) { return this.hijos.find((h) => '.' + h.className === sel || h.id === sel) || null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    insertBefore(nuevo) { this.hijos.push(nuevo); nuevo.parentNode = this; return nuevo; },
    appendChild(nuevo) { this.hijos.push(nuevo); nuevo.parentNode = this; return nuevo; },
    remove() {
      if (this.parentNode) this.parentNode.hijos = this.parentNode.hijos.filter((h) => h !== this);
      this.parentNode = null;
    }
  };
  return Object.assign(nodo, props);
}

const IDS_CONOCIDOS = ['nav', 'mobileMenuBtn', 'mobileMenu', 'equipCarousel', 'equipNext', 'equipPrev', 'formCard', 'contactForm'];

/**
 * Crea el entorno y ejecuta main.js dentro de el.
 * @param {object} opciones
 * @param {(url: string, init?: object) => Promise<object>} opciones.fetchImpl
 *        fetch del test: recibe cada peticion que el sitio intente hacer.
 */
export function cargarSitio({ fetchImpl, userAgent = 'arnes/1.0', href = 'https://ejemplo.invalid/', title = 'Terra', cookies = {} } = {}) {
  const registro = new Map();
  const creados = [];
  const jar = new Map(Object.entries(cookies));
  const peticiones = [];
  const temporizadores = [];
  const eventosFbq = [];
  const logs = [];

  const obtener = (id) => {
    if (!registro.has(id)) registro.set(id, crearElemento('div', { id }));
    return registro.get(id);
  };

  const document = {
    title,
    body: crearElemento('body'),
    getElementById(id) {
      const creado = creados.find((n) => n.id === id && n.parentNode);
      if (creado) return creado;
      if (registro.has(id)) return registro.get(id);
      return IDS_CONOCIDOS.includes(id) ? obtener(id) : null;
    },
    querySelectorAll() { return []; },
    createElement(tag) {
      const el = crearElemento(tag);
      creados.push(el);
      return el;
    }
  };

  Object.defineProperty(document, 'cookie', {
    get() { return Array.from(jar.entries()).map((par) => par[0] + '=' + par[1]).join('; '); },
    set(valor) {
      const par = String(valor).split(';')[0];
      const i = par.indexOf('=');
      if (i > 0) jar.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
    }
  });

  const window = {
    scrollY: 0,
    location: { href, search: '' },
    addEventListener() {},
    removeEventListener() {}
  };

  const almacen = new Map();
  const localStorage = {
    getItem(k) { return almacen.has(k) ? almacen.get(k) : null; },
    setItem(k, v) { almacen.set(k, String(v)); },
    removeItem(k) { almacen.delete(k); }
  };

  class ObservadorFalso {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  class FormDataFalso {
    constructor(form) { this.pares = Object.entries((form && form.campos) || {}); }
    entries() { return this.pares[Symbol.iterator](); }
    get(k) { const p = this.pares.find((x) => x[0] === k); return p ? p[1] : null; }
  }

  const fetchRegistrado = async (url, init) => {
    let cuerpo = null;
    if (init && typeof init.body === 'string') {
      try { cuerpo = JSON.parse(init.body); } catch { cuerpo = init.body; }
    }
    peticiones.push({ url: String(url), init: init || {}, cuerpo, host: hostDe(String(url)) });
    return fetchImpl(String(url), init);
  };

  const consola = {
    log: (...a) => logs.push(['log', a.map(String).join(' ')]),
    error: (...a) => logs.push(['error', a.map(String).join(' ')]),
    warn: (...a) => logs.push(['warn', a.map(String).join(' ')])
  };

  const fbq = (...args) => { eventosFbq.push(args); };

  /**
   * Canales de salida que NO son fetch. El arnes los cubre para que un envio por
   * XMLHttpRequest, sendBeacon o una imagen-pixel no pase inadvertido: se
   * registran igual que fetch y el test los puede exigir vacios.
   */
  const otrosCanales = [];
  const registrarCanal = (canal, url) => {
    otrosCanales.push({ canal, url: String(url), host: hostDe(String(url)) });
  };
  class XMLHttpRequestFalso {
    open(metodo, url) { this.metodo = metodo; this.url = url; }
    setRequestHeader() {}
    send() { registrarCanal('XMLHttpRequest', this.url); }
  }
  class ImagenFalsa {
    constructor() {
      let valor = '';
      Object.defineProperty(this, 'src', {
        get: () => valor,
        set: (v) => { valor = v; registrarCanal('Image', v); }
      });
    }
  }
  const sendBeacon = (url) => { registrarCanal('sendBeacon', url); return true; };

  const nombres = ['document', 'window', 'navigator', 'localStorage', 'crypto', 'console', 'fetch',
    'setTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'performance',
    'IntersectionObserver', 'FormData', 'fbq', 'XMLHttpRequest', 'Image'];
  const valores = [
    document,
    window,
    { userAgent, sendBeacon },
    localStorage,
    globalThis.crypto,
    consola,
    fetchRegistrado,
    (fn, ms) => { temporizadores.push({ fn, ms }); return temporizadores.length; },
    () => 0,
    () => {},
    () => 0,
    { now: () => 0 },
    ObservadorFalso,
    FormDataFalso,
    fbq,
    XMLHttpRequestFalso,
    ImagenFalsa
  ];

  const fuente = readFileSync(MAIN_JS_PATH, 'utf8');
  const fabrica = new Function(...nombres, fuente + '\n;return { handleSubmit, showFormError };');
  const exportado = fabrica(...valores);

  return {
    handleSubmit: exportado.handleSubmit,
    document,
    window,
    localStorage,
    peticiones,
    otrosCanales,
    eventosFbq,
    logs,
    cookies: jar,
    /** Ejecuta los setTimeout pendientes (el redirect a gracias.html usa uno). */
    correrTemporizadores() {
      while (temporizadores.length > 0) temporizadores.shift().fn();
    },
    /** Texto del mensaje de error que veria el visitante, o null si no hay. */
    errorVisible() {
      const p = creados.find((n) => n.id === 'formError' && n.parentNode);
      return p ? p.textContent : null;
    }
  };
}

/** Evento de submit equivalente al que dispara el <form> del sitio. */
export function crearEventoSubmit(campos) {
  const estado = { prevenido: false };
  const contenedor = crearElemento('div');
  const boton = crearElemento('button', { className: 'form-submit', innerHTML: 'Solicitar mi cotizacion gratis' });
  contenedor.appendChild(boton);
  const form = {
    campos,
    querySelector(sel) { return sel === '.form-submit' ? boton : null; }
  };
  const evento = {
    target: form,
    preventDefault() { estado.prevenido = true; }
  };
  return { boton, evento, estado };
}

export const CAMPOS_DEMO = {
  nombre: 'Juana',
  apellido: 'Perez',
  email: 'Juana.Perez@ejemplo.invalid',
  codarea: '011',
  telefono: '45236789'
};

/** Respuesta minima con la forma que main.js espera de fetch. */
export function respuesta(ok, cuerpo = {}) {
  return { ok, status: ok ? 200 : 500, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) };
}
