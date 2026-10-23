/*
 * ============================================================
 *  GRAFOS CON GRAPHVIZ
 *  El diagrama de cada flujo NO se dibuja a mano: se describe en
 *  lenguaje DOT a partir de los datos (estados, δ, documentos y
 *  carpetas) y Graphviz calcula solo la posición de cada nodo.
 *
 *  Usa Viz.js (Graphviz compilado para el navegador), incluido en
 *  js/vendor/viz-standalone.js, así que funciona sin internet.
 * ============================================================
 */
const Grafo = (function () {
  'use strict';

  let viz = null;
  let error = null;
  const espera = (typeof Viz !== 'undefined' ? Viz.instance() : Promise.reject(new Error('No se cargó Viz.js')))
    .then(v => (viz = v))
    .catch(e => { error = e; throw e; });

  const q = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  const html = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /**
   * Genera la descripción DOT de un flujo.
   * opciones:
   *   conteo      { q0: 3 }      documentos por estado (base de datos)
   *   archivos    { q0: 2 }      archivos por estado (carpetas)
   *   uso         { "q0|enviar": 5 }  veces que se recorrió cada transición
   *   activo      'q1'           estado a resaltar
   *   arista      { de, s }      transición a resaltar
   *   docs, usos  boolean        mostrar u ocultar los números
   *   dir         'LR' | 'TB'    orientación
   */
  function dot(afd, o = {}) {
    const docs = o.docs !== false, usos = o.usos !== false;
    // Colores según el tema: en oscuro los nodos son tinta sobre fondo profundo
    const os = o.tema === 'oscuro';
    const T = os
      ? { relleno: c => mezclar(c, -0.72), tinta: c => mezclar(c, 0.55), linea: '#3e5068', etiqueta: '#a9b5c6', tenue: '#8f9bb0', inicio: '#e6edf5', usada: c => mezclar(c, 0.1), etiquetaUsada: c => mezclar(c, 0.45) }
      : { relleno: c => mezclar(c, 0.86), tinta: c => mezclar(c, -0.45), linea: '#b7bcc5', etiqueta: '#4b4f58', tenue: '#6b7280', inicio: '#13202f', usada: c => mezclar(c, 0.25), etiquetaUsada: c => mezclar(c, -0.55) };
    // En oscuro, un color de estado muy oscuro (p. ej. gris oscuro) se aclara para que se distinga del fondo
    const lum = hex => { const n = parseInt(String(hex).slice(1), 16); return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
    const vis = c => (os && lum(c) < 0.32 ? mezclar(c, 0.42) : c);
    const L = [];
    L.push(`digraph ${q(afd.codigo)} {`);
    L.push(`  graph [rankdir=${o.dir || 'LR'}, bgcolor="transparent", pad="0.3", nodesep="0.45", ranksep="0.75", fontname="Helvetica"];`);
    L.push('  node  [shape=circle, style=filled, fontname="Helvetica", fontsize=17, penwidth=2, margin="0.04"];');
    L.push(`  edge  [fontname="Helvetica", fontsize=14, arrowsize=0.8, color="${T.linea}", fontcolor="${T.etiqueta}"];`);
    L.push('');
    L.push('  // Flecha de inicio hacia q0');
    L.push(`  "__inicio" [shape=point, width=0.12, color="${T.inicio}", fillcolor="${T.inicio}", label=""];`);
    L.push(`  "__inicio" -> ${q(afd.inicial)} [label="  inicio  ", fontsize=12, color="${T.inicio}", fontcolor="${T.etiqueta}", penwidth=1.4];`);
    L.push('');
    L.push('  // Estados (Q). Doble círculo = estado de aceptación (F)');
    afd.estados.forEach(e => {
      const c = vis(afd.color(e));
      const activo = e === o.activo;
      const nd = (o.conteo && o.conteo[e]) || 0, na = (o.archivos && o.archivos[e]) || 0;
      let lbl = `<B>${html(e)}</B><BR/><FONT POINT-SIZE="13">${html(afd.nombres[e])}</FONT>`;
      if (docs) lbl += `<BR/><FONT POINT-SIZE="11">${nd} doc${nd === 1 ? '' : 's'} · ${na} arch.</FONT>`;
      const attrs = [
        `id="nodo-${e}"`, `class="${activo ? 'gv-activo' : 'gv-nodo'}"`,
        `shape=${afd.esFinal(e) ? 'doublecircle' : 'circle'}`,
        `label=<${lbl}>`,
        `color="${c}"`,
        `fillcolor="${activo ? c : T.relleno(c)}"`,
        `fontcolor="${activo ? colorTexto(c) : T.tinta(c)}"`,
        `penwidth=${activo ? 4 : 2}`,
        `tooltip=${q(`${afd.nombres[e]}${afd.descripciones[e] ? ' — ' + afd.descripciones[e] : ''}`)}`
      ];
      if (afd.inalcanzables.includes(e)) attrs.push('style="filled,dashed"');
      L.push(`  ${q(e)} [${attrs.join(', ')}];`);
    });
    L.push('');
    L.push('  // Función de transición δ');
    // Agrupar símbolos que van del mismo origen al mismo destino
    const pares = new Map();
    afd.aristas().forEach(t => {
      const k = t.de + '>' + t.a;
      if (!pares.has(k)) pares.set(k, { de: t.de, a: t.a, simbolos: [] });
      pares.get(k).simbolos.push(t.s);
    });
    pares.forEach(p => {
      const n = p.simbolos.reduce((s, x) => s + ((o.uso && o.uso[p.de + '|' + x]) || 0), 0);
      const activa = o.arista && o.arista.de === p.de && p.simbolos.includes(o.arista.s);
      const c = vis(afd.color(p.a));
      const etiqueta = p.simbolos.map(x => (usos && o.uso && o.uso[p.de + '|' + x]) ? `${x} (${o.uso[p.de + '|' + x]})` : x).join(', ');
      const attrs = [
        `id="arista-${p.de}-${p.a}"`, `class="${activa ? 'gv-activa' : 'gv-arista'}"`,
        `label=${q('  ' + etiqueta + '  ')}`,
        `color="${activa ? c : (n ? T.usada(c) : T.linea)}"`,
        `fontcolor="${activa || n ? T.etiquetaUsada(c) : T.tenue}"`,
        `penwidth=${activa ? 3.6 : (usos && n ? (1.4 + Math.min(4, Math.log2(1 + n))).toFixed(1) : 1.4)}`,
        `tooltip=${q(p.simbolos.map(x => `δ(${p.de}, ${x}) = ${p.a}`).join('\n') + (n ? `\nUsada ${n} ${n === 1 ? 'vez' : 'veces'}` : ''))}`
      ];
      if (activa) attrs.push('style=bold');
      L.push(`  ${q(p.de)} -> ${q(p.a)} [${attrs.join(', ')}];`);
    });
    L.push('}');
    return L.join('\n');
  }

  /** Dibuja el DOT y devuelve un <svg>, o null si Graphviz aún no cargó. */
  function svg(textoDot) {
    if (!viz) return null;
    const el = viz.renderSVGElement(textoDot);
    el.removeAttribute('width');
    el.removeAttribute('height');
    el.classList.add('gv');
    el.setAttribute('role', 'img');
    return el;
  }

  return { listo: () => espera, disponible: () => !!viz, error: () => error, dot, svg };
})();
