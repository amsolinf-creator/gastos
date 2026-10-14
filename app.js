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
}));

// ---------- Dictado por voz ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let reconocimiento = null, escuchando = false;

$('mic').addEventListener('click', () => {
  if (!SR) { toast('Tu navegador no soporta dictado. Escribí el texto o usá Chrome.'); return; }
  if (escuchando) { reconocimiento.stop(); return; }
  reconocimiento = new SR();
  reconocimiento.lang = 'es-AR';
  reconocimiento.interimResults = true;
  reconocimiento.continuous = false;
  reconocimiento.onstart = () => { escuchando = true; $('mic').classList.add('on'); $('micEstado').textContent = 'Escuchando…'; };
  reconocimiento.onresult = e => { $('texto').value = Array.from(e.results).map(r => r[0].transcript).join(' '); };
  reconocimiento.onerror = e => { $('micEstado').textContent = e.error === 'not-allowed' ? 'Permiso de micrófono denegado.' : 'Error de dictado: ' + e.error; };
  reconocimiento.onend = () => {
    escuchando = false; $('mic').classList.remove('on');
    if ($('texto').value.trim()) { $('micEstado').textContent = 'Listo. Interpretando…'; interpretar(); }
  };
  reconocimiento.start();
});

// ---------- Interpretación (Gemini o reglas locales) ----------
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
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
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
  const blob = new Blob([JSON.stringify(gastos, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `gastos-${hoyISO()}.json`; a.click();
  URL.revokeObjectURL(a.href);
});
$('importar').addEventListener('click', () => $('archivo').click());
$('archivo').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const arr = JSON.parse(await f.text());
    if (!Array.isArray(arr)) throw new Error();
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

// ---------- Inicio ----------
cargarAjustes();
renderHoy();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
