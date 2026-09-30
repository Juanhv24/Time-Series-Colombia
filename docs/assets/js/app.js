// Tablero de la TRM: pronóstico con bandas, calculadora de probabilidad, volatilidad y evaluación.
import {
  base, ejeCategoria, ejeValor, fechaLarga, filaTooltip, fmt, grafico, kpis, leyenda, mesCorto, mesLargo,
  redimensionar, tabla, tokens, vistaTabla,
} from './util.js';

let D = null;
const estado = { periodo: 36, constante: false, sentido: 'supere', umbral: 3500, mes: 0 };

// ---------------------------------------------------------------------------
// Probabilidades a partir de los cuantiles de las trayectorias simuladas
// ---------------------------------------------------------------------------

// Proporción de escenarios en que el promedio mensual queda por debajo del umbral (interpolación lineal).
function probabilidadDebajo(umbral, iMes) {
  const q = D.pronostico.cuantiles[iMes];
  const p = D.pronostico.probabilidades;
  if (umbral <= q[0]) return 0;
  if (umbral >= q[q.length - 1]) return 1;
  let i = 0;
  while (q[i + 1] < umbral) i++;
  const tramo = q[i + 1] - q[i];
  return tramo > 0 ? p[i] + (p[i + 1] - p[i]) * (umbral - q[i]) / tramo : p[i];
}

function probabilidad(umbral, iMes, sentido) {
  const debajo = probabilidadDebajo(umbral, iMes);
  return sentido === 'supere' ? 1 - debajo : debajo;
}

// Las colas se reportan como "< 1 %" o "> 99 %": los cuantiles cubren del 0.25 % al 99.75 %.
function textoProbabilidad(p) {
  if (p < 0.01) return '< 1 %';
  if (p > 0.99) return '> 99 %';
  return fmt.pct(p * 100, 0);
}

function deCadaCien(p) {
  if (p < 0.01) return 'En menos de 1 de cada 100 escenarios simulados';
  if (p > 0.99) return 'En más de 99 de cada 100 escenarios simulados';
  return `En ${Math.round(p * 100)} de cada 100 escenarios simulados`;
}

// ---------------------------------------------------------------------------
// Encabezado, indicadores y tablas
// ---------------------------------------------------------------------------

function textos() {
  const d = D.datos;
  const poner = (sel, texto) => document.querySelectorAll(sel).forEach((el) => { el.textContent = texto; });
  poner('[data-meses]', fmt.entero(d.meses));
  poner('[data-fin-diaria]', fechaLarga(d.fin_diaria));
  poner('[data-ultimo-mes]', mesLargo(d.ultimo_mes));
  poner('[data-ultimo-mes-texto]', mesLargo(d.ultimo_mes));
  poner('[data-primer-mes]', mesLargo(d.primer_mes));
  poner('[data-simulaciones]', fmt.entero(D.modelo.simulaciones));
  poner('[data-fin-estimacion]', mesLargo(D.evaluacion.fin_estimacion));
  poner('[data-generado]', fechaLarga(D.generado));
}

function indicadores() {
  const d = D.datos;
  const p = D.pronostico;
  const ultimo = p.fecha.length - 1;
  const m = D.modelo;
  const cal95 = D.evaluacion.calibracion.find((c) => c.nivel === 0.95);
  kpis(document.getElementById('kpis'), [
    {
      etiqueta: `Promedio de ${mesLargo(d.ultimo_mes)}`,
      valor: fmt.cop2(d.ultimo_mes_valor),
      nota: `Último mes completo. TRM del ${fechaLarga(d.fin_diaria)}: ${fmt.cop2(d.ultima_diaria)}`,
    },
    {
      etiqueta: `Pronóstico central, ${mesLargo(p.fecha[ultimo])}`,
      valor: fmt.cop2(p.central[ultimo]),
      nota: `Banda del 95 %: ${fmt.cop(p.bandas['95'].inf[ultimo])} a ${fmt.cop(p.bandas['95'].sup[ultimo])}`,
    },
    {
      etiqueta: 'Volatilidad mensual actual',
      valor: fmt.pct(m.volatilidad_actual, 2),
      nota: `${fmt.dec2(m.volatilidad_actual / m.sigma_constante)} veces la volatilidad constante del ARIMA (${fmt.pct(m.sigma_constante, 2)})`,
    },
    {
      etiqueta: 'Meses fuera de la banda del 95 %',
      valor: fmt.pct(cal95.fuera_garch * 100, 1),
      nota: `En 120 pronósticos a un paso: ${fmt.pct(cal95.esperado * 100, 0)} esperado y ${fmt.pct(cal95.fuera_constante * 100, 1)} con varianza constante`,
    },
  ]);
}

function tablasEvaluacion() {
  const ev = D.evaluacion;
  tabla(document.getElementById('tabla-metricas'), [
    { titulo: 'Modelo', valor: 'modelo' },
    { titulo: 'MAE', valor: 'MAE', num: true, fmt: fmt.dec2 },
    { titulo: 'RMSE', valor: 'RMSE', num: true, fmt: fmt.dec2 },
    { titulo: 'MAPE', valor: 'MAPE (%)', num: true, fmt: (v) => fmt.pct(v, 2) },
  ], ev.metricas);
  document.getElementById('nota-dm').textContent = `Errores en pesos por dólar entre ${mesLargo(ev.un_paso.fecha[0])} y `
    + `${mesLargo(ev.un_paso.fecha.at(-1))}. La prueba de Diebold-Mariano no rechaza que ambos sean igual de precisos `
    + `(p = ${fmt.dec2(ev.diebold_mariano.absoluta)} con pérdida absoluta y ${fmt.dec2(ev.diebold_mariano.cuadratica)} con pérdida cuadrática).`;
  tabla(document.getElementById('tabla-calibracion'), [
    { titulo: 'Banda', valor: (f) => fmt.pct(f.nivel * 100, 0) },
    { titulo: 'Esperado', valor: (f) => fmt.pct(f.esperado * 100, 1), num: true },
    { titulo: 'Varianza constante', valor: (f) => fmt.pct(f.fuera_constante * 100, 1), num: true },
    { titulo: 'GARCH-t', valor: (f) => fmt.pct(f.fuera_garch * 100, 1), num: true },
  ], ev.calibracion);
}

// ---------------------------------------------------------------------------
// Gráfico 1: pronóstico con bandas
// ---------------------------------------------------------------------------

// Una banda se dibuja como dos series apiladas: el límite inferior invisible y el ancho con relleno.
function banda(nombre, pila, inf, sup, color) {
  return [
    { name: `${nombre}-base`, type: 'line', stack: pila, data: inf, symbol: 'none', lineStyle: { opacity: 0 }, silent: true, z: 1 },
    {
      name: nombre, type: 'line', stack: pila, symbol: 'none', silent: true, z: 1,
      data: inf.map((v, i) => (v == null || sup[i] == null ? null : +(sup[i] - v).toFixed(2))),
      lineStyle: { opacity: 0 }, areaStyle: { color, opacity: 1 },
    },
  ];
}

function renderPronostico() {
  const t = tokens();
  const tarjeta = document.querySelector('[data-grafico="pronostico"]');
  const h = D.historia;
  const p = D.pronostico;
  const desde = estado.periodo ? Math.max(0, h.fecha.length - estado.periodo) : 0;
  const fechasHist = h.fecha.slice(desde);
  const valoresHist = h.trm.slice(desde);
  const n = fechasHist.length;
  const fechas = [...fechasHist, ...p.fecha];
  const ultimoObs = valoresHist.at(-1);

  // Las series del pronóstico arrancan en el último mes observado para que no quede un salto.
  const futuro = (valores) => [...Array(n - 1).fill(null), ultimoObs, ...valores];
  const historia = [...valoresHist, ...Array(p.fecha.length).fill(null)];
  const central = futuro(p.central);

  const series = [
    ...banda('Banda 95 %', 'b95', futuro(p.bandas['95'].inf), futuro(p.bandas['95'].sup), t.banda95),
    ...banda('Banda 80 %', 'b80', futuro(p.bandas['80'].inf), futuro(p.bandas['80'].sup), t.banda80),
    ...banda('Banda 50 %', 'b50', futuro(p.bandas['50'].inf), futuro(p.bandas['50'].sup), t.banda50),
    {
      name: 'TRM observada', type: 'line', data: historia, symbol: 'none', z: 3,
      lineStyle: { color: t.historia, width: 2 }, itemStyle: { color: t.historia },
      markLine: {
        silent: true, symbol: 'none', lineStyle: { color: t.lineaBase, width: 1, type: 'solid' },
        label: { formatter: 'Pronóstico', position: 'insideEndTop', color: t.eje, fontSize: 11, fontFamily: t.fuente },
        data: [{ xAxis: fechasHist.at(-1) }],
      },
    },
    {
      name: 'Pronóstico central', type: 'line', data: central, z: 4, showSymbol: false,
      lineStyle: { color: t.central, width: 2 }, itemStyle: { color: t.central },
      endLabel: {
        show: true, formatter: (d) => fmt.cop(d.value), color: t.tinta, fontSize: 12, fontWeight: 600,
        fontFamily: t.fuente, distance: 6,
      },
    },
  ];
  if (estado.constante) {
    for (const [clave, nombre] of [['inf', 'IC 95 % varianza constante'], ['sup', 'IC 95 % varianza constante (sup)']]) {
      series.push({
        name: nombre, type: 'line', data: futuro(p.constante95[clave]), symbol: 'none', z: 3, silent: true,
        lineStyle: { color: t.eje, width: 1.5 },
      });
    }
  }

  const leyendaItems = [
    { etiqueta: 'TRM observada', color: t.historia, forma: 'linea' },
    { etiqueta: 'Pronóstico central', color: t.central, forma: 'linea' },
    { etiqueta: 'Banda 50 %', color: t.banda50 },
    { etiqueta: 'Banda 80 %', color: t.banda80 },
    { etiqueta: 'Banda 95 %', color: t.banda95 },
  ];
  if (estado.constante) leyendaItems.push({ etiqueta: 'IC 95 % con varianza constante', color: t.eje, forma: 'linea' });
  leyenda(tarjeta.querySelector('[data-leyenda]'), leyendaItems);

  const g = grafico(tarjeta);
  g.setOption({
    ...base(t),
    grid: { left: 8, right: 64, top: 24, bottom: 8, containLabel: true },
    tooltip: {
      ...base(t).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: t.lineaBase } },
      formatter: (params) => {
        const i = params[0].dataIndex;
        const f = fechas[i];
        let html = `<div style="margin-bottom:4px;font-weight:600">${mesLargo(f)}</div>`;
        if (i < n) html += filaTooltip(t.historia, 'TRM observada', fmt.cop2(historia[i]));
        if (i >= n) {
          const k = i - n;
          html += filaTooltip(t.central, 'Pronóstico central', fmt.cop2(p.central[k]));
          for (const [nivel, color] of [['50', t.banda50], ['80', t.banda80], ['95', t.banda95]]) {
            html += filaTooltip(color, `Banda ${nivel} %`, `${fmt.cop(p.bandas[nivel].inf[k])} a ${fmt.cop(p.bandas[nivel].sup[k])}`, 'bloque');
          }
          if (estado.constante) {
            html += filaTooltip(t.eje, 'IC 95 % var. constante', `${fmt.cop(p.constante95.inf[k])} a ${fmt.cop(p.constante95.sup[k])}`);
          }
        }
        return html;
      },
    },
    xAxis: ejeCategoria(t, fechas, {
      axisLabel: estado.periodo === 36
        ? { formatter: (f) => mesCorto(f) }
        : { formatter: (f) => f.slice(0, 4), interval: (i, f) => f.endsWith('-01') && (estado.periodo !== 0 || +f.slice(0, 4) % 2 === 0) },
    }),
    yAxis: ejeValor(t, { scale: true, axisLabel: { formatter: (v) => fmt.entero(v) } }),
    series,
  }, true);

  vistaTabla(tarjeta, [
    { titulo: 'Mes', valor: (f) => mesLargo(f.fecha) },
    { titulo: 'Pronóstico central', valor: 'central', num: true, fmt: fmt.cop2 },
    { titulo: 'Banda 50 %', valor: (f) => `${fmt.cop(f.inf50)} a ${fmt.cop(f.sup50)}`, num: true },
    { titulo: 'Banda 80 %', valor: (f) => `${fmt.cop(f.inf80)} a ${fmt.cop(f.sup80)}`, num: true },
    { titulo: 'Banda 95 %', valor: (f) => `${fmt.cop(f.inf95)} a ${fmt.cop(f.sup95)}`, num: true },
    { titulo: 'IC 95 % var. constante', valor: (f) => `${fmt.cop(f.infc)} a ${fmt.cop(f.supc)}`, num: true },
  ], p.fecha.map((f, k) => ({
    fecha: f, central: p.central[k],
    inf50: p.bandas['50'].inf[k], sup50: p.bandas['50'].sup[k],
    inf80: p.bandas['80'].inf[k], sup80: p.bandas['80'].sup[k],
    inf95: p.bandas['95'].inf[k], sup95: p.bandas['95'].sup[k],
    infc: p.constante95.inf[k], supc: p.constante95.sup[k],
  })));
}

// ---------------------------------------------------------------------------
// Calculadora y gráfico de probabilidad por mes
// ---------------------------------------------------------------------------

function renderCalculadora() {
  const t = tokens();
  const p = D.pronostico;
  const valido = Number.isFinite(estado.umbral) && estado.umbral >= 1000 && estado.umbral <= 10000;
  const salidaP = document.getElementById('calc-probabilidad');
  const frase = document.getElementById('calc-frase');
  const contexto = document.getElementById('calc-contexto');
  const tarjeta = document.querySelector('[data-grafico="probabilidad"]');
  const verbo = estado.sentido === 'supere' ? 'supera' : 'queda por debajo de';

  if (!valido) {
    salidaP.textContent = '—';
    frase.textContent = 'Ingresa una tasa de referencia entre 1.000 y 10.000 pesos por dólar.';
    contexto.textContent = '';
    grafico(tarjeta).clear();
    return;
  }

  const k = estado.mes;
  const prob = probabilidad(estado.umbral, k, estado.sentido);
  salidaP.textContent = textoProbabilidad(prob);
  frase.textContent = `${deCadaCien(prob)}, el promedio mensual de la TRM de ${mesLargo(p.fecha[k])} ${verbo} ${fmt.cop(estado.umbral)}.`;
  contexto.textContent = `Pronóstico central para ese mes: ${fmt.cop2(p.central[k])} · banda del 95 %: `
    + `${fmt.cop(p.bandas['95'].inf[k])} a ${fmt.cop(p.bandas['95'].sup[k])}.`;

  const probs = p.fecha.map((_, i) => probabilidad(estado.umbral, i, estado.sentido));
  const g = grafico(tarjeta);
  g.setOption({
    ...base(t),
    grid: { left: 8, right: 8, top: 28, bottom: 8, containLabel: true },
    tooltip: {
      ...base(t).tooltip,
      trigger: 'item',
      formatter: (d) => `<div style="margin-bottom:4px;font-weight:600">${mesLargo(p.fecha[d.dataIndex])}</div>`
        + filaTooltip(null, `Probabilidad de que ${verbo} ${fmt.cop(estado.umbral)}`, textoProbabilidad(probs[d.dataIndex])),
    },
    xAxis: ejeCategoria(t, p.fecha, { boundaryGap: true, axisLabel: { formatter: (f) => mesCorto(f).replace(' 20', ' ') } }),
    yAxis: ejeValor(t, { min: 0, max: 100, interval: 25, axisLabel: { formatter: (v) => `${v} %` } }),
    series: [{
      type: 'bar',
      barMaxWidth: 24,
      cursor: 'pointer',
      data: probs.map((v, i) => ({
        value: +(v * 100).toFixed(2),
        itemStyle: { color: i === k ? t.serie1 : t.atenuado, borderRadius: [4, 4, 0, 0] },
        label: {
          show: i === k, position: 'top', formatter: () => textoProbabilidad(v),
          color: t.tinta, fontWeight: 600, fontSize: 12, fontFamily: t.fuente,
        },
      })),
    }],
  }, true);
  g.off('click');
  g.on('click', (d) => {
    estado.mes = d.dataIndex;
    document.getElementById('mes').value = String(d.dataIndex);
    renderCalculadora();
  });

  vistaTabla(tarjeta, [
    { titulo: 'Mes', valor: (f) => mesLargo(f.fecha) },
    { titulo: `Probabilidad de que ${verbo} ${fmt.cop(estado.umbral)}`, valor: (f) => textoProbabilidad(f.p), num: true },
  ], p.fecha.map((f, i) => ({ fecha: f, p: probs[i] })));
}

function configurarCalculadora() {
  const p = D.pronostico;
  const selector = document.getElementById('mes');
  selector.replaceChildren(...p.fecha.map((f, i) => new Option(mesLargo(f), String(i))));
  // Por defecto, el cierre del año en curso (o el último mes del horizonte)
  const diciembre = p.fecha.findIndex((f) => f.endsWith('-12'));
  estado.mes = diciembre >= 0 ? diciembre : p.fecha.length - 1;
  selector.value = String(estado.mes);

  const form = document.getElementById('calculadora');
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', () => {
    estado.sentido = form.elements.sentido.value;
    estado.umbral = parseFloat(document.getElementById('umbral').value);
    estado.mes = +selector.value;
    renderCalculadora();
  });
}

// ---------------------------------------------------------------------------
// Gráfico 3: volatilidad condicional
// ---------------------------------------------------------------------------

function renderVolatilidad() {
  const t = tokens();
  const tarjeta = document.querySelector('[data-grafico="volatilidad"]');
  const h = D.historia;
  const sigma = D.modelo.sigma_constante;
  leyenda(tarjeta.querySelector('[data-leyenda]'), [
    { etiqueta: 'Volatilidad condicional (GARCH)', color: t.serie1, forma: 'linea' },
    { etiqueta: `Volatilidad constante del ARIMA (${fmt.pct(sigma, 2)})`, color: t.eje, forma: 'linea' },
  ]);
  const g = grafico(tarjeta);
  g.setOption({
    ...base(t),
    grid: { left: 8, right: 60, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      ...base(t).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: t.lineaBase } },
      formatter: (params) => {
        const i = params[0].dataIndex;
        return `<div style="margin-bottom:4px;font-weight:600">${mesLargo(h.fecha[i])}</div>`
          + filaTooltip(t.serie1, 'Volatilidad condicional', fmt.pct(h.volatilidad[i], 2))
          + filaTooltip(t.eje, 'Volatilidad constante', fmt.pct(sigma, 2));
      },
    },
    xAxis: ejeCategoria(t, h.fecha, { axisLabel: { formatter: (f) => f.slice(0, 4), interval: (i, f) => f.endsWith('-01') } }),
    yAxis: ejeValor(t, { min: 0, axisLabel: { formatter: (v) => `${fmt.entero(v)} %` } }),
    series: [
      {
        name: 'Volatilidad condicional', type: 'line', data: h.volatilidad, showSymbol: false, connectNulls: false,
        lineStyle: { color: t.serie1, width: 2 }, itemStyle: { color: t.serie1 },
        endLabel: { show: true, formatter: (d) => fmt.pct(d.value, 2), color: t.tinta, fontSize: 12, fontWeight: 600, fontFamily: t.fuente },
      },
      {
        name: 'Volatilidad constante', type: 'line', data: h.fecha.map(() => sigma), symbol: 'none', silent: true,
        lineStyle: { color: t.eje, width: 1.5 },
      },
    ],
  }, true);
  vistaTabla(tarjeta, [
    { titulo: 'Mes', valor: (f) => mesLargo(f.fecha) },
    { titulo: 'Volatilidad condicional (% mensual)', valor: 'v', num: true, fmt: (v) => fmt.dec2(v) },
  ], h.fecha.map((f, i) => ({ fecha: f, v: h.volatilidad[i] })).filter((f) => f.v != null).reverse());
}

// ---------------------------------------------------------------------------
// Gráfico 4: confiabilidad (pronósticos a un paso)
// ---------------------------------------------------------------------------

function renderConfiabilidad() {
  const t = tokens();
  const tarjeta = document.querySelector('[data-grafico="confiabilidad"]');
  const u = D.evaluacion.un_paso;
  const fuera = u.real.map((v, i) => v < u.inf_garch[i] || v > u.sup_garch[i]);
  leyenda(tarjeta.querySelector('[data-leyenda]'), [
    { etiqueta: 'TRM observada', color: t.historia, forma: 'linea' },
    { etiqueta: 'Pronóstico a un paso', color: t.serie1, forma: 'linea' },
    { etiqueta: 'Banda del 95 % (GARCH)', color: t.banda95 },
    { etiqueta: `Fuera de la banda (${fuera.filter(Boolean).length} de ${fuera.length})`, color: t.critico, forma: 'punto' },
  ]);
  const g = grafico(tarjeta);
  g.setOption({
    ...base(t),
    tooltip: {
      ...base(t).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: t.lineaBase } },
      formatter: (params) => {
        const i = params[0].dataIndex;
        return `<div style="margin-bottom:4px;font-weight:600">${mesLargo(u.fecha[i])}</div>`
          + filaTooltip(t.historia, 'TRM observada', fmt.cop2(u.real[i]))
          + filaTooltip(t.serie1, 'Pronóstico a un paso', fmt.cop2(u.arima[i]))
          + filaTooltip(t.banda95, 'Banda del 95 %', `${fmt.cop(u.inf_garch[i])} a ${fmt.cop(u.sup_garch[i])}`, 'bloque')
          + (fuera[i] ? `<div style="margin-top:4px;color:${t.critico};font-weight:600">Fuera de la banda</div>` : '');
      },
    },
    xAxis: ejeCategoria(t, u.fecha, { axisLabel: { formatter: (f) => f.slice(0, 4), interval: (i, f) => f.endsWith('-01') } }),
    yAxis: ejeValor(t, { scale: true, axisLabel: { formatter: (v) => fmt.entero(v) } }),
    series: [
      ...banda('Banda del 95 %', 'b95', u.inf_garch, u.sup_garch, t.banda95),
      { name: 'Pronóstico a un paso', type: 'line', data: u.arima, symbol: 'none', z: 3, lineStyle: { color: t.serie1, width: 1.5 } },
      { name: 'TRM observada', type: 'line', data: u.real, symbol: 'none', z: 4, lineStyle: { color: t.historia, width: 2 } },
      {
        name: 'Fuera de la banda', type: 'scatter', z: 5, symbolSize: 9,
        data: u.real.map((v, i) => (fuera[i] ? v : null)),
        itemStyle: { color: t.critico, borderColor: t.superficie, borderWidth: 2 },
      },
    ],
  }, true);
  vistaTabla(tarjeta, [
    { titulo: 'Mes', valor: (f) => mesLargo(f.fecha) },
    { titulo: 'TRM observada', valor: 'real', num: true, fmt: fmt.cop2 },
    { titulo: 'Pronóstico a un paso', valor: 'arima', num: true, fmt: fmt.cop2 },
    { titulo: 'Banda del 95 %', valor: (f) => `${fmt.cop(f.inf)} a ${fmt.cop(f.sup)}`, num: true },
    { titulo: 'Dentro de la banda', valor: (f) => (f.fuera ? 'No' : 'Sí') },
  ], u.fecha.map((f, i) => ({ fecha: f, real: u.real[i], arima: u.arima[i], inf: u.inf_garch[i], sup: u.sup_garch[i], fuera: fuera[i] })).reverse());
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

function renderGraficos() {
  renderPronostico();
  renderCalculadora();
  renderVolatilidad();
  renderConfiabilidad();
}

async function iniciar() {
  const aviso = document.getElementById('estado');
  try {
    const respuesta = await fetch('data/tablero.json');
    if (!respuesta.ok) throw new Error(`tablero.json: ${respuesta.status}`);
    D = await respuesta.json();
    textos();
    indicadores();
    tablasEvaluacion();
    configurarCalculadora();

    document.getElementById('filtro-periodo').addEventListener('change', (e) => {
      estado.periodo = +e.target.value;
      renderPronostico();
    });
    document.getElementById('mostrar-constante').addEventListener('change', (e) => {
      estado.constante = e.target.checked;
      renderPronostico();
    });

    renderGraficos();
    aviso.textContent = '';
    window.addEventListener('resize', redimensionar);
    // Los colores del gráfico vienen de los tokens CSS: al cambiar el tema del sistema se vuelven a dibujar
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderGraficos);
  } catch (error) {
    aviso.classList.add('error');
    aviso.textContent = `No fue posible cargar los datos (${error.message}). El tablero debe abrirse desde un servidor web, por ejemplo con uv run python -m http.server -d docs.`;
    console.error(error);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
else iniciar();
