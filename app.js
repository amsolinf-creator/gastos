// ---------- Almacenamiento (solo en el dispositivo) ----------
const LS_GASTOS = 'gastos.v1';
const LS_AJUSTES = 'gastos.ajustes.v1';

const cargar = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
let gastos = cargar(LS_GASTOS, []);
let ajustes = cargar(LS_AJUSTES, {});
ajustes = { apiKey: '', modelo: 'gemini-flash-latest', groqKey: '', groqModelo: 'llama-3.3-70b-versatile', principal: 'gemini', modoIA: 'rapido', confirmar: 'si', dolar: '', ...ajustes };
const persistir = () => localStorage.setItem(LS_GASTOS, JSON.stringify(gastos));

// ---------- Categorías: el diccionario sugiere y tus correcciones se recuerdan ----------
const LS_CATS = 'gastos.categorias.v1';
let catsAprendidas = cargar(LS_CATS, {});   // { "brocoli": "Verdulería" }
// Singular/plural dan la misma clave, también para palabras que no están en el diccionario
const claveCat = nombre => palabrasDe(nombre).map(w => { const s = singular(w); return s !== w ? s : w.replace(/([aeiou])s$/, '$1'); }).join(' ');
const capital = s => s.charAt(0).toUpperCase() + s.slice(1);

// Rubro dictado: "pinturería" => "Pinturería", "ferretería" => "Ferretería" (palabras terminadas en -ería)
const NO_RUBRO = new Set(['materia', 'miseria', 'histeria', 'arteria', 'bacteria', 'criteria', 'feria']);
function categoriaRubro(producto) {
  const m = sinTildes(producto.toLowerCase()).match(/\b([a-z]{3,}eria)\b/);
  if (!m || NO_RUBRO.has(m[1])) return null;
  return capital(m[1].replace(/eria$/, 'ería'));
}

// Si lo dictado es justo un comercio de tu lista de lugares ("kiosco", "quiosco", "supermercado"), ese es el rubro
const comercioExacto = producto => lugares.find(l => parecido(producto, l) === 1) || null;

// Lo que se dictó sirve de categoría cuando no hay una conocida: "pintura" => "Pintura"
function categoriaLibre(producto) {
  const t = producto.trim().replace(/\s+/g, ' ');
  return t && t.split(' ').length <= 3 && t.length <= 28 ? capital(t.toLowerCase()) : null;
}

// Orden: lo que corregiste vos > rubro dictado (-ería) > categoría sugerida > diccionario > el nombre dictado > Otros
function categoriaDe(producto, sugerida, libre = true) {
  return catsAprendidas[claveCat(producto)]
    || categoriaRubro(producto)
    || comercioExacto(producto)
    || (sugerida && sugerida !== 'Otros' ? sugerida : null)
    || (adivinarCategoria(producto) !== 'Otros' ? adivinarCategoria(producto) : null)
    || (libre ? categoriaLibre(producto) : null)
    || 'Otros';
}

// Categorías para los selectores: las base, más todas las que usaste alguna vez
const todasCategorias = (actual = '') => [...new Set([...CATEGORIAS.filter(c => c !== 'Otros'), ...gastos.map(g => g.categoria).filter(Boolean), 'Otros', actual].filter(Boolean))];
const opcionesCategoria = actual => todasCategorias(actual).map(c => `<option${c === actual ? ' selected' : ''}>${esc(c)}</option>`).join('') + '<option value="__nueva__">➕ Nueva categoría…</option>';
function pedirCategoria() {
  const n = (prompt('Nombre de la categoría (ej: Ferretería)') || '').trim();
  return n ? capital(n) : '';
}
function aprenderCategoria(producto, cat) {
  const k = claveCat(producto);
  if (!k) return;
  if (cat === adivinarCategoria(producto)) delete catsAprendidas[k]; else catsAprendidas[k] = cat;
  localStorage.setItem(LS_CATS, JSON.stringify(catsAprendidas));
}

// ---------- Lugar de la compra ----------
const LS_LUGARES = 'gastos.lugares.v1';
const LS_LUGAR = 'gastos.lugar.v1';
const LUGARES_BASE = ['Supermercado', 'Verdulería', 'Almacén', 'Carnicería', 'Panadería', 'Farmacia', 'Kiosco', 'Feria', 'Mercado', 'Online'];
let lugares = cargar(LS_LUGARES, LUGARES_BASE);
let lugarActual = cargar(LS_LUGAR, '');

const opcionesLugar = sel => {
  const lista = sel && !lugares.includes(sel) ? [...lugares, sel] : lugares;
  return '<option value="">Sin especificar</option>' + lista.map(l => `<option${l === sel ? ' selected' : ''}>${esc(l)}</option>`).join('');
};
function renderLugares() {
  for (const id of ['cLugar']) {
    $(id).innerHTML = opcionesLugar(lugarActual) + '<option value="__nuevo__">➕ Agregar lugar…</option>';
    $(id).value = lugarActual;
  }
}
function cambiarLugar(valor) {
  if (valor === '__nuevo__') {
    const n = (prompt('Nombre del lugar (ej: Verdulería de la esquina)') || '').trim();
    if (n) {
      const ya = lugares.find(l => l.toLowerCase() === n.toLowerCase());
      lugarActual = ya || n.charAt(0).toUpperCase() + n.slice(1);
      if (!ya) lugares.push(lugarActual);
      localStorage.setItem(LS_LUGARES, JSON.stringify(lugares));
    }
  } else lugarActual = valor;
  try { localStorage.setItem(LS_LUGAR, JSON.stringify(lugarActual)); } catch {}
  renderLugares();
}
// En "Gasto" no hay selector de lugar: el lugar sale de lo dictado ("kiosco 4500" => Kiosco, "ferretería 40 mil" => Ferretería)
function lugarDe(producto) {
  let mejor = '', mejorP = 0;
  for (const l of lugares) { const p = parecido(producto, l); if (p > mejorP) { mejor = l; mejorP = p; } }
  return mejor || categoriaRubro(producto) || '';
}
document.addEventListener('change', e => { if (e.target.id === 'cLugar') cambiarLugar(e.target.value); });

const $ = id => document.getElementById(id);
const ICX = '<svg class="ic ic-s"><use href="#i-x"/></svg>';
const CAT_COLOR = { 'Comida': '#f59e0b', 'Verdulería': '#34d399', 'Carnicería': '#fb7185', 'Limpieza': '#22d3ee', 'Transporte': '#a78bfa', 'Salud': '#f472b6', 'Hogar': '#fbbf24', 'Ocio': '#818cf8', 'Ropa': '#2dd4bf', 'Servicios': '#60a5fa', 'Otros': '#94a3b8' };
// Categorías sin color fijo (las que creás vos) reciben uno estable según su nombre
const colorCat = c => {
  if (CAT_COLOR[c]) return CAT_COLOR[c];
  let h = 0; for (const ch of String(c)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 70% 62%)`;
};
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
  document.body.dataset.tab = b.dataset.t;
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

// ---------- Interpretación (Gemini y/o Groq, con reglas locales como último recurso) ----------
let fuenteIA = '';
const hayIA = () => !!(ajustes.apiKey || ajustes.groqKey);

// Tope de espera por llamada: si una IA no responde a tiempo se la descarta y se sigue con otra opción
const TOPE_IA_MS = 6000;
const tope = () => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(TOPE_IA_MS) : undefined);

// "HTTP 429 – mensaje de la API" para saber por qué falló
async function detalleError(r) {
  let msg = '';
  try { const j = await r.json(); msg = (j.error && (j.error.message || j.error.status)) || ''; } catch {}
  return 'HTTP ' + r.status + (msg ? ' – ' + String(msg).replace(/\s+/g, ' ').slice(0, 140) : '');
}

const MODELOS_RESPALDO_GEMINI = ['gemini-flash-lite-latest'];  // cuota gratuita aparte de la del modelo principal
const modeloUsado = { gemini: '', groq: '' };

async function llamarGemini(prompt, schema) {
  const modelos = [...new Set([ajustes.modelo || 'gemini-flash-latest', ...MODELOS_RESPALDO_GEMINI])];
  let ultimo = '';
  for (const m of modelos) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
      signal: tope(),
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': ajustes.apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0 },
      }),
    });
    if (r.ok) {
      const data = await r.json();
      modeloUsado.gemini = m;
      return JSON.parse(data.candidates[0].content.parts[0].text);
    }
    ultimo = `${m}: ${await detalleError(r)}`;
    if (r.status !== 429 && r.status !== 404) break;   // cuota agotada o modelo inexistente: probar el siguiente
  }
  throw new Error(ultimo);
}

// Si el modelo de Groq no existe en la cuenta, se consulta la lista real y se elige uno de chat
const PREFERIDOS_GROQ = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'];
async function elegirModeloGroq() {
  const r = await fetch('https://api.groq.com/openai/v1/models', { signal: tope(), headers: { Authorization: 'Bearer ' + ajustes.groqKey } });
  if (!r.ok) throw new Error(await detalleError(r));
  const ids = (await r.json()).data.map(m => m.id).filter(id => !/whisper|tts|orpheus|guard|safeguard|embed|vision/i.test(id));
  return PREFERIDOS_GROQ.find(id => ids.includes(id)) || ids.find(id => /llama|gpt-oss|qwen|mixtral|gemma/i.test(id)) || null;
}

// Groq no acepta "schema": se le describen los campos en el pedido y se pide un objeto {"items":[...]}
function describirSchema(schema) {
  return Object.entries(schema.items.properties).map(([k, v]) =>
    `"${k}" (${v.type === 'NUMBER' ? 'número' : 'texto'}${v.enum ? ', uno de: ' + v.enum.join(' | ') : ''})`).join(', ');
}

async function llamarGroq(prompt, schema, modelo = ajustes.groqModelo || 'llama-3.3-70b-versatile', reintento = true) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    signal: tope(),
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ajustes.groqKey },
    body: JSON.stringify({
      model: modelo,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Respondés únicamente con JSON válido.' },
        { role: 'user', content: `${prompt}\n\nDevolvé un objeto JSON con la forma {"items":[...]}; cada elemento tiene exactamente estos campos: ${describirSchema(schema)}. Si no hay nada que extraer, devolvé {"items":[]}.` },
      ],
    }),
  });
  if (!r.ok) {
    const detalle = await detalleError(r);
    if ((r.status === 404 || r.status === 400) && reintento) {   // modelo inexistente o sin acceso: usar uno disponible
      let nuevo = null;
      try { nuevo = await elegirModeloGroq(); } catch (e) { throw new Error(`${modelo}: ${detalle}; no pude listar modelos (${e.message})`); }
      if (nuevo && nuevo !== modelo) {
        const datos = await llamarGroq(prompt, schema, nuevo, false);
        ajustes.groqModelo = nuevo; localStorage.setItem(LS_AJUSTES, JSON.stringify(ajustes));
        if ($('groqModelo')) $('groqModelo').value = nuevo;
        return datos;
      }
    }
    throw new Error(`${modelo}: ${detalle}`);
  }
  modeloUsado.groq = modelo;
  const data = await r.json();
  const obj = JSON.parse(data.choices[0].message.content);
  const arr = Array.isArray(obj) ? obj : obj.items;
  if (!Array.isArray(arr)) throw new Error('respuesta inválida');
  return arr;
}

// Consulta la IA principal; si falla o tarda más de 2,5 s, lanza la otra en paralelo. Gana la primera que responda bien.
const ESPERA_RESPALDO_MS = 2500;
function llamarIA(prompt, schema) {
  const motores = { gemini: ['Gemini', ajustes.apiKey && llamarGemini], groq: ['Groq', ajustes.groqKey && llamarGroq] };
  const orden = (ajustes.principal === 'groq' ? ['groq', 'gemini'] : ['gemini', 'groq']).filter(m => motores[m][1]);
  return new Promise((resolve, reject) => {
    const errores = [];
    let siguiente = 0, activos = 0, terminado = false, temporizador = null;
    const lanzar = () => {
      if (terminado || siguiente >= orden.length) return false;
      const m = orden[siguiente++];
      const [nombre, fn] = motores[m];
      activos++;
      fn(prompt, schema).then(datos => {
        if (terminado) return;
        terminado = true; clearTimeout(temporizador);
        fuenteIA = nombre + (m !== orden[0] ? ' · respaldo' : '');
        resolve(datos);
      }).catch(e => {
        errores.push(`${nombre}: ${e && e.name === 'TimeoutError' ? 'sin respuesta a tiempo' : (e && e.message) || e}`);
        activos--;
        if (!terminado && !lanzar() && activos === 0) { terminado = true; clearTimeout(temporizador); reject(new Error(errores.join('; '))); }
      });
      if (siguiente < orden.length) temporizador = setTimeout(lanzar, ESPERA_RESPALDO_MS);
      return true;
    };
    if (!lanzar()) reject(new Error('Sin claves de IA'));
  });
}

// "Rápido primero": las reglas locales responden al instante y la IA se consulta solo si no entendieron bien
// (o si en Ajustes elegiste "Siempre con IA"). Si la IA falla, queda el resultado local.
async function interpretarRapido({ texto, local, conIA, boton, estado }) {
  const t0 = performance.now();
  let items = local(texto);
  let fuente = hayIA() ? 'reglas locales (rápido)' : 'reglas locales (sin IA: falta la clave en Ajustes)';
  const confiable = items.length > 0 && !items.dudosos;
  if (hayIA() && ((ajustes.modoIA || 'rapido') !== 'rapido' || !confiable)) {
    boton.disabled = true;
    estado.textContent = '✨ Consultando la IA…';
    try { items = await conIA(texto); fuente = '✨ IA (' + fuenteIA + ')'; }
    catch (e) { fuente = 'reglas locales (la IA falló: ' + e.message + ')'; }
    finally { boton.disabled = false; }
  }
  return { items, fuente: `${fuente} · ${((performance.now() - t0) / 1000).toFixed(1)} s` };
}

async function interpretarConIA(texto) {
  const hoy = hoyISO();
  const prompt = `Extraé los gastos de este dictado en español rioplatense (Argentina). Hoy es ${hoy}.
"lucas"/"luca" = miles de pesos ("dos lucas" = 2000). Si no dice fecha, usá hoy; "ayer" = el día anterior.
Cada gasto: producto (corto, con mayúscula inicial), monto (número en pesos), categoria (usá una de: ${CATEGORIAS.filter(c => c !== 'Otros').join(', ')} si encaja; si el gasto nombra un comercio o rubro, usá ese nombre como categoría, por ejemplo "Pinturería" o "Ferretería"; solo usá Otros si no hay ninguna pista), fecha (YYYY-MM-DD).
Dictado: """${texto}"""`;
  const schema = {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: {
        producto: { type: 'STRING' }, monto: { type: 'NUMBER' },
        categoria: { type: 'STRING' }, fecha: { type: 'STRING' },
      },
      required: ['producto', 'monto', 'categoria', 'fecha'],
    },
  };
  const datos = await llamarIA(prompt, schema);
  return datos
    .filter(x => x && Number(x.monto) > 0)
    .map(x => ({
      producto: String(x.producto || 'Gasto'),
      monto: Number(x.monto),
      categoria: String(x.categoria || '').trim().slice(0, 30) || 'Otros',
      fecha: /^\d{4}-\d{2}-\d{2}$/.test(x.fecha) ? x.fecha : hoy,
    }));
}

let pendientes = [];

async function interpretar() {
  const texto = $('texto').value.trim();
  if (!texto) { toast('Dictá o escribí algo primero'); return; }
  const { items, fuente } = await interpretarRapido({ texto, local: interpretarLocal, conIA: interpretarConIA, boton: $('interpretar'), estado: $('micEstado') });
  $('micEstado').textContent = 'Interpretado con ' + fuente;
  if (!items.length) { toast('No encontré montos. Revisá el texto.'); return; }
  pendientes = items.map(it => ({ ...it, categoria: categoriaDe(it.producto, it.categoria) }));
  renderPendientes();
}
$('interpretar').addEventListener('click', interpretar);

function renderPendientes() {
  $('resultado').hidden = !pendientes.length;
  $('items').innerHTML = pendientes.map((p, i) => `
    <div class="item" data-i="${i}">
      <button class="quitar" data-q="${i}" aria-label="Quitar">${ICX}</button>
      <input class="nom full" data-k="producto" value="${esc(p.producto)}" aria-label="Producto">
      <select data-k="categoria">${opcionesCategoria(p.categoria)}</select>
      <input data-k="monto" type="number" inputmode="decimal" value="${p.monto}" aria-label="Monto">
      <input class="full" data-k="fecha" type="date" value="${p.fecha}" aria-label="Fecha">
    </div>`).join('');
}

$('items').addEventListener('input', e => {
  const fila = e.target.closest('.item'); if (!fila) return;
  const k = e.target.dataset.k;
  pendientes[+fila.dataset.i][k] = k === 'monto' ? Number(e.target.value) : e.target.value;
  if (k === 'categoria') pendientes[+fila.dataset.i].catEditada = true;
});
// "➕ Nueva categoría…": se pide el nombre y queda disponible en todos los selectores
$('items').addEventListener('change', e => {
  if (e.target.dataset.k !== 'categoria' || e.target.value !== '__nueva__') return;
  const fila = e.target.closest('.item'); const p = pendientes[+fila.dataset.i];
  p.categoria = pedirCategoria() || p.categoria; p.catEditada = true;
  renderPendientes();
});
$('items').addEventListener('click', e => {
  const b = e.target.closest('[data-q]'); if (!b) return;
  const q = b.dataset.q;
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
  validos.forEach(p => {
    if (p.catEditada) aprenderCategoria(p.producto, p.categoria);
    gastos.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      producto: p.producto.trim(), monto: p.monto, categoria: p.categoria, fecha: p.fecha, lugar: lugarDe(p.producto), dolar,
    });
  });
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

  $('grafico').scrollLeft = $('grafico').scrollWidth;   // que se vea el período actual (el último)

  const p = act(vista);
  const nombres = { dia: 'hoy', semana: 'esta semana', mes: 'este mes', anio: 'este año' };
  $('catTitulo').textContent = 'Por categoría — ' + nombres[vista];
  const porCat = {};
  gastos.filter(g => { const f = parseFecha(g.fecha); return f >= p.desde && f < p.hasta; })
    .forEach(g => (porCat[g.categoria] = (porCat[g.categoria] || 0) + g.monto));
  const filas = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
  const totalP = filas.reduce((s, [, v]) => s + v, 0) || 1;
  $('categorias').innerHTML = filas.length
    ? filas.map(([c, v]) => `<div class="cat" style="--c:${colorCat(c)}"><div class="top"><span><i class="dot"></i>${esc(c)}</span><span>${peso(v)} · ${Math.round(v / totalP * 100)}%</span></div><div class="pista"><i style="width:${v / totalP * 100}%"></i></div></div>`).join('')
    : '<p class="hint" style="margin:0">Sin gastos en este período.</p>';

  $('lugTitulo').textContent = 'Por lugar — ' + nombres[vista];
  const porLugar = {};
  gastos.filter(g => { const f = parseFecha(g.fecha); return f >= p.desde && f < p.hasta; })
    .forEach(g => { const l = g.lugar || 'Sin lugar'; porLugar[l] = (porLugar[l] || 0) + g.monto; });
  const filasL = Object.entries(porLugar).sort((a, b) => b[1] - a[1]);
  const totalL = filasL.reduce((s, [, v]) => s + v, 0) || 1;
  $('lugares').innerHTML = filasL.length
    ? filasL.map(([c, v]) => `<div class="cat"><div class="top"><span>${esc(c)}</span><span>${peso(v)} · ${Math.round(v / totalL * 100)}%</span></div><div class="pista"><i style="width:${v / totalL * 100}%"></i></div></div>`).join('')
    : '<p class="hint" style="margin:0">Sin gastos en este período.</p>';
}

// ---------- Historial ----------
const abiertos = new Set();   // compras desplegadas: se mantienen abiertas al corregir algo

const filaGasto = (g, enCompra = false) => `<div class="gasto${enCompra ? ' sub' : ''}"><div><div class="nombre"><i class="dot" style="--c:${colorCat(g.categoria)}"></i>${esc(g.producto)}</div>
  <div class="metas">
    <select class="mini" data-gid="${g.id}" data-c="categoria" aria-label="Categoría">${opcionesCategoria(g.categoria)}</select>
    ${enCompra ? '' : `<select class="mini" data-gid="${g.id}" data-c="lugar" aria-label="Lugar">${opcionesLugar(g.lugar || '').replace('Sin especificar', 'Sin lugar')}</select>`}
  </div>${g.dolar ? `<small>USD ${(g.monto / g.dolar).toFixed(2)}</small>` : ''}</div>
  <div class="der"><b>${peso(g.monto)}</b><button data-borrar="${g.id}" aria-label="Borrar">${ICX}</button></div></div>`;

// Una compra = una sola tarjeta con el lugar y el total; el detalle se despliega
function tarjetaCompra(items) {
  const id = items[0].compraId, lugar = items[0].lugar || '';
  const total = items.reduce((t, g) => t + g.monto, 0);
  return `<details class="compra-g" data-cid="${id}"${abiertos.has(id) ? ' open' : ''}>
    <summary>
      <span class="cg-t"><i class="cg-ic"><svg class="ic"><use href="#i-bag"/></svg></i><span><b>${esc(lugar || 'Compra')}</b><small>${items.length} producto(s)</small></span></span>
      <b class="cg-m">${peso(total)}</b>
    </summary>
    <div class="cg-det">
      <div class="cg-acc">
        <select class="mini" data-cid-lugar="${id}" aria-label="Lugar de la compra">${opcionesLugar(lugar).replace('Sin especificar', 'Sin lugar')}</select>
        <button class="cg-del" data-borrar-compra="${id}">Borrar compra</button>
      </div>
      ${items.map(g => filaGasto(g, true)).join('')}
    </div>
  </details>`;
}

function renderHistorial() {
  const orden = [...gastos].sort((a, b) => b.fecha.localeCompare(a.fecha));   // estable: dentro del día se conserva el orden de carga
  if (!orden.length) { $('lista').innerHTML = '<div class="vacio"><svg class="ic"><use href="#i-bag"/></svg>Todavía no hay gastos.</div>'; return; }
  const porDia = {};
  orden.forEach(g => (porDia[g.fecha] = porDia[g.fecha] || []).push(g));
  $('lista').innerHTML = Object.entries(porDia).map(([f, gs]) => {
    // dentro de cada día, los gastos de una misma compra se juntan en una sola tarjeta
    const compras = new Map(), bloques = [];
    for (const g of gs) {
      if (!g.compraId) { bloques.push({ g }); continue; }
      if (!compras.has(g.compraId)) { const c = { items: [] }; compras.set(g.compraId, c); bloques.push(c); }
      compras.get(g.compraId).items.push(g);
    }
    return `<div class="dia"><span>${parseFecha(f).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</span><span>${peso(gs.reduce((t, g) => t + g.monto, 0))}</span></div>
      ${bloques.map(b => (b.items ? tarjetaCompra(b.items) : filaGasto(b.g))).join('')}`;
  }).join('');
}
// recuerda qué compras están abiertas (el evento "toggle" no se propaga: se escucha en captura)
$('lista').addEventListener('toggle', e => {
  const cid = e.target.dataset && e.target.dataset.cid; if (!cid) return;
  if (e.target.open) abiertos.add(cid); else abiertos.delete(cid);
}, true);
// cambiar el lugar de toda la compra
$('lista').addEventListener('change', e => {
  const cid = e.target.dataset.cidLugar; if (!cid) return;
  gastos.filter(g => g.compraId === cid).forEach(g => { g.lugar = e.target.value; });
  persistir(); renderHistorial(); toast('Lugar de la compra actualizado');
});
// Corregir categoría o lugar de un gasto ya guardado (la categoría corregida se recuerda para el futuro)
$('lista').addEventListener('change', e => {
  const id = e.target.dataset.gid; if (!id) return;
  const g = gastos.find(x => x.id === id); if (!g) return;
  let valor = e.target.value;
  if (valor === '__nueva__') valor = pedirCategoria() || g.categoria;   // "➕ Nueva categoría…"
  g[e.target.dataset.c] = valor;
  if (e.target.dataset.c === 'categoria') aprenderCategoria(g.producto, g.categoria);
  persistir(); renderHistorial(); toast('Cambio guardado');
});
function reclasificarOtros() {
  let n = 0;
  gastos.forEach(g => {
    if (g.categoria !== 'Otros') return;
    const c = categoriaDe(g.producto, null, false);
    if (c !== 'Otros') { g.categoria = c; n++; }
  });
  if (n) persistir();
  return n;
}
$('hReclasificar').addEventListener('click', () => {
  const n = reclasificarOtros(); renderHistorial();
  toast(n ? `${n} gasto(s) reclasificado(s)` : 'No hay gastos en «Otros» que pueda reclasificar');
});
$('lista').addEventListener('click', e => {
  const bc = e.target.closest('[data-borrar-compra]');
  if (bc) {
    const cid = bc.dataset.borrarCompra, n = gastos.filter(g => g.compraId === cid).length;
    if (!confirm(`¿Borrar esta compra completa (${n} producto(s))?`)) return;
    gastos = gastos.filter(g => g.compraId !== cid); abiertos.delete(cid); persistir(); renderHistorial(); toast('Compra borrada');
    return;
  }
  const b = e.target.closest('[data-borrar]'); if (!b) return;
  const id = b.dataset.borrar;
  gastos = gastos.filter(g => g.id !== id); persistir(); renderHistorial(); toast('Gasto borrado');
});

// ---------- Ajustes ----------
function cargarAjustes() {
  $('apiKey').value = ajustes.apiKey; $('modelo').value = ajustes.modelo; $('dolar').value = ajustes.dolar;
  $('groqKey').value = ajustes.groqKey; $('groqModelo').value = ajustes.groqModelo; $('principal').value = ajustes.principal; $('modoIA').value = ajustes.modoIA; $('confirmar').value = ajustes.confirmar;
}
$('guardarAjustes').addEventListener('click', () => {
  ajustes = {
    apiKey: $('apiKey').value.trim(), modelo: $('modelo').value.trim() || 'gemini-flash-latest',
    groqKey: $('groqKey').value.trim(), groqModelo: $('groqModelo').value.trim() || 'llama-3.3-70b-versatile',
    principal: $('principal').value, modoIA: $('modoIA').value, confirmar: $('confirmar').value, dolar: $('dolar').value,
  };
  localStorage.setItem(LS_AJUSTES, JSON.stringify(ajustes));
  toast('Ajustes guardados');
});

// Prueba cada IA por separado y muestra el motivo exacto si falla
$('probarIA').addEventListener('click', async () => {
  $('guardarAjustes').click();
  const schema = { type: 'ARRAY', items: { type: 'OBJECT', properties: { ok: { type: 'STRING' } } } };
  const prompt = 'Devolvé un único elemento con ok = "si".';
  const motores = [['Gemini', ajustes.apiKey, llamarGemini, 'gemini'], ['Groq', ajustes.groqKey, llamarGroq, 'groq']].filter(m => m[1]);
  if (!motores.length) { $('probarEstado').textContent = 'Cargá al menos una clave de API.'; return; }
  $('probarIA').disabled = true;
  $('probarEstado').textContent = 'Probando…';
  const lineas = [];
  for (const [nombre, , fn, k] of motores) {
    try { await fn(prompt, schema); lineas.push(`${nombre}: ✅ funciona (modelo ${modeloUsado[k]})`); }
    catch (e) { lineas.push(`${nombre}: ❌ ${e.message}`); }
  }
  $('probarEstado').textContent = lineas.join('\n');
  $('probarIA').disabled = false;
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

// ---------- Coincidencia de nombres por sonido ----------
// El reconocimiento de voz escribe "champú" aunque en la lista esté "Shampoo": se comparan por cómo suenan.
const SINONIMOS_BRUTO = { fresa: 'frutilla', melocoton: 'durazno', aguacate: 'palta', platano: 'banana', maiz: 'choclo', pina: 'anana', guisante: 'arveja', frijol: 'poroto', calabacin: 'zapallito', patata: 'papa', zumo: 'jugo', refresco: 'gaseosa', champu: 'shampoo', acondicionador: 'enjuague', mayonesa: 'mayo' };

function sonido(w) {
  w = sinTildes(w.toLowerCase()).replace(/[^a-z0-9]/g, '');
  w = w.replace(/sh|ch/g, '#').replace(/ph/g, 'f').replace(/h/g, '')
    .replace(/ll/g, 'y').replace(/qu/g, 'k').replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/z/g, 's')
    .replace(/v/g, 'b').replace(/w/g, 'u').replace(/oo/g, 'u').replace(/ee/g, 'i').replace(/(.)\1+/g, '$1');
  return w.length > 3 ? w.replace(/s$/, '') : w;
}
const SINONIMOS = Object.fromEntries(Object.entries(SINONIMOS_BRUTO).map(([a, b]) => [sonido(a), sonido(b)]));
const canon = w => { const s = sonido(w); return SINONIMOS[s] || s; };

function distancia(a, b) {   // Levenshtein
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// Misma palabra: igual sonido, o (palabras largas) una letra de diferencia por error de tipeo
const mismaPalabra = (a, b) => a === b || (a.length >= 6 && b.length >= 6 && distancia(a, b) <= 1);
const palabrasCanon = s => sinTildes(s.toLowerCase()).split(/[^a-z0-9]+/).filter(Boolean).map(canon);

// Cuánto se parecen dos nombres: 1 = iguales; 0 = sin relación. Un nombre contenido en el otro también cuenta
// ("champú" ↔ "shampoo sedal"), pero puntúa menos que uno idéntico.
function parecido(a, b) {
  const wa = palabrasCanon(a), wb = palabrasCanon(b);
  if (!wa.length || !wb.length) return 0;
  const ma = wa.filter(x => wb.some(y => mismaPalabra(x, y))).length;
  const mb = wb.filter(y => wa.some(x => mismaPalabra(x, y))).length;
  if (ma !== wa.length && mb !== wb.length) return 0;   // ninguno contiene al otro
  return (ma + mb) / (wa.length + wb.length);
}

function buscarPrecio(nombre) {
  let mejor = null, mejorP = 0;
  for (const p of precios) {
    const sc = parecido(nombre, p.nombre);
    if (sc > mejorP) { mejor = p; mejorP = sc; }
  }
  return mejor;
}
const buscarExacto = nombre => precios.find(p => parecido(nombre, p.nombre) === 1);

// etiqueta: presentación que se muestra en la lista ("atado", "bolsa"); solo aplica a precios por unidad
function setPrecio(nombre, precio, unidad, etiqueta = '') {
  const et = unidad === 'u' ? etiqueta : '';
  const ex = buscarExacto(nombre);
  if (ex) { ex.precio = precio; ex.unidad = unidad; ex.etiqueta = et; }
  else precios.push({ nombre: cap(nombre.trim()), precio, unidad, etiqueta: et });
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
REGLA DE UNIDADES: solo usá kg, g, l o ml si el dictado dice explícitamente kilo, kilogramo, gramos, litro o mililitros (o "medio kilo", "kilo y medio", etc.). Si no lo dice, la unidad es siempre "u" (unidades).
- tipo "precio": declara cuánto cuesta algo ("tomate a 2500 el kilo"). Campos: producto, precio (número), unidad (kg, l o u; "la docena" => dividí el precio por 12 y usá u; si no dice "el kilo" ni "el litro", usá u).
- tipo "compra": lo que se pone en el carrito ("dos kilos de tomate", "medio kilo", "300 gramos", "tres bananas"). Campos: producto, cantidad (número), unidad (kg, g, l, ml o u), precio (precio por kg/l/unidad SOLO si lo dice en la misma frase; si no, 0), monto (importe fijo SOLO si dice un precio sin cantidad ni "el kilo", como "pan 800" o "rúcula atado dos mil pesos"; si no, 0).
Envases (atado, paquete, bolsa, caja, maple, bandeja, pack, botella, lata, manojo, cabeza) cuentan como unidad "u": poné el envase en "etiqueta" ("atado") y dejalo fuera de "producto" ("Rúcula"). Si no hay envase, etiqueta es "".
"lucas" = miles ("dos lucas" = 2000). "medio kilo" = 0.5 kg. "kilo y medio" = 1.5 kg.
Si después de "kilo(s)" se dice un número menor a 1000 sin otra unidad, son gramos: "un kilo doscientos cincuenta" = 1.25 kg, "dos kilos cien" = 2.1 kg, "un kilo 250" = 1.25 kg, "tres kilos y 500" = 3.5 kg. Usá la unidad kg con decimales.
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
        etiqueta: { type: 'STRING' },
      },
      required: ['tipo', 'producto', 'cantidad', 'unidad', 'precio', 'monto', 'etiqueta'],
    },
  };
  const datos = await llamarIA(prompt, schema);
  return datos.map(x => {
    const etiqueta = String(x.etiqueta || '').trim().toLowerCase();
    x = { ...x, producto: String(x.producto || ''), cantidad: Number(x.cantidad) || 0, precio: Number(x.precio) || 0, monto: Number(x.monto) || 0, unidad: UNIDADES_CANT.includes(x.unidad) ? x.unidad : 'u' };
    if (x.tipo === 'precio') return { tipo: 'precio', producto: x.producto, precio: x.precio, unidad: baseDe(x.unidad), etiqueta };
    if (x.monto > 0 && !(x.precio > 0)) {
      // precio sin cantidad: se guarda por la unidad más probable (atado => unidad, tomate => kilo)
      return { tipo: 'compra', producto: x.producto, cantidad: 1, unidad: 'u', precio: x.monto, guardarPrecio: true, etiqueta };
    }
    return { tipo: 'compra', producto: x.producto, cantidad: x.cantidad || 1, unidad: x.unidad, precio: x.precio, guardarPrecio: x.precio > 0, etiqueta };
  });
}

// ---------- Vista previa: lo interpretado se muestra destacado y se registra con un toque ----------
const confirmarAntes = () => ajustes.confirmar !== 'no';

// REGLA: solo se registra kilo, gramo o litro si se DICTÓ esa medida. Si no, es por unidad.
// Se aplica al final a todo lo interpretado, también a lo que devuelve la IA.
const textoTieneMedida = texto => /\b(kilos?|kilogramos?|kgs?|gramos?|grs?|gr|litros?|lts?|lt|mililitros?|ml)\b/.test(sinTildes(String(texto).toLowerCase()));
const reglaUnidad = (items, texto) => (textoTieneMedida(texto) ? items : items.map(it => ({ ...it, unidad: 'u' })));
const pend = { carrito: [], precios: [] };   // propuestas todavía sin registrar
let modoDictActual = 'carrito';
const fmtCant = n => String(Math.round(n * 1000) / 1000).replace('.', ',');

// Resuelve lo interpretado SIN modificar nada: precio y nombre de tu lista, subtotal
function resolverCompra(items) {
  const out = [];
  for (const it of items) {
    if (!it.producto || !it.producto.trim()) continue;
    if (it.tipo === 'precio') {
      if (it.precio > 0) out.push({ tipo: 'precio', producto: cap(it.producto.trim()), precio: it.precio, unidad: it.unidad, etiqueta: it.etiqueta || '' });
      continue;
    }
    let precio = it.precio > 0 ? it.precio : 0, up = baseDe(it.unidad), nombre = cap(it.producto.trim());
    if (!precio) {
      const ex = buscarPrecio(it.producto);
      if (ex) { precio = ex.precio; up = ex.unidad; nombre = ex.nombre; }   // usa el nombre de tu lista ("Shampoo sedal")
    }
    out.push({ tipo: 'compra', producto: nombre, original: it.producto, cantidad: it.cantidad || 1, unidad: it.unidad, precio, up, guardarPrecio: !!(it.precio > 0 && it.guardarPrecio), etiqueta: it.etiqueta || '' });
  }
  return out;
}

// Registra de verdad: guarda precios y suma al carrito
function aplicarCompra(lista) {
  let nPrecios = 0, nItems = 0, sinPrecio = 0;
  for (const p of lista) {
    if (p.tipo === 'precio') { setPrecio(p.producto, p.precio, p.unidad, p.etiqueta); nPrecios++; continue; }
    if (p.guardarPrecio) { setPrecio(p.original || p.producto, p.precio, p.up, p.etiqueta); nPrecios++; }
    const nuevo = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), producto: p.producto, cantidad: p.cantidad, unidad: p.unidad, precio: p.precio, up: p.up };
    carrito.push(nuevo); nItems++;
    if (subtotal(nuevo) === null) sinPrecio++;
  }
  guardarCarrito(); renderCompra();
  const partes = [];
  if (nPrecios) partes.push(`${nPrecios} precio(s) guardado(s)`);
  if (nItems) partes.push(`${nItems} al carrito`);
  if (sinPrecio) partes.push(`⚠ ${sinPrecio} sin precio`);
  return partes;
}

function lineaPropuesta(p, modo, i) {
  let nombre = p.producto || '', det = '', der = '';
  const etq = (u, e) => e || nombreUnidad[u] || u;
  if (modo === 'carrito') {
    if (p.tipo === 'precio') { det = `precio ${peso(p.precio)} / ${etq(p.unidad, p.etiqueta)}`; der = '<span class="tag">precio</span>'; }
    else {
      const sub = subtotal(p);
      det = p.precio > 0 ? `${fmtCant(p.cantidad)} ${p.unidad} × ${peso(p.precio)} / ${nombreUnidad[p.up] || p.up}` : `${fmtCant(p.cantidad)} ${p.unidad}`;
      der = sub === null ? `<span class="tag warn">${p.precio > 0 ? 'revisá kg/u' : 'sin precio'}</span>` : `<b>${peso(sub)}</b>`;
    }
  } else if (p.accion === 'precio') {
    const ex = buscarExacto(p.producto);
    det = `${ex ? 'actualiza' : 'nuevo'} · ${peso(p.precio)} / ${etq(p.unidad || 'u', p.etiqueta)}`; der = '<span class="tag">precio</span>';
  } else if (p.accion === 'borrar') {
    const ex = buscarExacto(p.producto) || buscarPrecio(p.producto);
    nombre = ex ? ex.nombre : p.producto; det = ex ? 'se quita de la lista' : 'no está en la lista';
    der = `<span class="tag ${ex ? 'del' : 'warn'}">${ex ? 'borrar' : 'no está'}</span>`;
  } else { nombre = 'Toda la lista'; det = `${precios.length} producto(s)`; der = '<span class="tag del">borrar todo</span>'; }
  return `<div class="pl"><div class="pl-t"><b>${esc(nombre)}</b><small>${esc(det)}</small></div><div class="pl-m">${der}</div><button class="pl-x" data-px="${i}" aria-label="Quitar">${ICX}</button></div>`;
}

function renderPropuesta() {
  const lista = pend[modoDictActual];
  $('propuesta').hidden = !lista.length;
  $('propLista').innerHTML = lista.map((p, i) => lineaPropuesta(p, modoDictActual, i)).join('');
}

function registrarPropuesta() {
  const modo = modoDictActual, lista = pend[modo];
  if (!lista.length) return;
  let partes;
  if (modo === 'carrito') partes = aplicarCompra(lista);
  else partes = resumenPrecios(aplicarAccionesPrecios(lista));
  pend[modo] = []; renderPropuesta();
  const el = modo === 'carrito' ? $('cEstado') : $('pEstado');
  el.textContent = '✓ Registrado: ' + (partes.join(' · ') || 'nada que registrar');
}
$('propSi').addEventListener('click', registrarPropuesta);
$('propNo').addEventListener('click', () => { pend[modoDictActual] = []; renderPropuesta(); });
$('propLista').addEventListener('click', e => {
  const b = e.target.closest('[data-px]'); if (!b) return;
  pend[modoDictActual].splice(+b.dataset.px, 1); renderPropuesta();
});

async function agregarCompra() {
  const texto = $('cTexto').value.trim();
  if (!texto) { toast('Dictá o escribí algo primero'); return; }
  const { items, fuente } = await interpretarRapido({ texto, local: interpretarCompraLocal, conIA: interpretarCompraConIA, boton: $('cAgregar'), estado: $('cEstado') });
  const lista = resolverCompra(reglaUnidad(items, texto));
  if (!lista.length) { $('cEstado').textContent = `No entendí nada — interpretado con ${fuente}`; return; }
  $('cTexto').value = '';
  if (confirmarAntes()) {
    pend.carrito.push(...lista);
    $('cEstado').textContent = `Revisá y tocá ✓ para registrar — ${fuente}`;
    renderPropuesta();
  } else {
    $('cEstado').textContent = `${aplicarCompra(lista).join(' · ')} — interpretado con ${fuente}`;
  }
}

function renderCompra() {
  $('cItems').innerHTML = carrito.map(it => {
    const sub = subtotal(it);
    const falta = sub === null;
    return `<div class="linea" data-id="${it.id}">
      <div class="sup">
        <input data-k="producto" value="${esc(it.producto)}" aria-label="Producto">
        <span class="sub${falta ? ' falta' : ''}">${falta ? (it.precio > 0 ? 'revisá kg/u' : 'falta precio') : peso(sub)}</span>
        <button class="quitar" data-q="${it.id}" aria-label="Quitar">${ICX}</button>
      </div>
      <div class="inf">
        <input data-k="cantidad" type="number" inputmode="decimal" step="any" value="${it.cantidad}" aria-label="Cantidad">
        <select data-k="unidad" aria-label="Unidad">${UNIDADES_CANT.map(u => `<option${u === it.unidad ? ' selected' : ''}>${u}</option>`).join('')}</select>
        <span class="por">×</span>
        <input data-k="precio" type="number" inputmode="decimal" step="any" value="${it.precio || ''}" placeholder="$ precio" aria-label="Precio">
        <select data-k="up" aria-label="Precio por">${[['kg', '/ kilo'], ['l', '/ litro'], ['u', '/ unidad']].map(([v, n]) => `<option value="${v}"${v === it.up ? ' selected' : ''}>${n}</option>`).join('')}</select>
      </div>
    </div>`;
  }).join('') || '<div class="vacio"><svg class="ic"><use href="#i-cart"/></svg>El carrito está vacío.<br>Dictá lo que vas poniendo y se suma solo.</div>';
  const total = peso(totalCarrito());
  const cant = carrito.length ? `${carrito.length} producto(s)` : '';
  $('cTotal').textContent = total; $('cTotalFijo').textContent = total;
  $('cCant').textContent = cant; $('cCantFija').textContent = cant ? '· ' + cant : '';
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
  const b = e.target.closest('[data-q]'); if (!b) return;
  const q = b.dataset.q;
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
// Al finalizar, el gasto es lo que marcó la caja (no el estimado). Se reparte entre los productos en proporción a su
// precio estimado, así cada categoría conserva su parte y la suma da exactamente el total de la caja.
$('cGuardar').addEventListener('click', () => {
  const validos = carrito.filter(it => subtotal(it) > 0);
  const estimado = totalCarrito();
  let total = Number($('cCaja').value) || 0;
  if (!validos.length && !total) { toast('Cargá el total que marca la caja'); $('cCaja').focus(); return; }
  if (!total) {
    if (!confirm(`No cargaste el total que marca la caja.\n¿Guardar con el total estimado (${peso(estimado)})?`)) { $('cCaja').focus(); return; }
    total = estimado;
  }
  const dolar = Number(ajustes.dolar) || null;
  const fecha = hoyISO();
  const redondeo = n => Math.round(n * 100) / 100;
  const registros = [];
  if (validos.length) {
    let acum = 0;
    validos.forEach((it, i) => {
      const est = subtotal(it);
      const monto = i === validos.length - 1 ? redondeo(total - acum) : redondeo(total * est / estimado);
      acum += monto;
      registros.push({ producto: it.producto, monto, estimado: redondeo(est) });
    });
  } else registros.push({ producto: lugarActual ? 'Compra en ' + lugarActual : 'Compra', monto: total, estimado: 0 });
  const compraId = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  registros.filter(r => r.monto > 0).forEach(r => gastos.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    producto: r.producto, monto: r.monto, estimado: r.estimado, categoria: categoriaDe(r.producto), fecha, lugar: lugarActual, compraId, dolar,
  }));
  persistir();
  carrito = []; guardarCarrito(); $('cCaja').value = ''; renderCompra();
  cambiarLugar('');   // la próxima compra arranca con el lugar "Sin especificar"
  toast(`Compra guardada: ${peso(total)}`);
});

// Lista de precios
const nombreUnidad = { kg: 'kilo', l: 'litro', u: 'unidad' };
function renderPrecios() {
  $('pCant').textContent = precios.length;
  $('pLista').innerHTML = precios.map((p, i) => `
    <div class="pfila"><span>${esc(p.nombre)}</span>
      <input type="number" inputmode="decimal" step="any" value="${p.precio}" data-pi="${i}" aria-label="Precio de ${esc(p.nombre)}">
      <small>/ ${esc(p.etiqueta || nombreUnidad[p.unidad] || p.unidad)}</small>
      <button class="quitar" data-pdel="${i}" aria-label="Borrar">${ICX}</button></div>`).join('')
    || '<p class="hint">Todavía no cargaste precios. Decí “tomate a 2500 el kilo” o agregalos acá.</p>';
}
$('pLista').addEventListener('change', e => {
  const i = e.target.dataset.pi; if (i === undefined) return;
  const v = Number(e.target.value);
  if (v > 0) { precios[+i].precio = v; guardarPrecios(); toast('Precio actualizado (aplica a lo que cargues desde ahora)'); }
});
$('pLista').addEventListener('click', e => {
  const b = e.target.closest('[data-pdel]'); if (!b) return;
  const i = b.dataset.pdel;
  precios.splice(+i, 1); guardarPrecios(); renderPrecios();
});
// ----- Editar la lista por voz o texto: cambiar precios, borrar productos, borrar todo -----

async function interpretarPreciosConIA(texto) {
  const conocidos = precios.map(p => `${p.nombre} (${p.precio}/${p.etiqueta || p.unidad})`).join(', ') || '(ninguno)';
  const prompt = `Interpretá este dictado para editar una lista de precios de verdulería/supermercado (español rioplatense). Acciones posibles:
- "precio": fijar o cambiar el precio de un producto. Campos: producto, precio (número), unidad (kg, l o u).
- "borrar": quitar un producto de la lista. Campo: producto.
- "borrar_todo": vaciar toda la lista ("borrar toda la lista", "eliminar todo").
Envases (atado, paquete, bolsa, caja, maple, bandeja, pack, botella, lata, manojo, cabeza) cuentan como unidad "u": poné el envase en "etiqueta" y dejalo fuera de "producto".
"lucas" = miles ("dos lucas" = 2000). Solo usá kg o l si el dictado dice explícitamente kilo o litro. Si no dice la unidad de un precio, usá siempre "u" (unidad), aunque el producto ya figure en la lista con otra unidad.
Productos actuales (usá exactamente esa escritura si es el mismo producto): ${conocidos}.
Para campos que no aplican usá 0 o "". Dictado: """${texto}"""`;
  const schema = {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: {
        accion: { type: 'STRING', enum: ['precio', 'borrar', 'borrar_todo'] },
        producto: { type: 'STRING' },
        precio: { type: 'NUMBER' },
        unidad: { type: 'STRING', enum: ['kg', 'l', 'u'] },
        etiqueta: { type: 'STRING' },
      },
      required: ['accion', 'producto', 'precio', 'unidad', 'etiqueta'],
    },
  };
  const datos = await llamarIA(prompt, schema);
  return datos.map(x => ({
    accion: ['precio', 'borrar', 'borrar_todo'].includes(x.accion) ? x.accion : 'precio',
    producto: String(x.producto || '').trim(),
    precio: Number(x.precio) || 0,
    unidad: ['kg', 'l', 'u'].includes(x.unidad) ? x.unidad : null,
    etiqueta: String(x.etiqueta || '').trim().toLowerCase(),
  }));
}

function aplicarAccionesPrecios(acciones) {
  const r = { nuevos: [], cambiados: [], borrados: [], noEncontrados: [], todo: false };
  for (const a of acciones) {
    if (a.accion === 'borrar_todo') {
      if (!precios.length) continue;
      if (confirm(`¿Eliminar TODA la lista de precios (${precios.length} productos)?`)) { precios = []; r.todo = true; }
      continue;
    }
    if (!a.producto) continue;
    if (a.accion === 'borrar') {
      const ex = buscarExacto(a.producto) || buscarPrecio(a.producto);
      if (!ex) { r.noEncontrados.push(a.producto); continue; }
      precios = precios.filter(p => p !== ex);
      r.borrados.push(ex.nombre);
    } else if (a.precio > 0) {
      const ex = buscarExacto(a.producto);
      const unidad = a.unidad || 'u';   // sin "kilo"/"litro" dicho, siempre por unidad (aunque el producto estuviera por kilo)
      setPrecio(a.producto, a.precio, unidad, a.etiqueta || (ex && unidad === 'u' ? ex.etiqueta : ''));
      (ex ? r.cambiados : r.nuevos).push(cap(a.producto));
    }
  }
  guardarPrecios(); renderPrecios();
  return r;
}

function resumenPrecios(r) {
  const partes = [];
  if (r.nuevos.length) partes.push('agregado: ' + r.nuevos.join(', '));
  if (r.cambiados.length) partes.push('actualizado: ' + r.cambiados.join(', '));
  if (r.borrados.length) partes.push('borrado: ' + r.borrados.join(', '));
  if (r.todo) partes.push('lista eliminada');
  if (r.noEncontrados.length) partes.push('no está en la lista: ' + r.noEncontrados.join(', '));
  return partes;
}

async function editarPrecios() {
  const texto = $('pTexto').value.trim();
  if (!texto) { toast('Dictá o escribí algo primero'); return; }
  const { items: acciones, fuente } = await interpretarRapido({ texto, local: interpretarPreciosLocal, conIA: interpretarPreciosConIA, boton: $('pAplicar'), estado: $('pEstado') });
  const validas = reglaUnidad(acciones.map(a => (a.accion === 'precio' ? { ...a } : a)), texto).filter(a => a.accion === 'borrar_todo' || (a.producto && (a.accion === 'borrar' || a.precio > 0)));
  if (!validas.length) { $('pEstado').textContent = `No entendí nada — interpretado con ${fuente}`; return; }
  $('pTexto').value = '';
  if (confirmarAntes()) {
    pend.precios.push(...validas);
    $('pEstado').textContent = `Revisá y tocá ✓ para registrar — ${fuente}`;
    renderPropuesta();
  } else {
    $('pEstado').textContent = `${resumenPrecios(aplicarAccionesPrecios(validas)).join(' · ')} — interpretado con ${fuente}`;
  }
}
// Barra de dictado única: el selector manda lo dictado al carrito o a la lista de precios
function setModoDict(m) {
  modoDictActual = m; renderPropuesta();
  $('dictCarrito').hidden = m !== 'carrito'; $('dictPrecios').hidden = m !== 'precios';
  $('cEstado').hidden = m !== 'carrito'; $('pEstado').hidden = m !== 'precios';
  document.querySelectorAll('#modoDict button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
}
$('modoDict').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) setModoDict(b.dataset.m); });
// Tocar el mensaje de estado lo expande o lo recoge (los errores pueden ser largos)
document.querySelectorAll('.estado').forEach(el => el.addEventListener('click', () => el.classList.toggle('abierto')));

$('pAplicar').addEventListener('click', editarPrecios);
$('pTexto').addEventListener('keydown', e => { if (e.key === 'Enter') editarPrecios(); });
configurarMic($('pMic'), $('pTexto'), $('pEstado'), () => editarPrecios());

$('pBorrarTodo').addEventListener('click', () => {
  if (!precios.length) { toast('La lista ya está vacía'); return; }
  if (!confirm(`¿Eliminar TODA la lista de precios (${precios.length} productos)? No se puede deshacer.`)) return;
  precios = []; guardarPrecios(); renderPrecios(); toast('Lista de precios eliminada');
});

$('pAgregar').addEventListener('click', () => {
  const nombre = $('pNom').value.trim(), precio = Number($('pPrecio').value);
  if (!nombre || !(precio > 0)) { toast('Completá producto y precio'); return; }
  const env = sacarEnvase(sinTildes(nombre.toLowerCase()));   // "Rúcula atado" => nombre "rucula" + etiqueta "atado"
  const limpio = env.etiqueta ? cap(sacarEnvase(nombre.toLowerCase()).nombre) : nombre;
  setPrecio(limpio, precio, env.etiqueta ? 'u' : $('pUni').value, env.etiqueta);
  $('pNom').value = ''; $('pPrecio').value = ''; $('pUni').value = 'u'; renderPrecios();
});

// Pantalla siempre vertical (refuerzo del "orientation" del manifest; solo aplica con la app instalada)
try { screen.orientation.lock('portrait').catch(() => {}); } catch {}

// ---------- Inicio ----------
cargarAjustes();
renderLugares();
// Una sola vez: con el diccionario ampliado, reclasifica lo que había quedado en «Otros»
try {
  if (localStorage.getItem('gastos.cats.version') !== '2') {
    const n = reclasificarOtros();
    localStorage.setItem('gastos.cats.version', '2');
    if (n) setTimeout(() => toast(`${n} gasto(s) de «Otros» se reclasificaron`), 800);
  }
} catch {}
renderHoy();
renderCompra();
// La barra de total se apoya justo sobre el menú, sea cual sea su alto en cada celular
const navEl = document.querySelector('nav');
const ajustarNav = () => document.documentElement.style.setProperty('--nav-h', navEl.offsetHeight + 'px');
ajustarNav();
if ('ResizeObserver' in window) new ResizeObserver(ajustarNav).observe(navEl);

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
