/*
 * ============================================================
 *  DIRECTORIO DE DOCUMENTOS
 *  Guarda los archivos subidos y los organiza en carpetas según
 *  el estado del autómata en que se encuentra cada documento.
 *
 *  Gestor_Documentos_UMG/
 *    01_Registrado/               ← flujo AUT-04 (en la raíz)
 *    02_En_revision/
 *    03_Resolucion/Aprobado/
 *    03_Resolucion/Rechazado/
 *    04_Archivado/
 *    AUT_05_Emision_de_constancias/01_Solicitada/ ...  ← otros flujos
 *    flujos.json                  ← base de datos exportada (flujos + documentos)
 *
 *  Las carpetas se calculan a partir de cada AFD: una carpeta por
 *  etapa (distancia desde q0) y una subcarpeta por estado cuando la
 *  etapa tiene más de uno. Si se edita el flujo, las carpetas cambian.
 *
 *  Capa 1 (siempre): IndexedDB, una base de datos del navegador.
 *  Capa 2 (opcional): una carpeta real en el disco, usando la
 *  File System Access API (Chrome y Edge).
 * ============================================================
 */
const Directorio = (function () {
  'use strict';

  const RAIZ = 'Gestor_Documentos_UMG';
  const MANIFIESTO = 'flujos.json';

  /** Ruta (lista de carpetas) de un documento según su flujo y estado. */
  function rutaDoc(doc) {
    const afd = Flujos.obtener(doc.flujo);
    return afd && afd.estados.includes(doc.estado) ? afd.rutaCarpeta(doc.estado) : ['00_Sin_flujo'];
  }

  function nombreArchivo(docId, original) {
    const limpio = String(original).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
    return `${docId} - ${limpio}`;
  }

  /* ---------------- IndexedDB ---------------- */
  let dbPromesa = null;
  function db() {
    if (dbPromesa) return dbPromesa;
    dbPromesa = new Promise((ok, mal) => {
      if (!('indexedDB' in window)) return mal(new Error('Este navegador no permite guardar archivos.'));
      const req = indexedDB.open('flujo-umg', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('archivos', { keyPath: 'docId' });
        req.result.createObjectStore('config');
      };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => mal(req.error);
    });
    return dbPromesa;
  }

  function tx(almacen, modo, accion) {
    return db().then(d => new Promise((ok, mal) => {
      const t = d.transaction(almacen, modo);
      const r = accion(t.objectStore(almacen));
      t.oncomplete = () => ok(r && 'result' in r ? r.result : undefined);
      t.onerror = () => mal(t.error);
      t.onabort = () => mal(t.error || new Error('Operación cancelada (¿espacio insuficiente?)'));
    }));
  }

  function guardarArchivo(docId, archivo) {
    const registro = {
      docId, nombre: archivo.name, tipo: archivo.type || 'application/octet-stream',
      tamano: archivo.size, subido: new Date().toISOString(), blob: archivo
    };
    return tx('archivos', 'readwrite', s => s.put(registro)).then(() => registro);
  }
  const obtenerArchivo = docId => tx('archivos', 'readonly', s => s.get(docId));
  const eliminarArchivo = docId => tx('archivos', 'readwrite', s => s.delete(docId));
  const todosLosArchivos = () => tx('archivos', 'readonly', s => s.getAll());
  const vaciar = () => tx('archivos', 'readwrite', s => s.clear());
  const restaurarArchivo = reg => tx('archivos', 'readwrite', s => s.put(reg));

  /* ---------------- Carpeta en disco ---------------- */
  const discoSoportado = () => typeof window.showDirectoryPicker === 'function';
  let raizDisco = null; // FileSystemDirectoryHandle de la carpeta elegida

  async function cargarVinculo() {
    if (!discoSoportado()) return;
    try { raizDisco = (await tx('config', 'readonly', s => s.get('carpeta'))) || null; } catch (e) { raizDisco = null; }
  }

  /** 'no-soportado' | 'sin-vincular' | 'requiere-permiso' | 'activo' */
  async function estadoDisco() {
    if (!discoSoportado()) return 'no-soportado';
    if (!raizDisco) return 'sin-vincular';
    try {
      const p = await raizDisco.queryPermission({ mode: 'readwrite' });
      return p === 'granted' ? 'activo' : 'requiere-permiso';
    } catch (e) { return 'requiere-permiso'; }
  }

  /** Abre el selector de carpetas del sistema (requiere un clic del usuario). */
  async function vincularCarpeta() {
    const h = await window.showDirectoryPicker({ id: 'flujo-umg', mode: 'readwrite' });
    raizDisco = h;
    await tx('config', 'readwrite', s => s.put(h, 'carpeta'));
    return h.name;
  }

  /** Vuelve a pedir permiso de escritura (los navegadores lo olvidan al recargar). */
  async function pedirPermiso() {
    if (!raizDisco) return false;
    return (await raizDisco.requestPermission({ mode: 'readwrite' })) === 'granted';
  }

  async function desvincular() {
    raizDisco = null;
    await tx('config', 'readwrite', s => s.delete('carpeta'));
  }

  const nombreCarpetaDisco = () => (raizDisco ? `${raizDisco.name}/${RAIZ}` : null);

  async function carpetaEn(base, partes) {
    let d = base;
    for (const p of partes) d = await d.getDirectoryHandle(p, { create: true });
    return d;
  }

  async function escribir(dir, nombre, contenido) {
    const f = await dir.getFileHandle(nombre, { create: true });
    const w = await f.createWritable();
    await w.write(contenido);
    await w.close();
  }

  /**
   * Hace que la carpeta del disco refleje el estado actual:
   * - crea las carpetas de todos los estados de los flujos de documentos,
   * - deja cada archivo solo en la carpeta de su estado,
   * - borra carpetas vacías que ya no corresponden a ningún estado,
   * - guarda flujos.json con la base de datos completa.
   */
  async function sincronizar(documentos) {
    if ((await estadoDisco()) !== 'activo') return false;
    const raiz = await raizDisco.getDirectoryHandle(RAIZ, { create: true });
    const archivos = await todosLosArchivos();
    const porDoc = new Map(archivos.map(a => [a.docId, a]));

    // 1. Qué carpetas deben existir y qué archivo va en cada una
    const esperado = new Map(); // "a/b" -> Map(nombre -> blob)
    const asegurar = ruta => { const k = ruta.join('/'); if (!esperado.has(k)) esperado.set(k, new Map()); return esperado.get(k); };
    Flujos.todos('documentos').forEach(afd => afd.estados.forEach(q => asegurar(afd.rutaCarpeta(q))));
    documentos.forEach(d => {
      const a = porDoc.get(d.id);
      if (a) asegurar(rutaDoc(d)).set(nombreArchivo(d.id, a.nombre), a.blob);
    });
    // Las carpetas "padre" también son esperadas
    [...esperado.keys()].forEach(k => { const p = k.split('/'); for (let i = 1; i < p.length; i++) asegurar(p.slice(0, i)); });

    // 2. Recorrer el disco: quitar archivos del sistema fuera de lugar y carpetas vacías obsoletas
    async function limpiar(dir, ruta) {
      let hayContenido = false;
      for await (const [nombre, h] of dir.entries()) {
        const sub = ruta.concat(nombre);
        if (h.kind === 'directory') {
          const vacia = await limpiar(h, sub);
          if (vacia && !esperado.has(sub.join('/'))) await dir.removeEntry(nombre);
          else hayContenido = true;
        } else if (/^DOC-\d+ - /.test(nombre)) { // solo tocamos archivos creados por el sistema
          const deben = esperado.get(ruta.join('/'));
          if (deben && deben.has(nombre)) hayContenido = true;
          else await dir.removeEntry(nombre);
        } else hayContenido = true;
      }
      return !hayContenido;
    }
    await limpiar(raiz, []);

    // 3. Crear carpetas y escribir los archivos que falten
    for (const [k, deben] of esperado) {
      const dir = await carpetaEn(raiz, k.split('/'));
      const hay = new Set();
      for await (const [nombre, h] of dir.entries()) if (h.kind === 'file') hay.add(nombre);
      for (const [nombre, blob] of deben) if (!hay.has(nombre)) await escribir(dir, nombre, blob);
    }

    // 4. Base de datos exportada para el reporte de grafos
    await escribir(raiz, MANIFIESTO, new Blob([JSON.stringify(Administrador.manifiesto(), null, 2)], { type: 'application/json' }));
    return true;
  }

  /**
   * Consulta las carpetas reales del disco: cuántos archivos de documentos
   * hay en cada ruta. Devuelve null si no hay carpeta vinculada.
   */
  async function consultarDisco() {
    if ((await estadoDisco()) !== 'activo') return null;
    let raiz;
    try { raiz = await raizDisco.getDirectoryHandle(RAIZ); } catch (e) { return { conteo: {}, nombre: nombreCarpetaDisco() }; }
    const conteo = {};
    async function contar(dir, ruta) {
      for await (const [nombre, h] of dir.entries()) {
        if (h.kind === 'directory') await contar(h, ruta.concat(nombre));
        else if (/^DOC-\d+ - /.test(nombre)) { const k = ruta.join('/'); conteo[k] = (conteo[k] || 0) + 1; }
      }
    }
    await contar(raiz, []);
    return { conteo, nombre: nombreCarpetaDisco() };
  }

  /* ---------------- Utilidades ---------------- */
  function tamanoLegible(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1024 / 1024).toFixed(1) + ' MB';
  }

  async function abrir(docId) {
    const a = await obtenerArchivo(docId);
    if (!a) throw new Error('El archivo ya no está en el directorio.');
    const url = URL.createObjectURL(a.blob);
    const w = window.open(url, '_blank');
    if (!w) descargarBlob(a.blob, a.nombre, url);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function descargar(docId) {
    const a = await obtenerArchivo(docId);
    if (!a) throw new Error('El archivo ya no está en el directorio.');
    descargarBlob(a.blob, a.nombre);
  }

  function descargarBlob(blob, nombre, url) {
    const u = url || URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.href = u; el.download = nombre;
    document.body.appendChild(el); el.click(); el.remove();
    if (!url) setTimeout(() => URL.revokeObjectURL(u), 60000);
  }

  /** Descarga flujos.json (la misma base de datos que se guarda en la carpeta). */
  function descargarManifiesto() {
    descargarBlob(new Blob([JSON.stringify(Administrador.manifiesto(), null, 2)], { type: 'application/json' }), MANIFIESTO);
  }

  return {
    RAIZ, MANIFIESTO, rutaDoc, nombreArchivo, consultarDisco, descargarManifiesto, descargarBlob,
    guardarArchivo, obtenerArchivo, eliminarArchivo, todosLosArchivos, vaciar, restaurarArchivo,
    discoSoportado, cargarVinculo, estadoDisco, vincularCarpeta, pedirPermiso, desvincular,
    nombreCarpetaDisco, sincronizar, tamanoLegible, abrir, descargar
  };
})();
