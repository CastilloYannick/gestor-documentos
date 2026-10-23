/*
 * ============================================================
 *  ADMINISTRADOR DE PROCESOS
 *  Registra documentos y controla su flujo consultando el AFD
 *  del flujo de trabajo al que pertenece cada documento.
 *  Ningún documento cambia de estado sin pasar por δ.
 * ============================================================
 */
const Administrador = (function () {
  'use strict';

  const CLAVE = 'flujo.documentos.v1';
  const FLUJO_BASE = 'aut-04';
  let documentos = [];
  let contador = 1;
  let usuario = 'Sistema';   // quien opera ahora (lo fija el inicio de sesión)

  /** Nombre de quien opera; queda registrado en cada transición. */
  function fijarUsuario(nombre) { usuario = (nombre || '').trim() || 'Sistema'; }

  /* ---------- Persistencia local (navegador) ---------- */
  function guardar() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify({ documentos, contador }));
    } catch (e) { /* sin almacenamiento: los datos viven solo en memoria */ }
  }

  function cargar() {
    try {
      const raw = localStorage.getItem(CLAVE);
      if (raw) {
        const datos = JSON.parse(raw);
        documentos = datos.documentos || [];
        contador = datos.contador || documentos.length + 1;
        // Documentos creados antes de que existieran varios flujos
        documentos.forEach(d => { if (!d.flujo) d.flujo = FLUJO_BASE; });
        return true;
      }
    } catch (e) { /* ignorar y usar datos de ejemplo */ }
    return false;
  }

  function ahora() { return new Date().toISOString(); }
  function nuevoId() { return 'DOC-' + String(contador++).padStart(3, '0'); }

  /** El AFD que controla a un documento. */
  function afdDe(doc) {
    const afd = Flujos.obtener(doc.flujo);
    if (!afd) throw new Error(`El flujo "${doc.flujo}" de ${doc.id} ya no existe.`);
    return afd;
  }

  /* ---------- Operaciones ---------- */

  /** Registra un documento. Siempre inicia en el estado inicial (q0) de su flujo. */
  function registrar({ titulo, tipo, responsable, prioridad, descripcion, flujo }, fecha, quien) {
    if (!titulo || !titulo.trim()) throw new Error('El título es obligatorio.');
    if (!responsable || !responsable.trim()) throw new Error('El responsable es obligatorio.');
    const afd = Flujos.obtener(flujo || FLUJO_BASE);
    if (!afd) throw new Error('Elige un flujo de trabajo.');
    if (afd.modo !== 'documentos') throw new Error('Ese flujo está en el diseñador. Publícalo antes de usarlo con documentos.');

    const doc = {
      id: nuevoId(),
      flujo: afd.id,
      titulo: titulo.trim(),
      tipo: tipo || 'Oficio',
      responsable: responsable.trim(),
      prioridad: prioridad || 'Media',
      descripcion: (descripcion || '').trim(),
      estado: afd.inicial,
      archivo: null, // { nombre, tipo, tamano } — el contenido vive en el Directorio
      creado: fecha || ahora(),
      historial: [{ desde: null, simbolo: null, hacia: afd.inicial, fecha: fecha || ahora(), usuario: quien || usuario }]
    };
    documentos.unshift(doc);
    guardar();
    return doc;
  }

  /**
   * Aplica un símbolo de Σ a un documento.
   * Si δ(estado, símbolo) no está definida, la acción se rechaza.
   */
  function aplicar(id, simbolo, nota, fecha, quien) {
    const doc = obtener(id);
    if (!doc) throw new Error('Documento no encontrado.');
    const afd = afdDe(doc);

    const siguiente = afd.transicion(doc.estado, simbolo);
    if (!siguiente) {
      throw new Error(
        `Transición inválida: δ(${doc.estado}, ${simbolo}) no está definida. ` +
        `Un documento "${afd.nombres[doc.estado] || doc.estado}" no puede "${simbolo}".`
      );
    }

    doc.historial.push({ desde: doc.estado, simbolo, hacia: siguiente, fecha: fecha || ahora(), nota: nota || '', usuario: quien || usuario });
    doc.estado = siguiente;
    guardar();
    return doc;
  }

  /** Asocia (o quita, con null) los datos del archivo adjunto. */
  function adjuntar(id, meta) {
    const doc = obtener(id);
    if (!doc) throw new Error('Documento no encontrado.');
    doc.archivo = meta ? { nombre: meta.nombre, tipo: meta.tipo, tamano: meta.tamano } : null;
    guardar();
    return doc;
  }

  /**
   * Deshace la última transición de un documento (corrección administrativa):
   * vuelve al estado anterior y la quita del historial.
   */
  function deshacer(id) {
    const doc = obtener(id);
    if (!doc) throw new Error('Documento no encontrado.');
    const ultima = doc.historial[doc.historial.length - 1];
    if (!ultima || !ultima.simbolo) throw new Error('No hay transiciones para deshacer.');
    doc.historial.pop();
    doc.estado = ultima.desde;
    guardar();
    return { doc, deshecha: ultima };
  }

  /** Vuelve a poner un documento eliminado (para Deshacer). */
  function restaurar(doc, indice) {
    if (obtener(doc.id)) return obtener(doc.id);
    documentos.splice(Math.max(0, Math.min(indice ?? 0, documentos.length)), 0, doc);
    guardar();
    return doc;
  }

  function eliminar(id) {
    documentos = documentos.filter(d => d.id !== id);
    guardar();
  }

  function obtener(id) { return documentos.find(d => d.id === id) || null; }
  function todos(flujo) { return documentos.filter(d => !flujo || d.flujo === flujo); }

  /* ---------- Consultas para tablas y grafos ---------- */

  /** Documentos por estado dentro de un flujo: { q0: 3, q1: 1, ... } */
  function conteoPorEstado(flujo) {
    const afd = Flujos.obtener(flujo || FLUJO_BASE);
    const c = {};
    if (!afd) return c;
    afd.estados.forEach(q => (c[q] = 0));
    todos(afd.id).forEach(d => { if (d.estado in c) c[d.estado]++; });
    return c;
  }

  /** Archivos adjuntos por estado dentro de un flujo. */
  function archivosPorEstado(flujo) {
    const c = {};
    todos(flujo).forEach(d => { if (d.archivo) c[d.estado] = (c[d.estado] || 0) + 1; });
    return c;
  }

  /** Cuántas veces se ha recorrido cada transición según el historial: { "q0|enviar": 5 } */
  function usoTransiciones(flujo) {
    const u = {};
    todos(flujo).forEach(d => d.historial.forEach(h => {
      if (h.simbolo) { const k = h.desde + '|' + h.simbolo; u[k] = (u[k] || 0) + 1; }
    }));
    return u;
  }

  /** Cadena w ∈ Σ* que ha recibido el documento (sus símbolos en orden). */
  function cadenaDe(doc) {
    return doc.historial.filter(h => h.simbolo).map(h => h.simbolo);
  }

  /** Resumen completo para exportar (lo usa el reporte de grafos). */
  function manifiesto() {
    return {
      sistema: 'Administrador de procesos · Universidad Mariano Gálvez de Guatemala',
      generado: ahora(),
      flujos: Flujos.exportar(),
      documentos: documentos.map(d => ({
        id: d.id, flujo: d.flujo, titulo: d.titulo, tipo: d.tipo, responsable: d.responsable,
        estado: d.estado, archivo: d.archivo ? d.archivo.nombre : null,
        carpeta: (() => { try { return afdDe(d).rutaCarpeta(d.estado).join('/'); } catch (e) { return null; } })(),
        historial: d.historial.map(h => ({ desde: h.desde, simbolo: h.simbolo, hacia: h.hacia, fecha: h.fecha, usuario: h.usuario || null }))
      }))
    };
  }

  /* ---------- Datos de ejemplo (repartidos en las últimas dos semanas) ---------- */
  function sembrar() {
    documentos = [];
    contador = 1;
    const H = 3600e3, D = 24 * H;
    const base = Date.now();
    // [flujo, título, tipo, responsable, prioridad, días atrás, cadena de símbolos, horas entre pasos]
    const ejemplos = [
      ['aut-04', 'Acta de reunión de coordinación', 'Acta', 'Carlos Pérez', 'Media', 13, ['enviar', 'aprobar', 'archivar'], 20],
      ['aut-04', 'Informe de laboratorio 3', 'Informe', 'Ana Gómez', 'Media', 12, ['enviar', 'rechazar'], 30],
      ['aut-05', 'Constancia de cursos aprobados', 'Constancia', 'Pedro Juárez', 'Media', 11, ['verificar', 'emitir', 'entregar'], 16],
      ['aut-04', 'Memorándum interno 12', 'Memorándum', 'Lucía Herrera', 'Baja', 10, ['enviar', 'rechazar', 'corregir', 'enviar'], 26],
      ['aut-04', 'Oficio de compra de equipo', 'Oficio', 'Luis Castillo', 'Alta', 9, ['enviar', 'aprobar'], 40],
      ['aut-05', 'Constancia de solvencia', 'Constancia', 'Jorge Méndez', 'Baja', 8, ['verificar', 'denegar', 'reintentar', 'emitir'], 18],
      ['aut-04', 'Solicitud de laboratorio de cómputo', 'Solicitud', 'Andrea Cifuentes', 'Alta', 7, ['enviar', 'aprobar', 'archivar'], 12],
      ['aut-04', 'Propuesta de proyecto final', 'Propuesta', 'Diego Morales', 'Alta', 6, ['enviar'], 10],
      ['aut-05', 'Constancia de estudios', 'Constancia', 'Andrea Cifuentes', 'Alta', 5, ['verificar'], 8],
      ['aut-04', 'Informe de prácticas supervisadas', 'Informe', 'Sofía Ramírez', 'Media', 4, ['enviar', 'rechazar', 'archivar'], 14],
      ['aut-04', 'Solicitud de equivalencia de cursos', 'Solicitud', 'María López', 'Alta', 3, ['enviar'], 6],
      ['aut-05', 'Constancia de inscripción', 'Constancia', 'Pedro Juárez', 'Media', 2, ['verificar', 'emitir'], 9],
      ['aut-04', 'Oficio de cambio de sección', 'Oficio', 'Luis Castillo', 'Baja', 1, [], 0],
      ['aut-04', 'Acta de defensa de tesis', 'Acta', 'Carlos Pérez', 'Alta', 0.4, ['enviar'], 3]
    ];
    const revisores = ['Mtra. Elena Barrios', 'Ing. Óscar Pineda', 'Lic. Rosa Ajú'];
    ejemplos.forEach(([flujo, titulo, tipo, responsable, prioridad, dias, cadena, paso], i) => {
      if (!Flujos.obtener(flujo)) return;
      let t = base - dias * D - (i % 3) * H;
      const d = registrar({ titulo, tipo, responsable, prioridad, flujo }, new Date(t).toISOString(), responsable);
      cadena.forEach((s, k) => {
        t += paso * H * (1 + (k % 2) * 0.5);
        if (t > base) t = base - (cadena.length - k) * 60e3;
        aplicar(d.id, s, '', new Date(t).toISOString(), revisores[(i + k) % revisores.length]);
      });
    });
    documentos.sort((a, b) => b.creado.localeCompare(a.creado));
  }

  function reiniciar() { sembrar(); guardar(); }
  function iniciar() { if (!cargar()) { sembrar(); guardar(); } }

  return { FLUJO_BASE, iniciar, registrar, aplicar, adjuntar, eliminar, obtener, todos, afdDe,
           fijarUsuario, usuario: () => usuario, deshacer, restaurar,
           conteoPorEstado, archivosPorEstado, usoTransiciones, cadenaDe, manifiesto, reiniciar };
})();
