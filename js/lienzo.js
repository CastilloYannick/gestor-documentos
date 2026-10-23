/*
 * ============================================================
 *  LIENZO: CREAR AUTÓMATAS CON ARRASTRAR Y SOLTAR
 *  - Arrastra "Estado" o "Estado final" desde la paleta al lienzo.
 *  - Arrastra un estado para moverlo.
 *  - Arrastra desde el botón "+" de un estado hasta otro estado
 *    (o hasta sí mismo) para crear una transición δ.
 *  - Doble clic en un espacio vacío crea un estado.
 *  Cada cambio se guarda en la definición del flujo, así que el
 *  AFD, la tabla δ y el grafo de Graphviz se actualizan solos.
 * ============================================================
 */
const Lienzo = (function () {
  'use strict';

  const R = 34;          // radio de cada estado
  const MIN_W = 760, MIN_H = 430;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const corto = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  /** Posición inicial por etapas (distancia desde q0) cuando el usuario aún no movió nada. */
  function posicionesIniciales(afd) {
    const pos = {};
    afd.etapas.forEach((g, i) => {
      g.forEach((q, k) => {
        pos[q] = { x: 100 + i * 170, y: MIN_H / 2 + (k - (g.length - 1) / 2) * 130 };
      });
    });
    return pos;
  }

  /** Posiciones guardadas + iniciales para los estados que no tienen una. */
  function posiciones(afd, guardadas) {
    const base = posicionesIniciales(afd);
    const pos = {};
    const valida = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
    afd.estados.forEach(q => { pos[q] = valida(guardadas && guardadas[q]) ? { ...guardadas[q] } : base[q]; });
    return pos;
  }

  function tamano(pos) {
    let w = MIN_W, h = MIN_H;
    Object.values(pos).forEach(p => { w = Math.max(w, p.x + R + 90); h = Math.max(h, p.y + R + 80); });
    return { w, h };
  }

  /** Geometría de la flecha entre dos estados (recta, curva o bucle). */
  function geometria(p1, p2, curva, mismo) {
    if (mismo) {
      const x = p1.x, y = p1.y - R;
      return { d: `M${x - 14},${y + 4} C${x - 46},${y - 78} ${x + 46},${y - 78} ${x + 14},${y + 4}`, lx: x, ly: y - 66 };
    }
    const dx = p2.x - p1.x, dy = p2.y - p1.y, L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const off = curva ? 34 : 0;
    const sx = p1.x + ux * R + nx * off * 0.35, sy = p1.y + uy * R + ny * off * 0.35;
    const ex = p2.x - ux * (R + 6) + nx * off * 0.35, ey = p2.y - uy * (R + 6) + ny * off * 0.35;
    const cx = (p1.x + p2.x) / 2 + nx * off, cy = (p1.y + p2.y) / 2 + ny * off;
    return curva
      ? { d: `M${sx},${sy} Q${cx},${cy} ${ex},${ey}`, lx: cx + nx * 10, ly: cy + ny * 10 }
      : { d: `M${sx},${sy} L${ex},${ey}`, lx: (sx + ex) / 2 + nx * 14, ly: (sy + ey) / 2 + ny * 14 + 4 };
  }

  function aristasSVG(afd, pos, o) {
    const pares = new Map();
    afd.aristas().forEach(t => {
      const k = t.de + '>' + t.a;
      if (!pares.has(k)) pares.set(k, { de: t.de, a: t.a, s: [] });
      pares.get(k).s.push(t.s);
    });
    let html = '';
    pares.forEach(p => {
      const curva = p.de !== p.a && pares.has(p.a + '>' + p.de);
      const g = geometria(pos[p.de], pos[p.a], curva, p.de === p.a);
      const sel = o.sel && o.sel.tipo === 'arista' && o.sel.de === p.de && o.sel.a === p.a;
      const activa = o.arista && o.arista.de === p.de && p.s.includes(o.arista.s);
      const n = p.s.reduce((t, s) => t + ((o.uso && o.uso[p.de + '|' + s]) || 0), 0);
      html += `<g class="lz-arista ${sel ? 'sel' : ''} ${activa ? 'activa' : ''} ${n ? 'usada' : ''}" data-de="${p.de}" data-a="${p.a}" style="--c:${afd.color(p.a)}">
        <path class="hit" d="${g.d}"/>
        <path class="linea" d="${g.d}" marker-end="url(#lz-p-${p.a})"/>
        <text x="${g.lx}" y="${g.ly}">${esc(p.s.join(', '))}</text></g>`;
    });
    return html;
  }

  /** Dibuja el lienzo completo. */
  function svg(afd, guardadas, o = {}) {
    const pos = posiciones(afd, guardadas);
    const { w, h } = tamano(pos);
    const pi = pos[afd.inicial];
    const nodos = afd.estados.map(q => {
      const p = pos[q];
      const sel = o.sel && o.sel.tipo === 'estado' && o.sel.q === q;
      const n = (o.conteo && o.conteo[q]) || 0;
      return `<g class="lz-nodo ${sel ? 'sel' : ''} ${q === o.activo ? 'activo' : ''} ${afd.inalcanzables.includes(q) ? 'suelto' : ''}" data-q="${q}" transform="translate(${p.x},${p.y})" style="--c:${afd.color(q)};--on:${afd.colorOn(q)}" tabindex="0" role="button" aria-label="Estado ${q} ${esc(afd.nombres[q])}">
        <title>${esc(afd.nombres[q])}${afd.descripciones[q] ? ' — ' + esc(afd.descripciones[q]) : ''}</title>
        <circle class="cuerpo" r="${R}"/>
        ${afd.esFinal(q) ? `<circle class="anillo" r="${R - 6}"/>` : ''}
        <text class="id" y="-5">${q}</text>
        <text class="nom" y="12">${esc(corto(afd.nombres[q], 13))}</text>
        ${n ? `<g class="cnt" transform="translate(${R - 8},${-R + 8})"><circle r="11"/><text y="4">${n}</text></g>` : ''}
        <g class="lz-knob" data-knob="${q}" transform="translate(${R + 12},0)"><title>Arrastra hasta otro estado para crear una transición</title><circle r="10"/><path d="M-4.5 0h9M0 -4.5v9"/></g>
      </g>`;
    }).join('');
    return `<svg class="lz" viewBox="0 0 ${w} ${h}" data-w="${w}" data-h="${h}" role="application" aria-label="Lienzo del autómata">
      <defs>
        ${afd.estados.map(q => `<marker id="lz-p-${q}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${afd.color(q)}"/></marker>`).join('')}
        <marker id="lz-p-tmp" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#1d6fa5"/></marker>
        <marker id="lz-p-ini" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--ink)"/></marker>
      </defs>
      <rect class="lz-fondo" x="0" y="0" width="${w}" height="${h}"/>
      ${pi ? `<g class="lz-inicio"><path d="M${pi.x - R - 54},${pi.y} L${pi.x - R - 6},${pi.y}" marker-end="url(#lz-p-ini)"/><text x="${pi.x - R - 50}" y="${pi.y - 8}">inicio</text></g>` : ''}
      <g class="lz-aristas">${aristasSVG(afd, pos, o)}</g>
      <path class="lz-temp" d="" marker-end="url(#lz-p-tmp)"/>
      <g class="lz-nodos">${nodos}</g>
    </svg>`;
  }

  /* ---------- Interacción ---------- */
  let estado = null; // { afd, pos, o, svg, h }

  function punto(svgEl, ev) {
    const pt = svgEl.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    return pt.matrixTransform(svgEl.getScreenCTM().inverse());
  }

  function limitar(svgEl, x, y) {
    const w = +svgEl.dataset.w, h = +svgEl.dataset.h;
    return { x: Math.round(Math.min(w - R - 4, Math.max(R + 4, x))), y: Math.round(Math.min(h - R - 4, Math.max(R + 24, y))) };
  }

  /**
   * Conecta los gestos del lienzo.
   * h: { mover(pos), crear(x, y, final), conectar(de, a), seleccionar(sel) }
   */
  function montar(cont, afd, guardadas, o, h) {
    cont.innerHTML = svg(afd, guardadas, o);
    const svgEl = cont.querySelector('svg');
    estado = { afd, pos: posiciones(afd, guardadas), o, svg: svgEl, h };
    let gesto = null;
    let ignorarClic = false; // el clic que el navegador dispara al terminar un arrastre

    svgEl.addEventListener('pointerdown', ev => {
      if (ev.button !== 0) return;
      const knob = ev.target.closest('.lz-knob');
      const nodo = ev.target.closest('.lz-nodo');
      const p = punto(svgEl, ev);
      if (knob) {
        gesto = { tipo: 'conectar', de: knob.dataset.knob };
        svgEl.classList.add('conectando');
      } else if (nodo) {
        const q = nodo.dataset.q;
        gesto = { tipo: 'mover', q, nodo, dx: estado.pos[q].x - p.x, dy: estado.pos[q].y - p.y, movido: false, x0: p.x, y0: p.y };
        nodo.classList.add('arrastrando');
      } else return;
      svgEl.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });

    svgEl.addEventListener('pointermove', ev => {
      if (!gesto) {
        // Resaltar el destino posible mientras no hay gesto: nada que hacer
        return;
      }
      const p = punto(svgEl, ev);
      if (gesto.tipo === 'mover') {
        if (!gesto.movido && Math.hypot(p.x - gesto.x0, p.y - gesto.y0) < 4) return;
        gesto.movido = true;
        const np = limitar(svgEl, p.x + gesto.dx, p.y + gesto.dy);
        estado.pos[gesto.q] = np;
        gesto.nodo.setAttribute('transform', `translate(${np.x},${np.y})`);
        svgEl.querySelector('.lz-aristas').innerHTML = aristasSVG(estado.afd, estado.pos, estado.o);
        const ini = svgEl.querySelector('.lz-inicio');
        if (ini && gesto.q === estado.afd.inicial) {
          ini.querySelector('path').setAttribute('d', `M${np.x - R - 54},${np.y} L${np.x - R - 6},${np.y}`);
          ini.querySelector('text').setAttribute('x', np.x - R - 50); ini.querySelector('text').setAttribute('y', np.y - 8);
        }
      } else {
        const a = estado.pos[gesto.de];
        svgEl.querySelector('.lz-temp').setAttribute('d', `M${a.x},${a.y} L${p.x},${p.y}`);
        const bajo = document.elementFromPoint(ev.clientX, ev.clientY);
        const destino = bajo && bajo.closest && bajo.closest('.lz-nodo');
        svgEl.querySelectorAll('.lz-nodo.destino').forEach(n => n.classList.remove('destino'));
        if (destino) destino.classList.add('destino');
      }
    });

    function terminar(ev) {
      if (!gesto) return;
      const g = gesto; gesto = null;
      ignorarClic = g.tipo === 'conectar' || g.movido;
      svgEl.classList.remove('conectando');
      if (g.tipo === 'mover') {
        g.nodo.classList.remove('arrastrando');
        if (g.movido) h.mover({ [g.q]: estado.pos[g.q] });
        else h.seleccionar({ tipo: 'estado', q: g.q });
      } else {
        svgEl.querySelector('.lz-temp').setAttribute('d', '');
        svgEl.querySelectorAll('.lz-nodo.destino').forEach(n => n.classList.remove('destino'));
        const bajo = ev && document.elementFromPoint(ev.clientX, ev.clientY);
        const destino = bajo && bajo.closest && bajo.closest('.lz-nodo');
        if (destino) h.conectar(g.de, destino.dataset.q);
      }
    }
    svgEl.addEventListener('pointerup', terminar);
    svgEl.addEventListener('pointercancel', () => terminar(null));

    svgEl.addEventListener('click', ev => {
      if (ignorarClic) { ignorarClic = false; return; }
      const ar = ev.target.closest('.lz-arista');
      if (ar) return h.seleccionar({ tipo: 'arista', de: ar.dataset.de, a: ar.dataset.a });
      if (!ev.target.closest('.lz-nodo')) h.seleccionar(null);
    });
    svgEl.addEventListener('dblclick', ev => {
      if (ev.target.closest('.lz-nodo, .lz-arista')) return;
      const pt = punto(svgEl, ev);
      const p = limitar(svgEl, pt.x, pt.y);
      h.crear(p.x, p.y, false);
    });
    svgEl.addEventListener('keydown', ev => {
      const nodo = ev.target.closest && ev.target.closest('.lz-nodo');
      if (nodo && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); h.seleccionar({ tipo: 'estado', q: nodo.dataset.q }); }
    });

    // Piezas arrastradas desde la paleta (arrastrar y soltar del navegador)
    cont.addEventListener('dragover', ev => {
      if ([...ev.dataTransfer.types].includes('text/x-estado')) { ev.preventDefault(); cont.classList.add('soltar'); }
    });
    cont.addEventListener('dragleave', ev => { if (!cont.contains(ev.relatedTarget)) cont.classList.remove('soltar'); });
    cont.addEventListener('drop', ev => {
      const tipo = ev.dataTransfer.getData('text/x-estado');
      cont.classList.remove('soltar');
      if (!tipo) return;
      ev.preventDefault(); ev.stopPropagation();
      const p = punto(svgEl, ev);
      const lp = limitar(svgEl, p.x, p.y);
      h.crear(lp.x, lp.y, tipo === 'final');
    });
  }

  /** Marca la selección sin volver a dibujar (así no se pierde un doble clic). */
  function marcar(sel) {
    if (!estado || !estado.svg.isConnected) return;
    estado.o.sel = sel;
    estado.svg.querySelectorAll('.lz-nodo.sel, .lz-arista.sel').forEach(n => n.classList.remove('sel'));
    if (sel && sel.tipo === 'estado') { const n = estado.svg.querySelector(`.lz-nodo[data-q="${CSS.escape(sel.q)}"]`); if (n) n.classList.add('sel'); }
    if (sel && sel.tipo === 'arista') { const n = estado.svg.querySelector(`.lz-arista[data-de="${CSS.escape(sel.de)}"][data-a="${CSS.escape(sel.a)}"]`); if (n) n.classList.add('sel'); }
  }

  /** Un lugar libre para un estado nuevo (cuando se hace clic en la paleta). */
  function lugarLibre(afd, guardadas) {
    const pos = posiciones(afd, guardadas);
    const { w, h } = tamano(pos);
    for (let y = 90; y < h; y += 110) {
      for (let x = 110; x < w; x += 140) {
        if (Object.values(pos).every(p => Math.hypot(p.x - x, p.y - y) > R * 3)) return { x, y };
      }
    }
    return { x: w - R - 60, y: 90 };
  }

  /**
   * Ordena los estados usando el trazado que calcula Graphviz
   * (lee el centro de cada nodo del SVG generado).
   */
  function ordenarConGraphviz(afd) {
    if (!Grafo.disponible()) return null;
    const el = Grafo.svg(Grafo.dot(afd, { docs: false, usos: false, dir: 'LR' }));
    const raiz = el.querySelector('g.graph');
    const m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(raiz.getAttribute('transform') || '') || [0, 0, 0];
    const tx = +m[1], ty = +m[2];
    const pts = {};
    afd.estados.forEach(q => {
      const g = el.querySelector(`#nodo-${CSS.escape(q)}`);
      const e = g && g.querySelector('ellipse');
      if (e) pts[q] = { x: +e.getAttribute('cx') + tx, y: +e.getAttribute('cy') + ty };
    });
    const xs = Object.values(pts).map(p => p.x), ys = Object.values(pts).map(p => p.y);
    if (!xs.length) return null;
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const W = Math.max(MIN_W, afd.etapas.length * 170 + 60), H = MIN_H;
    const pos = {};
    Object.entries(pts).forEach(([q, p]) => {
      pos[q] = {
        x: Math.round(100 + (maxX > minX ? (p.x - minX) / (maxX - minX) : 0.5) * (W - 200)),
        y: Math.round(95 + (maxY > minY ? (p.y - minY) / (maxY - minY) : 0.5) * (H - 190))
      };
    });
    return pos;
  }

  return { svg, montar, marcar, posiciones, lugarLibre, ordenarConGraphviz };
})();
