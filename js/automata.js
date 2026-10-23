/*
 * ============================================================
 *  AUTÓMATAS FINITOS DETERMINISTAS (AFD) — FLUJOS DE TRABAJO
 * ============================================================
 *
 *  Cada flujo de trabajo es un AFD  M = (Q, Σ, δ, q0, F):
 *
 *    Q  = estados del documento
 *    Σ  = acciones que el usuario puede aplicar
 *    δ  = función de transición  δ(q, s) = q'
 *    q0 = estado inicial
 *    F  = estados de aceptación (el proceso terminó)
 *
 *  Un par (estado, símbolo) que no aparece en δ NO está definido:
 *  el administrador de procesos rechaza esa acción.
 *
 *  Los flujos se guardan como datos (JSON), no como código, para que
 *  puedan crearse y editarse desde la interfaz. El flujo AUT-04 es el
 *  ciclo de aprobación original del proyecto.
 */

/* ---------- Paleta de colores para los estados ---------- */
const PALETA = [
  { hex: '#64748b', nombre: 'Gris' },
  { hex: '#f5b301', nombre: 'Amarillo' },
  { hex: '#16a34a', nombre: 'Verde' },
  { hex: '#e5484d', nombre: 'Rojo' },
  { hex: '#3f4654', nombre: 'Gris oscuro' },
  { hex: '#2563eb', nombre: 'Azul' },
  { hex: '#7c3aed', nombre: 'Morado' },
  { hex: '#ea580c', nombre: 'Naranja' },
  { hex: '#0d9488', nombre: 'Turquesa' },
  { hex: '#db2777', nombre: 'Rosa' }
];

/** Texto legible (oscuro o blanco) sobre un color de fondo. */
function colorTexto(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.4 ? '#3a2700' : '#ffffff';
}

/** Mezcla un color con blanco (t=0 → color, t=1 → blanco) o negro (t<0). */
function mezclar(hex, t) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const dest = t >= 0 ? 255 : 0, k = Math.abs(t);
  return '#' + c.map(v => Math.round(v + (dest - v) * k).toString(16).padStart(2, '0')).join('');
}

/** Convierte un texto en un nombre seguro para carpetas: "En revisión" → "En_revision". */
function slug(txt) {
  return String(txt).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'Estado';
}

/* ============================================================
 *  crearAFD(def): construye el autómata a partir de su definición
 * ============================================================ */
function crearAFD(def) {
  'use strict';
  const estados = def.estados.map(e => e.id);
  const nombres = {}, descripciones = {}, colores = {};
  def.estados.forEach(e => { nombres[e.id] = e.nombre; descripciones[e.id] = e.desc || ''; colores[e.id] = e.color; });
  const alfabeto = def.alfabeto.map(a => a.id);
  const etiquetas = {};
  def.alfabeto.forEach(a => { etiquetas[a.id] = a.etiqueta || a.id; });
  const delta = def.delta;
  const inicial = def.inicial;
  const finales = def.finales.slice();

  function transicion(q, s) { return (delta[q] && delta[q][s]) || null; }
  function simbolosValidos(q) { return alfabeto.filter(s => transicion(q, s)); }
  function esFinal(q) { return finales.includes(q); }

  /** Todas las aristas (de, símbolo, a) en orden de estados y alfabeto. */
  function aristas() {
    const out = [];
    estados.forEach(q => alfabeto.forEach(s => { const a = transicion(q, s); if (a) out.push({ de: q, s, a }); }));
    return out;
  }

  /** δ extendida: procesa una cadena w ∈ Σ* desde q0. */
  function procesarCadena(simbolos) {
    let actual = inicial;
    const recorrido = [{ estado: actual }];
    for (const s of simbolos) {
      if (!alfabeto.includes(s)) {
        return { aceptada: false, recorrido, estadoFinal: actual, error: `"${s}" no pertenece al alfabeto Σ.` };
      }
      const siguiente = transicion(actual, s);
      if (!siguiente) {
        return { aceptada: false, recorrido, estadoFinal: actual,
                 error: `δ(${actual}, ${s}) no está definida: el autómata se detiene y rechaza.` };
      }
      recorrido.push({ simbolo: s, estado: siguiente });
      actual = siguiente;
    }
    return { aceptada: esFinal(actual), recorrido, estadoFinal: actual, error: null };
  }

  /* ---- Etapas: distancia mínima desde q0 (búsqueda en anchura) ---- */
  const distancia = {};
  if (estados.includes(inicial)) {
    distancia[inicial] = 0;
    const cola = [inicial];
    while (cola.length) {
      const q = cola.shift();
      alfabeto.forEach(s => {
        const a = transicion(q, s);
        if (a && distancia[a] === undefined) { distancia[a] = distancia[q] + 1; cola.push(a); }
      });
    }
  }
  const alcanzables = estados.filter(q => distancia[q] !== undefined);
  const inalcanzables = estados.filter(q => distancia[q] === undefined);
  const maxD = alcanzables.reduce((m, q) => Math.max(m, distancia[q]), -1);
  const etapas = [];
  for (let i = 0; i <= maxD; i++) etapas.push(estados.filter(q => distancia[q] === i));
  if (inalcanzables.length) etapas.push(inalcanzables);
  const etapaDe = {};
  etapas.forEach((g, i) => g.forEach(q => { etapaDe[q] = i; }));

  function nombreEtapa(i) {
    const g = etapas[i] || [];
    if (g.length === 1) return nombres[g[0]];
    if (def.nombresEtapa && def.nombresEtapa[i]) return def.nombresEtapa[i];
    if (g.every(q => inalcanzables.includes(q))) return 'Sin conexión';
    return 'Etapa ' + (i + 1);
  }

  /** Carpeta del flujo dentro del directorio raíz ('' = en la raíz). */
  const carpetaFlujo = def.carpeta !== undefined ? def.carpeta : `${slug(def.codigo)}_${slug(def.nombre)}`;

  /** Ruta de carpetas donde vive un documento que está en el estado q. */
  function rutaCarpeta(q) {
    const i = etapaDe[q];
    const ruta = carpetaFlujo ? [carpetaFlujo] : [];
    ruta.push(`${String(i + 1).padStart(2, '0')}_${slug(nombreEtapa(i))}`);
    if (etapas[i].length > 1) ruta.push(slug(nombres[q]));
    return ruta;
  }

  /** Revisión del diseño: avisos útiles para quien edita el flujo. */
  function validar() {
    const avisos = [];
    if (!estados.includes(inicial)) avisos.push({ tipo: 'error', txt: 'No hay estado inicial.' });
    if (!finales.length) avisos.push({ tipo: 'error', txt: 'No hay estados de aceptación (F está vacío): ningún documento podrá terminar.' });
    else if (!finales.some(q => alcanzables.includes(q))) avisos.push({ tipo: 'error', txt: 'Ningún estado de aceptación es alcanzable desde el inicial.' });
    inalcanzables.forEach(q => avisos.push({ tipo: 'aviso', txt: `${q} · ${nombres[q]} no es alcanzable desde ${inicial}.` }));
    estados.filter(q => !esFinal(q) && !simbolosValidos(q).length)
      .forEach(q => avisos.push({ tipo: 'aviso', txt: `${q} · ${nombres[q]} no tiene salidas y no es de aceptación: un documento quedaría atascado.` }));
    alfabeto.filter(s => !estados.some(q => transicion(q, s)))
      .forEach(s => avisos.push({ tipo: 'info', txt: `El símbolo "${s}" no se usa en ninguna transición.` }));
    return avisos;
  }

  return Object.freeze({
    id: def.id, codigo: def.codigo, nombre: def.nombre, descripcion: def.descripcion || '', modo: def.modo,
    estados, nombres, descripciones, colores, alfabeto, etiquetas, inicial, finales, delta,
    transicion, simbolosValidos, esFinal, aristas, procesarCadena,
    distancia, alcanzables, inalcanzables, etapas, etapaDe, nombreEtapa,
    carpetaFlujo, rutaCarpeta, validar,
    color: q => colores[q] || '#64748b',
    colorOn: q => colorTexto(colores[q] || '#64748b')
  });
}

/* ============================================================
 *  FLUJOS: registro de todos los autómatas (se guarda localmente)
 * ============================================================ */
const Flujos = (function () {
  'use strict';
  const CLAVE = 'flujo.flujos.v1';

  /** Flujos de ejemplo con los que arranca el sistema. */
  function ejemplos() {
    return [
      {
        id: 'aut-04', codigo: 'AUT-04', nombre: 'Ciclo de aprobación', modo: 'documentos', base: true, carpeta: '',
        descripcion: 'Flujo original: registro, revisión, resolución y archivo.',
        estados: [
          { id: 'q0', nombre: 'Registrado', desc: 'Ingreso al sistema', color: '#64748b' },
          { id: 'q1', nombre: 'En revisión', desc: 'Validación activa', color: '#f5b301' },
          { id: 'q2', nombre: 'Aprobado', desc: 'Resolución favorable', color: '#16a34a' },
          { id: 'q3', nombre: 'Rechazado', desc: 'Resolución desfavorable; puede corregirse', color: '#e5484d' },
          { id: 'q4', nombre: 'Archivado', desc: 'Cierre del proceso', color: '#3f4654' }
        ],
        alfabeto: [
          { id: 'enviar', etiqueta: 'Enviar a revisión' }, { id: 'aprobar', etiqueta: 'Aprobar' },
          { id: 'rechazar', etiqueta: 'Rechazar' }, { id: 'corregir', etiqueta: 'Corregir' },
          { id: 'archivar', etiqueta: 'Archivar' }
        ],
        delta: {
          q0: { enviar: 'q1' }, q1: { aprobar: 'q2', rechazar: 'q3' },
          q2: { archivar: 'q4' }, q3: { corregir: 'q0', archivar: 'q4' }, q4: {}
        },
        inicial: 'q0', finales: ['q4'], nombresEtapa: { 2: 'Resolución' }
      },
      {
        id: 'aut-05', codigo: 'AUT-05', nombre: 'Emisión de constancias', modo: 'documentos',
        descripcion: 'Solicitud, verificación de pagos y entrega de constancias.',
        estados: [
          { id: 'q0', nombre: 'Solicitada', desc: 'El estudiante pide la constancia', color: '#64748b' },
          { id: 'q1', nombre: 'Verificación', desc: 'Se revisan pagos y datos', color: '#f5b301' },
          { id: 'q2', nombre: 'Emitida', desc: 'Constancia firmada', color: '#16a34a' },
          { id: 'q3', nombre: 'Denegada', desc: 'Falta un requisito', color: '#e5484d' },
          { id: 'q4', nombre: 'Entregada', desc: 'Recibida por el estudiante', color: '#3f4654' }
        ],
        alfabeto: [
          { id: 'verificar', etiqueta: 'Verificar' }, { id: 'emitir', etiqueta: 'Emitir' },
          { id: 'denegar', etiqueta: 'Denegar' }, { id: 'reintentar', etiqueta: 'Reintentar' },
          { id: 'entregar', etiqueta: 'Entregar' }
        ],
        delta: {
          q0: { verificar: 'q1' }, q1: { emitir: 'q2', denegar: 'q3' },
          q2: { entregar: 'q4' }, q3: { reintentar: 'q1' }, q4: {}
        },
        inicial: 'q0', finales: ['q4', 'q3'], nombresEtapa: { 2: 'Resultado' }
      }
    ];
  }

  let defs = [];
  let cache = {};

  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(defs)); } catch (e) { /* solo en memoria */ }
  }
  function cargar() {
    try {
      const raw = localStorage.getItem(CLAVE);
      if (raw) { defs = JSON.parse(raw); return defs.length > 0; }
    } catch (e) { /* datos dañados: usar ejemplos */ }
    return false;
  }
  function iniciar() { if (!cargar()) { defs = ejemplos(); guardar(); } cache = {}; }
  function restaurar() { defs = ejemplos(); cache = {}; guardar(); }

  const clonar = o => JSON.parse(JSON.stringify(o));
  const def = id => defs.find(d => d.id === id) || null;

  /** AFD listo para usar (se reconstruye solo cuando cambia la definición). */
  function obtener(id) {
    const d = def(id);
    if (!d) return null;
    if (!cache[id]) cache[id] = crearAFD(d);
    return cache[id];
  }
  const todos = modo => defs.filter(d => !modo || d.modo === modo).map(d => obtener(d.id));

  /** Aplica cambios a una definición, la revisa y la guarda. */
  function actualizar(id, cambio) {
    const d = def(id);
    if (!d) throw new Error('Flujo no encontrado.');
    const copia = clonar(d);
    cambio(copia);
    crearAFD(copia); // lanza si quedó inconsistente
    defs[defs.indexOf(d)] = copia;
    delete cache[id];
    guardar();
    return obtener(id);
  }

  function nuevoId() {
    let n = 1; while (def('flujo-' + n)) n++;
    return 'flujo-' + n;
  }
  function nuevoCodigo() {
    const usados = defs.map(d => parseInt(String(d.codigo).replace(/\D/g, ''), 10)).filter(Boolean);
    return 'AUT-' + String(Math.max(5, ...usados) + 1).padStart(2, '0');
  }

  /** Crea un flujo mínimo: inicio → fin. */
  function crear(nombre, modo) {
    const d = {
      id: nuevoId(), codigo: nuevoCodigo(), nombre: nombre || 'Nuevo flujo', modo: modo || 'documentos',
      descripcion: '',
      estados: [
        { id: 'q0', nombre: 'Recibido', desc: '', color: '#64748b' },
        { id: 'q1', nombre: 'En proceso', desc: '', color: '#f5b301' },
        { id: 'q2', nombre: 'Finalizado', desc: '', color: '#16a34a' }
      ],
      alfabeto: [{ id: 'iniciar', etiqueta: 'Iniciar' }, { id: 'finalizar', etiqueta: 'Finalizar' }],
      delta: { q0: { iniciar: 'q1' }, q1: { finalizar: 'q2' }, q2: {} },
      inicial: 'q0', finales: ['q2']
    };
    defs.push(d); guardar();
    return obtener(d.id);
  }

  function duplicar(id, modo, nombre) {
    const d = clonar(def(id));
    d.id = nuevoId(); d.codigo = nuevoCodigo();
    d.nombre = nombre || d.nombre + ' (copia)';
    d.modo = modo || d.modo;
    delete d.base; delete d.carpeta;
    defs.push(d); guardar();
    return obtener(d.id);
  }

  function importar(obj, modo) {
    if (!obj || !Array.isArray(obj.estados) || !Array.isArray(obj.alfabeto) || !obj.delta || !obj.inicial)
      throw new Error('El archivo no tiene el formato de un flujo (estados, alfabeto, delta, inicial).');
    const d = clonar(obj);
    d.id = nuevoId(); d.codigo = nuevoCodigo(); d.modo = modo || 'diseno';
    d.finales = d.finales || [];
    delete d.base; delete d.carpeta;
    crearAFD(d);
    defs.push(d); guardar();
    return obtener(d.id);
  }

  /** Guarda posiciones del lienzo (no cambian el autómata, solo el dibujo). */
  function posicionar(id, pos) {
    const d = def(id);
    if (!d) return;
    d.posiciones = Object.assign(d.posiciones || {}, pos);
    guardar();
  }

  function eliminar(id) {
    defs = defs.filter(d => d.id !== id); delete cache[id]; guardar();
  }

  return { PALETA, iniciar, restaurar, obtener, todos, def: id => clonar(def(id)), actualizar,
           crear, duplicar, importar, eliminar, posicionar, exportar: () => clonar(defs) };
})();

if (typeof module !== 'undefined') module.exports = { crearAFD, Flujos, PALETA, slug, colorTexto, mezclar };
