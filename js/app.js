/*
 * ============================================================
 *  INTERFAZ — dibuja las vistas y conecta los botones con el
 *  Administrador de Procesos (que a su vez consulta el AFD de
 *  cada flujo de trabajo).
 * ============================================================
 */
(function () {
  'use strict';

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reducirMovimiento = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ui = {
    vista: 'panel',
    seleccionado: null,       // documento seleccionado
    flujo: null,              // flujo abierto en la Vista del autómata
    modoEditor: 'documentos', // 'documentos' | 'diseno'
    // Opciones del grafo (en pantallas angostas el grafo se dibuja de arriba hacia abajo)
    g: { docs: true, usos: true, dir: matchMedia('(max-width: 760px)').matches ? 'TB' : 'LR', todos: false, lienzo: false },
    lz: { sel: null, pendiente: null },  // selección en el lienzo de arrastrar y soltar
    carpeta: null,            // { flujo, q } en el directorio
    anim: null,
    archivoPendiente: null,
    flujoReg: null,
    filtro: { texto: '', flujo: 'todos', estados: [] }, // búsqueda en la tabla de documentos
    kbFlujo: null,            // flujo mostrado en el tablero
    sello: null,              // documento cuyo sello debe "golpear" en el próximo dibujo
    sesion: null              // { nombre, rol }
  };

  /* ---------- Íconos (SVG en línea) ---------- */
  const svgI = (d, w = 18) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I = {
    doc: svgI('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
    lupa: svgI('<circle cx="11" cy="11" r="6"/><path d="m20 20-4.2-4.2M9 11l1.5 1.5L13 10"/>'),
    check: svgI('<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>'),
    archivo: svgI('<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/>', 20),
    grid: svgI('<rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/>', 17),
    columnas: svgI('<rect x="3.5" y="4" width="5" height="16" rx="1.5"/><rect x="9.5" y="4" width="5" height="11" rx="1.5"/><rect x="15.5" y="4" width="5" height="7" rx="1.5"/>', 17),
    mas: svgI('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11v6M9 14h6"/>', 17),
    lista: svgI('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>', 17),
    nodos: svgI('<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>', 17),
    grafica: svgI('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', 17),
    carpeta: svgI('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>', 16),
    subir: svgI('<path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>', 20),
    bajar: svgI('<path d="M12 4v12M7 11l5 5 5-5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>', 16),
    clip: '<svg class="clip" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Con archivo"><path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/></svg>',
    lapiz: svgI('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>', 16),
    x: svgI('<path d="M18 6 6 18M6 6l12 12"/>', 14),
    plus: svgI('<path d="M12 5v14M5 12h14"/>', 16),
    copia: svgI('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>', 16),
    regla: svgI('<path d="M3 21 21 3M14 4l6 6M9 9l2 2M6 12l2 2M12 6l2 2"/>', 16),
    mano: svgI('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11.5v-2a1.5 1.5 0 0 1 3 0V12M14 10.5a1.5 1.5 0 0 1 3 0V12M17 11.5a1.5 1.5 0 0 1 3 0V16a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-2.7L4.3 15a1.6 1.6 0 0 1 2.6-1.8L8 15"/>', 15),
    cohete: svgI('<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M9 15l-3-3 9-9c2 0 3 1 3 3z"/><circle cx="14.5" cy="9.5" r="1.5"/>', 16),
    play: svgI('<path d="M7 4.5v15l12-7.5z"/>', 15),
    deshacer: svgI('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>', 15),
    buscar: svgI('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 16),
    tema: svgI('<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>', 16),
    salir: svgI('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>', 16)
  };
  const icono = n => I[n] || '';

  const NAV = [
    { id: 'panel', ico: I.grid, t: 'Panel' },
    { id: 'tablero', ico: I.columnas, t: 'Tablero' },
    { id: 'registrar', ico: I.mas, t: 'Registrar' },
    { id: 'detalle', ico: I.lista, t: 'Detalle' },
    { id: 'automata', ico: I.nodos, t: 'Autómata' },
    { id: 'estadisticas', ico: I.grafica, t: 'Estadísticas' }
  ];

  /* ---------- Colores por estado ---------- */
  const afdDoc = d => Flujos.obtener(d.flujo);
  /** Variables CSS de color de un estado (el CSS deriva tonos claros y oscuros). */
  const cv = (afd, q) => `--c:${afd.color(q)};--on:${afd.colorOn(q)}`;
  const chip = (afd, q) => afd ? `<span class="st" style="${cv(afd, q)}">${esc(afd.nombres[q] || q)}</span>` : `<span class="st">${esc(q)}</span>`;
  const fecha = iso => new Date(iso).toLocaleString('es-GT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const gradiente = (afd, estados) => {
    const n = estados.length;
    return 'linear-gradient(90deg,' + estados.map((q, i) => `${afd.color(q)} ${(i / n * 100).toFixed(1)}% ${((i + 1) / n * 100).toFixed(1)}%`).join(',') + ')';
  };
  const ayudas = { esc, cv, chip, icono };
  const temaActual = () => document.documentElement.dataset.theme === 'dark' ? 'oscuro' : 'claro';

  /* ---------- Avisos ---------- */
  const toast = (msg, opc) => Efectos.toast(msg, opc);

  /* ---------- Navegación superior con indicador deslizante ---------- */
  function pintarNav() {
    const html = NAV.map((n, i) => `
      <button class="tab" type="button" data-ir="${n.id}" ${ui.vista === n.id ? 'aria-current="page"' : ''} title="${n.t} (${i + 1})">${n.ico}<span>${n.t}</span></button>`).join('');
    const lista = $('#nav-top'), activas = $('#nav-activas');
    if (lista.dataset.vista !== ui.vista || !lista.children.length) {
      lista.innerHTML = html;
      activas.innerHTML = html.replace(/data-ir="[^"]*"/g, '').replace(/aria-current="page"/g, '').replace(/<button /g, '<span ').replace(/<\/button>/g, '</span>');
      lista.dataset.vista = ui.vista;
    }
    moverIndicador();
  }

  /** Recorta la copia "activa" de las pestañas justo sobre la pestaña actual (clip-path). */
  function moverIndicador(sinAnimar) {
    const lista = $('#nav-top'), activas = $('#nav-activas');
    const tab = lista.querySelector('[aria-current="page"]');
    if (!tab) return;
    const pista = lista.parentElement;
    const izq = tab.offsetLeft, der = pista.offsetWidth - (tab.offsetLeft + tab.offsetWidth);
    if (sinAnimar) activas.parentElement.parentElement.classList.add('sin-transicion');
    activas.style.clipPath = `inset(0 ${der}px 0 ${izq}px round 11px)`;
    if (sinAnimar) requestAnimationFrame(() => activas.parentElement.parentElement.classList.remove('sin-transicion'));
    const tabs = $('#tabs');
    if (tabs.scrollWidth > tabs.clientWidth) tab.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: Efectos.reducido() ? 'auto' : 'smooth' });
  }

  function ir(vista, id) {
    ui.vista = vista;
    if (id) ui.seleccionado = id;
    render();
    window.scrollTo({ top: 0, behavior: reducirMovimiento() ? 'auto' : 'smooth' });
  }

  /* ---------- Ciclo de tarjetas: una tarjeta por etapa del flujo ---------- */
  function ciclo(doc, afd) {
    afd = afd || (doc ? afdDoc(doc) : Flujos.obtener(Administrador.FLUJO_BASE));
    if (!afd) return '';
    const q = doc && afd.estados.includes(doc.estado) ? doc.estado : afd.inicial;
    const etapa = afd.etapaDe[q] || 0;
    const c = Administrador.conteoPorEstado(afd.id);
    const anim = ui.anim;
    const visitados = doc ? doc.historial.map(h => h.hacia) : [];
    const n = afd.etapas.length;
    const ok = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>';

    const icono = (i, g) => i === 0 ? I.doc : (g.every(x => afd.esFinal(x)) && i === n - 1) ? I.archivo : g.length > 1 ? I.check : I.lupa;

    const partes = [];
    afd.etapas.forEach((g, i) => {
      if (i > 0) {
        const cnt = g.reduce((s, x) => s + (c[x] || 0), 0);
        const pasada = i <= etapa, fluye = anim && i === etapa;
        const estilo = g.length > 1 ? `--c:#94a3b8;--on:#fff;--grad:${gradiente(afd, g)}` : cv(afd, g[0]);
        partes.push(`<div class="flecha ${g.length > 1 ? 'multi' : ''} ${pasada ? 'pasada' : ''} ${fluye ? 'fluye' : ''}" style="${estilo}">
          <svg width="40" height="12" viewBox="0 0 40 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path class="linea" d="M2 6h32"/><path d="M31 1.5 35.5 6 31 10.5"/></svg>
          ${cnt ? `<span class="badge" title="Documentos en «${esc(afd.nombreEtapa(i))}»">${cnt}</span>` : ''}</div>`);
      }
      const activo = i === etapa, pasado = i < etapa;
      const rep = g.includes(q) ? q : (pasado ? g.slice().reverse().find(x => visitados.includes(x)) : null) || (g.length === 1 ? g[0] : null);
      const multi = g.length > 1;
      let estilo = rep ? cv(afd, rep) : '--c:#94a3b8;--on:#fff';
      if (multi) estilo += `;--grad:${gradiente(afd, g)}`;
      const cls = ['estado', multi ? 'multi' : '', activo ? 'activo' : pasado ? 'pasado' : 'futuro',
        g.every(x => afd.esFinal(x)) ? 'final' : '', activo && anim ? 'recien' : ''].join(' ');
      const chips = multi ? `<div class="chips">${g.map(x => `<span class="chip ${x === rep ? 'on' : ''}" style="--c:${afd.color(x)}">${esc(afd.nombres[x])}</span>`).join('')}</div>` : '';
      partes.push(`<div class="${cls}" style="--i:${i};${estilo}">
        <span class="num">${String(i + 1).padStart(2, '0')}</span>
        ${pasado ? `<span class="hecho" title="Etapa completada">${ok}</span>` : ''}
        <span class="ico">${icono(i, g)}</span>
        <b>${esc(afd.nombreEtapa(i))}</b>
        ${!multi && afd.descripciones[g[0]] ? `<small>${esc(afd.descripciones[g[0]])}</small>` : ''}${chips}
      </div>`);
    });
    const cols = afd.etapas.map(() => 'minmax(118px,1fr)').join(' 40px ');
    return `<div class="ciclo-wrap"><div class="ciclo" style="grid-template-columns:${cols}">${partes.join('')}</div></div>`;
  }

  /* ---------- Vista: Panel principal ---------- */
  const normal = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const fmtHoy = new Intl.DateTimeFormat('es-GT', { weekday: 'long', day: 'numeric', month: 'long' });

  function resumen() {
    const docs = Administrador.todos();
    const fin = d => { const a = afdDoc(d); return a && a.esFinal(d.estado); };
    const finales = docs.filter(fin).length;
    const pendientes = docs.filter(d => { const a = afdDoc(d); return a && !a.esFinal(d.estado) && d.estado !== a.inicial; }).length;
    return { total: docs.length, curso: docs.length - finales, finales, pendientes };
  }

  function vistaPanel() {
    const docs = Administrador.todos();
    if (!Administrador.obtener(ui.seleccionado) && docs[0]) ui.seleccionado = docs[0].id;
    const doc = Administrador.obtener(ui.seleccionado);
    const afd = doc ? afdDoc(doc) : Flujos.obtener(Administrador.FLUJO_BASE);
    const c = Administrador.conteoPorEstado(afd.id);
    const r = resumen();
    const nombre = ui.sesion ? ui.sesion.nombre.split(/\s+/)[0] : '';
    const hoy = fmtHoy.format(new Date());

    return `
      <div class="hola">
        <div><h1>${Efectos.saludo()}${nombre ? ', ' + esc(nombre) : ''}</h1>
          <p class="lead">${hoy.charAt(0).toUpperCase() + hoy.slice(1)}. ${r.curso} documento${r.curso === 1 ? ' sigue' : 's siguen'} en curso y ${r.pendientes} ${r.pendientes === 1 ? 'espera' : 'esperan'} una revisión o resolución.</p></div>
        <div class="head-acc">${botonDirectorio()}<button type="button" class="btn primary" data-ir="registrar">${I.plus} Registrar documento</button></div>
      </div>
      <div class="kpis">
        <div class="kpi"><small>Documentos</small><b data-contar="${r.total}">${ui.entrando ? 0 : r.total}</b><span>en ${Flujos.todos('documentos').length} flujos</span></div>
        <div class="kpi"><small>En curso</small><b data-contar="${r.curso}">${ui.entrando ? 0 : r.curso}</b><span>todavía sin terminar</span></div>
        <div class="kpi"><small>Esperan una acción</small><b data-contar="${r.pendientes}">${ui.entrando ? 0 : r.pendientes}</b><span>fuera del estado inicial</span></div>
        <div class="kpi"><small>Finalizados</small><b data-contar="${r.finales}">${ui.entrando ? 0 : r.finales}</b><span>en un estado de aceptación</span></div>
      </div>

      ${doc ? `<section class="seccion">
        <div class="seccion-tit"><div><h2>${esc(doc.titulo)}</h2>
          <p class="lead"><span class="code">${doc.id}</span> · ${esc(afd.codigo)} ${esc(afd.nombre)} · ${chip(afd, doc.estado)}</p></div>
          <div class="head-acc"><button type="button" class="btn sm" data-ver="${doc.id}">${I.lista} Abrir detalle</button><button type="button" class="btn sm" data-ir="tablero">${I.columnas} Ver en el tablero</button></div></div>
        ${ciclo(doc, afd)}
        <div class="stats" style="grid-template-columns:repeat(${Math.min(afd.estados.length, 6)},minmax(0,1fr))">
          ${afd.estados.map(q => `<div class="stat" style="${cv(afd, q)}"><small><i class="pt"></i>${esc(afd.nombres[q])}</small><b>${c[q]}</b></div>`).join('')}
        </div>
      </section>` : ''}

      <section class="seccion">
        <div class="seccion-tit"><h2>Documentos</h2><button type="button" class="btn sm" data-cmd="csv">${I.bajar} Exportar CSV</button></div>
        ${barraFiltros()}
        <div id="tabla-docs">${tablaDocs()}</div>
      </section>`;
  }

  function barraFiltros() {
    const f = ui.filtro;
    const afdF = f.flujo !== 'todos' ? Flujos.obtener(f.flujo) : null;
    const chips = afdF
      ? afdF.estados.map(q => `<button type="button" class="filtro-chip" data-filtro-estado="${q}" aria-pressed="${f.estados.includes(q)}" style="${cv(afdF, q)}">${esc(afdF.nombres[q])}</button>`).join('')
      : `<button type="button" class="filtro-chip" data-filtro-estado="curso" aria-pressed="${f.estados.includes('curso')}" style="--c:#f5b301;--on:#3a2700">En curso</button>
         <button type="button" class="filtro-chip" data-filtro-estado="final" aria-pressed="${f.estados.includes('final')}" style="--c:#16a34a;--on:#fff">Finalizados</button>`;
    return `<div class="tabla-barra">
      <div class="buscar-campo">${I.buscar}<input id="buscar-docs" type="search" placeholder="Buscar por código, título, tipo o responsable  ( / )" value="${esc(f.texto)}" aria-label="Buscar documentos"></div>
      <select id="filtro-flujo" aria-label="Filtrar por flujo"><option value="todos">Todos los flujos</option>
        ${Flujos.todos('documentos').map(a => `<option value="${a.id}" ${f.flujo === a.id ? 'selected' : ''}>${esc(a.codigo)} · ${esc(a.nombre)}</option>`).join('')}</select>
      <div class="filtros" role="group" aria-label="Filtrar por estado">${chips}</div>
      <span class="conteo" id="conteo-docs" aria-live="polite"></span>
    </div>`;
  }

  /** Documentos que pasan la búsqueda y los filtros. */
  function docsFiltrados() {
    const f = ui.filtro, t = normal(f.texto.trim());
    return Administrador.todos().filter(d => {
      const a = afdDoc(d);
      if (f.flujo !== 'todos' && d.flujo !== f.flujo) return false;
      if (f.estados.length) {
        if (f.flujo === 'todos') {
          const fin = a && a.esFinal(d.estado);
          if (!((f.estados.includes('final') && fin) || (f.estados.includes('curso') && !fin))) return false;
        } else if (!f.estados.includes(d.estado)) return false;
      }
      return !t || normal(`${d.id} ${d.titulo} ${d.responsable} ${d.tipo}`).includes(t);
    });
  }

  function resaltar(texto) {
    const t = ui.filtro.texto.trim();
    const e = esc(texto);
    if (!t) return e;
    const re = new RegExp(esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return e.replace(re, m => `<mark class="resaltar">${m}</mark>`);
  }

  function tablaDocs() {
    const lista = docsFiltrados();
    const total = Administrador.todos().length;
    setTimeout(() => { const c = $('#conteo-docs'); if (c) c.textContent = lista.length === total ? `${total} documentos` : `Mostrando ${lista.length} de ${total}`; });
    if (!total) return `<p class="vacio-msg">No hay documentos. Usa «Registrar documento» para crear el primero.</p>`;
    if (!lista.length) return `<p class="vacio-msg">Ningún documento coincide con la búsqueda. <button type="button" class="btn sm" data-cmd="limpiar-filtros">Quitar filtros</button></p>`;
    return `<div class="tabla-scroll"><table class="tabla">
      <thead><tr><th>Código</th><th>Documento</th><th class="hide-sm">Flujo</th><th class="hide-sm">Responsable</th><th>Estado</th><th class="hide-sm">Último cambio</th><th><span class="sr-only">Acciones</span></th></tr></thead>
      <tbody>${lista.map(d => { const a = afdDoc(d); const u = d.historial[d.historial.length - 1]; return `
        <tr class="click ${d.id === ui.seleccionado ? 'sel' : ''}" data-sel="${d.id}" style="${a ? cv(a, d.estado) : ''}">
          <td class="code">${resaltar(d.id)}</td>
          <td>${resaltar(d.titulo)}${d.archivo ? I.clip : ''}${d.prioridad === 'Alta' ? ' <span class="prio Alta">Alta</span>' : ''}</td>
          <td class="hide-sm"><span class="code">${esc(a ? a.codigo : '—')}</span></td>
          <td class="hide-sm">${resaltar(d.responsable)}</td>
          <td>${chip(a, d.estado)}</td>
          <td class="hide-sm" title="${esc(fecha(u.fecha))}">${Efectos.haceCuanto(u.fecha)}</td>
          <td style="text-align:right"><button class="btn sm" data-ver="${d.id}">Ver</button></td>
        </tr>`; }).join('')}</tbody></table></div>`;
  }

  function pintarTablaDocs() { const c = $('#tabla-docs'); if (c) c.innerHTML = tablaDocs(); }

  /** Exporta a CSV (separado por ; y con BOM, para que Excel en español lo abra con tildes). */
  function exportarCSV(lista) {
    const celdas = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const filas = [['Código', 'Título', 'Flujo', 'Estado', 'Responsable', 'Tipo', 'Prioridad', 'Registrado', 'Último cambio', 'Último usuario', 'Archivo', 'Cadena w']];
    lista.forEach(d => {
      const a = afdDoc(d), u = d.historial[d.historial.length - 1];
      filas.push([d.id, d.titulo, a ? a.codigo : d.flujo, a ? a.nombres[d.estado] : d.estado, d.responsable, d.tipo, d.prioridad,
        new Date(d.creado).toLocaleString('es-GT'), new Date(u.fecha).toLocaleString('es-GT'), u.usuario || '', d.archivo ? d.archivo.nombre : '',
        Administrador.cadenaDe(d).join(' ')]);
    });
    const csv = '﻿' + filas.map(f => f.map(celdas).join(';')).join('\r\n');
    Directorio.descargarBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `documentos-${new Date().toLocaleDateString('sv-SE')}.csv`);
    toast(`${lista.length} documentos exportados a CSV.`);
  }

  /* ---------- Columna lateral (panel y registro) ---------- */
  function actividadReciente(n) {
    const ev = [];
    Administrador.todos().forEach(d => {
      const a = afdDoc(d); if (!a) return;
      d.historial.forEach(h => ev.push({ d, a, h }));
    });
    ev.sort((x, y) => y.h.fecha.localeCompare(x.h.fecha));
    return ev.slice(0, n);
  }

  function pintarLateral(entra) {
    const cont = $('#aside-panel');
    const lat = $('#lateral');
    if (ui.vista === 'panel') {
      const ev = actividadReciente(7);
      cont.innerHTML = `
        <div class="lat-sec"><p class="lat-tit">Actividad reciente</p>
          <ul class="bitacora">${ev.map(({ d, a, h }) => `<li>
            <span class="ini" title="${esc(h.usuario || '')}">${esc(Efectos.iniciales(h.usuario || 'Sistema'))}</span>
            <div><b>${esc(h.usuario || 'Sistema')}</b> ${h.simbolo ? `movió <button type="button" class="link-doc" data-ver="${d.id}">${d.id}</button> a ${chip(a, h.hacia)}` : `registró <button type="button" class="link-doc" data-ver="${d.id}">${d.id}</button>`}
              <small>${h.simbolo ? `<span class="code">${esc(h.simbolo)}</span> · ` : `${esc(a.codigo)} · `}${Efectos.haceCuanto(h.fecha)}</small></div></li>`).join('') || '<li>Sin actividad todavía.</li>'}</ul>
        </div>
        <div class="lat-sec"><h3>Distribución por flujo</h3>
          ${Flujos.todos('documentos').map(a => {
            const c = Administrador.conteoPorEstado(a.id);
            const total = Object.values(c).reduce((x, y) => x + y, 0);
            return `<p class="hint" style="margin:14px 0 6px"><b style="color:var(--ink)">${esc(a.codigo)}</b> · ${esc(a.nombre)} · ${total}</p>
              <div class="barra-dist" title="${a.estados.map(q => `${a.nombres[q]}: ${c[q]}`).join(', ')}">${a.estados.filter(q => c[q]).map(q => `<i style="flex:${c[q]};${cv(a, q)}"></i>`).join('')}</div>
              <div class="leyenda">${a.estados.map(q => `<span style="${cv(a, q)}">${esc(a.nombres[q])} ${c[q]}</span>`).join('')}</div>`;
          }).join('')}
        </div>
        <p class="hint">Pulsa <kbd>Ctrl</kbd> <kbd>K</kbd> para buscar cualquier documento o acción.</p>`;
    } else if (ui.vista === 'registrar') {
      const afd = Flujos.obtener(ui.flujoReg);
      cont.innerHTML = `
        <div class="lat-sec"><p class="lat-tit">Recorrido previsto</p>
          <p class="hint" style="margin-top:4px">${afd ? `Así avanzará el documento por <b>${esc(afd.codigo)}</b>, desde ${esc(afd.nombres[afd.inicial])}.` : ''}</p>
          <div class="svg-wrap mini" id="rec-grafo"><p class="cargando">Calculando…</p></div></div>
        <div class="lat-sec"><h3>Cómo se registra</h3>
          <ol class="pasos-reg"><li>Escribe el título y quién lo registra.</li><li>Elige el flujo: decide por qué estados pasará.</li>
            <li>Adjunta el archivo; se guardará en la carpeta de su estado.</li><li>El documento entra en el estado inicial y aparece en el tablero.</li></ol></div>`;
      pintarGrafoRegistro();
    } else cont.innerHTML = '';
    if (entra) { lat.classList.remove('entra'); void lat.offsetWidth; lat.classList.add('entra'); }
  }

  async function pintarGrafoRegistro() {
    const cont = $('#rec-grafo'), afd = Flujos.obtener(ui.flujoReg);
    if (!cont || !afd) return;
    try { await Grafo.listo(); } catch (e) { cont.innerHTML = '<p class="cargando">Graphviz no está disponible.</p>'; return; }
    ponerSvg(cont, Grafo.dot(afd, { docs: false, usos: false, dir: 'TB', tema: temaActual(), activo: afd.inicial }));
  }

  /* ---------- Vista: Registrar ---------- */
  function leadRegistro(afd) {
    return `Todo documento nuevo entra al autómata <b>${esc(afd.codigo)}</b> en su estado inicial <b>${afd.inicial} · ${esc(afd.nombres[afd.inicial])}</b> y su archivo se guarda en la carpeta <span class="code">${esc(afd.rutaCarpeta(afd.inicial).join('/'))}</span>.`;
  }

  function vistaRegistrar() {
    const flujos = Flujos.todos('documentos');
    if (!flujos.find(f => f.id === ui.flujoReg)) ui.flujoReg = (flujos[0] || {}).id;
    const afd = Flujos.obtener(ui.flujoReg);
    return `
      <div class="view-head"><div><h1>Registrar documento</h1>
        <p class="lead" id="reg-lead">${afd ? leadRegistro(afd) : 'No hay flujos publicados para documentos.'}</p></div>
        <div class="head-acc">${botonDirectorio()}<span class="tag" id="reg-tag">${afd ? afd.inicial : '—'}</span></div></div>
      <form class="form" id="form-reg" novalidate>
        <div class="full"><label for="f-titulo">Título del documento</label><input id="f-titulo" name="titulo" placeholder="Ej. Solicitud de cambio de sección" maxlength="120"></div>
        <div class="full"><label for="f-flujo">Flujo de trabajo (autómata que lo controlará)</label>
          <select id="f-flujo" name="flujo">${flujos.map(f => `<option value="${f.id}" ${f.id === ui.flujoReg ? 'selected' : ''}>${esc(f.codigo)} · ${esc(f.nombre)}</option>`).join('')}</select></div>
        <div><label for="f-tipo">Tipo</label><select id="f-tipo" name="tipo">
          ${['Oficio', 'Solicitud', 'Informe', 'Acta', 'Memorándum', 'Constancia', 'Propuesta'].map(t => `<option>${t}</option>`).join('')}</select></div>
        <div><label for="f-prio">Prioridad</label><select id="f-prio" name="prioridad"><option>Alta</option><option selected>Media</option><option>Baja</option></select></div>
        <div class="full"><label for="f-resp">Responsable</label><input id="f-resp" name="responsable" placeholder="Nombre de quien registra" maxlength="80" value="${esc(ui.sesion ? ui.sesion.nombre : '')}"></div>
        <div class="full"><label for="f-desc">Descripción (opcional)</label><textarea id="f-desc" name="descripcion" placeholder="Breve descripción del contenido"></textarea></div>
        <div class="full">
          <label for="f-archivo">Archivo del documento</label>
          <label class="dropzone" id="dropzone" for="f-archivo">
            <span class="dz-ico">${I.subir}</span>
            <span><b>Arrastra un archivo aquí o haz clic para elegirlo</b>
            <small>Se acepta cualquier tipo: PDF, Word, Excel, imágenes, ZIP… Se guardará en el directorio según su estado.</small></span>
            <input type="file" id="f-archivo">
          </label>
          <div id="archivo-sel">${pintarArchivoSel()}</div>
        </div>
        <div class="full" style="display:flex;gap:10px">
          <button type="submit" class="btn primary">Registrar documento</button>
          <button type="reset" class="btn">Limpiar</button>
        </div>
      </form>`;
  }

  function pintarArchivoSel() {
    const f = ui.archivoPendiente;
    if (!f) return '';
    const ext = (f.name.split('.').pop() || 'archivo').slice(0, 5);
    return `<div class="archivo-sel"><span class="ext">${esc(ext)}</span>
      <span class="nm">${esc(f.name)}</span><small>${Directorio.tamanoLegible(f.size)}</small>
      <button type="button" class="btn sm" id="btn-quitar-archivo">Quitar</button></div>`;
  }

  function elegirArchivo(f) {
    if (!f) return;
    if (f.size > 200 * 1024 * 1024) return toast('El archivo supera 200 MB. Elige uno más pequeño.', true);
    ui.archivoPendiente = f;
    const cont = $('#archivo-sel');
    if (cont) cont.innerHTML = pintarArchivoSel();
  }

  const botonDirectorio = () => `<button type="button" class="btn sm" data-dir>${I.carpeta} Abrir directorio</button>`;

  /* ---------- Vista: Detalle ---------- */
  const fmtSello = new Intl.DateTimeFormat('es-GT', { day: '2-digit', month: 'short', year: 'numeric' });
  const selloFecha = d => fmtSello.format(new Date(d.historial[d.historial.length - 1].fecha)).replace(/\./g, '');
  function vistaDetalle() {
    const docs = Administrador.todos();
    if (!docs.length) return `<p class="eyebrow">Trazabilidad</p><h1>Detalle del documento</h1><p class="vacio-msg">No hay documentos registrados.</p>`;
    if (!Administrador.obtener(ui.seleccionado)) ui.seleccionado = docs[0].id;
    const d = Administrador.obtener(ui.seleccionado);
    const afd = afdDoc(d);
    if (!afd) return `<h1>Detalle del documento</h1><p class="vacio-msg">El flujo de ${esc(d.id)} ya no existe.</p>`;
    const validos = afd.simbolosValidos(d.estado);
    const cadena = Administrador.cadenaDe(d);

    return `
      <div class="view-head"><div><h1>Detalle del documento</h1><p class="lead">Cada acción aplica una transición δ del autómata ${esc(afd.codigo)} y queda registrada con su autor.</p></div>
        <select id="sel-doc" style="max-width:320px" aria-label="Documento">${docs.map(x => `<option value="${x.id}" ${x.id === d.id ? 'selected' : ''}>${x.id} · ${esc(x.titulo)}</option>`).join('')}</select>
      </div>
      ${ciclo(d, afd)}
      <div class="det-grid">
        <div>
          <div class="hoja" id="hoja">
            <div class="sello ${ui.sello === d.id ? 'golpe' : ''}" style="${cv(afd, d.estado)}" aria-label="Sello: ${esc(afd.nombres[d.estado])}">${esc(afd.nombres[d.estado])}<small>${esc(selloFecha(d))} · UMG</small></div>
            <p class="eyebrow">${d.id}</p><h2>${esc(d.titulo)}</h2>
            <dl class="meta">
              <dt>Estado</dt><dd>${chip(afd, d.estado)} <span class="code" style="color:var(--muted)">${d.estado}</span></dd>
              <dt>Flujo</dt><dd><span class="code">${esc(afd.codigo)}</span> ${esc(afd.nombre)}</dd>
              <dt>Tipo</dt><dd>${esc(d.tipo)}</dd>
              <dt>Responsable</dt><dd>${esc(d.responsable)}</dd>
              <dt>Último cambio</dt><dd>${esc(d.historial[d.historial.length - 1].usuario || '—')}, ${Efectos.haceCuanto(d.historial[d.historial.length - 1].fecha)}</dd>
              <dt>Prioridad</dt><dd>${esc(d.prioridad)}</dd>
              <dt>Registrado</dt><dd>${fecha(d.creado)}</dd>
              ${d.descripcion ? `<dt>Descripción</dt><dd>${esc(d.descripcion)}</dd>` : ''}
              <dt>Cadena w</dt><dd class="code">${cadena.length ? cadena.join(' · ') : 'ε (vacía)'}</dd>
            </dl>
          </div>
          <div class="box" style="margin-top:16px">
            <div class="view-head"><h3>Archivo del documento</h3>${botonDirectorio()}</div>
            ${d.archivo ? `
              <div class="archivo-sel"><span class="ext">${esc((d.archivo.nombre.split('.').pop() || '').slice(0, 5))}</span>
                <span class="nm">${esc(d.archivo.nombre)}</span><small>${Directorio.tamanoLegible(d.archivo.tamano)}</small></div>
              <p class="hint">Ubicación: <span class="code">${Directorio.RAIZ}/${esc(Directorio.rutaDoc(d).join('/'))}/</span></p>
              <div class="acciones">
                <button class="btn sm" data-abrir="${d.id}">Abrir</button>
                <button class="btn sm" data-descargar="${d.id}">Descargar</button>
                <label class="btn sm" for="f-reemplazo">Reemplazar</label>
              </div>`
            : `<p class="hint">Este documento no tiene archivo adjunto.</p>
               <div class="acciones"><label class="btn sm primary" for="f-reemplazo">${I.subir} Adjuntar archivo</label></div>`}
            <input type="file" id="f-reemplazo" hidden>
          </div>
          <div class="box" style="margin-top:16px">
            <h3>Acciones (símbolos de Σ)</h3>
            <input id="nota" placeholder="Nota u observación (opcional)" style="margin-top:14px" maxlength="140">
            <div class="acciones">
              ${afd.alfabeto.map(s => { const t = afd.transicion(d.estado, s); return `<button class="btn ${t ? 'tinte' : ''}" data-sim="${esc(s)}" ${t ? `style="${cv(afd, t)}"` : 'disabled'}
                title="${t ? `δ(${d.estado}, ${esc(s)}) = ${t}` : `δ(${d.estado}, ${esc(s)}) no definida`}">${esc(afd.etiquetas[s])}</button>`; }).join('')}
            </div>
            <p class="hint">${afd.esFinal(d.estado)
              ? `El documento está en un estado de aceptación (${d.estado}). La cadena <span class="code">${esc(cadena.join(' ') || 'ε')}</span> es <b>aceptada</b>${validos.length ? '; aún puede reabrirse con las acciones habilitadas' : ' y el proceso terminó'}.`
              : `Solo se habilitan las acciones con transición definida desde <b>${d.estado}</b>: ${validos.map(s => `δ(${d.estado}, ${esc(s)}) = ${afd.transicion(d.estado, s)}`).join(', ') || 'ninguna'}.`}</p>
          </div>
          <div class="acciones" style="margin-top:16px">
            ${d.historial.length > 1 ? `<button class="btn sm" data-cmd="deshacer-doc" data-id="${d.id}">${I.deshacer} Deshacer el último paso</button>` : ''}
            <button class="btn sm peligro" id="btn-eliminar">${I.x} Eliminar documento</button></div>
        </div>
        <div class="box">
          <h3>Historial de transiciones</h3>
          <ul class="timeline">
            ${d.historial.slice().reverse().map(h => `<li style="${afd.estados.includes(h.hacia) ? cv(afd, h.hacia) : ''}">
              ${h.simbolo ? `<span class="code">δ(${h.desde}, ${esc(h.simbolo)}) = ${h.hacia}</span> → <b>${esc(afd.nombres[h.hacia] || h.hacia)}</b>` : `<b>Registro inicial</b> en ${h.hacia}`}
              ${h.nota ? `<small>“${esc(h.nota)}”</small>` : ''}
              <small>${h.usuario ? `<span class="quien">${esc(h.usuario)}</span> · ` : ''}${fecha(h.fecha)}</small></li>`).join('')}
          </ul>
        </div>
      </div>`;
  }

  /* ============================================================
   *  VISTA DEL AUTÓMATA (Graphviz + editor de flujos)
   * ============================================================ */

  /** Flujo abierto en el editor según el modo (documentos / diseñador). */
  function flujoActual() {
    let afd = Flujos.obtener(ui.flujo);
    if (afd && afd.modo === ui.modoEditor) return afd;
    const doc = Administrador.obtener(ui.seleccionado);
    const deDoc = doc && Flujos.obtener(doc.flujo);
    afd = (deDoc && deDoc.modo === ui.modoEditor) ? deDoc : Flujos.todos(ui.modoEditor)[0] || null;
    ui.flujo = afd ? afd.id : null;
    return afd;
  }

  function tablaDelta(afd) {
    return `<table class="tabla delta">
      <thead><tr><th>Estado</th>${afd.alfabeto.map(s => `<th>${esc(s)}</th>`).join('')}</tr></thead>
      <tbody>${afd.estados.map(q => `<tr>
        <td style="${cv(afd, q)}"><span class="pt"></span><b>${afd.esFinal(q) ? '*' : ''}${q === afd.inicial ? '→' : ''}${q}</b> <small>${esc(afd.nombres[q])}</small></td>
        ${afd.alfabeto.map(s => { const t = afd.transicion(q, s); return `<td class="celda ${t ? '' : 'vacio'}" data-celda="${q}|${esc(s)}" title="${t ? `δ(${q}, ${esc(s)}) = ${t} · clic para editar` : `δ(${q}, ${esc(s)}) no definida · clic para crearla`}">${t || '—'}</td>`; }).join('')}
      </tr>`).join('')}</tbody>
    </table>`;
  }

  function vistaAutomata() {
    if (ui.g.todos) return vistaTodos();
    const afd = flujoActual();
    if (!afd) {
      return `<div class="view-head"><div><p class="eyebrow">Modelo formal</p><h1>Vista del autómata</h1>
        <p class="lead">${ui.modoEditor === 'diseno' ? 'El diseñador está vacío. Crea un diseño nuevo o copia un flujo desde el menú de la derecha.' : 'No hay flujos de documentos.'}</p></div></div>`;
    }
    const d = Administrador.obtener(ui.seleccionado);
    const docAqui = d && d.flujo === afd.id ? d : null;
    const ultima = docAqui && docAqui.historial.length > 1 ? docAqui.historial[docAqui.historial.length - 1] : null;
    const enDiseno = afd.modo === 'diseno';

    return `
      <div class="view-head"><div><p class="eyebrow">${enDiseno ? 'Diseño en borrador' : 'Flujo de documentos'}</p><h1>${esc(afd.nombre)}</h1>
        <p class="lead">Autómata finito determinista <b>${esc(afd.codigo)}</b>. ${docAqui ? `Resaltado: <b>${docAqui.id}</b> en <b>${docAqui.estado}</b>${ultima ? `, última transición <span class="code">${esc(ultima.simbolo)}</span>` : ''}.` : enDiseno ? 'Los cambios en el diseñador no afectan a ningún documento.' : ''}</p></div>
        <div class="head-acc">
          <div class="seg"><button class="on" data-todos="0" aria-pressed="true">Este flujo</button><button data-todos="1" aria-pressed="false">Todos los workflows</button></div>
          <span class="tag ${enDiseno ? 'tag-diseno' : ''}">${esc(afd.codigo)}</span></div></div>

      <div class="box" style="margin-top:24px">
        <div class="view-head"><h3>Tabla de transiciones δ</h3><span class="hint" style="margin:0">Clic en una celda para crear o cambiar esa transición</span></div>
        <div class="tabla-scroll">${tablaDelta(afd)}</div>
        <p class="hint">→ estado inicial · * estado de aceptación · — transición no definida (acción rechazada)</p>
      </div>

      <div class="box grafo-box" style="margin-top:16px">
        <div class="grafo-barra">
          <div class="seg"><button class="${ui.g.lienzo ? '' : 'on'}" data-lienzo="0" aria-pressed="${!ui.g.lienzo}">${I.nodos.replace('width="18" height="18"', 'width="15" height="15"')} Grafo automático</button><button class="${ui.g.lienzo ? 'on' : ''}" data-lienzo="1" aria-pressed="${ui.g.lienzo}">${I.mano} Lienzo: arrastrar y soltar</button></div>
          ${ui.g.lienzo ? `<div class="grafo-opc">
            <button class="toggle" data-lz="ordenar" title="Acomoda los estados con el trazado que calcula Graphviz">Ordenar con Graphviz</button>
          </div>` : `<div class="grafo-opc">
            <button class="toggle ${ui.g.docs ? 'on' : ''}" data-g="docs" aria-pressed="${ui.g.docs}">Documentos por estado</button>
            <button class="toggle ${ui.g.usos ? 'on' : ''}" data-g="usos" aria-pressed="${ui.g.usos}">Recorridos reales</button>
            <button class="toggle" data-g="dir" title="Cambiar orientación">${ui.g.dir === 'LR' ? '↔ Horizontal' : '↕ Vertical'}</button>
          </div>`}
        </div>
        ${ui.g.lienzo ? `
        <div class="lz-wrap">
          <div class="lz-paleta" aria-label="Paleta">
            <p class="eyebrow">Arrastra al lienzo</p>
            <div class="lz-pieza" draggable="true" data-paleta="normal" role="button" tabindex="0" title="Arrastra al lienzo o haz clic para agregar"><span class="lz-ico"></span>Estado</div>
            <div class="lz-pieza" draggable="true" data-paleta="final" role="button" tabindex="0" title="Arrastra al lienzo o haz clic para agregar"><span class="lz-ico final"></span>Estado final</div>
            <p class="lz-ayuda"><b>Mover:</b> arrastra un estado.<br><b>Conectar:</b> arrastra desde su <span class="lz-mas">+</span> hasta otro estado.<br><b>Bucle:</b> suelta el <span class="lz-mas">+</span> sobre el mismo estado.<br><b>Crear:</b> doble clic en un espacio vacío.<br><b>Borrar:</b> selecciona y pulsa Supr.</p>
          </div>
          <div class="lz-area" id="lz-area"></div>
        </div>
        <div class="lz-insp" id="lz-insp"></div>` : `
        <div class="svg-wrap" id="svg-wrap"><p class="cargando">Calculando el grafo…</p></div>`}
        <p class="hint fuente" id="grafo-fuente"></p>
        ${docAqui && docAqui.historial.length > 1 ? `<div class="reproductor"><button type="button" class="btn sm acento" data-cmd="reproducir">${I.play} Reproducir el recorrido de ${docAqui.id}</button><span class="paso-txt" id="paso-txt" aria-live="polite"></span></div>` : '<span id="paso-txt" class="paso-txt" aria-live="polite"></span>'}
      </div>

      <div class="automata-grid">
        <div class="box tester">
          <h3>Probador de cadenas</h3>
          <p class="hint" style="margin-top:6px">Escribe una secuencia de símbolos separados por espacios, o usa los botones. El autómata la recorre paso a paso desde ${afd.inicial}.</p>
          <div class="simbolos">${afd.alfabeto.map(s => `<button class="btn sm" data-add="${esc(s)}">${esc(s)}</button>`).join('')}</div>
          <div class="tester-row">
            <input id="cadena" placeholder="${esc(afd.alfabeto.slice(0, 3).join(' '))}" autocomplete="off">
            <button class="btn" id="btn-limpiar">Limpiar</button>
            <button class="btn primary" id="btn-probar">Probar</button>
          </div>
          <div class="resultado" id="resultado"></div>
        </div>
        <div class="box formal">
          <h3>Definición formal</h3>
          <p style="margin-top:10px"><span class="code">M = (Q, Σ, δ, ${afd.inicial}, F)</span></p>
          <p><b>Q</b> = { ${afd.estados.join(', ')} }</p>
          <p><b>Σ</b> = { ${afd.alfabeto.map(esc).join(', ')} }</p>
          <p><b>q0</b> = ${afd.inicial} (${esc(afd.nombres[afd.inicial])})</p>
          <p><b>F</b> = { ${afd.finales.join(', ')} } (${afd.finales.map(q => esc(afd.nombres[q])).join(', ') || '∅'})</p>
          <p><b>|δ|</b> = ${afd.aristas().length} transiciones</p>
        </div>
      </div>`;
  }

  function vistaTodos() {
    const flujos = Flujos.todos();
    return `
      <div class="view-head"><div><h1>Todos los workflows</h1>
        <p class="lead">Cada grafo se genera con Graphviz consultando la base de datos y las carpetas: documentos y archivos por estado, y cuántas veces se ha usado cada transición.</p></div>
        <div class="head-acc"><div class="seg"><button data-todos="0" aria-pressed="false">Este flujo</button><button class="on" data-todos="1" aria-pressed="true">Todos los workflows</button></div></div></div>
      <p class="hint fuente" id="grafo-fuente"></p>
      <div class="todos-grid">
        ${flujos.map(f => `<article class="box flujo-card">
          <div class="view-head"><div><p class="eyebrow">${esc(f.codigo)}${f.modo === 'diseno' ? ', en diseño' : ''}</p><h3>${esc(f.nombre)}</h3></div>
            <button class="btn sm" data-abrir-flujo="${f.id}">${I.lapiz} Abrir</button></div>
          <div class="svg-wrap mini" data-grafo="${f.id}"><p class="cargando">Calculando…</p></div>
          <p class="hint">${f.estados.length} estados · ${f.alfabeto.length} símbolos · ${f.aristas().length} transiciones · ${Administrador.todos(f.id).length} documentos</p>
        </article>`).join('')}
      </div>`;
  }

  /* ---------- Consulta de datos para los grafos ---------- */
  ui.datosGrafo = {};

  /**
   * Consulta la base de datos (documentos en localStorage, archivos en IndexedDB)
   * y, si hay una carpeta vinculada, las carpetas reales del disco.
   */
  async function consultarDatos(afd) {
    const conteo = Administrador.conteoPorEstado(afd.id);
    const uso = Administrador.usoTransiciones(afd.id);
    const archivos = {};
    let fuente = 'base de datos del navegador (documentos e IndexedDB)';
    try {
      const disco = await Directorio.consultarDisco();
      if (disco) {
        afd.estados.forEach(q => { archivos[q] = disco.conteo[afd.rutaCarpeta(q).join('/')] || 0; });
        fuente = `carpeta local «${disco.nombre}» y base de datos del navegador`;
      } else {
        const regs = await Directorio.todosLosArchivos();
        const ids = new Set(regs.map(r => r.docId));
        Administrador.todos(afd.id).forEach(d => { if (ids.has(d.id)) archivos[d.estado] = (archivos[d.estado] || 0) + 1; });
      }
    } catch (e) { /* sin acceso a archivos: se muestran solo los documentos */ }
    return { conteo, uso, archivos, fuente };
  }

  function opcionesGrafo(afd, datos, extra) {
    const d = Administrador.obtener(ui.seleccionado);
    const docAqui = d && d.flujo === afd.id ? d : null;
    const ultima = docAqui && docAqui.historial.length > 1 ? docAqui.historial[docAqui.historial.length - 1] : null;
    return Object.assign({
      conteo: datos.conteo, archivos: datos.archivos, uso: datos.uso,
      docs: ui.g.docs, usos: ui.g.usos, dir: ui.g.dir, tema: temaActual(),
      activo: docAqui ? docAqui.estado : null,
      arista: ultima ? { de: ultima.desde, s: ultima.simbolo } : null
    }, extra || {});
  }

  function ponerSvg(cont, dot) {
    const el = Grafo.svg(dot);
    if (!el) return false;
    cont.replaceChildren(el);
    return true;
  }

  async function pintarGrafos() {
    if (ui.vista !== 'automata') return;
    try { await Grafo.listo(); } catch (e) {
      $$('.svg-wrap .cargando').forEach(p => (p.textContent = 'No se pudo cargar Graphviz (js/vendor/viz-standalone.js).'));
      return;
    }
    if (ui.g.todos) {
      let fuente = '';
      for (const cont of $$('[data-grafo]')) {
        const afd = Flujos.obtener(cont.dataset.grafo);
        const datos = await consultarDatos(afd);
        fuente = datos.fuente;
        ponerSvg(cont, Grafo.dot(afd, opcionesGrafo(afd, datos, { dir: 'LR' })));
      }
      const f = $('#grafo-fuente'); if (f) f.textContent = 'Consulta: ' + fuente;
      return;
    }
    const afd = flujoActual();
    if (afd && ui.g.lienzo && $('#lz-area')) {
      const datos = await consultarDatos(afd);
      ui.datosGrafo = { afd: afd.id, datos };
      pintarLienzo();
      const f = $('#grafo-fuente');
      if (f) f.textContent = 'Cada cambio en el lienzo actualiza el autómata, la tabla δ y el grafo automático. Las posiciones se guardan con el flujo.';
      return;
    }
    const cont = $('#svg-wrap');
    if (!afd || !cont) return;
    const datos = await consultarDatos(afd);
    ui.datosGrafo = { afd: afd.id, datos };
    ponerSvg(cont, Grafo.dot(afd, opcionesGrafo(afd, datos)));
    const f = $('#grafo-fuente');
    if (f) f.textContent = `Consulta: ${datos.fuente}. Doble círculo = estado de aceptación · grosor de la flecha = veces recorrida · clic en un estado para usarlo en el editor.`;
  }

  /* ---------- Ficha que recorre el grafo (probador y reproductor) ---------- */
  let animando = false;

  /** Vuelve a dibujar el grafo sin resaltar nada, para que la ficha cuente la historia. */
  function grafoLimpio(afd) {
    const datos = ui.datosGrafo.afd === afd.id ? ui.datosGrafo.datos : { conteo: {}, archivos: {}, uso: {} };
    if (ui.g.lienzo && $('#lz-area')) pintarLienzo({ activo: null, arista: null });
    else if (Grafo.disponible() && $('#svg-wrap')) ponerSvg($('#svg-wrap'), Grafo.dot(afd, opcionesGrafo(afd, datos, { activo: null, arista: null })));
  }

  /** Mueve una ficha por las aristas del grafo dibujado (Graphviz o lienzo). */
  async function recorrer(afd, tramos, { alPaso, fallo, inicio } = {}) {
    const lienzo = ui.g.lienzo ? $('#lz-area svg') : null;
    const svg = lienzo || $('#svg-wrap svg');
    if (!svg) return;
    const capa = lienzo ? svg : (svg.querySelector('g.graph') || svg);
    const nodo = q => lienzo ? svg.querySelector(`.lz-nodo[data-q="${CSS.escape(q)}"]`) : svg.querySelector(`#nodo-${CSS.escape(q)}`);
    const centro = q => {
      const n = nodo(q); if (!n) return null;
      if (lienzo) { const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(n.getAttribute('transform')); return m && { x: +m[1], y: +m[2] }; }
      const e = n.querySelector('ellipse'); return e && { x: +e.getAttribute('cx'), y: +e.getAttribute('cy') };
    };
    const camino = (de, a) => lienzo ? svg.querySelector(`.lz-arista[data-de="${CSS.escape(de)}"][data-a="${CSS.escape(a)}"] .linea`)
      : svg.querySelector(`#arista-${CSS.escape(de)}-${CSS.escape(a)} path`);
    const pisar = q => { const n = nodo(q); if (n) { n.style.setProperty('--c', afd.color(q)); n.classList.add('pisado'); } };
    const origen = inicio || (tramos[0] ? tramos[0].de : afd.inicial);
    let p = centro(origen); if (!p) return;
    const ficha = Efectos.crearFicha(capa);
    Efectos.ponerFicha(ficha, p);
    pisar(origen);
    for (let i = 0; i < tramos.length; i++) {
      const t = tramos[i];
      if (alPaso) alPaso(i, t);
      await Efectos.espera(Efectos.reducido() ? 0 : 260);
      if (!svg.isConnected) return;
      const c = camino(t.de, t.a), dest = centro(t.a);
      if (c) {
        await Efectos.moverRecto(ficha, p, c.getPointAtLength(0), 120);
        await Efectos.moverPorCamino(ficha, c, 720);
        p = c.getPointAtLength(c.getTotalLength());
      }
      if (dest) { await Efectos.moverRecto(ficha, p, dest, 160); p = dest; }
      pisar(t.a);
    }
    if (fallo) { const n = nodo(fallo); if (n) { n.classList.add('rechazo'); } }
    setTimeout(() => ficha.remove(), 1600);
  }

  async function probarCadena() {
    if (animando) return;
    const afd = flujoActual();
    if (!afd) return;
    const texto = $('#cadena').value.trim();
    const simbolos = texto ? texto.split(/[\s,]+/) : [];
    const r = afd.procesarCadena(simbolos);
    const out = $('#resultado'), info = $('#paso-txt'), boton = $('#btn-probar');
    out.className = 'resultado';
    animando = true; if (boton) boton.disabled = true;
    grafoLimpio(afd);
    const tramos = r.recorrido.slice(1).map((x, i) => ({ de: r.recorrido[i].estado, s: x.simbolo, a: x.estado }));
    await recorrer(afd, tramos, {
      alPaso: (i, t) => { if (info) info.textContent = `Paso ${i + 1} de ${simbolos.length}: δ(${t.de}, ${t.s}) = ${t.a}`; },
      fallo: r.aceptada ? null : r.estadoFinal
    });
    animando = false; if (boton) boton.disabled = false;
    if (info) info.textContent = '';
    const ruta = r.recorrido.map((x, k) => (k ? ` —${x.simbolo}→ ` : '') + x.estado).join('');
    const w = simbolos.length ? simbolos.join(' ') : 'ε';
    out.className = 'resultado ' + (r.aceptada ? 'si' : 'no');
    out.innerHTML = r.aceptada
      ? `<b>Cadena aceptada.</b> «${esc(w)}» termina en ${r.estadoFinal} ∈ F.<br><span class="code">${esc(ruta)}</span>`
      : `<b>Cadena rechazada.</b> ${r.error ? esc(r.error) : `Termina en ${r.estadoFinal} (${esc(afd.nombres[r.estadoFinal])}), que no es de aceptación.`}<br><span class="code">${esc(ruta)}</span>`;
  }

  /** Reproduce, paso a paso, el historial real del documento seleccionado. */
  async function reproducirRecorrido() {
    if (animando) return;
    const afd = flujoActual(), d = Administrador.obtener(ui.seleccionado);
    if (!afd || !d || d.flujo !== afd.id) return;
    const pasos = d.historial.filter(h => h.simbolo && afd.estados.includes(h.desde) && afd.estados.includes(h.hacia));
    const info = $('#paso-txt');
    animando = true;
    grafoLimpio(afd);
    await recorrer(afd, pasos.map(h => ({ de: h.desde, s: h.simbolo, a: h.hacia, h })), {
      inicio: d.historial[0].hacia,
      alPaso: (i, t) => { if (info) info.textContent = `Paso ${i + 1} de ${pasos.length} · δ(${t.de}, ${t.s}) = ${t.a} · ${t.h.usuario || ''} · ${fecha(t.h.fecha)}`; }
    });
    animando = false;
    if (info) info.textContent = `${d.id} llegó a ${afd.nombres[d.estado]} en ${pasos.length} paso${pasos.length === 1 ? '' : 's'}.`;
    setTimeout(() => { if (ui.vista === 'automata' && !animando) pintarGrafos(); }, 1800);
  }

  /* ============================================================
   *  MENÚ INTERACTIVO: EDITOR DE FLUJOS (panel derecho)
   * ============================================================ */
  function pintarEditor() {
    const cont = $('#aside-editor');
    if (ui.vista !== 'automata') { cont.innerHTML = ''; return; }
    const afd = ui.g.todos ? Flujos.obtener(ui.flujo) || flujoActual() : flujoActual();
    const diseno = ui.modoEditor === 'diseno';
    const lista = Flujos.todos(ui.modoEditor);
    const docsEn = q => afd ? Administrador.todos(afd.id).filter(d => d.estado === q).length : 0;

    const cabecera = `
      <h2>Editor de flujos</h2>
      <div class="seg seg-modo" role="group" aria-label="Modo del editor">
        <button class="${!diseno ? 'on' : ''}" data-modo="documentos" aria-pressed="${!diseno}">${I.doc.replace('width="18" height="18"', 'width="15" height="15"')} Documentos</button>
        <button class="${diseno ? 'on' : ''}" data-modo="diseno" aria-pressed="${diseno}">${I.regla} Modo diseñador</button>
      </div>
      <p class="hint">${diseno
        ? 'Experimenta sin riesgo: los diseños no controlan documentos. Cuando esté listo, publícalo para usarlo al registrar documentos.'
        : 'Estos flujos controlan documentos reales. Los cambios se aplican de inmediato y el directorio crea las carpetas de cada estado.'}</p>`;

    if (!afd) {
      cont.innerHTML = cabecera + `
        <div class="ed-sec"><h4>Sin flujos en este modo</h4>
          <div class="ed-fila"><button class="btn sm primary" data-ed="nuevo">${I.plus} Nuevo ${diseno ? 'diseño' : 'flujo'}</button>
          ${diseno && Flujos.todos('documentos')[0] ? `<button class="btn sm" data-ed="copiar-de" data-id="${Flujos.todos('documentos')[0].id}">${I.copia} Copiar ${esc(Flujos.todos('documentos')[0].codigo)}</button>` : ''}</div></div>`;
      return;
    }

    const avisos = afd.validar();
    const ops = q => afd.estados.map(x => `<option value="${x}" ${x === q ? 'selected' : ''}>${x} · ${esc(afd.nombres[x])}</option>`).join('');

    cont.innerHTML = cabecera + `
      <section class="ed-sec">
        <h4>Flujo</h4>
        <select id="ed-flujo" aria-label="Flujo a editar">${lista.map(f => `<option value="${f.id}" ${f.id === afd.id ? 'selected' : ''}>${esc(f.codigo)} · ${esc(f.nombre)}</option>`).join('')}</select>
        <div class="ed-dos">
          <label>Nombre<input id="ed-nombre" value="${esc(afd.nombre)}" maxlength="60"></label>
          <label>Código<input id="ed-codigo" value="${esc(afd.codigo)}" maxlength="12"></label>
        </div>
        <div class="ed-fila">
          <button class="btn sm" data-ed="nuevo">${I.plus} Nuevo</button>
          <button class="btn sm" data-ed="duplicar">${I.copia} Duplicar</button>
          <button class="btn sm peligro" data-ed="eliminar-flujo">${I.x} Eliminar</button>
        </div>
        ${diseno
          ? `<button class="btn sm primary ancho" data-ed="publicar">${I.cohete} Publicar para documentos</button>`
          : `<button class="btn sm ancho" data-ed="a-diseno">${I.regla} Abrir una copia en el diseñador</button>`}
      </section>

      <section class="ed-sec">
        <h4>Estados <span class="n">${afd.estados.length}</span></h4>
        <div class="ed-estados">
          ${afd.estados.map(q => `<div class="ed-estado ${ui.desde === q ? 'marcado' : ''}" style="${cv(afd, q)}">
            <button class="ed-color" data-color="${q}" title="Cambiar color (${esc(afd.color(q))})" aria-label="Cambiar color de ${esc(afd.nombres[q])}"></button>
            <span class="code ed-id">${q}</span>
            <input value="${esc(afd.nombres[q])}" data-renombrar="${q}" aria-label="Nombre de ${q}" maxlength="40">
            <label class="ed-flag" title="Estado inicial"><input type="radio" name="ed-ini" data-inicial="${q}" ${q === afd.inicial ? 'checked' : ''}>inicio</label>
            <label class="ed-flag" title="Estado de aceptación"><input type="checkbox" data-final="${q}" ${afd.esFinal(q) ? 'checked' : ''}>final</label>
            <button class="ed-quitar" data-quitar-estado="${q}" aria-label="Eliminar ${q}" title="${docsEn(q) ? docsEn(q) + ' documento(s) en este estado' : 'Eliminar estado'}">${I.x}</button>
          </div>`).join('')}
        </div>
        <div class="ed-fila ed-agregar">
          <input id="ed-nuevo-estado" placeholder="Nombre del nuevo estado" maxlength="40">
          <button class="btn sm primary" data-ed="agregar-estado">${I.plus} Estado</button>
        </div>
      </section>

      <section class="ed-sec">
        <h4>Transiciones δ <span class="n">${afd.aristas().length}</span></h4>
        <div class="ed-trans-form">
          <select id="ed-desde" aria-label="Desde">${ops(ui.desde || afd.inicial)}</select>
          <input id="ed-simbolo" list="ed-alfabeto" placeholder="símbolo" aria-label="Símbolo" maxlength="24" value="${esc(ui.simbolo || '')}">
          <datalist id="ed-alfabeto">${afd.alfabeto.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
          <select id="ed-hacia" aria-label="Hacia">${ops(ui.hacia || afd.estados[1] || afd.inicial)}</select>
          <button class="btn sm primary" data-ed="agregar-trans">${I.plus}</button>
        </div>
        <ul class="ed-trans">
          ${afd.aristas().map(t => `<li style="${cv(afd, t.a)}"><span class="code">δ(${t.de}, ${esc(t.s)}) = ${t.a}</span>
            <button class="ed-quitar" data-quitar-trans="${t.de}|${esc(t.s)}" aria-label="Quitar transición">${I.x}</button></li>`).join('') || '<li class="hint">Sin transiciones.</li>'}
        </ul>
      </section>

      <section class="ed-sec">
        <h4>Revisión del autómata</h4>
        <ul class="ed-avisos">${avisos.length
          ? avisos.map(a => `<li class="${a.tipo}">${esc(a.txt)}</li>`).join('')
          : '<li class="ok">El autómata es válido: es determinista, tiene estados de aceptación alcanzables y ningún documento queda atascado.</li>'}</ul>
      </section>

      <section class="ed-sec">
        <h4>Exportar e importar</h4>
        <div class="ed-fila">
          <button class="btn sm" data-ed="dot">${I.bajar} DOT</button>
          <button class="btn sm" data-ed="svg">${I.bajar} SVG</button>
          <button class="btn sm" data-ed="json">${I.bajar} JSON</button>
          <label class="btn sm" for="ed-importar">${I.subir.replace('width="20" height="20"', 'width="16" height="16"')} Importar</label>
          <input type="file" id="ed-importar" accept=".json,application/json" hidden>
        </div>
        <button class="btn sm ancho" data-ed="manifiesto">${I.bajar} Base de datos completa (flujos.json)</button>
      </section>`;
  }

  /** Aplica un cambio al flujo abierto, guarda, sincroniza carpetas y vuelve a dibujar. */
  function editar(cambio, mensaje) {
    const afd = flujoActual();
    if (!afd) return;
    try {
      Flujos.actualizar(afd.id, cambio);
      if (afd.modo === 'documentos') sincronizar();
      render();
      if (mensaje) toast(mensaje);
    } catch (err) { toast(err.message, true); }
  }

  const slugSimbolo = s => String(s).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
  const capital = s => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

  function quitarSimbolosSinUso(def) {
    def.alfabeto = def.alfabeto.filter(a => def.estados.some(e => def.delta[e.id] && def.delta[e.id][a.id]));
  }

  function accionEditor(t) {
    const afd = flujoActual();
    const accion = t.dataset.ed;
    const diseno = ui.modoEditor === 'diseno';

    if (accion === 'nuevo') {
      const nombre = prompt('Nombre del nuevo flujo:', diseno ? 'Diseño sin título' : 'Nuevo flujo');
      if (nombre === null) return;
      const f = Flujos.crear(nombre.trim() || 'Nuevo flujo', ui.modoEditor);
      ui.flujo = f.id; ui.g.todos = false;
      if (!diseno) sincronizar();
      render(); return toast(`${f.codigo} creado. Agrega estados y transiciones desde este menú.`);
    }
    if (accion === 'copiar-de') {
      const f = Flujos.duplicar(t.dataset.id, 'diseno', Flujos.obtener(t.dataset.id).nombre + ' (borrador)');
      ui.flujo = f.id; render(); return toast(`Copia en el diseñador: ${f.codigo}`);
    }
    if (!afd) return;

    switch (accion) {
      case 'duplicar': {
        const f = Flujos.duplicar(afd.id, afd.modo);
        ui.flujo = f.id; if (!diseno) sincronizar(); render();
        return toast(`Duplicado como ${f.codigo}`);
      }
      case 'eliminar-flujo': {
        const usados = Administrador.todos(afd.id).length;
        if (usados) return toast(`No se puede eliminar: ${usados} documento(s) usan ${afd.codigo}.`, true);
        if (!diseno && Flujos.todos('documentos').length === 1) return toast('Debe quedar al menos un flujo para documentos.', true);
        if (!confirm(`¿Eliminar el flujo ${afd.codigo} · ${afd.nombre}?`)) return;
        Flujos.eliminar(afd.id); ui.flujo = null;
        if (!diseno) sincronizar();
        render(); return toast('Flujo eliminado');
      }
      case 'a-diseno': {
        const f = Flujos.duplicar(afd.id, 'diseno', afd.nombre + ' (borrador)');
        ui.modoEditor = 'diseno'; ui.flujo = f.id; render();
        return toast(`Copia abierta en el diseñador como ${f.codigo}. El original no cambia.`);
      }
      case 'publicar': {
        const errores = afd.validar().filter(a => a.tipo === 'error');
        if (errores.length) return toast('Antes de publicar: ' + errores[0].txt, true);
        Flujos.actualizar(afd.id, d => { d.modo = 'documentos'; d.nombre = d.nombre.replace(/\s*\(borrador\)\s*$/i, '') || d.nombre; });
        ui.modoEditor = 'documentos'; ui.flujo = afd.id; ui.flujoReg = afd.id;
        sincronizar(); render();
        return toast(`${afd.codigo} publicado: ya puedes elegirlo al registrar documentos.`);
      }
      case 'agregar-estado': {
        const nombre = ($('#ed-nuevo-estado').value || '').trim();
        if (!nombre) { $('#ed-nuevo-estado').focus(); return toast('Escribe el nombre del estado.', true); }
        return editar(d => {
          let n = 0; while (d.estados.some(e => e.id === 'q' + n)) n++;
          const usados = d.estados.map(e => e.color);
          const color = (Flujos.PALETA.find(p => !usados.includes(p.hex)) || Flujos.PALETA[n % Flujos.PALETA.length]).hex;
          d.estados.push({ id: 'q' + n, nombre, desc: '', color });
          d.delta['q' + n] = {};
        }, `Estado «${nombre}» agregado. Conéctalo con una transición.`);
      }
      case 'agregar-trans': {
        const de = $('#ed-desde').value, a = $('#ed-hacia').value;
        if (!slugSimbolo($('#ed-simbolo').value)) { $('#ed-simbolo').focus(); return toast('Escribe el símbolo (la acción), por ejemplo: aprobar.', true); }
        ui.desde = de; ui.simbolo = ''; ui.hacia = a;
        return agregarTransicion(de, $('#ed-simbolo').value, a);
      }
      case 'dot': return Directorio.descargarBlob(new Blob([Grafo.dot(afd, opcionesGrafo(afd, (ui.datosGrafo.afd === afd.id && ui.datosGrafo.datos) || {}))], { type: 'text/vnd.graphviz' }), `${afd.codigo}.dot`);
      case 'svg': {
        const s = $('#svg-wrap svg') || (Grafo.disponible() && Grafo.svg(Grafo.dot(afd)));
        if (!s) return toast('El grafo todavía se está calculando.', true);
        const txt = new XMLSerializer().serializeToString(s);
        return Directorio.descargarBlob(new Blob([txt], { type: 'image/svg+xml' }), `${afd.codigo}.svg`);
      }
      case 'json': return Directorio.descargarBlob(new Blob([JSON.stringify(Flujos.def(afd.id), null, 2)], { type: 'application/json' }), `${afd.codigo}.json`);
      case 'manifiesto': return Directorio.descargarManifiesto();
    }
  }

  /* ============================================================
   *  LIENZO DE ARRASTRAR Y SOLTAR
   * ============================================================ */
  function pintarLienzo(resalte) {
    const afd = flujoActual();
    const cont = $('#lz-area');
    if (!afd || !cont) return;
    const d = Administrador.obtener(ui.seleccionado);
    const docAqui = d && d.flujo === afd.id ? d : null;
    const datos = ui.datosGrafo.afd === afd.id ? ui.datosGrafo.datos : {};
    if (ui.lz.sel && ui.lz.sel.tipo === 'estado' && !afd.estados.includes(ui.lz.sel.q)) ui.lz.sel = null;
    if (ui.lz.sel && ui.lz.sel.tipo === 'arista' && !afd.aristas().some(t => t.de === ui.lz.sel.de && t.a === ui.lz.sel.a)) ui.lz.sel = null;
    // La primera vez se fijan las posiciones para que el dibujo no "salte" al editar
    if (!(Flujos.def(afd.id) || {}).posiciones) Flujos.posicionar(afd.id, Lienzo.posiciones(afd, {}));
    const o = Object.assign({ sel: ui.lz.sel, conteo: datos.conteo, uso: datos.uso, activo: docAqui ? docAqui.estado : null }, resalte || {});
    Lienzo.montar(cont, afd, (Flujos.def(afd.id) || {}).posiciones, o, {
      mover: pos => Flujos.posicionar(afd.id, pos),
      crear: (x, y, final) => crearEstadoEn(x, y, final),
      conectar: (de, a) => { ui.lz.pendiente = { de, a }; ui.lz.sel = null; pintarInspector(true); },
      seleccionar: sel => { ui.lz.sel = sel; ui.lz.pendiente = null; Lienzo.marcar(sel); pintarInspector(); }
    });
    if (!resalte) pintarInspector();
  }

  function pintarInspector(enfocar) {
    const cont = $('#lz-insp');
    const afd = flujoActual();
    if (!cont || !afd) return;
    const p = ui.lz.pendiente, sel = ui.lz.sel;
    const datalist = `<datalist id="lz-alfabeto">${afd.alfabeto.map(s => `<option value="${esc(s)}">`).join('')}</datalist>`;
    if (p) {
      cont.innerHTML = `<div class="lz-ins-fila" style="${cv(afd, p.a)}">
        <b>Nueva transición</b>
        <span class="code">δ(${p.de}, </span><input id="lz-simbolo" list="lz-alfabeto" placeholder="símbolo" maxlength="24" aria-label="Símbolo de la transición"><span class="code">) = ${p.a}</span>
        <button class="btn sm primary" data-lz="crear-trans" data-de="${p.de}" data-a="${p.a}">${I.plus} Crear</button>
        <button class="btn sm" data-lz="cancelar">Cancelar</button>${datalist}</div>
        <p class="hint">Escribe la acción que lleva de ${esc(afd.nombres[p.de])} a ${esc(afd.nombres[p.a])}, por ejemplo <span class="code">aprobar</span>. Enter para crear.</p>`;
    } else if (sel && sel.tipo === 'estado') {
      const q = sel.q;
      cont.innerHTML = `<div class="lz-ins-fila" style="${cv(afd, q)}">
        <button class="ed-color" data-color="${q}" title="Cambiar color" aria-label="Cambiar color"></button>
        <span class="code ed-id">${q}</span>
        <input id="lz-nombre" value="${esc(afd.nombres[q])}" data-renombrar="${q}" maxlength="40" aria-label="Nombre del estado">
        <label class="ed-flag"><input type="radio" name="lz-ini" data-inicial="${q}" ${q === afd.inicial ? 'checked' : ''}>inicial</label>
        <label class="ed-flag"><input type="checkbox" data-final="${q}" ${afd.esFinal(q) ? 'checked' : ''}>final</label>
        <button class="btn sm peligro" data-quitar-estado="${q}">${I.x} Eliminar</button></div>
        <p class="hint">Salidas: ${afd.simbolosValidos(q).map(s => `<span class="code">δ(${q}, ${esc(s)}) = ${afd.transicion(q, s)}</span>`).join(' · ') || 'ninguna todavía; arrastra desde su + para conectarlo.'}</p>`;
    } else if (sel && sel.tipo === 'arista') {
      const ts = afd.aristas().filter(t => t.de === sel.de && t.a === sel.a);
      cont.innerHTML = `<div class="lz-ins-fila" style="${cv(afd, sel.a)}">
        <b>${sel.de} → ${sel.a}</b>
        ${ts.map(t => `<span class="lz-trans"><span class="code">δ(${t.de}, ${esc(t.s)}) = ${t.a}</span><button class="ed-quitar" data-quitar-trans="${t.de}|${esc(t.s)}" aria-label="Quitar">${I.x}</button></span>`).join('')}
        <input id="lz-simbolo" list="lz-alfabeto" placeholder="otro símbolo" maxlength="24" aria-label="Agregar otro símbolo">
        <button class="btn sm" data-lz="crear-trans" data-de="${sel.de}" data-a="${sel.a}">${I.plus} Agregar</button>${datalist}</div>`;
    } else {
      cont.innerHTML = `<p class="hint lz-vacio">Selecciona un estado o una flecha para editarlos aquí. ${afd.modo === 'documentos' ? 'Este flujo controla documentos: los cambios se aplican de inmediato.' : 'Estás en el diseñador: los cambios no afectan documentos.'}</p>`;
    }
    if (enfocar) { const i = $('#lz-simbolo'); if (i) i.focus(); }
  }

  function nuevoIdEstado(afd) {
    let n = 0; while (afd.estados.includes('q' + n)) n++;
    return 'q' + n;
  }

  function crearEstadoEn(x, y, final) {
    const afd = flujoActual();
    if (!afd) return;
    const id = nuevoIdEstado(afd);
    const nombre = final ? 'Final ' + id.slice(1) : 'Estado ' + id.slice(1);
    ui.lz.sel = { tipo: 'estado', q: id }; ui.lz.pendiente = null;
    editar(d => {
      const usados = d.estados.map(e => e.color);
      const color = (Flujos.PALETA.find(p => !usados.includes(p.hex)) || Flujos.PALETA[d.estados.length % Flujos.PALETA.length]).hex;
      d.estados.push({ id, nombre, desc: '', color });
      d.delta[id] = {};
      if (final) d.finales.push(id);
      d.posiciones = Object.assign(d.posiciones || {}, Lienzo.posiciones(afd, d.posiciones), { [id]: { x, y } });
    }, `${id} creado. Ponle nombre abajo y conéctalo arrastrando desde su +.`);
    const n = $('#lz-nombre'); if (n) { n.focus(); n.select(); }
  }

  /** Crea δ(de, s) = a (agrega el símbolo a Σ si es nuevo). */
  function agregarTransicion(de, simbolo, a) {
    const afd = flujoActual();
    const s = slugSimbolo(simbolo);
    if (!s) return toast('Escribe el símbolo (la acción), por ejemplo: aprobar.', true), false;
    const antes = afd.transicion(de, s);
    editar(d => {
      if (!d.alfabeto.some(x => x.id === s)) d.alfabeto.push({ id: s, etiqueta: capital(s) });
      d.delta[de] = d.delta[de] || {};
      d.delta[de][s] = a;
    }, antes && antes !== a
      ? `δ(${de}, ${s}) cambió de ${antes} a ${a}. Un AFD solo admite un destino por símbolo.`
      : `δ(${de}, ${s}) = ${a} agregada.`);
    return true;
  }

  function quitarEstado(q) {
    const afd = flujoActual();
    const n = Administrador.todos(afd.id).filter(d => d.estado === q).length;
    if (n) return toast(`No se puede eliminar ${q}: hay ${n} documento(s) en ese estado.`, true);
    if (q === afd.inicial) return toast('No se puede eliminar el estado inicial. Elige otro inicio primero.', true);
    if (afd.estados.length <= 1) return toast('El autómata necesita al menos un estado.', true);
    ui.lz.sel = null;
    editar(d => {
      d.estados = d.estados.filter(x => x.id !== q);
      delete d.delta[q];
      Object.keys(d.delta).forEach(k => Object.keys(d.delta[k]).forEach(s => { if (d.delta[k][s] === q) delete d.delta[k][s]; }));
      d.finales = d.finales.filter(x => x !== q);
      delete d.nombresEtapa;
      quitarSimbolosSinUso(d);
    }, `Estado ${q} eliminado junto con sus transiciones.`);
  }

  /* ---------- Ventana del directorio ---------- */

  /** Mantiene la carpeta del disco al día (si está vinculada) sin bloquear la interfaz. */
  function sincronizar() {
    Directorio.sincronizar(Administrador.todos()).catch(err => toast('No se pudo actualizar la carpeta del disco: ' + err.message, true));
  }

  async function pintarDirectorio() {
    const docs = Administrador.todos().filter(d => d.archivo);
    const estadoDisco = await Directorio.estadoDisco();
    const flujos = Flujos.todos('documentos');
    if (!ui.carpeta || !Flujos.obtener(ui.carpeta.flujo)) ui.carpeta = { flujo: flujos[0].id, q: flujos[0].inicial };
    const cuenta = (f, q) => docs.filter(d => d.flujo === f && d.estado === q).length;

    const boton = (afd, q, etiqueta, sub) => `<button class="carpeta ${sub ? 'sub' : ''} ${ui.carpeta.flujo === afd.id && ui.carpeta.q === q ? 'on' : ''}" style="${cv(afd, q)}" data-carpeta="${afd.id}|${q}">${I.carpeta}${esc(etiqueta)}<span class="n">${cuenta(afd.id, q)}</span></button>`;
    const arbol = flujos.map(afd => `
      <div class="carpeta grupo flujo-g">${I.carpeta}${esc(afd.carpetaFlujo || afd.codigo + ' (raíz)')}</div>
      <div class="arbol-flujo ${afd.carpetaFlujo ? 'sangria' : ''}">${afd.etapas.map((g, i) => {
        const etapa = afd.rutaCarpeta(g[0])[afd.carpetaFlujo ? 1 : 0];
        if (g.length === 1) return boton(afd, g[0], etapa);
        return `<div class="carpeta grupo">${I.carpeta}${esc(etapa)}<span class="n">${g.reduce((s, q) => s + cuenta(afd.id, q), 0)}</span></div>` +
          g.map(q => boton(afd, q, afd.rutaCarpeta(q).slice(-1)[0], true)).join('');
      }).join('')}</div>`).join('');

    const afdSel = Flujos.obtener(ui.carpeta.flujo);
    const enCarpeta = docs.filter(d => d.flujo === afdSel.id && d.estado === ui.carpeta.q);
    const ruta = `${Directorio.nombreCarpetaDisco() || Directorio.RAIZ}/${afdSel.rutaCarpeta(ui.carpeta.q).join('/')}/`;

    const disco = {
      'no-soportado': `<i class="dot off"></i><p>Los archivos se guardan dentro del navegador. Para guardarlos también en una carpeta de tu computadora, abre la página en <b>Chrome</b> o <b>Edge</b>.</p>`,
      'sin-vincular': `<i class="dot off"></i><p>Los archivos se guardan dentro del navegador. Vincula una carpeta para que también se guarden en tu computadora, separados por flujo y estado.</p><button class="btn sm primary" id="btn-vincular">${I.carpeta} Vincular carpeta</button>`,
      'requiere-permiso': `<i class="dot warn"></i><p>Carpeta vinculada: <b>${esc(Directorio.nombreCarpetaDisco())}</b>. El navegador necesita que confirmes el permiso de nuevo.</p><button class="btn sm primary" id="btn-permiso">Dar permiso</button><button class="btn sm" id="btn-desvincular">Desvincular</button>`,
      'activo': `<i class="dot"></i><p>Sincronizado con tu computadora en <b>${esc(Directorio.nombreCarpetaDisco())}</b>, incluida la base de datos <span class="code">flujos.json</span>.</p><button class="btn sm" id="btn-cambiar">Cambiar carpeta</button><button class="btn sm" id="btn-desvincular">Desvincular</button>`
    }[estadoDisco];

    $('#dir-contenido').innerHTML = `
      <div class="view-head">
        <div><h2 id="dir-titulo">Directorio de documentos</h2></div>
        <div class="head-acc"><button class="btn sm" data-ed="manifiesto">${I.bajar} flujos.json</button>
        <button class="btn sm" data-cerrar-dir aria-label="Cerrar">Cerrar ✕</button></div>
      </div>
      <div class="disco">${disco}</div>
      <div class="dir-grid">
        <nav class="arbol" aria-label="Carpetas por flujo y estado">${arbol}</nav>
        <div>
          <div class="ruta">${esc(ruta)}</div>
          ${enCarpeta.length ? `<ul class="lista-arch">${enCarpeta.map(d => `
            <li><span class="archivo-sel" style="margin:0;padding:6px;border:none"><span class="ext">${esc((d.archivo.nombre.split('.').pop() || '').slice(0, 5))}</span></span>
              <span class="info"><b>${esc(Directorio.nombreArchivo(d.id, d.archivo.nombre))}</b>
              <small>${esc(d.titulo)} · ${Directorio.tamanoLegible(d.archivo.tamano)} · ${chip(afdSel, d.estado)}</small></span>
              <button class="btn sm" data-abrir="${d.id}">Abrir</button>
              <button class="btn sm" data-descargar="${d.id}">Descargar</button>
              <button class="btn sm" data-ver-dir="${d.id}">Ver</button></li>`).join('')}</ul>`
          : `<p class="vacio-msg">Esta carpeta está vacía.<br><small>Los archivos llegan aquí cuando su documento pasa a "${esc(afdSel.nombres[ui.carpeta.q])}".</small></p>`}
        </div>
      </div>`;
  }

  function abrirDirectorio() {
    $('#modal-dir').hidden = false;
    pintarDirectorio().then(() => { const b = $('#modal-dir [data-cerrar-dir].btn'); if (b) b.focus(); });
  }
  function cerrarDirectorio() {
    const m = $('#modal-dir');
    if (m.hidden || m.classList.contains('cerrando')) return;
    m.classList.add('cerrando'); // salida más rápida que la entrada
    setTimeout(() => { m.hidden = true; m.classList.remove('cerrando'); }, 160);
  }

  /* ---------- Cerrar sesión (simulado) ---------- */
  function cerrarSesion() {
    if (!confirm('¿Deseas cerrar sesión?')) return;
    cerrarDirectorio(); cerrarMenuUsuario();
    $('.app').classList.add('saliendo');
    try { sessionStorage.clear(); localStorage.removeItem('flujo.sesion'); } catch (e) { /* sin almacenamiento */ }
    setTimeout(() => {
      // Los navegadores solo permiten cerrar pestañas abiertas por un script.
      // Si no se puede cerrar, se muestra la pantalla de sesión cerrada.
      window.close();
      const logo = $('.marca .logo-umg');
      if (logo) $('#salida-logo').replaceChildren(logo.cloneNode(true));
      $('.app').hidden = true;
      $('#salida').hidden = false;
      document.title = 'Sesión cerrada · Administrador de procesos';
    }, 380);
  }

  /* ---------- Vistas nuevas ---------- */
  function vistaTablero() {
    const flujos = Flujos.todos('documentos');
    if (!flujos.find(f => f.id === ui.kbFlujo)) {
      const d = Administrador.obtener(ui.seleccionado), a = d && Flujos.obtener(d.flujo);
      ui.kbFlujo = a && a.modo === 'documentos' ? a.id : flujos[0].id;
    }
    return Tablero.vista(Flujos.obtener(ui.kbFlujo), ayudas);
  }
  const vistaEstadisticas = () => Estadisticas.vista(ayudas);

  /* ---------- Aplicar una transición (detalle o tablero), con Deshacer ---------- */
  function aplicarTransicion(id, simbolo, origen) {
    try {
      const previo = Administrador.obtener(id);
      const antes = previo.estado, rutaAntes = Directorio.rutaDoc(previo).join('/');
      const nota = origen === 'detalle' ? ($('#nota') || {}).value : '';
      const d = Administrador.aplicar(id, simbolo, nota);
      const afd = afdDoc(d), rutaNueva = Directorio.rutaDoc(d).join('/');
      sincronizar();
      ui.anim = origen === 'detalle' ? { de: antes, a: d.estado } : null;
      ui.sello = id; ui.seleccionado = id;
      render();
      ui.anim = null;
      if (origen === 'tablero-boton') { const c = $(`.kb-tarjeta[data-id="${id}"]`); if (c) c.classList.add('llego'); }
      toast(`${d.id}: δ(${antes}, ${simbolo}) = ${d.estado}, ahora «${afd.nombres[d.estado]}»` +
        (d.archivo && rutaAntes !== rutaNueva ? `. Archivo movido a ${rutaNueva}` : '') + '.',
        { accion: { texto: 'Deshacer', fn: () => deshacerPaso(id, d.historial.length) } });
      return d;
    } catch (err) { toast(err.message, true); return null; }
  }

  /** Deshace el último paso. Si se indica cuántos pasos debía tener, solo deshace
   *  cuando ese cambio sigue siendo el último (un aviso viejo no deshace uno nuevo). */
  function deshacerPaso(id, pasosEsperados) {
    try {
      const actual = Administrador.obtener(id);
      if (!actual) throw new Error(`${id} ya no existe.`);
      if (pasosEsperados && actual.historial.length !== pasosEsperados)
        throw new Error(`${id} cambió después de ese aviso; abre su detalle para deshacer el último paso.`);
      const { doc, deshecha } = Administrador.deshacer(id);
      sincronizar(); render();
      toast(`Se deshizo δ(${deshecha.desde}, ${deshecha.simbolo}). ${doc.id} volvió a «${afdDoc(doc).nombres[doc.estado]}».`);
    } catch (err) { toast(err.message, true); }
  }

  function rechazarMovimiento(id, q) {
    const d = Administrador.obtener(id), afd = afdDoc(d);
    const opciones = afd.simbolosValidos(d.estado).map(s => `${s} → ${afd.nombres[afd.transicion(d.estado, s)]}`);
    toast(`δ no permite pasar de «${afd.nombres[d.estado]}» a «${afd.nombres[q]}».${opciones.length ? ' Desde aquí: ' + opciones.join(', ') + '.' : ''}`, { error: true });
  }

  async function eliminarDocumento(id) {
    const d = Administrador.obtener(id);
    if (!d) return;
    const indice = Administrador.todos().indexOf(d);
    const copia = JSON.parse(JSON.stringify(d));
    let registro = null;
    try { registro = await Directorio.obtenerArchivo(id); } catch (e) { /* sin archivo */ }
    Administrador.eliminar(id);
    Directorio.eliminarArchivo(id).catch(() => {}).then(sincronizar);
    ui.seleccionado = null;
    render();
    toast(`${id} eliminado.`, { accion: { texto: 'Deshacer', fn: async () => {
      Administrador.restaurar(copia, indice);
      if (registro) { try { await Directorio.restaurarArchivo(registro); } catch (e) { /* se pierde solo el archivo */ } }
      sincronizar(); ui.seleccionado = id; render();
      toast(`${id} restaurado.`);
    } } });
  }

  /* ---------- Render principal ---------- */
  function render() {
    const vistas = { panel: vistaPanel, tablero: vistaTablero, registrar: vistaRegistrar, detalle: vistaDetalle, automata: vistaAutomata, estadisticas: vistaEstadisticas };
    document.body.dataset.vista = ui.vista;
    // La secuencia de entrada solo corre al cambiar de pantalla, no en cada clic
    const entra = ui.vista !== ui.ultimaVista || ui.g.todos !== ui.ultimoTodos;
    ui.ultimaVista = ui.vista; ui.ultimoTodos = ui.g.todos;
    ui.entrando = entra && !ui.anim;
    $('#principal').innerHTML = `<div class="vista ${ui.entrando ? 'entra' : ''}">${vistas[ui.vista]()}</div>`;
    pintarNav();
    pintarLateral(entra);
    pintarEditor();
    pintarGrafos();
    despuesDeDibujar(entra);
  }

  function despuesDeDibujar(entra) {
    if (ui.vista === 'panel') $$('#principal [data-contar]').forEach(el => Efectos.contar(el, +el.dataset.contar, ui.entrando ? 700 : 0));
    Tablero.montar(ui.vista === 'tablero' ? $('#kb') : null, Flujos.obtener(ui.kbFlujo), {
      soltar: (id, simbolo) => aplicarTransicion(id, simbolo, 'tablero'),
      rechazar: rechazarMovimiento
    });
    Estadisticas.montar(ui.vista === 'estadisticas' ? $('#principal .vista') : null, entra);
    if (ui.sello) { const h = $('#hoja'); if (h) h.classList.add('impacto'); ui.sello = null; }
  }

  /* ---------- Sesión ---------- */
  function aplicarSesion(ses) {
    ui.sesion = ses;
    Administrador.fijarUsuario(ses.nombre);
    $('#avatar').textContent = Efectos.iniciales(ses.nombre);
    $('#usuario-nombre').textContent = ses.nombre;
    $('#usuario-rol').textContent = ses.rol;
    $('#mu-nombre').textContent = ses.nombre;
    $('#mu-rol').textContent = ses.rol;
  }

  function iniciarSesion() {
    let ses = null;
    try { ses = JSON.parse(localStorage.getItem('flujo.sesion') || 'null'); } catch (e) { ses = null; }
    if (ses && ses.nombre) { aplicarSesion(ses); return; }
    const l = $('#login');
    l.hidden = false;
    let ultimo = '';
    try { ultimo = localStorage.getItem('flujo.ultimoNombre') || ''; } catch (e) { /* nada */ }
    $('#login-nombre').value = ultimo;
    if (Efectos.reducido()) { const an = $('#lg-anim'); if (an) an.remove(); }
    setTimeout(() => $('#login-nombre').focus(), 80);
  }

  function entrar(form) {
    const nombre = form.nombre.value.trim().replace(/\s+/g, ' ');
    const rol = (form.querySelector('input[name="rol"]:checked') || {}).value || 'Administrador';
    if (nombre.length < 2) { $('#login-error').textContent = 'Escribe tu nombre (al menos 2 letras) para continuar.'; form.nombre.focus(); return; }
    const ses = { nombre, rol, desde: new Date().toISOString() };
    try { localStorage.setItem('flujo.sesion', JSON.stringify(ses)); localStorage.setItem('flujo.ultimoNombre', nombre); } catch (e) { /* solo en memoria */ }
    aplicarSesion(ses);
    const l = $('#login');
    l.classList.add('saliendo');
    setTimeout(() => { l.hidden = true; l.classList.remove('saliendo'); }, 300);
    ui.ultimaVista = null; render();
    toast(`Hola, ${nombre.split(' ')[0]}. Entraste como ${rol}.`);
  }

  function cerrarMenuUsuario() {
    const m = $('#menu-usuario'); if (!m) return;
    m.hidden = true; $('#btn-usuario').setAttribute('aria-expanded', 'false');
  }

  /* ---------- Tema claro / oscuro ---------- */
  function actualizarBotonTema() {
    const oscuro = temaActual() === 'oscuro';
    $('#btn-tema').setAttribute('aria-label', oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
    $('#btn-tema').title = (oscuro ? 'Modo claro' : 'Modo oscuro') + ' (T)';
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = oscuro ? '#0d1a29' : '#10304f';
  }

  function alternarTema() {
    const nuevo = temaActual() === 'oscuro' ? 'light' : 'dark';
    Efectos.cambiarTema($('#btn-tema'), () => {
      document.documentElement.dataset.theme = nuevo;
      try { localStorage.setItem('flujo.tema', nuevo); } catch (e) { /* nada */ }
      actualizarBotonTema();
      if (ui.vista === 'automata') pintarGrafos();
      if (ui.vista === 'registrar') pintarGrafoRegistro();
    });
  }

  /* ---------- Paleta de comandos (Ctrl+K) ---------- */
  const pal = { items: [], sel: 0 };

  function abrirPaleta() {
    cerrarMenuUsuario();
    $('#paleta').hidden = false;
    const i = $('#paleta-input'); i.value = '';
    filtrarPaleta('');
    i.focus();
  }
  function cerrarPaleta() { $('#paleta').hidden = true; }

  function itemsPaleta(q) {
    const t = normal(q.trim());
    const secciones = NAV.map((n, i) => ({ grupo: 'Ir a', ico: n.ico, txt: n.t, det: `tecla ${i + 1}`, fn: () => ir(n.id) }));
    const doc = Administrador.obtener(ui.seleccionado);
    const acciones = [
      { grupo: 'Acciones', ico: I.plus, txt: 'Registrar un documento nuevo', det: 'N', fn: () => { ir('registrar'); setTimeout(() => { const f = $('#f-titulo'); if (f) f.focus(); }, 60); } },
      { grupo: 'Acciones', ico: I.tema, txt: temaActual() === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro', det: 'T', fn: alternarTema },
      { grupo: 'Acciones', ico: I.carpeta, txt: 'Abrir el directorio de documentos', fn: abrirDirectorio },
      { grupo: 'Acciones', ico: I.bajar, txt: 'Exportar todos los documentos a CSV', fn: () => exportarCSV(Administrador.todos()) },
      { grupo: 'Acciones', ico: I.regla, txt: 'Diseñar un flujo nuevo', fn: () => { ui.modoEditor = 'diseno'; ui.flujo = null; ui.g.todos = false; ir('automata'); } },
      doc && { grupo: 'Acciones', ico: I.play, txt: `Reproducir el recorrido de ${doc.id}`, fn: () => { ui.modoEditor = 'documentos'; ui.flujo = doc.flujo; ui.g.todos = false; ir('automata'); setTimeout(reproducirRecorrido, 700); } },
      { grupo: 'Acciones', ico: I.salir, txt: 'Cerrar sesión', fn: cerrarSesion }
    ].filter(Boolean);
    const docs = Administrador.todos().map(d => { const a = afdDoc(d); return { grupo: 'Documentos', ico: I.doc, txt: `${d.id} · ${d.titulo}`, det: a ? a.nombres[d.estado] : '', busca: `${d.id} ${d.titulo} ${d.responsable} ${d.tipo}`, fn: () => ir('detalle', d.id) }; });
    const flujos = Flujos.todos().map(f => ({ grupo: 'Flujos', ico: I.nodos, txt: `${f.codigo} · ${f.nombre}`, det: f.modo === 'diseno' ? 'en diseño' : '', fn: () => { ui.modoEditor = f.modo; ui.flujo = f.id; ui.g.todos = false; ir('automata'); } }));
    if (!t) return [...secciones, ...acciones, ...docs.slice(0, 4)];
    return [...secciones, ...acciones, ...docs, ...flujos].filter(x => normal(x.busca || `${x.txt} ${x.det || ''}`).includes(t)).slice(0, 40);
  }

  function filtrarPaleta(q) { pal.items = itemsPaleta(q); pal.sel = 0; pintarPaleta(); }

  function pintarPaleta() {
    const ul = $('#paleta-lista');
    if (!pal.items.length) { ul.innerHTML = '<li class="pl-vacio">Nada coincide. Prueba con un código como DOC-004 o una palabra del título.</li>'; return; }
    let grupo = '', html = '';
    pal.items.forEach((x, i) => {
      if (x.grupo !== grupo) { grupo = x.grupo; html += `<li class="pl-grupo" role="presentation">${grupo}</li>`; }
      html += `<li class="pl-item" id="pl-${i}" role="option" data-pl="${i}" aria-selected="${i === pal.sel}"><span class="pl-ico">${x.ico}</span><span class="pl-txt">${esc(x.txt)}${x.det ? `<small>${esc(x.det)}</small>` : ''}</span></li>`;
    });
    ul.innerHTML = html;
    $('#paleta-input').setAttribute('aria-activedescendant', 'pl-' + pal.sel);
    const s = ul.querySelector('[aria-selected="true"]'); if (s) s.scrollIntoView({ block: 'nearest' });
  }

  function ejecutarPaleta(i) { const x = pal.items[i]; if (!x) return; cerrarPaleta(); x.fn(); }

  /* ---------- Eventos (delegados) ---------- */
  document.addEventListener('click', e => {
    // Clic en un estado del grafo: lo usa como origen en el editor
    const nodo = e.target.closest('#svg-wrap g.node');
    if (nodo && nodo.id && nodo.id.startsWith('nodo-')) {
      ui.desde = nodo.id.slice(5);
      pintarEditor();
      const s = $('#ed-simbolo'); if (s) s.focus();
      return toast(`Origen ${ui.desde} listo en el editor: escribe el símbolo y elige el destino.`);
    }

    // Menú de usuario: se cierra al hacer clic fuera
    if (!e.target.closest('.usuario')) cerrarMenuUsuario();

    // Tarjeta del tablero: abrir el detalle (si no fue un arrastre)
    const tarjeta = e.target.closest('.kb-tarjeta');
    if (tarjeta && !e.target.closest('button') && !tarjeta.classList.contains('kb-fantasma')) {
      const kb = $('#kb');
      if (kb && kb._ignorarClic) return;
      return ir('detalle', tarjeta.dataset.id);
    }

    const t = e.target.closest('[data-ir],[data-ver],[data-sel],[data-sim],[data-add],[data-dir],[data-cerrar-dir],[data-carpeta],[data-abrir],[data-descargar],[data-ver-dir],' +
      '[data-cmd],[data-kb-flujo],[data-kb-accion],[data-filtro-estado],[data-pl],[data-cerrar-paleta],[data-cerrar-atajos],#btn-tema,#btn-comandos,#btn-usuario,' +
      '[data-ed],[data-modo],[data-todos],[data-g],[data-lienzo],[data-paleta],[data-lz],[data-color],[data-quitar-estado],[data-quitar-trans],[data-celda],[data-abrir-flujo],' +
      '#btn-probar,#btn-limpiar,#btn-eliminar,#btn-salir,#btn-reingresar,#btn-quitar-archivo,#btn-vincular,#btn-cambiar,#btn-permiso,#btn-desvincular');
    if (!t) return;

    /* --- Barra superior, paleta y comandos --- */
    if (t.id === 'btn-tema') return alternarTema();
    if (t.id === 'btn-comandos') return abrirPaleta();
    if (t.id === 'btn-usuario') {
      const m = $('#menu-usuario'), abrir = m.hidden;
      m.hidden = !abrir; t.setAttribute('aria-expanded', String(abrir));
      return;
    }
    if (t.hasAttribute('data-cerrar-paleta')) return cerrarPaleta();
    if (t.dataset.pl) return ejecutarPaleta(+t.dataset.pl);
    if (t.hasAttribute('data-cerrar-atajos')) { $('#modal-atajos').hidden = true; return; }
    if (t.dataset.cmd) {
      cerrarMenuUsuario();
      switch (t.dataset.cmd) {
        case 'csv': return exportarCSV(ui.vista === 'panel' ? docsFiltrados() : Administrador.todos());
        case 'limpiar-filtros': ui.filtro = { texto: '', flujo: 'todos', estados: [] }; return render();
        case 'reproducir': return reproducirRecorrido();
        case 'deshacer-doc': return deshacerPaso(t.dataset.id);
        case 'atajos': $('#modal-atajos').hidden = false; return $('#modal-atajos [data-cerrar-atajos].btn').focus();
        case 'reiniciar':
          if (confirm('¿Restaurar los flujos y documentos de ejemplo? Se perderán los cambios, los flujos creados y los archivos subidos.')) {
            Flujos.restaurar(); Administrador.reiniciar(); ui.seleccionado = null; ui.flujo = null;
            Directorio.vaciar().catch(() => {}).then(sincronizar);
            render(); toast('Datos de ejemplo restaurados.');
          }
          return;
      }
    }

    /* --- Tablero --- */
    if (t.dataset.kbFlujo) { ui.kbFlujo = t.dataset.kbFlujo; return render(); }
    if (t.dataset.kbAccion) return aplicarTransicion(t.dataset.id, t.dataset.kbAccion, 'tablero-boton');

    /* --- Filtros de la tabla --- */
    if (t.dataset.filtroEstado) {
      const v = t.dataset.filtroEstado, l = ui.filtro.estados;
      ui.filtro.estados = l.includes(v) ? l.filter(x => x !== v) : l.concat(v);
      t.setAttribute('aria-pressed', String(ui.filtro.estados.includes(v)));
      return pintarTablaDocs();
    }

    /* --- Lienzo --- */
    if (t.dataset.lienzo) { ui.g.lienzo = t.dataset.lienzo === '1'; ui.lz = { sel: null, pendiente: null }; return render(); }
    if (t.dataset.paleta) {
      const afd = flujoActual(); if (!afd) return;
      const p = Lienzo.lugarLibre(afd, (Flujos.def(afd.id) || {}).posiciones);
      return crearEstadoEn(p.x, p.y, t.dataset.paleta === 'final');
    }
    if (t.dataset.lz === 'cancelar') { ui.lz.pendiente = null; return pintarInspector(); }
    if (t.dataset.lz === 'crear-trans') {
      if (agregarTransicion(t.dataset.de, ($('#lz-simbolo') || {}).value || '', t.dataset.a)) ui.lz.pendiente = null;
      return;
    }
    if (t.dataset.lz === 'ordenar') {
      const afd = flujoActual();
      const pos = afd && Lienzo.ordenarConGraphviz(afd);
      if (!pos) return toast('Graphviz todavía se está cargando. Intenta de nuevo en un momento.', true);
      Flujos.posicionar(afd.id, pos); pintarLienzo();
      return toast('Estados ordenados con el trazado de Graphviz.');
    }

    /* --- Editor de flujos y grafo --- */
    if (t.dataset.ed) return accionEditor(t);
    if (t.dataset.modo) { ui.modoEditor = t.dataset.modo; ui.flujo = null; ui.desde = null; return render(); }
    if (t.dataset.todos) { ui.g.todos = t.dataset.todos === '1'; return render(); }
    if (t.dataset.abrirFlujo) {
      const f = Flujos.obtener(t.dataset.abrirFlujo);
      ui.modoEditor = f.modo; ui.flujo = f.id; ui.g.todos = false; return render();
    }
    if (t.dataset.g) {
      if (t.dataset.g === 'dir') ui.g.dir = ui.g.dir === 'LR' ? 'TB' : 'LR';
      else ui.g[t.dataset.g] = !ui.g[t.dataset.g];
      return render();
    }
    if (t.dataset.color) {
      const q = t.dataset.color;
      return editar(d => {
        const e = d.estados.find(x => x.id === q);
        const i = Flujos.PALETA.findIndex(p => p.hex === e.color);
        e.color = Flujos.PALETA[(i + 1) % Flujos.PALETA.length].hex;
      });
    }
    if (t.dataset.quitarEstado) return quitarEstado(t.dataset.quitarEstado);
    if (t.dataset.quitarTrans) {
      const [de, s] = t.dataset.quitarTrans.split('|');
      return editar(d => { delete d.delta[de][s]; quitarSimbolosSinUso(d); }, `δ(${de}, ${s}) eliminada.`);
    }
    if (t.dataset.celda) {
      const [q, s] = t.dataset.celda.split('|');
      const afd = flujoActual();
      ui.desde = q; ui.simbolo = s; ui.hacia = afd.transicion(q, s) || ui.hacia;
      pintarEditor();
      const h = $('#ed-hacia'); if (h) { h.focus(); h.closest('.ed-sec').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      return toast(`Editando δ(${q}, ${s}): elige el destino y presiona +.`);
    }

    /* --- Directorio --- */
    if (t.hasAttribute('data-dir')) return abrirDirectorio();
    if (t.hasAttribute('data-cerrar-dir')) return cerrarDirectorio();
    if (t.dataset.carpeta) { const [flujo, q] = t.dataset.carpeta.split('|'); ui.carpeta = { flujo, q }; return pintarDirectorio(); }
    if (t.dataset.abrir) { e.stopPropagation(); return Directorio.abrir(t.dataset.abrir).catch(err => toast(err.message, true)); }
    if (t.dataset.descargar) { e.stopPropagation(); return Directorio.descargar(t.dataset.descargar).catch(err => toast(err.message, true)); }
    if (t.dataset.verDir) { cerrarDirectorio(); return ir('detalle', t.dataset.verDir); }
    if (t.id === 'btn-vincular' || t.id === 'btn-cambiar') {
      Directorio.vincularCarpeta()
        .then(nombre => Directorio.sincronizar(Administrador.todos()).then(() => toast(`Carpeta vinculada: ${nombre}/${Directorio.RAIZ}`)))
        .catch(err => { if (err.name !== 'AbortError') toast('No se pudo vincular la carpeta: ' + err.message, true); })
        .finally(() => { pintarDirectorio(); pintarGrafos(); });
      return;
    }
    if (t.id === 'btn-permiso') {
      Directorio.pedirPermiso()
        .then(ok => ok ? Directorio.sincronizar(Administrador.todos()).then(() => toast('Carpeta sincronizada')) : toast('Permiso denegado', true))
        .catch(err => toast(err.message, true))
        .finally(() => { pintarDirectorio(); pintarGrafos(); });
      return;
    }
    if (t.id === 'btn-desvincular') { Directorio.desvincular().then(pintarDirectorio); return toast('Carpeta desvinculada. Los archivos siguen guardados en el navegador.'); }

    /* --- Sesión --- */
    if (t.id === 'btn-salir') return cerrarSesion();
    if (t.id === 'btn-reingresar') return location.reload();

    /* --- Archivo en el formulario --- */
    if (t.id === 'btn-quitar-archivo') { ui.archivoPendiente = null; $('#f-archivo').value = ''; $('#archivo-sel').innerHTML = ''; return; }

    if (t.dataset.ir) return ir(t.dataset.ir);
    if (t.dataset.ver) { e.stopPropagation(); return ir('detalle', t.dataset.ver); }
    if (t.dataset.sel) { ui.seleccionado = t.dataset.sel; return render(); }

    if (t.dataset.sim) return aplicarTransicion(ui.seleccionado, t.dataset.sim, 'detalle');

    if (t.dataset.add) {
      const inp = $('#cadena');
      inp.value = (inp.value.trim() + ' ' + t.dataset.add).trim();
      return;
    }
    if (t.id === 'btn-probar') return probarCadena();
    if (t.id === 'btn-limpiar') { $('#cadena').value = ''; $('#resultado').className = 'resultado'; pintarGrafos(); return; }

    if (t.id === 'btn-eliminar') return eliminarDocumento(ui.seleccionado);
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'sel-doc') { ui.seleccionado = t.value; render(); }
    if (t.id === 'f-archivo') elegirArchivo(t.files[0]);
    if (t.id === 'f-reemplazo' && t.files[0]) adjuntarA(ui.seleccionado, t.files[0]).then(render);
    if (t.id === 'f-flujo') {
      ui.flujoReg = t.value;
      const afd = Flujos.obtener(t.value);
      $('#reg-lead').innerHTML = leadRegistro(afd);
      $('#reg-tag').textContent = afd.inicial;
      pintarLateral();
    }
    if (t.id === 'filtro-flujo') { ui.filtro.flujo = t.value; ui.filtro.estados = []; return render(); }

    /* --- Editor --- */
    if (t.id === 'ed-flujo') { ui.flujo = t.value; ui.desde = null; return render(); }
    if (t.id === 'ed-nombre' || t.id === 'ed-codigo') {
      const v = t.value.trim();
      if (!v) return render();
      const campo = t.id === 'ed-nombre' ? 'nombre' : 'codigo';
      return editar(d => { d[campo] = campo === 'codigo' ? v.toUpperCase() : v; },
        flujoActual().modo === 'documentos' && flujoActual().carpetaFlujo ? 'Guardado. La carpeta del flujo se renombró en el directorio.' : 'Guardado.');
    }
    if (t.dataset.renombrar) {
      const q = t.dataset.renombrar, v = t.value.trim();
      if (!v) return render();
      return editar(d => { d.estados.find(x => x.id === q).nombre = v; }, `${q} ahora se llama «${v}».`);
    }
    if (t.dataset.inicial) {
      const q = t.dataset.inicial;
      return editar(d => { d.inicial = q; delete d.nombresEtapa; }, `${q} es el nuevo estado inicial. Los documentos nuevos empezarán ahí.`);
    }
    if (t.dataset.final) {
      const q = t.dataset.final, on = t.checked;
      return editar(d => { d.finales = on ? [...new Set(d.finales.concat(q))] : d.finales.filter(x => x !== q); },
        on ? `${q} ahora es estado de aceptación (∈ F).` : `${q} ya no es estado de aceptación.`);
    }
    if (t.id === 'ed-importar' && t.files[0]) {
      t.files[0].text().then(txt => {
        const f = Flujos.importar(JSON.parse(txt), ui.modoEditor);
        ui.flujo = f.id;
        if (ui.modoEditor === 'documentos') sincronizar();
        render(); toast(`Flujo importado como ${f.codigo}`);
      }).catch(err => toast('No se pudo importar: ' + err.message, true));
    }
  });

  document.addEventListener('input', e => {
    if (e.target.id === 'buscar-docs') { ui.filtro.texto = e.target.value; pintarTablaDocs(); }
    if (e.target.id === 'paleta-input') filtrarPaleta(e.target.value);
  });

  document.addEventListener('keydown', e => {
    const escribiendo = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    const enLogin = !$('#login').hidden;

    // Paleta de comandos
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !enLogin) { e.preventDefault(); return $('#paleta').hidden ? abrirPaleta() : cerrarPaleta(); }
    if (!$('#paleta').hidden) {
      if (e.key === 'Escape') { e.preventDefault(); return cerrarPaleta(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        pal.sel = (pal.sel + (e.key === 'ArrowDown' ? 1 : -1) + pal.items.length) % Math.max(1, pal.items.length);
        return pintarPaleta();
      }
      if (e.key === 'Enter') { e.preventDefault(); return ejecutarPaleta(pal.sel); }
      return;
    }
    if (e.key === 'Escape') { cerrarMenuUsuario(); if (!$('#modal-atajos').hidden) $('#modal-atajos').hidden = true; }

    // Atajos de una tecla (no mientras se escribe)
    if (!escribiendo && !enLogin && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= NAV.length) { e.preventDefault(); return ir(NAV[n - 1].id); }
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); ir('registrar'); return setTimeout(() => { const f = $('#f-titulo'); if (f) f.focus(); }, 60); }
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); return alternarTema(); }
      if (e.key === '?') { e.preventDefault(); $('#modal-atajos').hidden = false; return $('#modal-atajos [data-cerrar-atajos].btn').focus(); }
      if (e.key === '/') { e.preventDefault(); if (ui.vista !== 'panel') ir('panel'); return setTimeout(() => { const b = $('#buscar-docs'); if (b) b.focus(); }, 60); }
    }
    if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('kb-tarjeta')) return ir('detalle', e.target.dataset.id);

    if (e.target.id === 'cadena' && e.key === 'Enter') probarCadena();
    if (e.target.id === 'ed-nuevo-estado' && e.key === 'Enter') accionEditor({ dataset: { ed: 'agregar-estado' } });
    if (e.target.id === 'ed-simbolo' && e.key === 'Enter') accionEditor({ dataset: { ed: 'agregar-trans' } });
    if (e.target.id === 'lz-simbolo' && e.key === 'Enter') { const b = $('#lz-insp [data-lz="crear-trans"]'); if (b) b.click(); }
    if (e.target.classList && e.target.classList.contains('lz-pieza') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.target.click(); }
    if (!escribiendo && ui.vista === 'automata' && ui.g.lienzo && (e.key === 'Delete' || e.key === 'Backspace') && ui.lz.sel) {
      e.preventDefault();
      const sel = ui.lz.sel;
      if (sel.tipo === 'estado') return quitarEstado(sel.q);
      ui.lz.sel = null;
      return editar(d => { Object.keys(d.delta[sel.de] || {}).forEach(s => { if (d.delta[sel.de][s] === sel.a) delete d.delta[sel.de][s]; }); quitarSimbolosSinUso(d); }, `Transiciones ${sel.de} → ${sel.a} eliminadas.`);
    }
    if (e.key === 'Escape' && ui.lz.pendiente) { ui.lz.pendiente = null; pintarInspector(); }
    if (e.key === 'Escape' && !$('#modal-dir').hidden) cerrarDirectorio();
  });

  /* --- Piezas de la paleta del lienzo --- */
  document.addEventListener('dragstart', e => {
    const pz = e.target.closest && e.target.closest('[data-paleta]');
    if (!pz) return;
    e.dataTransfer.setData('text/x-estado', pz.dataset.paleta);
    e.dataTransfer.effectAllowed = 'copy';
  });

  /* --- Arrastrar y soltar archivos --- */
  ['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => {
    e.preventDefault(); // evita que el navegador abra el archivo y abandone la app
    const dz = e.target.closest && e.target.closest('#dropzone');
    if (dz) dz.classList.add('encima');
  }));
  document.addEventListener('dragleave', e => {
    const dz = e.target.closest && e.target.closest('#dropzone');
    if (dz && !dz.contains(e.relatedTarget)) dz.classList.remove('encima');
  });
  document.addEventListener('drop', e => {
    e.preventDefault();
    const dz = e.target.closest && e.target.closest('#dropzone');
    if (!dz) return;
    dz.classList.remove('encima');
    elegirArchivo(e.dataTransfer.files[0]);
  });

  /** Guarda el archivo en el directorio y lo asocia al documento. */
  async function adjuntarA(id, archivo) {
    try {
      const reg = await Directorio.guardarArchivo(id, archivo);
      Administrador.adjuntar(id, reg);
      sincronizar();
      toast(`Archivo guardado en ${Directorio.rutaDoc(Administrador.obtener(id)).join('/')}`);
      return true;
    } catch (err) {
      toast('No se pudo guardar el archivo: ' + err.message, true);
      return false;
    }
  }

  document.addEventListener('reset', e => {
    if (e.target.id !== 'form-reg') return;
    ui.archivoPendiente = null;
    $('#archivo-sel').innerHTML = '';
  });

  document.addEventListener('submit', async e => {
    if (e.target.id === 'form-login') { e.preventDefault(); return entrar(e.target); }
    if (e.target.id !== 'form-reg') return;
    e.preventDefault();
    const f = new FormData(e.target);
    let d;
    try { d = Administrador.registrar(Object.fromEntries(f)); }
    catch (err) { return toast(err.message, true); }

    if (ui.archivoPendiente) await adjuntarA(d.id, ui.archivoPendiente);
    else { const a = afdDoc(d); toast(`${d.id} registrado en ${a.inicial} · ${a.nombres[a.inicial]}`); }
    ui.archivoPendiente = null;
    ir('detalle', d.id);
  });

  /* ---------- Arranque ---------- */
  if (!document.documentElement.dataset.theme) document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  actualizarBotonTema();
  Flujos.iniciar();
  Administrador.iniciar();
  iniciarSesion();
  document.body.classList.add('primera');
  render();
  moverIndicador(true);
  addEventListener('resize', () => moverIndicador(true));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => moverIndicador(true));
  setTimeout(() => document.body.classList.remove('primera'), 900);
  Directorio.cargarVinculo().then(sincronizar);
})();
