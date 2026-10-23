/*
 * ============================================================
 *  ESTADÍSTICAS
 *  Todo se calcula desde la base de datos (documentos e historial).
 *  Gráficas en SVG: barras de máx. 24 px con punta redondeada de
 *  4 px, cuadrícula tenue, etiqueta solo en el valor destacado,
 *  ayuda al pasar el mouse y una tabla equivalente debajo de cada
 *  gráfica (el color nunca es la única pista: cada barra lleva su
 *  nombre escrito).
 * ============================================================
 */
const Estadisticas = (function () {
  'use strict';

  const DIA = 864e5;
  const fmtDia = new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'short' });
  const fmtDiaLargo = new Intl.DateTimeFormat('es-GT', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtFecha = new Intl.DateTimeFormat('es-GT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  /* ---------- Cálculos ---------- */
  function datos() {
    const docs = Administrador.todos();
    const flujos = Flujos.todos('documentos');
    const ahora = Date.now();

    // Actividad por día (últimos 14 días, hora local): registros y transiciones
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const dias = [];
    for (let i = 13; i >= 0; i--) dias.push({ fecha: new Date(hoy.getTime() - i * DIA), reg: 0, trans: 0 });
    const diaDe = iso => { const f = new Date(iso); f.setHours(0, 0, 0, 0); const k = Math.round((f - dias[0].fecha) / DIA); return k >= 0 && k < 14 ? dias[k] : null; };
    docs.forEach(d => {
      const r = diaDe(d.creado); if (r) r.reg++;
      d.historial.forEach(h => { if (!h.simbolo) return; const t = diaDe(h.fecha); if (t) t.trans++; });
    });
    dias.forEach(d => { d.n = d.reg + d.trans; });

    // Documentos por estado y tiempo promedio en cada estado (estancias terminadas)
    const porFlujo = flujos.map(afd => {
      const suyos = docs.filter(d => d.flujo === afd.id);
      const estancia = {};
      suyos.forEach(d => d.historial.forEach((h, i) => {
        const sig = d.historial[i + 1];
        if (!sig) return;
        const ms = new Date(sig.fecha) - new Date(h.fecha);
        if (ms >= 0) (estancia[h.hacia] = estancia[h.hacia] || []).push(ms);
      }));
      return {
        afd,
        estados: afd.etapas.flat().map(q => ({
          q, nombre: afd.nombres[q], color: afd.color(q),
          n: suyos.filter(d => d.estado === q).length,
          prom: estancia[q] ? estancia[q].reduce((a, b) => a + b, 0) / estancia[q].length : null,
          muestras: estancia[q] ? estancia[q].length : 0
        }))
      };
    });

    // Transiciones más usadas y bitácora
    const uso = {};
    const bitacora = [];
    docs.forEach(d => {
      const afd = Flujos.obtener(d.flujo);
      d.historial.forEach(h => {
        if (!h.simbolo) return;
        const k = d.flujo + '|' + h.desde + '|' + h.simbolo;
        if (!uso[k]) uso[k] = { afd, de: h.desde, s: h.simbolo, a: h.hacia, n: 0 };
        uso[k].n++;
        bitacora.push({ d, afd, h });
      });
    });
    const top = Object.values(uso).sort((a, b) => b.n - a.n).slice(0, 8);
    bitacora.sort((a, b) => b.h.fecha.localeCompare(a.h.fecha));

    // Indicadores
    const finales = docs.filter(d => { const a = Flujos.obtener(d.flujo); return a && a.esFinal(d.estado); });
    const cierres = finales.map(d => {
      const a = Flujos.obtener(d.flujo);
      const llegada = d.historial.find(h => a.esFinal(h.hacia) && h.simbolo);
      return llegada ? new Date(llegada.fecha) - new Date(d.creado) : null;
    }).filter(v => v != null);
    const transHoy = bitacora.filter(b => new Date(b.h.fecha) >= hoy).length;

    return {
      dias, porFlujo, top, bitacora,
      kpi: {
        total: docs.length, curso: docs.length - finales.length, finales: finales.length,
        cierre: cierres.length ? cierres.reduce((a, b) => a + b, 0) / cierres.length : 0,
        transiciones: bitacora.length, transHoy
      },
      ahora
    };
  }

  /* ---------- Piezas de dibujo ---------- */
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Barra vertical con punta redondeada (4 px) y base recta. */
  function columna(x, y, w, h, r = 4) {
    if (h <= 0) return '';
    r = Math.min(r, h, w / 2);
    return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
  }
  /** Barra horizontal con punta redondeada a la derecha. */
  function fila(x, y, w, h, r = 4) {
    if (w <= 0) return '';
    r = Math.min(r, w, h / 2);
    return `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`;
  }
  function pasoLimpio(max) {
    if (max <= 5) return 1;
    const crudo = max / 4, mag = Math.pow(10, Math.floor(Math.log10(crudo)));
    return [1, 2, 5, 10].map(m => m * mag).find(s => s >= crudo);
  }

  /* Actividad por día: columnas apiladas (registros abajo, transiciones arriba),
     2 px de separación entre segmentos y punta redondeada solo arriba. */
  function graficaDias(dias, W) {
    const H = 230, ml = 30, mr = 4, mt = 22, mb = 30;
    const max = Math.max(1, ...dias.map(d => d.n));
    const paso = pasoLimpio(max), tope = Math.ceil(max / paso) * paso;
    const banda = (W - ml - mr) / dias.length, bw = Math.max(6, Math.min(24, banda * 0.6));
    const y = v => mt + (H - mt - mb) * (1 - v / tope);
    const cadaEtiqueta = Math.max(1, Math.ceil(56 / banda));
    let s = '';
    for (let v = 0; v <= tope; v += paso) s += `<line class="g-eje${v ? ' tenue' : ''}" x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}"/><text class="g-txt" x="${ml - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    const imax = dias.reduce((m, d, i) => (d.n > dias[m].n ? i : m), 0);
    dias.forEach((d, i) => {
      const x = ml + banda * i + (banda - bw) / 2;
      const base = H - mb, hReg = base - y(d.reg), hTot = base - y(d.n);
      const tip = `${fmtDiaLargo.format(d.fecha)} · <b>${d.n}</b> movimiento${d.n === 1 ? '' : 's'}` +
        (d.n ? `<br>${d.reg} registro${d.reg === 1 ? '' : 's'} · ${d.trans} transicion${d.trans === 1 ? '' : 'es'}` : '');
      // El segmento de abajo es recto si hay otro encima; el de arriba lleva la punta redondeada
      const segReg = d.reg ? (d.trans ? `<rect class="g-barra" x="${x}" y="${base - hReg}" width="${bw}" height="${hReg}" fill="var(--serie-1)"/>`
        : `<path class="g-barra" fill="var(--serie-1)" d="${columna(x, base - hReg, bw, hReg)}"/>`) : '';
      const hTrans = hTot - hReg - (d.reg ? 2 : 0);
      const segTrans = d.trans && hTrans > 0 ? `<path class="g-barra" fill="var(--serie-2)" d="${columna(x, base - hTot, bw, hTrans)}"/>` : '';
      s += `<g class="g-grupo" data-tip="${esc(tip)}" data-x="${x + bw / 2}" data-y="${y(d.n)}">
        <rect class="g-hit" x="${ml + banda * i}" y="${mt}" width="${banda}" height="${H - mt - mb}"/>
        <g class="g-barra-v" style="--k:${i}">${segReg}${segTrans}</g></g>`;
      const ultimo = i === dias.length - 1;
      if (ultimo || (dias.length - 1 - i) % cadaEtiqueta === 0)
        s += `<text class="g-txt" x="${x + bw / 2}" y="${H - mb + 18}" text-anchor="middle">${ultimo ? 'hoy' : fmtDia.format(d.fecha)}</text>`;
    });
    if (dias[imax].n) s += `<text class="g-txt valor" x="${ml + banda * imax + banda / 2}" y="${y(dias[imax].n) - 7}" text-anchor="middle">${dias[imax].n}</text>`;
    s += `<line class="g-eje" x1="${ml}" x2="${W - mr}" y1="${H - mb}" y2="${H - mb}"/>`;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Movimientos por día en las últimas dos semanas: registros y transiciones">${s}</svg>`;
  }

  /* Barras horizontales agrupadas por flujo (estado = nombre escrito + color).
     En pantallas angostas la etiqueta va encima de la barra. */
  function graficaFilas(grupos, { valor, texto, etiquetaW = 150 }, W) {
    const apilado = W < 460 || etiquetaW > W * 0.42;
    const fh = apilado ? 40 : 28, bh = 14, cab = 30;
    const todos = grupos.flatMap(g => g.filas);
    const max = Math.max(1e-9, ...todos.map(valor).filter(v => v != null));
    let yy = 6, s = '', k = 0;
    const x0 = apilado ? 0 : etiquetaW + 12, ancho = Math.max(40, W - x0 - 64);
    grupos.forEach(g => {
      if (g.titulo) { s += `<text class="g-txt fuerte" x="0" y="${yy + 16}">${esc(g.titulo)}</text>`; yy += cab; }
      g.filas.forEach(f => {
        const v = valor(f);
        const w = !v ? 0 : Math.max(3, ancho * v / max);
        const yb = apilado ? yy + 20 : yy + (fh - bh) / 2;
        const tip = `${esc(f.nombre)} · <b>${esc(texto(f))}</b>${f.extra ? '<br>' + esc(f.extra) : ''}`;
        const etiqueta = apilado
          ? `<text class="g-txt" x="0" y="${yy + 13}">${esc(f.etiqueta || f.nombre)}</text>`
          : `<text class="g-txt" x="${etiquetaW}" y="${yy + fh / 2 + 4}" text-anchor="end">${esc(f.etiqueta || f.nombre)}</text>`;
        s += `<g class="g-grupo" data-tip="${esc(tip)}" data-x="${x0 + w / 2}" data-y="${yb}">
          <rect class="g-hit" x="0" y="${yy}" width="${W}" height="${fh}"/>
          ${etiqueta}
          ${v == null ? `<text class="g-txt" x="${x0}" y="${yb + bh / 2 + 4}">sin datos</text>`
            : `${w ? `<path class="g-barra g-barra-h" style="--k:${k}" fill="${f.color}" d="${fila(x0, yb, w, bh)}"/>` : ''}
               <text class="g-txt valor" x="${x0 + w + (w ? 8 : 0)}" y="${yb + bh / 2 + 4}">${esc(texto(f))}</text>`}
        </g>`;
        yy += fh; k++;
      });
      yy += 8;
    });
    return `<svg width="${W}" height="${yy}" viewBox="0 0 ${W} ${yy}" role="img">${s}</svg>`;
  }

  function tablaVista(cab, filas) {
    return `<details class="tabla-vista"><summary>Ver como tabla</summary><div class="tabla-scroll"><table class="tabla">
      <thead><tr>${cab.map((c, i) => `<th class="${i ? 'num' : ''}">${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${filas.map(f => `<tr>${f.map((c, i) => `<td class="${i ? 'num' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
  }

  /* ---------- Vista ---------- */
  let dibujos = {};
  let observador = null;

  function vista(h) {
    const D = datos();
    const k = D.kpi;
    const grEstados = D.porFlujo.map(p => ({ titulo: `${p.afd.codigo} · ${p.afd.nombre}`, filas: p.estados.map(e => ({ ...e })) }));
    const grTiempo = D.porFlujo.map(p => ({ titulo: `${p.afd.codigo} · ${p.afd.nombre}`, filas: p.estados.filter(e => !p.afd.esFinal(e.q) || e.prom != null).map(e => ({ ...e, extra: e.muestras ? `${e.muestras} estancia${e.muestras === 1 ? '' : 's'}` : '' })) }));
    const grTop = [{ titulo: '', filas: D.top.map(t => ({ nombre: `${t.afd.codigo} · δ(${t.de}, ${t.s}) = ${t.a}`, etiqueta: `${t.s} · ${t.afd.nombres[t.de]} → ${t.afd.nombres[t.a]}`, color: t.afd.color(t.a), n: t.n, extra: t.afd.nombre })) }];
    // Las gráficas se dibujan al montar, con el ancho real de su caja (1 px = 1 px)
    dibujos = {
      dias: W => graficaDias(D.dias, W),
      estados: W => graficaFilas(grEstados, { valor: f => f.n, texto: f => String(f.n) }, W),
      tiempo: W => graficaFilas(grTiempo, { valor: f => f.prom, texto: f => f.prom == null ? 'sin datos' : Efectos.duracion(f.prom) }, W),
      top: W => graficaFilas(grTop, { valor: f => f.n, texto: f => String(f.n), etiquetaW: 250 }, W)
    };

    return `
      <div class="vista-tit"><div><h1>Estadísticas</h1>
        <p class="lead">Calculadas en este momento a partir de los documentos y de cada transición del historial.</p></div>
        <div class="head-acc"><button type="button" class="btn sm" data-cmd="csv">${h.icono('bajar')} Exportar documentos (CSV)</button></div></div>

      <div class="kpis">
        <div class="kpi"><small>Documentos</small><b data-contar="${k.total}">0</b><span>${k.curso} en curso</span></div>
        <div class="kpi"><small>Finalizados</small><b data-contar="${k.finales}">0</b><span>en un estado de aceptación</span></div>
        <div class="kpi"><small>Tiempo medio hasta finalizar</small><b data-contar="${(k.cierre / DIA).toFixed(1)}" data-decimales="1" data-sufijo=" d">0</b><span>desde que se registran</span></div>
        <div class="kpi"><small>Transiciones registradas</small><b data-contar="${k.transiciones}">0</b><span>${k.transHoy} hoy</span></div>
      </div>

      <div class="est-grid" id="est-grid">
        <section class="grafica ancha"><h3>Actividad por día</h3><p class="sub">Documentos registrados y transiciones aplicadas en las últimas dos semanas</p>
          <ul class="g-leyenda" aria-hidden="true"><li style="--c:var(--serie-1)">Registros</li><li style="--c:var(--serie-2)">Transiciones</li></ul>
          <div class="g-lienzo" data-g="dias"></div>
          ${tablaVista(['Día', 'Registros', 'Transiciones', 'Total'], D.dias.map(d => [fmtDiaLargo.format(d.fecha), d.reg, d.trans, d.n]))}</section>

        <section class="grafica"><h3>Documentos por estado</h3><p class="sub">Dónde está cada documento ahora</p>
          <div class="g-lienzo" data-g="estados"></div>
          ${tablaVista(['Flujo y estado', 'Documentos'], D.porFlujo.flatMap(p => p.estados.map(e => [`${p.afd.codigo} · ${e.nombre}`, e.n])))}</section>

        <section class="grafica"><h3>Tiempo promedio en cada estado</h3><p class="sub">Desde que el documento entra hasta que sale</p>
          <div class="g-lienzo" data-g="tiempo"></div>
          ${tablaVista(['Flujo y estado', 'Promedio', 'Estancias'], D.porFlujo.flatMap(p => p.estados.map(e => [`${p.afd.codigo} · ${e.nombre}`, e.prom == null ? '—' : Efectos.duracion(e.prom), e.muestras])))}</section>

        <section class="grafica ancha"><h3>Transiciones más usadas</h3><p class="sub">Veces que se aplicó cada δ</p>
          ${D.top.length ? '<div class="g-lienzo" data-g="top"></div>' : '<p class="vacio-msg">Todavía no hay transiciones.</p>'}
          ${tablaVista(['Transición', 'Veces'], D.top.map(t => [`${t.afd.codigo} δ(${t.de}, ${t.s}) = ${t.a}`, t.n]))}</section>

        <section class="grafica ancha"><h3>Bitácora</h3><p class="sub">Las 25 transiciones más recientes, con quién las hizo</p>
          <div class="tabla-scroll"><table class="tabla tabla-tarjetas">
            <thead><tr><th>Fecha</th><th>Documento</th><th>Transición</th><th>Resultado</th><th>Usuario</th></tr></thead>
            <tbody>${D.bitacora.slice(0, 25).map(b => `<tr class="click" data-ver="${b.d.id}" style="${h.cv(b.afd, b.h.hacia)}">
              <td class="tt-fecha">${fmtFecha.format(new Date(b.h.fecha))}</td>
              <td class="tt-doc"><span class="code">${b.d.id}</span> ${esc(b.d.titulo)}</td>
              <td class="tt-trans"><span class="code">δ(${b.h.desde}, ${esc(b.h.simbolo)}) = ${b.h.hacia}</span></td>
              <td class="tt-res">${h.chip(b.afd, b.h.hacia)}</td>
              <td class="tt-usr">${esc(b.h.usuario || '—')}</td></tr>`).join('') || '<tr><td colspan="5" class="vacio-msg">Sin transiciones todavía.</td></tr>'}</tbody></table></div></section>
      </div>`;
  }

  /* ---------- Dibujo con el ancho real, ayuda flotante y contadores ---------- */
  function dibujar(cont) {
    cont.querySelectorAll('.g-lienzo').forEach(el => {
      const W = Math.floor(el.clientWidth);
      if (!W || +el.dataset.w === W || !dibujos[el.dataset.g]) return;
      el.dataset.w = W;
      el.innerHTML = dibujos[el.dataset.g](W);
    });
  }

  function montar(cont, entra) {
    if (observador) { observador.disconnect(); observador = null; }
    if (!cont) return;
    if (entra) cont.classList.add('entra-graficas');
    dibujar(cont);
    // Al cambiar el ancho se redibuja sin repetir la animación de entrada
    if (window.ResizeObserver) {
      let primero = true;
      observador = new ResizeObserver(() => {
        if (primero) { primero = false; return; }
        cont.classList.remove('entra-graficas');
        dibujar(cont);
      });
      const grid = cont.querySelector('#est-grid');
      if (grid) observador.observe(grid);
    }
    cont.querySelectorAll('[data-contar]').forEach(el => Efectos.contar(el, parseFloat(el.dataset.contar), entra ? 700 : 0));
    cont.querySelectorAll('.grafica').forEach(gr => {
      const lienzo = gr.querySelector('.g-lienzo');
      if (!lienzo) return;
      const tip = document.createElement('div');
      tip.className = 'gtip'; tip.setAttribute('role', 'status');
      gr.appendChild(tip);
      lienzo.addEventListener('pointermove', ev => {
        const g = ev.target.closest('.g-grupo'), svg = lienzo.querySelector('svg');
        if (!g || !svg) { tip.classList.remove('ver'); return; }
        const m = svg.getScreenCTM(), rg = gr.getBoundingClientRect();
        const pt = new DOMPoint(+g.dataset.x, +g.dataset.y).matrixTransform(m);
        tip.innerHTML = g.dataset.tip;
        const medio = tip.offsetWidth / 2 + 8;
        tip.style.left = Math.min(rg.width - medio, Math.max(medio, pt.x - rg.left)) + 'px';
        tip.style.top = (pt.y - rg.top) + 'px';
        tip.classList.add('ver');
      });
      lienzo.addEventListener('pointerleave', () => tip.classList.remove('ver'));
    });
  }

  return { vista, montar, datos };
})();
