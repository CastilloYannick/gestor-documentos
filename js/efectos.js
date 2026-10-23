/*
 * ============================================================
 *  EFECTOS Y UTILIDADES DE INTERFAZ
 *  Avisos apilados con acción (Deshacer), contadores animados,
 *  ficha que recorre el grafo del autómata, vuelo de tarjetas
 *  (técnica FLIP) y cambio de tema con revelado circular.
 *  Reglas de movimiento: curvas propias, menos de 300 ms en la
 *  interfaz, solo transform/opacity y respeto a "reducir movimiento".
 * ============================================================
 */
const Efectos = (function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const reducido = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const espera = ms => new Promise(r => setTimeout(r, ms));

  /* ---------- Avisos (toasts) ---------- */
  const MAX_AVISOS = 3;
  const cerrarSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  /**
   * Muestra un aviso. opc: { error, accion: { texto, fn }, duracion }
   * (compatibilidad: un booleano como segundo argumento significa error).
   */
  function toast(msg, opc) {
    if (typeof opc === 'boolean') opc = { error: opc };
    opc = opc || {};
    const cont = document.getElementById('toasts');
    if (!cont) return { cerrar() {} };
    const el = document.createElement('div');
    el.className = 'toast-i' + (opc.error ? ' error' : '');
    el.setAttribute('role', opc.error ? 'alert' : 'status');
    el.innerHTML = `<span class="ti-punto" aria-hidden="true"></span><span class="ti-txt"></span>` +
      (opc.accion ? '<button class="ti-accion" type="button"></button>' : '') +
      `<button class="ti-cerrar" type="button" aria-label="Cerrar aviso">${cerrarSvg}</button>`;
    el.querySelector('.ti-txt').textContent = msg;
    if (opc.accion) el.querySelector('.ti-accion').textContent = opc.accion.texto;
    cont.appendChild(el);

    // Como máximo tres a la vez: el más viejo se va
    const vivos = [...cont.querySelectorAll('.toast-i:not(.saliendo)')];
    if (vivos.length > MAX_AVISOS) vivos.slice(0, vivos.length - MAX_AVISOS).forEach(v => v._cerrar && v._cerrar());

    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('visible')));

    let restante = opc.duracion || (opc.accion ? 6500 : opc.error ? 5200 : 3200);
    let inicio = Date.now(), tId = null, cerrado = false;
    const programar = () => { clearTimeout(tId); inicio = Date.now(); tId = setTimeout(cerrar, restante); };
    const pausar = () => { clearTimeout(tId); restante -= Date.now() - inicio; };
    function cerrar() {
      if (cerrado) return;
      cerrado = true; clearTimeout(tId);
      el.classList.add('saliendo'); el.classList.remove('visible');
      setTimeout(() => el.remove(), 200);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    }
    // Detalles invisibles: el tiempo se detiene con el mouse encima o con la pestaña oculta
    function alCambiarVisibilidad() { if (document.hidden) pausar(); else programar(); }
    el.addEventListener('mouseenter', pausar);
    el.addEventListener('mouseleave', programar);
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    el.querySelector('.ti-cerrar').addEventListener('click', cerrar);
    if (opc.accion) el.querySelector('.ti-accion').addEventListener('click', () => { cerrar(); opc.accion.fn(); });
    el._cerrar = cerrar;
    programar();
    return { cerrar };
  }

  /* ---------- Contadores que suben hasta su valor ---------- */
  function contar(el, hasta, ms = 700) {
    const dec = +(el.dataset.decimales || 0), suf = el.dataset.sufijo || '';
    const fmt = v => v.toLocaleString('es-GT', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf;
    if (reducido() || !hasta || ms <= 0) { el.textContent = fmt(hasta || 0); return; }
    const t0 = performance.now();
    (function paso(t) {
      const k = Math.min(1, (t - t0) / ms);
      el.textContent = fmt(dec ? hasta * easeOut(k) : Math.round(hasta * easeOut(k)));
      if (k < 1) requestAnimationFrame(paso);
    })(t0);
  }

  /* ---------- Vuelo de la tarjeta fantasma hasta su destino (FLIP) ----------
     El fantasma está fijo en (0,0) y se mueve con transform: basta animar
     su transform actual hasta la posición del rectángulo de destino. */
  function volar(fantasma, hasta, ms = 320) {
    if (reducido()) return Promise.resolve();
    return fantasma.animate([
      { transform: fantasma.style.transform },
      { transform: `translate(${hasta.left}px, ${hasta.top}px) rotate(0deg) scale(1)` }
    ], { duration: ms, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' }).finished.catch(() => {});
  }

  function sacudir(el) {
    el.classList.remove('sacudir'); void el.offsetWidth; el.classList.add('sacudir');
    setTimeout(() => el.classList.remove('sacudir'), 420);
  }

  /* ---------- Ficha que recorre el grafo ---------- */
  function crearFicha(padre) {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'ficha');
    g.innerHTML = '<circle class="halo" r="15"/><circle class="cuerpo-f" r="11"/><path d="M-4 -3.5h8M-4 0h8M-4 3.5h5"/>';
    padre.appendChild(g);
    return g;
  }
  function ponerFicha(ficha, p) { ficha.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`); }

  /** Mueve la ficha a lo largo de un <path> (de su inicio a su fin). */
  function moverPorCamino(ficha, camino, ms) {
    return new Promise(res => {
      const L = camino.getTotalLength();
      if (reducido() || !L) { ponerFicha(ficha, camino.getPointAtLength(L)); return res(); }
      const t0 = performance.now();
      (function paso(t) {
        const k = Math.min(1, (t - t0) / ms);
        ponerFicha(ficha, camino.getPointAtLength(L * easeInOut(k)));
        if (k < 1) requestAnimationFrame(paso); else res();
      })(t0);
    });
  }

  /** Mueve la ficha en línea recta entre dos puntos. */
  function moverRecto(ficha, a, b, ms) {
    return new Promise(res => {
      if (reducido()) { ponerFicha(ficha, b); return res(); }
      const t0 = performance.now();
      (function paso(t) {
        const k = easeInOut(Math.min(1, (t - t0) / ms));
        ponerFicha(ficha, { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
        if (k < 1 || (t - t0) < ms) requestAnimationFrame(paso); else res();
      })(t0);
    });
  }

  /* ---------- Tema claro/oscuro con revelado circular ---------- */
  function cambiarTema(boton, aplicar) {
    const r = boton.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const radio = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    if (!document.startViewTransition || reducido()) { aplicar(); return; }
    const raiz = document.documentElement;
    raiz.classList.add('tema-cambiando');
    const vt = document.startViewTransition(aplicar);
    vt.ready.then(() => {
      raiz.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radio}px at ${x}px ${y}px)`] },
        { duration: 520, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', pseudoElement: '::view-transition-new(root)' });
    }).catch(() => {});
    vt.finished.finally(() => raiz.classList.remove('tema-cambiando'));
  }

  /* ---------- Textos ---------- */
  function iniciales(nombre) {
    const p = String(nombre || '?').replace(/^(Lic|Ing|Mtra?|Dr|Dra|Licda)\.\s*/i, '').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }

  function haceCuanto(iso) {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'hace un momento';
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    const d = Math.round(s / 86400);
    return d === 1 ? 'ayer' : `hace ${d} d`;
  }

  function duracion(ms) {
    const h = ms / 3600e3;
    if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
    if (h < 48) return `${h < 10 ? h.toFixed(1) : Math.round(h)} h`;
    return `${(h / 24).toFixed(1)} d`;
  }

  function saludo(d = new Date()) {
    const h = d.getHours();
    return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  }

  return { reducido, espera, toast, contar, volar, sacudir, crearFicha, ponerFicha, moverPorCamino, moverRecto,
           cambiarTema, iniciales, haceCuanto, duracion, saludo, easeOut, easeInOut };
})();
