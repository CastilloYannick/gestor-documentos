/*
 * ============================================================
 *  TABLERO (KANBAN) CONTROLADO POR EL AUTÓMATA
 *  Una columna por estado. Al arrastrar un documento solo se
 *  iluminan las columnas a las que δ permite llegar desde su
 *  estado actual; las demás se apagan. Soltar en una columna
 *  válida aplica la transición; soltar en otra la rechaza.
 *  Alternativa sin arrastre: los botones de acción de cada tarjeta.
 * ============================================================
 */
const Tablero = (function () {
  'use strict';

  /** Estados en orden de etapas (distancia desde q0). */
  const orden = afd => afd.etapas.flat();

  /** Destinos posibles de un documento: { q: [símbolos] } */
  function destinos(afd, estado) {
    const d = {};
    afd.simbolosValidos(estado).forEach(s => { const a = afd.transicion(estado, s); (d[a] = d[a] || []).push(s); });
    return d;
  }

  function tarjeta(afd, d, k, h) {
    const acc = afd.simbolosValidos(d.estado).map(s => {
      const a = afd.transicion(d.estado, s);
      return `<button type="button" class="kb-accion" data-kb-accion="${h.esc(s)}" data-id="${d.id}" style="${h.cv(afd, a)}" title="δ(${d.estado}, ${h.esc(s)}) = ${a}">${h.esc(afd.etiquetas[s])}</button>`;
    }).join('');
    const ultima = d.historial[d.historial.length - 1];
    return `<article class="kb-tarjeta" tabindex="0" data-id="${d.id}" style="--k:${k};${h.cv(afd, d.estado)}"
        aria-label="${d.id}, ${h.esc(d.titulo)}, en ${h.esc(afd.nombres[d.estado])}. Enter para abrir.">
      <div class="kb-fila"><span class="kb-id">${d.id}</span>${d.prioridad === 'Alta' ? '<span class="prio Alta">Alta</span>' : ''}${d.archivo ? h.icono('clip') : ''}</div>
      <b class="kb-tit">${h.esc(d.titulo)}</b>
      <div class="kb-meta"><span class="ini" aria-hidden="true">${h.esc(Efectos.iniciales(d.responsable))}</span><span>${h.esc(d.responsable)}</span>
        <span class="kb-tiempo" title="Último cambio">${Efectos.haceCuanto(ultima.fecha)}</span></div>
      ${acc ? `<div class="kb-acciones">${acc}</div>` : ''}
    </article>`;
  }

  function vista(afd, h) {
    const flujos = Flujos.todos('documentos');
    const docs = Administrador.todos(afd.id);
    let k = 0;
    const columnas = orden(afd).map(q => {
      const enCol = docs.filter(d => d.estado === q);
      const marca = [q === afd.inicial ? 'inicio' : '', afd.esFinal(q) ? 'final' : ''].filter(Boolean).join(' · ');
      return `<section class="kb-col" data-q="${q}" style="${h.cv(afd, q)}" aria-label="${h.esc(afd.nombres[q])}, ${enCol.length} documentos">
        <header class="kb-cab"><span class="pt" aria-hidden="true"></span><b>${h.esc(afd.nombres[q])}</b><span class="kb-marca">${q}${marca ? ' · ' + marca : ''}</span><span class="n">${enCol.length}</span></header>
        <p class="kb-simbolo" aria-hidden="true"></p>
        <div class="kb-lista">${enCol.map(d => tarjeta(afd, d, k++, h)).join('') || '<p class="kb-vacia">Sin documentos en este estado</p>'}</div>
      </section>`;
    }).join('');
    return `
      <div class="vista-tit">
        <div><h1>Tablero</h1>
          <p class="lead">Arrastra un documento a otra columna. Solo podrás soltarlo donde el autómata <b>${h.esc(afd.codigo)}</b> tiene una transición definida desde su estado actual.</p></div>
        <div class="head-acc">
          ${flujos.length > 1 ? `<div class="seg" role="group" aria-label="Flujo">${flujos.map(f => `<button type="button" class="${f.id === afd.id ? 'on' : ''}" data-kb-flujo="${f.id}" aria-pressed="${f.id === afd.id}">${h.esc(f.codigo)}</button>`).join('')}</div>` : ''}
          <button type="button" class="btn sm" data-ir="registrar">${h.icono('plus')} Nuevo documento</button>
        </div>
      </div>
      <div class="kb" id="kb" data-flujo="${afd.id}">${columnas}</div>
      <p class="hint">${h.esc(afd.nombre)} · ${docs.length} documentos. También puedes usar los botones de cada tarjeta, o abrirla con Enter.</p>`;
  }

  /* ---------- Arrastre con puntero (mouse, lápiz y dedo) ---------- */
  let desmontar = null; // oyentes globales del tablero anterior

  function montar(kb, afd, h) {
    if (desmontar) { desmontar(); desmontar = null; }
    if (!kb) return;
    let g = null; // gesto en curso

    kb.addEventListener('pointerdown', ev => {
      if (ev.button !== 0) return;
      const card = ev.target.closest('.kb-tarjeta');
      if (!card || ev.target.closest('button')) return;
      g = { card, id: card.dataset.id, x0: ev.clientX, y0: ev.clientY, arrastrando: false };
    });

    const mover = ev => {
      if (!g) return;
      if (!g.arrastrando) {
        if (Math.hypot(ev.clientX - g.x0, ev.clientY - g.y0) < 6) return;
        iniciar(ev);
      }
      g.x = ev.clientX; g.y = ev.clientY;
      g.fantasma.style.transform = `translate(${g.x - g.dx}px, ${g.y - g.dy}px) rotate(2deg) scale(1.03)`;
      const bajo = document.elementFromPoint(g.x, g.y);
      const col = bajo && bajo.closest && bajo.closest('.kb-col');
      kb.querySelectorAll('.kb-col.encima').forEach(c => c !== col && c.classList.remove('encima'));
      if (col && col.classList.contains('valida')) col.classList.add('encima');
      // Desplazamiento automático cerca de los bordes del tablero
      const r = kb.getBoundingClientRect();
      if (g.x > r.right - 60) kb.scrollLeft += 14; else if (g.x < r.left + 60) kb.scrollLeft -= 14;
      ev.preventDefault();
    };

    function iniciar(ev) {
      const r = g.card.getBoundingClientRect();
      g.arrastrando = true; g.origen = g.card.getBoundingClientRect();
      g.dx = ev.clientX - r.left; g.dy = ev.clientY - r.top;
      g.fantasma = g.card.cloneNode(true);
      g.fantasma.classList.add('kb-fantasma');
      g.fantasma.removeAttribute('tabindex');
      g.fantasma.style.width = r.width + 'px';
      g.fantasma.style.transform = `translate(${r.left}px, ${r.top}px)`;
      document.body.appendChild(g.fantasma);
      g.card.classList.add('hueco');
      const doc = Administrador.obtener(g.id);
      g.estado = doc.estado;
      g.destinos = destinos(afd, doc.estado);
      kb.classList.add('arrastrando');
      kb.querySelectorAll('.kb-col').forEach(c => {
        const q = c.dataset.q, s = g.destinos[q];
        c.classList.toggle('origen', q === doc.estado);
        c.classList.toggle('valida', !!s);
        c.classList.toggle('invalida', !s && q !== doc.estado);
        c.querySelector('.kb-simbolo').textContent = s ? `Soltar aquí: δ(${doc.estado}, ${s.join(' | ')}) = ${q}` : '';
      });
      document.body.style.cursor = 'grabbing';
    }

    async function terminar(ev) {
      if (!g) return;
      const gesto = g; g = null;
      if (!gesto.arrastrando) return;
      document.body.style.cursor = '';
      const bajo = ev ? document.elementFromPoint(ev.clientX, ev.clientY) : null;
      const col = bajo && bajo.closest && bajo.closest('.kb-col');
      const limpiar = () => {
        kb.classList.remove('arrastrando');
        kb.querySelectorAll('.kb-col').forEach(c => c.classList.remove('valida', 'invalida', 'origen', 'encima'));
      };
      kb._ignorarClic = true; setTimeout(() => (kb._ignorarClic = false), 0);

      if (col && gesto.destinos[col.dataset.q]) {
        // Válido: se aplica δ, se redibuja y el fantasma vuela a su nuevo lugar
        const simbolo = gesto.destinos[col.dataset.q][0];
        limpiar();
        const nuevo = h.soltar(gesto.id, simbolo); // redibuja el tablero
        const destino = nuevo && document.querySelector(`.kb-tarjeta[data-id="${gesto.id}"]`);
        if (destino) {
          destino.style.visibility = 'hidden';
          await Efectos.volar(gesto.fantasma, destino.getBoundingClientRect(), 300);
          destino.style.visibility = '';
          destino.classList.add('llego');
        }
        gesto.fantasma.remove();
        return;
      }
      // No válido (u otra parte): la tarjeta regresa
      limpiar();
      await Efectos.volar(gesto.fantasma, gesto.origen, 260);
      gesto.fantasma.remove();
      gesto.card.classList.remove('hueco');
      if (col && col.dataset.q !== gesto.estado) {
        Efectos.sacudir(gesto.card);
        h.rechazar(gesto.id, col.dataset.q);
      }
    }

    const cancelar = () => terminar(null);
    document.addEventListener('pointermove', mover, { passive: false });
    document.addEventListener('pointerup', terminar);
    document.addEventListener('pointercancel', cancelar);
    desmontar = () => {
      document.removeEventListener('pointermove', mover);
      document.removeEventListener('pointerup', terminar);
      document.removeEventListener('pointercancel', cancelar);
      if (g && g.fantasma) g.fantasma.remove();
      g = null;
    };
  }

  return { vista, montar, destinos };
})();
