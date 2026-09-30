// Utilidades compartidas: formato colombiano, tokens de color, ejes, tablas y leyendas.

const nf0 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const vacio = (v) => v == null || Number.isNaN(v);

export const fmt = {
  entero: (v) => (vacio(v) ? '—' : nf0.format(v)),
  dec1: (v) => (vacio(v) ? '—' : nf1.format(v)),
  dec2: (v) => (vacio(v) ? '—' : nf2.format(v)),
  cop: (v) => (vacio(v) ? '—' : `$${nf0.format(v)}`),
  cop2: (v) => (vacio(v) ? '—' : `$${nf2.format(v)}`),
  pct: (v, d = 1) => (vacio(v) ? '—' : `${({ 0: nf0, 1: nf1, 2: nf2 })[d].format(v)} %`),
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];

// "2026-07" -> "jul 2026" y "julio de 2026"
export const mesCorto = (f) => `${MESES[+f.slice(5, 7) - 1].slice(0, 3)} ${f.slice(0, 4)}`;
export const mesLargo = (f) => `${MESES[+f.slice(5, 7) - 1]} de ${f.slice(0, 4)}`;
export const fechaLarga = (f) => `${+f.slice(8, 10)} de ${MESES[+f.slice(5, 7) - 1]} de ${f.slice(0, 4)}`;

// Lee los tokens CSS vigentes (cambian con el modo claro u oscuro).
export function tokens() {
  const s = getComputedStyle(document.documentElement);
  const v = (n) => s.getPropertyValue(n).trim();
  return {
    superficie: v('--superficie'),
    tinta: v('--tinta'),
    tinta2: v('--tinta-2'),
    eje: v('--eje'),
    reticula: v('--reticula'),
    lineaBase: v('--linea-base'),
    serie1: v('--serie-1'),
    atenuado: v('--atenuado'),
    critico: v('--critico'),
    banda95: v('--banda-95'),
    banda80: v('--banda-80'),
    banda50: v('--banda-50'),
    central: v('--central'),
    historia: v('--historia'),
    fuente: v('--fuente'),
  };
}

// Opciones comunes de ECharts: retícula tenue, ejes discretos y tooltip sobrio.
export function base(t) {
  return {
    animationDuration: 300,
    textStyle: { fontFamily: t.fuente, color: t.tinta2 },
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      backgroundColor: t.superficie,
      borderColor: t.reticula,
      borderWidth: 1,
      textStyle: { color: t.tinta, fontSize: 12, fontFamily: t.fuente },
      extraCssText: 'box-shadow:0 4px 14px rgba(0,0,0,.12);border-radius:8px;',
      confine: true,
    },
  };
}

// La fuente se declara en cada etiqueta de eje para que containLabel mida el texto
// con la misma fuente con la que se dibuja.
export function ejeValor(t, extra = {}) {
  const { axisLabel = {}, ...resto } = extra;
  return {
    type: 'value',
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: t.reticula, width: 1 } },
    ...resto,
    axisLabel: { color: t.eje, fontSize: 11, fontFamily: t.fuente, hideOverlap: true, ...axisLabel },
  };
}

export function ejeCategoria(t, datos, extra = {}) {
  const { axisLabel = {}, ...resto } = extra;
  return {
    type: 'category',
    data: datos,
    boundaryGap: false,
    axisLine: { lineStyle: { color: t.lineaBase } },
    axisTick: { show: false },
    ...resto,
    axisLabel: { color: t.eje, fontSize: 11, fontFamily: t.fuente, hideOverlap: true, ...axisLabel },
  };
}

export function escapar(texto) {
  return String(texto)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Fila de tooltip: etiqueta con su clave de color y valor destacado a la derecha.
export function filaTooltip(color, etiqueta, valor, forma = 'linea') {
  const estilos = { linea: 'width:12px;height:2px', bloque: 'width:10px;height:10px;border-radius:2px', punto: 'width:8px;height:8px;border-radius:50%' };
  const clave = color ? `<span style="display:inline-block;${estilos[forma]};background:${color};margin-right:6px;vertical-align:middle"></span>` : '';
  return `<div style="display:flex;justify-content:space-between;gap:16px;align-items:center">`
    + `<span style="opacity:.8">${clave}${escapar(etiqueta)}</span><strong>${escapar(valor)}</strong></div>`;
}

// Leyenda HTML: la identidad nunca depende solo del color, cada clave lleva su texto.
export function leyenda(contenedor, items) {
  contenedor.replaceChildren();
  for (const it of items) {
    const span = document.createElement('span');
    const i = document.createElement('i');
    i.className = it.forma || 'bloque';
    i.style.background = it.color;
    span.append(i, document.createTextNode(it.etiqueta));
    contenedor.appendChild(span);
  }
}

// Tabla HTML construida con textContent (los datos nunca se inyectan como HTML).
export function tabla(contenedor, columnas, filas) {
  contenedor.replaceChildren();
  const t = document.createElement('table');
  const thead = t.createTHead().insertRow();
  for (const c of columnas) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = c.titulo;
    if (c.num) th.className = 'num';
    thead.appendChild(th);
  }
  const tbody = t.createTBody();
  for (const f of filas) {
    const tr = tbody.insertRow();
    for (const c of columnas) {
      const td = tr.insertCell();
      const valor = typeof c.valor === 'function' ? c.valor(f) : f[c.valor];
      td.textContent = c.fmt ? c.fmt(valor) : (valor ?? '—');
      if (c.num) td.className = 'num';
    }
  }
  contenedor.appendChild(t);
}

// Registro de gráficos para redimensionarlos y volver a dibujarlos al cambiar el tema.
const graficos = new Map();

export function grafico(contenedor) {
  const lienzo = contenedor.querySelector('.lienzo');
  let instancia = graficos.get(lienzo);
  if (!instancia) {
    instancia = echarts.init(lienzo, null, { renderer: 'canvas' });
    graficos.set(lienzo, instancia);
  }
  return instancia;
}

export function redimensionar() {
  for (const g of graficos.values()) g.resize();
}

// Botón "Tabla" que alterna entre el gráfico y su versión tabular.
export function vistaTabla(tarjeta, columnas, filas) {
  const figcaption = tarjeta.querySelector('figcaption');
  let boton = figcaption.querySelector('.alternar-tabla');
  let envoltura = tarjeta.querySelector('.tabla-envoltura[data-vista-tabla]');
  const lienzo = tarjeta.querySelector('.lienzo');
  if (!boton) {
    boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'alternar-tabla';
    boton.textContent = 'Tabla';
    boton.setAttribute('aria-pressed', 'false');
    figcaption.appendChild(boton);
    envoltura = document.createElement('div');
    envoltura.className = 'tabla-envoltura';
    envoltura.dataset.vistaTabla = '';
    envoltura.hidden = true;
    lienzo.after(envoltura);
    boton.addEventListener('click', () => {
      const activo = boton.getAttribute('aria-pressed') !== 'true';
      boton.setAttribute('aria-pressed', String(activo));
      envoltura.hidden = !activo;
      lienzo.hidden = activo;
      if (!activo) redimensionar();
    });
  }
  tabla(envoltura, columnas, filas);
}

export function kpis(contenedor, items) {
  contenedor.replaceChildren();
  for (const it of items) {
    const div = document.createElement('div');
    div.className = 'kpi';
    const e = document.createElement('p'); e.className = 'etiqueta'; e.textContent = it.etiqueta;
    const v = document.createElement('p'); v.className = 'valor'; v.textContent = it.valor;
    div.append(e, v);
    if (it.nota) { const n = document.createElement('p'); n.className = 'nota'; n.textContent = it.nota; div.append(n); }
    contenedor.appendChild(div);
  }
}
