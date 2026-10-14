// ---------- Almacenamiento (solo en el dispositivo) ----------
const LS_GASTOS = 'gastos.v1';
const LS_AJUSTES = 'gastos.ajustes.v1';

const cargar = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
let gastos = cargar(LS_GASTOS, []);
let ajustes = cargar(LS_AJUSTES, { apiKey: '', modelo: 'gemini-flash-latest', dolar: '' });
const persistir = () => localStorage.setItem(LS_GASTOS, JSON.stringify(gastos));

const $ = id => document.getElementById(id);
const peso = n => '$' + Math.round(n).toLocaleString('es-AR');
const hoyISO = () => fechaISO(new Date());
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const parseFecha = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };

function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.id);
  toast.id = setTimeout(() => (t.hidden = true), 3000);
}

// ---------- Navegación ----------
document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + b.dataset.t));
  if (b.dataset.t === 'stats') renderStats();
  if (b.dataset.t === 'historial') renderHistorial();
  if (b.dataset.t === 'registrar') renderHoy();
  if (b.dataset.t === 'compra') renderCompra();
}));

// ---------- Dictado por voz ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

function configurarMic(boton, entrada, estado, alTerminar) {
  let rec = null, escuchando = false;
  boton.addEventListener('click', () => {
    if (!SR) { toast('Tu navegador no soporta dictado. Escribí el texto o usá Chrome.'); return; }
    if (escuchando) { rec.stop(); return; }
    rec = new SR();
    rec.lang = 'es-AR';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onstart = () => { escuchando = true; boton.classList.add('on'); estado.textContent = 'Escuchando…'; };
    rec.onresult = e => { entrada.value = Array.from(e.results).map(r => r[0].transcript).join(' '); };
    rec.onerror = e => { estado.textContent = e.error === 'not-allowed' ? 'Permiso de micrófono denegado.' : 'Error de dictado: ' + e.error; };
    rec.onend = () => {
      escuchando = false; boton.classList.remove('on');
      if (entrada.value.trim()) { estado.textContent = 'Listo. Interpretando…'; alTerminar(); }
    };
    rec.start();
  });
}
configurarMic($('mic'), $('texto'), $('micEstado'), () => interpretar());

// ---------- Interpretación (Gemini o reglas locales) ----------
// 503 = servidores de Google saturados (temporal): se reintenta hasta 2 veces antes de caer a las reglas locales
async function fetchGemini(url, opts) {
  let r;
  for (let intento = 0; intento < 3; intento++) {
    r = await fetch(url, opts);
    if (r.status !== 503) break;
    await new Promise(ok => setTimeout(ok, 1200 * (intento + 1)));
  }
  return r;
}

async function interpretarConIA(texto) {
  const hoy = hoyISO();
  const prompt = `Extraé los gastos de este dictado en español rioplatense (Argentina). Hoy es ${hoy}.
"lucas"/"luca" = miles de pesos ("dos lucas" = 2000). Si no dice fecha, usá hoy; "ayer" = el día anterior.
Cada gasto: producto (corto, con mayúscula inicial), monto (número en pesos), categoria (una de: ${CATEGORIAS.join(', ')}), fecha (YYYY-MM-DD).
Dictado: """${texto}"""`;
  const schema = {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: {
        producto: { type: 'STRING' }, monto: { type: 'NUMBER' },
        categoria: { type: 'STRING', enum: CATEGORIAS }, fecha: { type: 'STRING' },
      },
      required: ['producto', 'monto', 'categoria', 'fecha'],
    },
  };
  const modelo = encodeURIComponent(ajustes.modelo || 'gemini-flash-latest');
  const r = await fetchGemini(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': ajustes.apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0 },
    }),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const data = await r.json();
  const items = JSON.parse(data.candidates[0].content.parts[0].text);
  return items
    .filter(x => x && Number(x.monto) > 0)
    .map(x => ({
      producto: String(x.producto || 'Gasto'),
      monto: Number(x.monto),
      categoria: CATEGORIAS.includes(x.categoria) ? x.categoria : 'Otros',
      fecha: /^\d{4}-\d{2}-\d{2}$/.test(x.fecha) ? x.fecha : hoy,
    }));
}

let pendientes = [];

async function interpretar() {
  const texto = $('texto').value.trim();
  if (!texto) { toast('Dictá o escribí algo primero'); return; }
  $('interpretar').disabled = true;
  let items = [];
  let fuente = 'reglas locales (sin IA: falta la clave en Ajustes)';
  try {
    if (ajustes.apiKey) {
      try { items = await interpretarConIA(texto); fuente = '✨ IA (Gemini)'; }
      catch (e) { fuente = 'reglas locales (la IA falló: ' + e.message + ')'; items = interpretarLocal(texto); }
    } else {
      items = interpretarLocal(texto);
    }
  } finally { $('interpretar').disabled = false; }
  $('micEstado').textContent = 'Interpretado con ' + fuente;
  if (!items.length) { toast('No encontré montos. Revisá el texto.'); return; }
  pendientes = items;
  renderPendientes();
}
$('interpretar').addEventListener('click', interpretar);

function renderPendientes() {
  $('resultado').hidden = !pendientes.length;
  $('items').innerHTML = pendientes.map((p, i) => `
    <div class="item" data-i="${i}">
      <button class="quitar" data-q="${i}" aria-label="Quitar">✕</button>
      <input class="nom full" data-k="producto" value="${esc(p.producto)}" aria-label="Producto">
      <select data-k="categoria">${CATEGORIAS.map(c => `<option${c === p.categoria ? ' selected' : ''}>${c}</option>`).join('')}</select>
      <input data-k="monto" type="number" inputmode="decimal" value="${p.monto}" aria-label="Monto">
      <input class="full" data-k="fecha" type="date" value="${p.fecha}" aria-label="Fecha">
    </div>`).join('');
}

$('items').addEventListener('input', e => {
  const fila = e.target.closest('.item'); if (!fila) return;
  const k = e.target.dataset.k;
  pendientes[+fila.dataset.i][k] = k === 'monto' ? Number(e.target.value) : e.target.value;
});
$('items').addEventListener('click', e => {
  const q = e.target.dataset.q; if (q === undefined) return;
  pendientes.splice(+q, 1); renderPendientes();
});
$('agregarFila').addEventListener('click', () => {
  pendientes.push({ producto: '', monto: 0, categoria: 'Otros', fecha: hoyISO() });
  renderPendientes();
});
$('descartar').addEventListener('click', limpiarRegistro);

function limpiarRegistro() {
  pendientes = []; $('texto').value = ''; renderPendientes();
  $('micEstado').textContent = 'Tocá el micrófono y decí, por ejemplo: “leche mil doscientos cincuenta, dos lucas de verdura”.';
}

$('guardar').addEventListener('click', () => {
  const validos = pendientes.filter(p => p.producto.trim() && p.monto > 0 && p.fecha);
  if (!validos.length) { toast('Completá producto y monto'); return; }
  const dolar = Number(ajustes.dolar) || null;
  validos.forEach(p => gastos.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    producto: p.producto.trim(), monto: p.monto, categoria: p.categoria, fecha: p.fecha, dolar,
  }));
  persistir(); limpiarRegistro(); renderHoy();
  toast(`${validos.length} gasto(s) guardado(s)`);
});

function renderHoy() {
  $('totalHoy').textContent = peso(gastos.filter(g => g.fecha === hoyISO()).reduce((s, g) => s + g.monto, 0));
}

// ---------- Estadísticas ----------
let vista = 'dia';
$('vista').addEventListener('click', e => {
  if (!e.target.dataset.v) return;
  vista = e.target.dataset.v;
  document.querySelectorAll('#vista button').forEach(b => b.classList.toggle('on', b === e.target));
  renderStats();
});

const lunes = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const suma = (desde, hasta) => gastos.filter(g => { const f = parseFecha(g.fecha); return f >= desde && f < hasta; }).reduce((s, g) => s + g.monto, 0);

// Devuelve los períodos [{desde, hasta, label}] terminando en el actual
function periodos(tipo) {
  const hoy = new Date(); const out = [];
  const z = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  if (tipo === 'dia') for (let i = 13; i >= 0; i--) {
    const d = new Date(z); d.setDate(d.getDate() - i);
    const h = new Date(d); h.setDate(h.getDate() + 1);
    out.push({ desde: d, hasta: h, label: d.getDate() + '/' + (d.getMonth() + 1) });
  }
  if (tipo === 'semana') for (let i = 11; i >= 0; i--) {
    const d = lunes(z); d.setDate(d.getDate() - 7 * i);
    const h = new Date(d); h.setDate(h.getDate() + 7);
    out.push({ desde: d, hasta: h, label: d.getDate() + '/' + (d.getMonth() + 1) });
  }
  if (tipo === 'mes') for (let i = 11; i >= 0; i--) {
    const d = new Date(z.getFullYear(), z.getMonth() - i, 1);
    out.push({ desde: d, hasta: new Date(d.getFullYear(), d.getMonth() + 1, 1), label: d.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '') });
  }
  if (tipo === 'anio') for (let i = 4; i >= 0; i--) {
    const y = z.getFullYear() - i;
    out.push({ desde: new Date(y, 0, 1), hasta: new Date(y + 1, 0, 1), label: String(y) });
  }
  return out;
}

function renderStats() {
  const ps = { dia: periodos('dia'), semana: periodos('semana'), mes: periodos('mes'), anio: periodos('anio') };
  const act = k => ps[k][ps[k].length - 1];
  const tot = k => suma(act(k).desde, act(k).hasta);
  $('cards').innerHTML = [['Hoy', 'dia'], ['Esta semana', 'semana'], ['Este mes', 'mes'], ['Este año', 'anio']]
    .map(([t, k]) => `<div class="card"><small>${t}</small><b>${peso(tot(k))}</b></div>`).join('');

  const datos = ps[vista].map(p => ({ ...p, total: suma(p.desde, p.hasta) }));
  const max = Math.max(...datos.map(d => d.total), 1);
  $('grafico').innerHTML = datos.map((d, i) => `
    <div class="bar${i === datos.length - 1 ? ' actual' : ''}" title="${peso(d.total)}">
      <i style="height:${(d.total / max) * 85}%"></i><span>${d.label}</span>
    </div>`).join('');

  const p = act(vista);
  const nombres = { dia: 'hoy', semana: 'esta semana', mes: 'este mes', anio: 'este año' };
  $('catTitulo').textContent = 'Por categoría — ' + nombres[vista];
  const porCat = {};
  gastos.filter(g => { const f = parseFecha(g.fecha); return f >= p.desde && f < p.hasta; })
    .forEach(g => (porCat[g.categoria] = (porCat[g.categoria] || 0) + g.monto));
  const filas = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
  const totalP = filas.reduce((s, [, v]) => s + v, 0) || 1;
  $('categorias').innerHTML = filas.length
    ? filas.map(([c, v]) => `<div class="cat"><div class="top"><span>${esc(c)}</span><span>${peso(v)} · ${Math.round(v / totalP * 100)}%</span></div><div class="pista"><i style="width:${v / totalP * 100}%"></i></div></div>`).join('')
    : '<p class="hint">Sin gastos en este período.</p>';
}

// ---------- Historial ----------
function renderHistorial() {
  const orden = [...gastos].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id));
  if (!orden.length) { $('lista').innerHTML = '<p class="hint">Todavía no hay gastos.</p>'; return; }
  const porDia = {};
  orden.forEach(g => (porDia[g.fecha] = porDia[g.fecha] || []).push(g));
  $('lista').innerHTML = Object.entries(porDia).map(([f, gs]) => `
    <div class="dia"><span>${parseFecha(f).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</span><span>${peso(gs.reduce((s, g) => s + g.monto, 0))}</span></div>
    ${gs.map(g => `<div class="gasto"><div>${esc(g.producto)}<small>${esc(g.categoria)}${g.dolar ? ' · USD ' + (g.monto / g.dolar).toFixed(2) : ''}</small></div><div><b>${peso(g.monto)}</b><button data-borrar="${g.id}" aria-label="Borrar">✕</button></div></div>`).join('')}`).join('');
}
$('lista').addEventListener('click', e => {
  const id = e.target.dataset.borrar; if (!id) return;
  gastos = gastos.filter(g => g.id !== id); persistir(); renderHistorial(); toast('Gasto borrado');
});

// ---------- Ajustes ----------
function cargarAjustes() {
  $('apiKey').value = ajustes.apiKey; $('modelo').value = ajustes.modelo; $('dolar').value = ajustes.dolar;
}
$('guardarAjustes').addEventListener('click', () => {
  ajustes = { apiKey: $('apiKey').value.trim(), modelo: $('modelo').value.trim() || 'gemini-flash-latest', dolar: $('dolar').value };
  localStorage.setItem(LS_AJUSTES, JSON.stringify(ajustes));
  toast('Ajustes guardados');
});

$('exportar').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ gastos, precios }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `gastos-${hoyISO()}.json`; a.click();
  URL.revokeObjectURL(a.href);
});
$('importar').addEventListener('click', () => $('archivo').click());
$('archivo').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const arr = Array.isArray(data) ? data : data.gastos;
    if (!Array.isArray(arr)) throw new Error();
    if (Array.isArray(data.precios)) {
      data.precios.filter(p => p && p.nombre && p.precio > 0).forEach(p => setPrecio(p.nombre, p.precio, p.unidad));
    }
    const ids = new Set(gastos.map(g => g.id));
    const nuevos = arr.filter(g => g && g.id && g.producto && g.monto > 0 && /^\d{4}-\d{2}-\d{2}$/.test(g.fecha) && !ids.has(g.id));
    gastos.push(...nuevos); persistir(); renderHoy();
    toast(`${nuevos.length} gasto(s) importado(s)`);
  } catch { toast('Archivo inválido'); }
  e.target.value = '';
});
$('borrarTodo').addEventListener('click', () => {
  if (!confirm('¿Borrar TODOS los gastos de este dispositivo? No se puede deshacer.')) return;
  gastos = []; persistir(); renderHoy(); toast('Datos borrados');
});

// ---------- Compra: lista de precios y carrito ----------
const LS_PRECIOS = 'gastos.precios.v1';
const LS_CARRITO = 'gastos.carrito.v1';
let precios = cargar(LS_PRECIOS, []);   // [{nombre, precio, unidad: 'kg'|'l'|'u'}]
let carrito = cargar(LS_CARRITO, []);   // [{id, producto, cantidad, unidad, precio, up}]
const guardarPrecios = () => localStorage.setItem(LS_PRECIOS, JSON.stringify(precios));
const guardarCarrito = () => localStorage.setItem(LS_CARRITO, JSON.stringify(carrito));

const UNIDADES_CANT = ['kg', 'g', 'l', 'ml', 'u'];
const baseDe = u => (u === 'g' ? 'kg' : u === 'ml' ? 'l' : u);
const factor = u => (u === 'g' || u === 'ml' ? 1 / 1000 : 1);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// Claves de comparación: "Tomates" y "tomate" son el mismo producto
const claves = s => {
  const k = sinTildes(s.toLowerCase()).trim().replace(/\s+/g, ' ').replace(/s$/, '');
  return [k, k.replace(/e$/, '')];
};
const palabras = s => sinTildes(s.toLowerCase()).split(/\s+/).filter(Boolean).map(w => claves(w)[1]);

function buscarPrecio(nombre) {
  const ck = claves(nombre);
  const exacto = precios.find(p => claves(p.nombre).some(k => ck.includes(k)));
  if (exacto) return exacto;
  const pw = palabras(nombre);
  let mejor = null;
  for (const p of precios) {
    const ew = palabras(p.nombre);
    if (ew.every(w => pw.includes(w)) || pw.every(w => ew.includes(w))) {
      if (!mejor || ew.length > palabras(mejor.nombre).length) mejor = p;
    }
  }
  return mejor;
}

function setPrecio(nombre, precio, unidad) {
  const ex = precios.find(p => claves(p.nombre).some(k => claves(nombre).includes(k)));
  if (ex) { ex.precio = precio; ex.unidad = unidad; }
  else precios.push({ nombre: cap(nombre.trim()), precio, unidad });
  precios.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  guardarPrecios();
}

// Subtotal de una línea; null si falta precio o las unidades no coinciden
function subtotal(it) {
  if (!(it.precio > 0)) return null;
  if (baseDe(it.unidad) !== it.up) return null;
  return it.cantidad * factor(it.unidad) * it.precio;
}
const totalCarrito = () => carrito.reduce((s, it) => s + (subtotal(it) || 0), 0);

async function interpretarCompraConIA(texto) {
  const conocidos = precios.map(p => p.nombre).join(', ') || '(ninguno)';
  const prompt = `Interpretá este dictado de una compra (verdulería/supermercado, español rioplatense). Puede mezclar dos tipos de frases:
- tipo "precio": declara cuánto cuesta algo ("tomate a 2500 el kilo"). Campos: producto, precio (número), unidad (kg, l o u; "la docena" => dividí el precio por 12 y usá u).
- tipo "compra": lo que se pone en el carrito ("dos kilos de tomate", "medio kilo", "300 gramos", "tres bananas"). Campos: producto, cantidad (número), unidad (kg, g, l, ml o u), precio (precio por kg/l/unidad SOLO si lo dice en la misma frase; si no, 0), monto (importe total fijo SOLO si dice un total sin cantidad, como "pan 800"; si no, 0).
"lucas" = miles ("dos lucas" = 2000). "medio kilo" = 0.5 kg. "kilo y medio" = 1.5 kg.
Nombres de productos ya conocidos (usá exactamente esa escritura si es el mismo producto): ${conocidos}.
Para campos que no aplican usá 0. Dictado: """${texto}"""`;
  const schema = {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: {
        tipo: { type: 'STRING', enum: ['precio', 'compra'] },
        producto: { type: 'STRING' },
        cantidad: { type: 'NUMBER' },
        unidad: { type: 'STRING', enum: UNIDADES_CANT },
        precio: { type: 'NUMBER' },
        monto: { type: 'NUMBER' },
      },
      required: ['tipo', 'producto', 'cantidad', 'unidad', 'precio', 'monto'],
    },
  };
  const modelo = encodeURIComponent(ajustes.modelo || 'gemini-flash-latest');
  const r = await fetchGemini(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': ajustes.apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0 },
    }),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const data = await r.json();
  return JSON.parse(data.candidates[0].content.parts[0].text).map(x => {
    if (x.tipo === 'precio') return { tipo: 'precio', producto: x.producto, precio: x.precio, unidad: baseDe(x.unidad) };
    if (x.monto > 0 && !(x.precio > 0)) return { tipo: 'compra', producto: x.producto, cantidad: 1, unidad: 'u', precio: x.monto, guardarPrecio: false };
    return { tipo: 'compra', producto: x.producto, cantidad: x.cantidad || 1, unidad: x.unidad, precio: x.precio, guardarPrecio: x.precio > 0 };
  });
}

async function agregarCompra() {
  const texto = $('cTexto').value.trim();
  if (!texto) { toast('Dictá o escribí algo primero'); return; }
  $('cAgregar').disabled = true;
  let items = [];
  let fuente = 'reglas locales (sin IA: falta la clave en Ajustes)';
  try {
    if (ajustes.apiKey) {
      try { items = await interpretarCompraConIA(texto); fuente = '✨ IA (Gemini)'; }
      catch (e) { fuente = 'reglas locales (la IA falló: ' + e.message + ')'; items = interpretarCompraLocal(texto); }
    } else items = interpretarCompraLocal(texto);
  } finally { $('cAgregar').disabled = false; }

  let nPrecios = 0, nItems = 0, sinPrecio = 0;
  for (const it of items) {
    if (!it.producto || !it.producto.trim()) continue;
    if (it.tipo === 'precio') {
      if (it.precio > 0) { setPrecio(it.producto, it.precio, it.unidad); nPrecios++; }
      continue;
    }
    let precio = it.precio > 0 ? it.precio : 0;
    let up = baseDe(it.unidad);
    if (precio) {
      if (it.guardarPrecio) setPrecio(it.producto, precio, up);
    } else {
      const ex = buscarPrecio(it.producto);
      if (ex) { precio = ex.precio; up = ex.unidad; }
    }
    const nuevo = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), producto: cap(it.producto.trim()), cantidad: it.cantidad || 1, unidad: it.unidad, precio, up };
    carrito.push(nuevo);
    nItems++;
    if (subtotal(nuevo) === null) sinPrecio++;
  }
  guardarCarrito();
  $('cTexto').value = '';
  const partes = [];
  if (nPrecios) partes.push(`${nPrecios} precio(s) guardado(s)`);
  if (nItems) partes.push(`${nItems} al carrito`);
  if (sinPrecio) partes.push(`⚠ ${sinPrecio} sin precio`);
  $('cEstado').textContent = `${partes.join(' · ') || 'No entendí nada'} — interpretado con ${fuente}`;
  renderCompra();
}

function renderCompra() {
  $('cItems').innerHTML = carrito.map(it => {
    const sub = subtotal(it);
    const falta = sub === null;
    return `<div class="linea" data-id="${it.id}">
      <div class="sup">
        <input data-k="producto" value="${esc(it.producto)}" aria-label="Producto">
        <span class="sub${falta ? ' falta' : ''}">${falta ? (it.precio > 0 ? '⚠ kg/u?' : '⚠ precio') : peso(sub)}</span>
        <button class="quitar" data-q="${it.id}" aria-label="Quitar">✕</button>
      </div>
      <div class="inf">
        <input data-k="cantidad" type="number" inputmode="decimal" step="any" value="${it.cantidad}" aria-label="Cantidad">
        <select data-k="unidad">${UNIDADES_CANT.map(u => `<option${u === it.unidad ? ' selected' : ''}>${u}</option>`).join('')}</select>
        <span style="text-align:right">× $</span>
        <input data-k="precio" type="number" inputmode="decimal" step="any" value="${it.precio || ''}" placeholder="precio" aria-label="Precio">
      </div>
      <div class="inf" style="grid-template-columns:1fr 110px">
        <span>precio por</span>
        <select data-k="up">${[['kg', 'kilo'], ['l', 'litro'], ['u', 'unidad']].map(([v, n]) => `<option value="${v}"${v === it.up ? ' selected' : ''}>${n}</option>`).join('')}</select>
      </div>
    </div>`;
  }).join('') || '<p class="hint" style="text-align:center">El carrito está vacío.</p>';
  $('cTotal').textContent = peso(totalCarrito());
  $('cCant').textContent = carrito.length ? `${carrito.length} producto(s)` : '';
  renderDif();
  renderPrecios();
}

function renderDif() {
  const caja = Number($('cCaja').value);
  const el = $('cDif');
  if (!caja || !carrito.length) { el.textContent = ''; el.className = 'dif'; return; }
  const d = caja - totalCarrito();
  if (Math.abs(d) < 1) { el.textContent = '✔ Coincide con tu cuenta'; el.className = 'dif bien'; }
  else if (d > 0) { el.textContent = `La caja cobra ${peso(d)} de MÁS que tu cuenta`; el.className = 'dif mal'; }
  else { el.textContent = `La caja cobra ${peso(-d)} de menos que tu cuenta`; el.className = 'dif bien'; }
}

// Editar una línea: solo se actualizan los números, sin redibujar (no pierde el foco)
$('cItems').addEventListener('change', e => {
  const fila = e.target.closest('.linea'); if (!fila) return;
  const it = carrito.find(x => x.id === fila.dataset.id); if (!it) return;
  const k = e.target.dataset.k;
  const teniaPrecio = it.precio > 0;
  if (k === 'cantidad' || k === 'precio') it[k] = Number(e.target.value) || 0;
  else it[k] = e.target.value;
  if (k === 'unidad' && !teniaPrecio) it.up = baseDe(it.unidad);
  if (k === 'precio' && !teniaPrecio && it.precio > 0 && !buscarPrecio(it.producto)) {
    setPrecio(it.producto, it.precio, it.up);
    toast(`Precio de ${it.producto} guardado en la lista`);
  }
  guardarCarrito(); renderCompra();
});
$('cItems').addEventListener('click', e => {
  const q = e.target.dataset.q; if (!q) return;
  carrito = carrito.filter(x => x.id !== q); guardarCarrito(); renderCompra();
});
$('cCaja').addEventListener('input', renderDif);
$('cAgregar').addEventListener('click', agregarCompra);
$('cTexto').addEventListener('keydown', e => { if (e.key === 'Enter') agregarCompra(); });
configurarMic($('cMic'), $('cTexto'), $('cEstado'), () => agregarCompra());

$('cVaciar').addEventListener('click', () => {
  if (carrito.length && !confirm('¿Vaciar el carrito?')) return;
  carrito = []; guardarCarrito(); $('cCaja').value = ''; renderCompra();
});
$('cGuardar').addEventListener('click', () => {
  const validos = carrito.filter(it => subtotal(it) > 0);
  if (!validos.length) { toast('No hay productos con precio para guardar'); return; }
  const dolar = Number(ajustes.dolar) || null;
  const fecha = hoyISO();
  validos.forEach(it => gastos.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    producto: it.producto, monto: Math.round(subtotal(it) * 100) / 100, categoria: adivinarCategoria(it.producto), fecha, dolar,
  }));
  persistir();
  carrito = []; guardarCarrito(); $('cCaja').value = ''; renderCompra();
  toast(`${validos.length} gasto(s) guardado(s) en el historial`);
});

// Lista de precios
const nombreUnidad = { kg: 'kilo', l: 'litro', u: 'unidad' };
function renderPrecios() {
  $('pCant').textContent = precios.length;
  $('pLista').innerHTML = precios.map((p, i) => `
    <div class="pfila"><span>${esc(p.nombre)}</span>
      <input type="number" inputmode="decimal" step="any" value="${p.precio}" data-pi="${i}" aria-label="Precio de ${esc(p.nombre)}">
      <small>/ ${nombreUnidad[p.unidad] || p.unidad}</small>
      <button class="quitar" data-pdel="${i}" aria-label="Borrar">✕</button></div>`).join('')
    || '<p class="hint">Todavía no cargaste precios. Decí “tomate a 2500 el kilo” o agregalos acá.</p>';
}
$('pLista').addEventListener('change', e => {
  const i = e.target.dataset.pi; if (i === undefined) return;
  const v = Number(e.target.value);
  if (v > 0) { precios[+i].precio = v; guardarPrecios(); toast('Precio actualizado (aplica a lo que cargues desde ahora)'); }
});
$('pLista').addEventListener('click', e => {
  const i = e.target.dataset.pdel; if (i === undefined) return;
  precios.splice(+i, 1); guardarPrecios(); renderPrecios();
});
$('pAgregar').addEventListener('click', () => {
  const nombre = $('pNom').value.trim(), precio = Number($('pPrecio').value);
  if (!nombre || !(precio > 0)) { toast('Completá producto y precio'); return; }
  setPrecio(nombre, precio, $('pUni').value);
  $('pNom').value = ''; $('pPrecio').value = ''; renderPrecios();
});

// ---------- Inicio ----------
cargarAjustes();
renderHoy();
renderCompra();
// ---------- Aviso de actualización ----------
const LS_UPD = 'gastos.actualizando';

// Pregunta al service worker qué versión es (null si no responde)
function obtenerVersion(sw) {
  return new Promise(ok => {
    if (!sw) return ok(null);
    const canal = new MessageChannel();
    canal.port1.onmessage = e => ok(e.data);
    sw.postMessage('VERSION', [canal.port2]);
    setTimeout(() => ok(null), 1500);
  });
}

function mostrarAvisoActualizacion(sw) {
  $('actualizar').hidden = false;
  $('btnActualizar').onclick = async () => {
    $('btnActualizar').disabled = true;
    const antes = await obtenerVersion(navigator.serviceWorker.controller);
    try { localStorage.setItem(LS_UPD, antes || '?'); } catch {}
    sw.postMessage('SKIP_WAITING');
  };
}

// Tras recargar: confirma que la versión nueva quedó funcionando
async function confirmarActualizacion(reg) {
  let previa = null;
  try { previa = localStorage.getItem(LS_UPD); localStorage.removeItem(LS_UPD); } catch {}
  if (!previa) return;
  const ahora = await obtenerVersion(navigator.serviceWorker.controller || reg.active);
  const cartel = $('okActualizado');
  const ok = !!ahora && ahora !== previa;
  cartel.classList.toggle('error', !ok);
  $('okTexto').textContent = ok
    ? `✅ App actualizada correctamente (${ahora})`
    : '⚠ No se pudo confirmar la actualización. Cerrá y volvé a abrir la app.';
  cartel.hidden = false;
  if (ok) setTimeout(() => (cartel.hidden = true), 8000);
}
$('okCerrar').addEventListener('click', () => ($('okActualizado').hidden = true));

if ('serviceWorker' in navigator) {
  const habiaControlador = !!navigator.serviceWorker.controller;
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habiaControlador || recargando) return; // primera instalación: no hace falta recargar
    recargando = true; location.reload();
  });
  navigator.serviceWorker.register('sw.js').then(reg => {
    confirmarActualizacion(reg);
    if (reg.waiting && navigator.serviceWorker.controller) mostrarAvisoActualizacion(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nuevo = reg.installing;
      nuevo.addEventListener('statechange', () => {
        if (nuevo.state === 'installed' && navigator.serviceWorker.controller) mostrarAvisoActualizacion(nuevo);
      });
    });
    // Buscar versiones nuevas al volver a la app y cada 30 minutos
    const buscar = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) buscar(); });
    setInterval(buscar, 30 * 60 * 1000);
  }).catch(() => {});
}
