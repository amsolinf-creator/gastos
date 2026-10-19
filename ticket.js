// ---------- Conciliar una compra con el ticket (foto leída por IA) ----------
// El carrito trabaja con precios estimados; el ticket tiene los reales. Esta pantalla reemplaza el monto estimado de
// cada producto por el real. La foto se usa solo para leer los renglones: NO se guarda en la app.
const TICKET_AVISO = 'gastos.ticketAviso.v1';
let cn = null;   // estado de la conciliación abierta

const numCn = v => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const redondear2 = n => Math.round(n * 100) / 100;
const topeLargo = () => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(35000) : undefined);

// "TOMATE PERITA X KG" => "Tomate perita x kg"
const limpiarDescTicket = d => { const t = String(d).trim().replace(/\s+/g, ' ').toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };

// ---------- Foto: se reduce antes de enviarla (más rápido y gasta menos cuota) ----------
async function prepararImagen(file, ladoMax = 2000) {
  let bmp;
  try { bmp = await createImageBitmap(file); }
  catch {
    bmp = await new Promise((ok, mal) => { const img = new Image(); img.onload = () => ok(img); img.onerror = () => mal(new Error('No se pudo abrir la imagen')); img.src = URL.createObjectURL(file); });
  }
  const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight, k = Math.min(1, ladoMax / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', 0.85);
  return { base64: url.split(',')[1], mime: 'image/jpeg', ancho: c.width, alto: c.height };
}

// ---------- Lectura del ticket con Gemini (acepta imágenes) ----------
async function leerTicket(base64, mime, nombresCarrito) {
  const prompt = `Leé este ticket de compra de un comercio argentino y devolvé los datos en JSON.
- "total": el importe total a pagar (número).
- "lineas": solo los productos comprados. Cada línea: "descripcion" (como figura en el ticket, sin códigos de barra), "cantidad" (número; 1 si no figura), "unidad" ("kg", "g", "l" o "u"), "subtotal" (importe final de esa línea en pesos, con el descuento de esa línea si lo tuviera) y "producto_carrito": si la línea corresponde a alguno de estos productos del carrito, escribí EXACTAMENTE su nombre; si no corresponde a ninguno, dejalo vacío.
Productos del carrito: ${nombresCarrito.join(', ') || '(ninguno)'}.
- Ignorá renglones que no son productos: IVA, subtotales, vuelto, medios de pago, puntos, datos del comercio.
- Los importes argentinos usan punto para los miles y coma para los decimales: 1.250,50 es 1250.5.
- "comercio" y "fecha" (AAAA-MM-DD) si se leen; si no, vacío.`;
  const schema = {
    type: 'OBJECT',
    properties: {
      comercio: { type: 'STRING' }, fecha: { type: 'STRING' }, total: { type: 'NUMBER' },
      lineas: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
        descripcion: { type: 'STRING' }, cantidad: { type: 'NUMBER' }, unidad: { type: 'STRING' }, subtotal: { type: 'NUMBER' }, producto_carrito: { type: 'STRING' },
      }, required: ['descripcion', 'cantidad', 'unidad', 'subtotal', 'producto_carrito'] } },
    },
    required: ['total', 'lineas'],
  };
  const modelos = [...new Set([ajustes.modelo || 'gemini-flash-latest', 'gemini-flash-lite-latest'])];
  let ultimo = '';
  for (const m of modelos) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
      signal: topeLargo(), method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': ajustes.apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: base64 } }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0 },
      }),
    });
    if (r.ok) {
      const data = await r.json();
      try { return JSON.parse(data.candidates[0].content.parts[0].text); }
      catch { throw new Error('No pude interpretar la respuesta de la IA'); }
    }
    ultimo = `${m}: ${await detalleError(r)}`;
    if (![429, 404, 503].includes(r.status)) break;   // cuota agotada, modelo inexistente o saturado: se prueba el otro
  }
  throw new Error(ultimo);
}

// ---------- Armado de los renglones ----------
function lineasDesdeCarrito() {
  return cn.items.map(g => ({ desc: g.producto, cant: '', unidad: '', monto: g.monto, destino: g.id }));
}

// Cada renglón del ticket se asocia a un producto del carrito (la IA propone; se confirma con el nombre y el parecido)
function lineasDesdeTicket(t) {
  const usados = new Set(), lineas = [];
  for (const l of t.lineas || []) {
    const desc = String(l.descripcion || '').trim(), monto = Number(l.subtotal) || 0;
    if (!desc) continue;
    let destino = monto > 0 ? 'nuevo' : 'ignorar';
    if (monto > 0) {
      const libres = cn.items.filter(g => !usados.has(g.id)), propuesto = String(l.producto_carrito || '').trim();
      let cand = null;
      if (propuesto) cand = libres.find(g => parecido(propuesto, g.producto) === 1) || libres.find(g => parecido(propuesto, g.producto) > 0) || null;
      if (!cand) { let mejor = 0; for (const g of libres) { const p = parecido(desc, g.producto); if (p > mejor) { mejor = p; cand = g; } } }
      if (cand) { destino = cand.id; usados.add(cand.id); }
    }
    lineas.push({ desc, cant: Number(l.cantidad) || '', unidad: String(l.unidad || ''), monto, destino });
  }
  return lineas;
}

// Escaneo: fecha y lugar de la compra según lo que se leyó (si no se leen, hoy y sin lugar)
function datosDelTicket(t) {
  const f = String(t.fecha || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(f) && f <= hoyISO() && f >= '2000-01-01') cn.fecha = f;
  const c = String(t.comercio || '').trim();
  if (c) {
    let mejor = '', mp = 0;
    for (const l of lugares) { const p = parecido(c, l); if (p > mp) { mp = p; mejor = l; } }
    cn.lugar = mejor || limpiarDescTicket(c);
  }
}

// ---------- Pantalla ----------
function montarConciliacion() {
  if ($('conciliar')) return;
  document.body.insertAdjacentHTML('beforeend', `
  <div id="conciliar" class="concil" hidden>
    <div class="concil-head">
      <button id="cnCerrar" class="ibtn no" aria-label="Cerrar"><svg class="ic"><use href="#i-x"/></svg></button>
      <div><b id="cnTit">Conciliar con el ticket</b><small id="cnSub"></small></div>
    </div>
    <div class="concil-cuerpo">
      <div id="cnPaso1">
        <p class="hint">Sacale una foto al ticket entero, derecho y bien iluminado. La IA lee los renglones y vos confirmás antes de guardar. <b>La foto no se guarda.</b></p>
        <label class="cn-boton cn-prim"><svg class="ic"><use href="#i-camera"/></svg> Sacar foto<input id="cnFoto" type="file" accept="image/*" capture="environment" hidden></label>
        <label class="cn-boton"><svg class="ic"><use href="#i-image"/></svg> Elegir de la galería<input id="cnGaleria" type="file" accept="image/*" hidden></label>
        <button id="cnManual" class="ghost" style="width:100%;margin-top:10px">Cargar los montos a mano</button>
        <p id="cnEstado" class="hint cn-estado"></p>
      </div>
      <div id="cnPaso2" hidden>
        <p id="cnInfo" class="hint" style="margin-top:0"></p>
        <div id="cnFilas"></div>
        <div id="cnTotales" class="cn-totales"></div>
      </div>
    </div>
    <div id="cnPie" class="concil-pie" hidden>
      <button id="cnGuardar" class="primary" style="margin:0">Guardar conciliación</button>
    </div>
  </div>`);
  $('cnCerrar').addEventListener('click', cerrarConciliacion);
  $('cnFoto').addEventListener('change', e => procesarFoto(e.target.files[0], e.target));
  $('cnGaleria').addEventListener('change', e => procesarFoto(e.target.files[0], e.target));
  $('cnManual').addEventListener('click', () => { cn.lineas = lineasDesdeCarrito(); cn.total = ''; cn.origen = 'manual'; mostrarPaso2('Completá el monto real de cada producto, tal como figura en el ticket.'); });
  $('cnGuardar').addEventListener('click', guardarConciliacion);
  $('cnGuardar').textContent = 'Guardar';
  // los campos se leen al terminar de editar (así el teclado no pierde el foco); los totales se actualizan mientras se escribe
  $('cnFilas').addEventListener('change', e => leerCampo(e.target, true));
  $('cnFilas').addEventListener('input', e => leerCampo(e.target, false));
  $('cnTotales').addEventListener('input', e => { if (e.target.id === 'cnTotal') { cn.total = e.target.value; pintarTotales(false); } else if (e.target.id === 'cnRepartir') { cn.repartir = e.target.checked; } });
}

function abrirConciliacion(cid) {
  const items = gastos.filter(g => g.compraId === cid);
  if (!items.length) return;
  montarConciliacion();
  $('cnTit').textContent = 'Conciliar con el ticket'; $('cnManual').hidden = false;
  cn = { cid, items, lineas: [], quitar: {}, total: '', repartir: true, origen: '', fecha: items[0].fecha, lugar: items[0].lugar || '' };
  const est = items.reduce((t, g) => t + g.monto, 0);
  $('cnSub').textContent = `${cn.lugar || 'Compra'} · ${fmtFecha(cn.fecha)} · hoy figura ${peso(est)}`;
  $('cnPaso1').hidden = false; $('cnPaso2').hidden = true; $('cnPie').hidden = true; $('cnEstado').textContent = '';
  $('conciliar').hidden = false; document.body.style.overflow = 'hidden';
  $('conciliar').scrollTop = 0;
}
// Escanear un ticket sin carrito previo: toda la compra sale de la foto
function abrirEscaneo() {
  montarConciliacion();
  cn = { cid: null, nuevo: true, items: [], lineas: [], quitar: {}, total: '', repartir: true, origen: '', fecha: hoyISO(), lugar: '' };
  $('cnTit').textContent = 'Registrar desde un ticket';
  $('cnSub').textContent = 'Los productos y el total salen de la foto';
  $('cnManual').hidden = true;
  $('cnPaso1').hidden = false; $('cnPaso2').hidden = true; $('cnPie').hidden = true; $('cnEstado').textContent = '';
  $('conciliar').hidden = false; document.body.style.overflow = 'hidden';
  $('conciliar').scrollTop = 0;
}
function cerrarConciliacion() { $('conciliar').hidden = true; document.body.style.overflow = ''; cn = null; }

async function procesarFoto(file, input) {
  if (input) input.value = '';
  if (!file) return;
  const estado = $('cnEstado');
  if (!ajustes.apiKey) { estado.textContent = 'Para leer la foto hace falta la clave de Gemini (Ajustes). Mientras tanto podés cargar los montos a mano.'; return; }
  const seguir = async () => {
    estado.textContent = 'Leyendo el ticket… puede tardar unos segundos.';
    $('cnFoto').disabled = $('cnGaleria').disabled = true;
    try {
      const img = await prepararImagen(file);
      const t = await leerTicket(img.base64, img.mime, cn.items.map(g => g.producto));
      cn.lineas = lineasDesdeTicket(t); cn.total = Number(t.total) > 0 ? String(t.total) : ''; cn.origen = 'foto'; cn.comercio = t.comercio || '';
      if (cn.nuevo) datosDelTicket(t);
      if (!cn.lineas.length) { estado.textContent = 'No pude leer ningún producto. Probá con otra foto (más cerca, derecha y con buena luz) o cargá los montos a mano.'; return; }
      mostrarPaso2(`Leí ${cn.lineas.length} renglón(es)${cn.comercio ? ' de ' + cn.comercio : ''}. Revisá que cada uno esté asociado al producto correcto y que los montos coincidan con el ticket.`);
    } catch (e) {
      estado.textContent = 'No se pudo leer el ticket: ' + e.message + '. Podés probar de nuevo o cargar los montos a mano.';
    } finally { $('cnFoto').disabled = $('cnGaleria').disabled = false; }
  };
  if (localStorage.getItem(TICKET_AVISO)) { await seguir(); return; }
  mostrarModal({
    titulo: 'La foto se envía a Google',
    html: '<p>Para leer el ticket, la foto se envía a <b>Google (Gemini)</b>. La app <b>no la guarda</b>.</p><p>Si el ticket tiene datos que no querés compartir (por ejemplo parte de una tarjeta), tapalos antes de sacar la foto.</p>',
    ok: 'Entendido, continuar', sec: 'Cancelar',
    alOk: () => { localStorage.setItem(TICKET_AVISO, '1'); seguir(); },
  });
}

function mostrarPaso2(info) {
  $('cnPaso1').hidden = true; $('cnPaso2').hidden = false; $('cnPie').hidden = false;
  $('cnInfo').textContent = info;
  cn.quitar = {};
  pintarFilas();
}

function leerCampo(el, confirmar) {
  const fila = el.closest('[data-i]'); if (!fila || !cn) return;
  const l = cn.lineas[+fila.dataset.i], k = el.dataset.cn;
  if (k === 'destino') l.destino = el.value;
  else if (k === 'cant') l.cant = el.value;
  else if (k === 'monto') l.monto = el.value;
  else if (k === 'nombre') { l.nombre = el.value; return; }
  else if (k === 'quitar') return;
  if (confirmar) pintarFilas(); else pintarTotales(false);
}

function pintarFilas() {
  const usados = new Set(cn.lineas.filter(l => l.destino !== 'nuevo' && l.destino !== 'ignorar').map(l => l.destino));
  const opciones = sel => cn.items.map(g => `<option value="${g.id}"${sel === g.id ? ' selected' : ''}>${esc(g.producto)}</option>`).join('')
    + `<option value="nuevo"${sel === 'nuevo' ? ' selected' : ''}>${cn.nuevo ? 'Registrar este producto' : 'Producto nuevo (no estaba en mi carrito)'}</option><option value="ignorar"${sel === 'ignorar' ? ' selected' : ''}>Ignorar este renglón</option>`;
  const filas = cn.lineas.map((l, i) => {
    const g = cn.items.find(x => x.id === l.destino), est = g ? g.estimado || g.monto : 0, dif = g ? numCn(l.monto) - est : 0;
    const chip = !g || l.destino === 'ignorar' ? '' : (Math.abs(dif) < 1 ? '<span class="tag">igual al estimado</span>' : `<span class="tag ${dif > 0 ? 'warn' : ''}">${dif > 0 ? '+' : '−'}${peso(Math.abs(dif))} vs estimado</span>`);
    return `<div class="cn-fila${l.destino === 'ignorar' ? ' cn-ign' : ''}" data-i="${i}">
      <div class="cn-t"><b>${esc(l.desc)}</b>${cn.origen === 'foto' ? '<small>renglón del ticket</small>' : '<small>producto de la compra</small>'}</div>
      ${l.destino === 'nuevo' ? `<input data-cn="nombre" type="text" value="${esc(l.nombre !== undefined ? l.nombre : limpiarDescTicket(l.desc))}" aria-label="Nombre del producto">` : ''}
      <select data-cn="destino" aria-label="Producto de la compra">${opciones(l.destino)}</select>
      <div class="cn-campos">
        <label>Cantidad<input data-cn="cant" type="number" inputmode="decimal" step="any" value="${l.cant === '' ? '' : l.cant}" placeholder="—"></label>
        <label>Monto real ($)<input data-cn="monto" type="number" inputmode="decimal" step="any" value="${l.monto === '' ? '' : l.monto}" placeholder="0"></label>
      </div>
      ${chip}
    </div>`;
  }).join('');
  const sin = cn.items.filter(g => !usados.has(g.id)).map(g => `<div class="cn-fila cn-sin">
      <div class="cn-t"><b>${esc(g.producto)}</b><small>No aparece en el ticket · estimado ${peso(g.monto)}</small></div>
      <label class="chk"><input type="checkbox" data-quitar="${g.id}" ${cn.quitar[g.id] === false ? '' : 'checked'}> Quitar de la compra</label>
    </div>`).join('');
  $('cnFilas').innerHTML = filas + (sin ? '<h2 style="margin-top:18px">Productos que no están en el ticket</h2>' + sin : '');
  $('cnFilas').querySelectorAll('[data-quitar]').forEach(c => c.addEventListener('change', () => { cn.quitar[c.dataset.quitar] = c.checked; pintarTotales(false); }));
  pintarTotales(true);
}

function pintarTotales(completo) {
  // "quitar" por defecto: un producto que no está en el ticket casi seguro no se compró
  for (const g of cn.items) if (cn.quitar[g.id] === undefined) cn.quitar[g.id] = true;
  const usados = new Set(cn.lineas.filter(l => l.destino !== 'nuevo' && l.destino !== 'ignorar').map(l => l.destino));
  let suma = 0;
  for (const l of cn.lineas) if (l.destino !== 'ignorar') suma += numCn(l.monto);
  for (const g of cn.items) if (!usados.has(g.id) && cn.quitar[g.id] === false) suma += g.monto;
  const total = numCn(cn.total), dif = total ? redondear2(total - suma) : 0;
  const bloque = !total ? '<span>Escribí el total que figura en el ticket para controlar la suma.</span>'
    : (Math.abs(dif) < 1 ? '<span class="ok">✓ La suma coincide con el total del ticket</span>'
      : `<span class="mal">${dif > 0 ? 'Faltan ' + peso(dif) + ' para llegar al' : 'Sobran ' + peso(-dif) + ' respecto del'} total del ticket</span>`);
  if (completo || !$('cnTotal')) {
    $('cnTotales').innerHTML = `<div class="cn-suma"><span>Suma de los productos</span><b id="cnSuma">${peso(suma)}</b></div>
      <label>Total del ticket ($)<input id="cnTotal" type="number" inputmode="decimal" step="any" value="${cn.total}" placeholder="Ej: 15250"></label>
      <div id="cnDif" class="cn-dif">${bloque}</div>
      <label class="chk"><input id="cnRepartir" type="checkbox" ${cn.repartir ? 'checked' : ''}> Si hay diferencia (descuentos, redondeos), repartirla entre los productos</label>`;
  } else { $('cnSuma').textContent = peso(suma); $('cnDif').innerHTML = bloque; }
}

function guardarConciliacion() {
  const usados = new Set(cn.lineas.filter(l => l.destino !== 'nuevo' && l.destino !== 'ignorar').map(l => l.destino));
  const acum = new Map(), nuevos = [];
  for (const l of cn.lineas) {
    const monto = numCn(l.monto);
    if (l.destino === 'ignorar' || !(monto > 0)) continue;
    if (l.destino === 'nuevo') { nuevos.push({ producto: (l.nombre !== undefined ? String(l.nombre).trim() : '') || limpiarDescTicket(l.desc), monto, cant: numCn(l.cant) }); continue; }
    const a = acum.get(l.destino) || { monto: 0, cant: 0 }; a.monto += monto; a.cant += numCn(l.cant); acum.set(l.destino, a);
  }
  if (cn.nuevo && !cn.cid) cn.cid = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const conMonto = acum.size + nuevos.length;
  if (!conMonto) { toast('Cargá al menos un monto real'); return; }
  const total = numCn(cn.total);
  const quitar = cn.items.filter(g => !usados.has(g.id) && cn.quitar[g.id] !== false).map(g => g.id);
  const resultado = [];
  for (const g of cn.items) {
    if (quitar.includes(g.id)) continue;
    if (acum.has(g.id)) {
      if (!(g.estimado > 0)) g.estimado = g.monto;
      g.monto = redondear2(acum.get(g.id).monto); g.conTicket = true;
      if (acum.get(g.id).cant) g.cantidadReal = acum.get(g.id).cant;
    }
    resultado.push(g);
  }
  const nuevosGastos = nuevos.map(n => ({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), producto: n.producto, monto: redondear2(n.monto), estimado: 0, dolar: Number(ajustes.dolar) || null,
    categoria: categoriaDe(n.producto, null, false), fecha: cn.fecha, lugar: cn.lugar, compraId: cn.cid, conTicket: true, ...(n.cant ? { cantidadReal: n.cant } : {}),
  }));
  // la diferencia con el total del ticket (descuentos generales, redondeos) se reparte en proporción
  const conTicket = [...resultado.filter(g => g.conTicket), ...nuevosGastos];
  const sumaFinal = [...resultado, ...nuevosGastos].reduce((t, g) => t + g.monto, 0);
  if (cn.repartir && total > 0 && conTicket.length && Math.abs(total - sumaFinal) >= 1) {
    const baseT = conTicket.reduce((t, g) => t + g.monto, 0), objetivo = baseT + (total - sumaFinal);
    if (objetivo > 0) { let acu = 0; conTicket.forEach((g, i) => { const m = i === conTicket.length - 1 ? redondear2(objetivo - acu) : redondear2(g.monto * objetivo / baseT); g.monto = Math.max(0.01, m); acu += g.monto; }); }
  }
  gastos = gastos.filter(g => !quitar.includes(g.id));
  gastos.push(...nuevosGastos);
  persistir();
  const cid = cn.cid, totalFinal = gastos.filter(g => g.compraId === cid).reduce((x, g) => x + g.monto, 0);
  const eraNuevo = cn.nuevo;
  cerrarConciliacion();
  abiertos.add(cid); renderHistorial();
  if (eraNuevo) document.querySelector('nav button[data-t=historial]').click();
  toast(eraNuevo ? `Compra registrada desde el ticket: ${peso(totalFinal)}` : `Compra conciliada con el ticket: ${peso(totalFinal)}`);
}

// Botón "Conciliar con ticket" dentro de cada compra del Historial
$('lista').addEventListener('click', e => {
  const b = e.target.closest('[data-conciliar]'); if (b) abrirConciliacion(b.dataset.conciliar);
});

// Botón "Escanear ticket" en Gasto directo
document.addEventListener('click', e => { if (e.target.closest('#escanear')) abrirEscaneo(); });
