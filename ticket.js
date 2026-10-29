// ---------- Conciliar una compra con el ticket (foto leída por IA) ----------
// El carrito trabaja con precios estimados; el ticket tiene los reales. Esta pantalla reemplaza el monto estimado de
// cada producto por el real. La foto se usa solo para leer los renglones: NO se guarda en la app.
const TICKET_AVISO = 'gastos.ticketAviso.v1';
let cn = null;   // estado de la conciliación abierta

const numCn = v => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const redondear2 = n => Math.round(n * 100) / 100;
const topeLargo = (ms = 35000) => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);

// "TOMATE PERITA X KG" => "Tomate perita x kg"
// El nombre del producto queda tal cual figura en el ticket (solo se acomodan los espacios)
const nombreTicket = d => String(d).trim().replace(/\s+/g, ' ');
const limpiarDescTicket = d => { const t = String(d).trim().replace(/\s+/g, ' ').toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };

// ---------- Foto: se reduce antes de enviarla (más rápido y gasta menos cuota) ----------
async function canvasDeArchivo(file, ladoMax = 2000) {
  let bmp;
  try { bmp = await createImageBitmap(file); }
  catch {
    bmp = await new Promise((ok, mal) => { const img = new Image(); img.onload = () => ok(img); img.onerror = () => mal(new Error('No se pudo abrir la imagen')); img.src = URL.createObjectURL(file); });
  }
  const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight, k = Math.min(1, ladoMax / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}
const base64DeCanvas = c => ({ base64: c.toDataURL('image/jpeg', 0.85).split(',')[1], mime: 'image/jpeg', ancho: c.width, alto: c.height });
async function prepararImagen(file, ladoMax = 2000) { return base64DeCanvas(await canvasDeArchivo(file, ladoMax)); }

// ---------- Recorte: se encuadra el ticket y se deja afuera lo que no sirve ----------
let rc = null;   // { cv: canvas de origen, x, y, w, h: recorte en píxeles del origen }
const RC_MIN = 60;
function pintarRecorte() {
  if (!rc) return;
  const l = $('cnLienzo'), k = l.getBoundingClientRect().width / rc.cv.width, m = $('cnMarco');
  m.style.left = rc.x * k + 'px'; m.style.top = rc.y * k + 'px'; m.style.width = rc.w * k + 'px'; m.style.height = rc.h * k + 'px';
}
function dibujarOrigen() {
  const l = $('cnLienzo'); l.width = rc.cv.width; l.height = rc.cv.height; l.getContext('2d').drawImage(rc.cv, 0, 0);
  rc.x = rc.y = 0; rc.w = rc.cv.width; rc.h = rc.cv.height;
  requestAnimationFrame(pintarRecorte);
}
function girarRecorte() {
  const o = rc.cv, c = document.createElement('canvas'); c.width = o.height; c.height = o.width;
  const g = c.getContext('2d'); g.translate(c.width, 0); g.rotate(Math.PI / 2); g.drawImage(o, 0, 0);
  rc.cv = c; dibujarOrigen();
}
function arrastrarRecorte(e) {
  const modo = e.target.dataset.rc || (e.target.id === 'cnMarco' ? 'mover' : ''); if (!modo || !rc) return;
  e.preventDefault();
  const k = $('cnLienzo').getBoundingClientRect().width / rc.cv.width, x0 = e.clientX, y0 = e.clientY, o = { ...rc }, W = rc.cv.width, H = rc.cv.height;
  const mover = ev => {
    const dx = (ev.clientX - x0) / k, dy = (ev.clientY - y0) / k;
    let x = o.x, y = o.y, r = o.x + o.w, b = o.y + o.h;
    if (modo === 'mover') { x = Math.min(Math.max(0, o.x + dx), W - o.w); y = Math.min(Math.max(0, o.y + dy), H - o.h); r = x + o.w; b = y + o.h; }
    else {
      if (modo.includes('w')) x = Math.min(Math.max(0, o.x + dx), r - RC_MIN);
      if (modo.includes('e')) r = Math.max(Math.min(W, o.x + o.w + dx), x + RC_MIN);
      if (modo.includes('n')) y = Math.min(Math.max(0, o.y + dy), b - RC_MIN);
      if (modo.includes('s')) b = Math.max(Math.min(H, o.y + o.h + dy), y + RC_MIN);
    }
    rc.x = x; rc.y = y; rc.w = r - x; rc.h = b - y; pintarRecorte();
  };
  const fin = () => { removeEventListener('pointermove', mover); removeEventListener('pointerup', fin); removeEventListener('pointercancel', fin); };
  addEventListener('pointermove', mover); addEventListener('pointerup', fin); addEventListener('pointercancel', fin);
}
async function abrirRecorte(file) {
  const estado = $('cnEstado'); estado.textContent = 'Abriendo la foto…';
  try { rc = { cv: await canvasDeArchivo(file) }; }
  catch (e) { estado.textContent = 'No se pudo abrir la foto: ' + e.message; return; }
  estado.textContent = '';
  $('cnPaso1').hidden = true; $('cnPasoRecorte').hidden = false;
  dibujarOrigen();
}
function cerrarRecorte() { $('cnPasoRecorte').hidden = true; $('cnPaso1').hidden = false; rc = null; }
function usarRecorte() {
  const c = document.createElement('canvas'); c.width = Math.round(rc.w); c.height = Math.round(rc.h);
  c.getContext('2d').drawImage(rc.cv, Math.round(rc.x), Math.round(rc.y), c.width, c.height, 0, 0, c.width, c.height);
  const img = base64DeCanvas(c); cerrarRecorte();
  enviarFoto([img]);
}

// ---------- Lectura del ticket con Gemini (acepta imágenes) ----------
async function leerTicket(imagenes, nombresCarrito) {
  const varias = imagenes.length > 1;
  const prompt = `Leé este ticket de compra de un comercio argentino y devolvé los datos en JSON.${varias ? `
- Son ${imagenes.length} capturas CONSECUTIVAS del mismo ticket, en orden de arriba hacia abajo. Se pueden superponer: si un renglón aparece repetido al final de una captura y al principio de la siguiente, es el mismo renglón y debe contarse UNA sola vez. El total suele figurar en la última.` : ''}
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
  return llamarGeminiImagenes(prompt, schema, imagenes);
}

// Pedido a Gemini con una o más imágenes; si el modelo está saturado o sin cuota se prueba el de respaldo
async function llamarGeminiImagenes(prompt, schema, imagenes, topeMs) {
  const modelos = [...new Set([ajustes.modelo || 'gemini-flash-latest', 'gemini-flash-lite-latest'])];
  let ultimo = '';
  for (const m of modelos) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
      signal: topeLargo(topeMs), method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': ajustes.apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, ...imagenes.map(im => ({ inline_data: { mime_type: im.mime, data: im.base64 } }))] }],
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

// ---------- Etiquetas de precio (balanza o góndola) ----------
async function leerEtiquetas(imagenes) {
  const prompt = `Cada imagen es la etiqueta de un producto de un comercio argentino: puede ser la etiqueta de una balanza (producto fraccionado, con peso y precio total) o la etiqueta de precio de una góndola. Devolvé en JSON la lista "etiquetas", UNA por imagen, con:
- "producto": el nombre tal cual figura en la etiqueta.
- "cantidad": el peso neto o la cantidad comprada (número). Si es una etiqueta de góndola sin peso, 1.
- "unidad": la unidad de esa cantidad: "kg", "g", "l" o "u". Los pesos de balanza como 1.042 kg significan 1,042 kilos (el punto separa los gramos).
- "precio_unitario": el precio por kilo, por litro o por unidad (el que figura como $/KG, precio por kg, o el precio de góndola), en pesos.
- "unidad_precio": "kg", "l" o "u".
- "total": el precio total a pagar si figura en la etiqueta; si no figura, 0.
Ignorá vencimiento, lote, código de barras, ingredientes y datos del comercio. Los importes argentinos usan punto para los miles y coma para los decimales.`;
  const schema = {
    type: 'OBJECT',
    properties: { etiquetas: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      producto: { type: 'STRING' }, cantidad: { type: 'NUMBER' }, unidad: { type: 'STRING' },
      precio_unitario: { type: 'NUMBER' }, unidad_precio: { type: 'STRING' }, total: { type: 'NUMBER' },
    }, required: ['producto', 'cantidad', 'unidad', 'precio_unitario', 'unidad_precio', 'total'] } } },
    required: ['etiquetas'],
  };
  const r = await llamarGeminiImagenes(prompt, schema, imagenes);
  return (r.etiquetas || []).map(e => {
    let unidad = ['kg', 'g', 'l', 'u'].includes(String(e.unidad).toLowerCase()) ? String(e.unidad).toLowerCase() : 'u';
    let up = ['kg', 'l', 'u'].includes(String(e.unidad_precio).toLowerCase()) ? String(e.unidad_precio).toLowerCase() : (unidad === 'g' ? 'kg' : unidad);
    let cantidad = Number(e.cantidad) || 1, precio = Number(e.precio_unitario) || 0; const total = Number(e.total) || 0;
    // si la etiqueta no trae precio por kilo pero sí total y peso, se calcula
    if (!(precio > 0) && total > 0) { const base = cantidad * (unidad === 'g' ? 0.001 : 1); precio = base > 0 ? Math.round(total / base * 100) / 100 : total; if (!up) up = unidad === 'g' ? 'kg' : unidad; }
    return { producto: nombreTicket(e.producto || ''), cantidad, unidad, precio, up, totalEtiqueta: total, guardar: true };
  }).filter(e => e.producto);
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
  // La IA a veces lee mal el año: solo se acepta la fecha del ticket si es de los últimos 45 días (si no, se usa hoy y se avisa)
  const f = String(t.fecha || ''), limite = new Date(); limite.setDate(limite.getDate() - 45);
  cn.avisoFecha = '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(f)) {
    if (f <= hoyISO() && f >= fechaISO(limite)) cn.fecha = f;
    else cn.avisoFecha = `La fecha que leí en el ticket (${fmtFecha(f)}) no parece correcta, así que puse la de hoy. Podés cambiarla abajo.`;
  }
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
        <p id="cnHint1" class="hint">Sacale una foto al ticket entero, derecho y bien iluminado. La IA lee los renglones y vos confirmás antes de guardar. <b>La foto no se guarda.</b></p>
        <p id="cnHint2" class="hint">¿Ticket largo en la pantalla del celular? Sacá varias capturas seguidas (que cada una repita un poco el final de la anterior) y elegilas todas juntas desde la galería.</p>
        <label class="cn-boton cn-prim"><svg class="ic"><use href="#i-camera"/></svg> Sacar foto<input id="cnFoto" type="file" accept="image/*" capture="environment" hidden></label>
        <label class="cn-boton"><svg class="ic"><use href="#i-image"/></svg> Elegir de la galería (una o varias)<input id="cnGaleria" type="file" accept="image/*" multiple hidden></label>
        <button id="cnManual" class="ghost" style="width:100%;margin-top:10px">Cargar los montos a mano</button>
        <p id="cnEstado" class="hint cn-estado"></p>
      </div>
      <div id="cnPasoRecorte" hidden>
        <p class="hint" style="margin-top:0">Arrastrá las esquinas para encuadrar solo el ticket (o movelo desde adentro). Dejá afuera todo lo que no sirva.</p>
        <div class="rc-caja"><div class="rc-wrap" id="cnWrap"><canvas id="cnLienzo"></canvas>
          <div id="cnMarco" class="rc-marco"><i data-rc="nw"></i><i data-rc="ne"></i><i data-rc="sw"></i><i data-rc="se"></i></div></div></div>
        <div class="rc-barra">
          <button id="rcGirar" class="ghost" type="button">↻ Girar</button>
          <button id="rcTodo" class="ghost" type="button">Foto entera</button>
          <button id="rcOtra" class="ghost" type="button">Otra foto</button>
        </div>
        <button id="rcUsar" class="primary" type="button" style="width:100%">Usar esta parte</button>
      </div>
      <div id="cnPasoEtq" hidden>
        <p id="cnEtqInfo" class="hint" style="margin-top:0"></p>
        <div id="cnEtqFilas"></div>
      </div>
      <div id="cnPaso2" hidden>
        <p id="cnInfo" class="hint" style="margin-top:0"></p>
        <div id="cnFilas"></div>
        <div id="cnTotales" class="cn-totales"></div>
        <label id="cnFechaL" hidden>Fecha de la compra<input id="cnFecha" type="date"></label>
        <div id="pagoTicket" class="pago" hidden></div>
        <div id="notaTicketL" hidden><label class="nota-campo">Observaciones <span class="nota">· opcional</span><input id="notaTicket" type="text" maxlength="140" autocomplete="off" placeholder="Ej: Reintegro del 20% en el próximo resumen"></label></div>
      </div>
    </div>
    <div id="cnPie" class="concil-pie" hidden>
      <button id="cnGuardar" class="primary" style="margin:0">Guardar conciliación</button>
    </div>
  </div>`);
  $('cnCerrar').addEventListener('click', cerrarConciliacion);
  $('cnFoto').addEventListener('change', e => procesarFoto([...e.target.files], e.target));
  $('cnGaleria').addEventListener('change', e => procesarFoto([...e.target.files], e.target));
  $('rcGirar').addEventListener('click', girarRecorte);
  $('rcTodo').addEventListener('click', () => { rc.x = rc.y = 0; rc.w = rc.cv.width; rc.h = rc.cv.height; pintarRecorte(); });
  $('rcOtra').addEventListener('click', cerrarRecorte);
  $('rcUsar').addEventListener('click', usarRecorte);
  $('cnPasoRecorte').addEventListener('pointerdown', arrastrarRecorte);
  $('cnManual').addEventListener('click', () => { cn.lineas = lineasDesdeCarrito(); cn.total = ''; cn.origen = 'manual'; mostrarPaso2('Completá el monto real de cada producto, tal como figura en el ticket.'); });
  $('cnGuardar').addEventListener('click', () => (cn && cn.etiqueta ? guardarEtiquetas() : guardarConciliacion()));
  $('cnEtqFilas').addEventListener('input', e => leerCampoEtq(e.target, false));
  $('cnEtqFilas').addEventListener('change', e => leerCampoEtq(e.target, true));
  $('cnEtqFilas').addEventListener('click', e => { const q = e.target.closest('[data-et-quitar]'); if (q && cn) { cn.etq.splice(+q.dataset.etQuitar, 1); if (!cn.etq.length) { volverAFoto(); return; } pintarEtq(); } });
  $('cnGuardar').textContent = 'Guardar';
  // los campos se leen al terminar de editar (así el teclado no pierde el foco); los totales se actualizan mientras se escribe
  $('cnFilas').addEventListener('change', e => leerCampo(e.target, true));
  $('cnFilas').addEventListener('input', e => leerCampo(e.target, false));
  $('cnTotales').addEventListener('input', e => { if (e.target.id === 'cnTotal') { cn.total = e.target.value; pintarTotales(false); } else if (e.target.id === 'cnModoDif') { cn.modoDif = e.target.value; } });
}

function abrirConciliacion(cid) {
  const items = gastos.filter(g => g.compraId === cid);
  if (!items.length) return;
  montarConciliacion();
  restaurarTextosFoto(); $('cnTit').textContent = 'Conciliar con el ticket'; $('cnManual').hidden = false; $('pagoTicket').hidden = true; $('notaTicketL').hidden = true;
  cn = { cid, items, lineas: [], quitar: {}, total: '', modoDif: 'ajuste', origen: '', fecha: items[0].fecha, lugar: items[0].lugar || '' };
  const est = items.reduce((t, g) => t + g.monto, 0);
  $('cnSub').textContent = `${cn.lugar || 'Compra'} · ${fmtFecha(cn.fecha)} · hoy figura ${peso(est)}`;
  $('cnPaso1').hidden = false; $('cnPasoRecorte').hidden = true; $('cnPaso2').hidden = true; $('cnPasoEtq').hidden = true; $('cnPie').hidden = true; $('cnEstado').textContent = '';
  $('conciliar').hidden = false; document.body.style.overflow = 'hidden';
  $('conciliar').scrollTop = 0;
}
// Escanear un ticket sin carrito previo: toda la compra sale de la foto
function abrirEscaneo() {
  montarConciliacion();
  cn = { cid: null, nuevo: true, items: [], lineas: [], quitar: {}, total: '', modoDif: 'ajuste', origen: '', fecha: hoyISO(), lugar: '' };
  restaurarTextosFoto(); $('cnTit').textContent = 'Registrar desde un ticket'; $('pagoTicket').hidden = false; $('notaTicketL').hidden = false; $('notaTicket').value = ''; pintarPago($('pagoTicket'), 1);
  $('cnSub').textContent = 'Los productos y el total salen de la foto';
  $('cnManual').hidden = true;
  $('cnPaso1').hidden = false; $('cnPasoRecorte').hidden = true; $('cnPaso2').hidden = true; $('cnPasoEtq').hidden = true; $('cnPie').hidden = true; $('cnEstado').textContent = '';
  $('conciliar').hidden = false; document.body.style.overflow = 'hidden';
  $('conciliar').scrollTop = 0;
}
function cerrarConciliacion() { $('conciliar').hidden = true; document.body.style.overflow = ''; cn = null; }

async function procesarFoto(archivos, input) {
  archivos = (Array.isArray(archivos) ? archivos : [archivos]).filter(Boolean);
  if (input) input.value = '';
  if (!archivos.length) return;
  if (!ajustes.apiKey) { $('cnEstado').textContent = 'Para leer la foto hace falta la clave de Gemini (Ajustes). Mientras tanto podés cargar los montos a mano.'; return; }
  if (archivos.length === 1) { await abrirRecorte(archivos[0]); return; }
  // varias capturas del mismo ticket: se envían juntas, en el orden en que se eligieron
  if (archivos.length > 8) { $('cnEstado').textContent = 'Elegí hasta 8 capturas por vez.'; return; }
  $('cnEstado').textContent = `Preparando ${archivos.length} capturas…`;
  try { await enviarFoto(await Promise.all(archivos.map(f => prepararImagen(f, 1600)))); }
  catch (e) { $('cnEstado').textContent = 'No se pudieron abrir las capturas: ' + e.message; }
}

async function enviarFoto(imgs) {
  const estado = $('cnEstado');
  const seguir = async () => {
    estado.textContent = 'Leyendo el ticket… puede tardar unos segundos.';
    $('cnFoto').disabled = $('cnGaleria').disabled = true;
    try {
      if (cn.etiqueta) {
        const lista = await leerEtiquetas(imgs);
        if (!lista.length) { estado.textContent = 'No pude leer ninguna etiqueta. Probá con otra foto: más cerca, derecha y sin reflejos.'; return; }
        mostrarEtiquetas(lista); return;
      }
      const t = await leerTicket(imgs, cn.items.map(g => g.producto));
      cn.lineas = lineasDesdeTicket(t); cn.total = Number(t.total) > 0 ? String(t.total) : ''; cn.origen = 'foto'; cn.comercio = t.comercio || '';
      if (cn.nuevo) datosDelTicket(t);
      if (!cn.lineas.length) { estado.textContent = 'No pude leer ningún producto. Probá con otra foto (más cerca, derecha y con buena luz) o encuadrá mejor el ticket.'; return; }
      mostrarPaso2(`Leí ${cn.lineas.length} renglón(es)${cn.comercio ? ' de ' + cn.comercio : ''}. Revisá que cada uno esté asociado al producto correcto y que los montos coincidan con el ticket.`);
    } catch (e) {
      estado.textContent = 'No se pudo leer ' + (cn.etiqueta ? 'la etiqueta' : 'el ticket') + ': ' + e.message + '. Podés probar de nuevo' + (cn.nuevo || cn.etiqueta ? '.' : ' o cargar los montos a mano.');
    } finally { $('cnFoto').disabled = $('cnGaleria').disabled = false; }
  };
  if (localStorage.getItem(TICKET_AVISO)) { await seguir(); return; }
  mostrarModal({
    titulo: 'La foto se envía a Google',
    html: '<p>Para leer el ticket, la foto se envía a <b>Google (Gemini)</b>. La app <b>no la guarda</b>.</p><p>Si el ticket tiene datos que no querés compartir (por ejemplo parte de una tarjeta), dejalos afuera al encuadrar la foto.</p>',
    ok: 'Entendido, continuar', sec: 'Cancelar',
    alOk: () => { localStorage.setItem(TICKET_AVISO, '1'); seguir(); },
  });
}

function mostrarPaso2(info) {
  $('cnPaso1').hidden = true; $('cnPaso2').hidden = false; $('cnPie').hidden = false;
  $('cnInfo').textContent = info + (cn.avisoFecha ? ' ' + cn.avisoFecha : '');
  $('cnFechaL').hidden = !cn.nuevo;
  if (cn.nuevo) { $('cnFecha').value = cn.fecha; $('cnFecha').max = hoyISO(); }
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
      ${l.destino === 'nuevo' ? `<input data-cn="nombre" type="text" value="${esc(l.nombre !== undefined ? l.nombre : nombreTicket(l.desc))}" aria-label="Nombre del producto">` : ''}
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

// Una promoción general o un recargo se registra como un renglón aparte ("Descuento" con monto negativo / "Recargo")
const textoAjuste = dif => (dif < 0 ? 'Registrarla como descuento' : (dif > 0 ? 'Registrarla como recargo (otros cargos)' : 'Registrarla como descuento o recargo'));
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
      <label>Si hay diferencia con el total del ticket
        <select id="cnModoDif"><option value="ajuste"${cn.modoDif === 'ajuste' ? ' selected' : ''}>${textoAjuste(dif)}</option><option value="repartir"${cn.modoDif === 'repartir' ? ' selected' : ''}>Repartirla entre los productos</option><option value="nada"${cn.modoDif === 'nada' ? ' selected' : ''}>No registrarla (queda la suma de los productos)</option></select></label>`;
  } else { $('cnSuma').textContent = peso(suma); $('cnDif').innerHTML = bloque; $('cnModoDif').options[0].textContent = textoAjuste(dif); }
}

function guardarConciliacion() {
  if (cn.nuevo && $('cnFecha').value) cn.fecha = $('cnFecha').value;
  const pago = cn.nuevo ? leerPago($('pagoTicket')) : {};
  if (pago === null) return;
  // la observación de la compra: la que escribís al escanear, o la que ya tenía al volver a conciliar
  const nota = cn.nuevo ? ($('notaTicket').value || '').trim() : ((cn.items.find(g => g.nota) || {}).nota || '');
  const conNota = () => (nota ? { nota } : {});
  const usados = new Set(cn.lineas.filter(l => l.destino !== 'nuevo' && l.destino !== 'ignorar').map(l => l.destino));
  const acum = new Map(), nuevos = [];
  for (const l of cn.lineas) {
    const monto = numCn(l.monto);
    if (l.destino === 'ignorar' || !(monto > 0)) continue;
    if (l.destino === 'nuevo') { nuevos.push({ producto: (l.nombre !== undefined ? String(l.nombre).trim() : '') || nombreTicket(l.desc), monto, cant: numCn(l.cant) }); continue; }
    const a = acum.get(l.destino) || { monto: 0, cant: 0, nombres: [] }; a.monto += monto; a.cant += numCn(l.cant); if (cn.origen === 'foto' && !a.nombres.includes(nombreTicket(l.desc))) a.nombres.push(nombreTicket(l.desc)); acum.set(l.destino, a);
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
      if (acum.get(g.id).nombres.length) g.producto = acum.get(g.id).nombres.join(' / ');   // el nombre del ticket reemplaza al que dictaste
      if (acum.get(g.id).cant) g.cantidadReal = acum.get(g.id).cant;
    }
    resultado.push(g);
  }
  const nuevosGastos = nuevos.map(n => ({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), producto: n.producto, monto: redondear2(n.monto), estimado: 0, dolar: Number(ajustes.dolar) || null,
    categoria: categoriaDe(n.producto, null, false), fecha: cn.fecha, lugar: cn.lugar, compraId: cn.cid, conTicket: true, ...conPago(pago), ...conNota(), ...(n.cant ? { cantidadReal: n.cant } : {}),
  }));
  // diferencia con el total del ticket: descuento/recargo como renglón aparte, o repartida en proporción
  const conTicket = [...resultado.filter(g => g.conTicket), ...nuevosGastos];
  const sumaFinal = [...resultado, ...nuevosGastos].reduce((t, g) => t + g.monto, 0);
  if (cn.modoDif === 'ajuste' && total > 0 && Math.abs(total - sumaFinal) >= 1) {
    const d = redondear2(total - sumaFinal);
    nuevosGastos.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), producto: d < 0 ? 'Descuento' : 'Recargo', monto: d, estimado: 0, dolar: Number(ajustes.dolar) || null,
      categoria: d < 0 ? 'Descuentos' : 'Otros', fecha: cn.fecha, lugar: cn.lugar, compraId: cn.cid, conTicket: true, ...conPago(pago), ...conNota(),
    });
  }
  if (cn.modoDif === 'repartir' && total > 0 && conTicket.length && Math.abs(total - sumaFinal) >= 1) {
    const baseT = conTicket.reduce((t, g) => t + g.monto, 0), objetivo = baseT + (total - sumaFinal);
    if (objetivo > 0) { let acu = 0; conTicket.forEach((g, i) => { const m = i === conTicket.length - 1 ? redondear2(objetivo - acu) : redondear2(g.monto * objetivo / baseT); g.monto = Math.max(0.01, m); acu += g.monto; }); }
  }
  gastos = gastos.filter(g => !quitar.includes(g.id));
  gastos.push(...nuevosGastos);
  persistir();
  const cid = cn.cid, totalFinal = gastos.filter(g => g.compraId === cid).reduce((x, g) => x + g.monto, 0);
  const eraNuevo = cn.nuevo; if (eraNuevo) reiniciarCuotas($('pagoTicket'));
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


// ---------- Escanear etiqueta (Compra → cámara junto al micrófono) ----------
let textosFoto = null;
function restaurarTextosFoto() {
  if (!textosFoto) textosFoto = [$('cnHint1').innerHTML, $('cnHint2').innerHTML];
  $('cnHint1').innerHTML = textosFoto[0]; $('cnHint2').innerHTML = textosFoto[1]; $('cnHint2').hidden = false;
  $('cnGuardar').textContent = 'Guardar'; $('cnPasoEtq').hidden = true;
}
function abrirEtiqueta() {
  montarConciliacion(); restaurarTextosFoto();
  cn = { etiqueta: true, items: [], lineas: [], quitar: {}, total: '', modoDif: 'nada', origen: '', fecha: hoyISO(), lugar: '', etq: [] };
  $('cnTit').textContent = 'Escanear etiqueta'; $('cnSub').textContent = 'Producto con precio: balanza o góndola';
  $('cnHint1').innerHTML = 'Sacale una foto a la <b>etiqueta de precio</b> (la de la balanza o la de la góndola). La IA lee el producto, el peso y el precio, y vos confirmás antes de agregarlo al carrito. <b>La foto no se guarda.</b>';
  $('cnHint2').innerHTML = 'Podés elegir <b>varias fotos</b> desde la galería: se lee una etiqueta por foto.';
  $('cnManual').hidden = true;
  $('cnPaso1').hidden = false; $('cnPasoRecorte').hidden = true; $('cnPaso2').hidden = true; $('cnPasoEtq').hidden = true; $('cnPie').hidden = true; $('cnEstado').textContent = '';
  $('conciliar').hidden = false; document.body.style.overflow = 'hidden'; $('conciliar').scrollTop = 0;
}
function volverAFoto() { $('cnPasoEtq').hidden = true; $('cnPie').hidden = true; $('cnPaso1').hidden = false; $('cnEstado').textContent = ''; }

function mostrarEtiquetas(lista) {
  cn.etq = lista;
  $('cnPaso1').hidden = true; $('cnPasoEtq').hidden = false; $('cnPie').hidden = false; $('cnGuardar').textContent = 'Agregar al carrito';
  $('cnEtqInfo').textContent = `Leí ${lista.length} etiqueta(s). Revisá el nombre, la cantidad y el precio; el total se calcula solo.`;
  pintarEtq();
}
const nombreUp = { kg: 'kilo', l: 'litro', u: 'unidad' };
function totalEtq(e) { return subtotal({ cantidad: Number(e.cantidad) || 0, unidad: e.unidad, precio: Number(e.precio) || 0, up: e.up }); }
function textoTotalEtq(e) {
  const t = totalEtq(e);
  if (t === null) return '<span class="mal">revisá la unidad</span>';
  const dif = e.totalEtiqueta > 0 && Math.abs(t - e.totalEtiqueta) / e.totalEtiqueta > 0.02;
  return `<b>${peso(t)}</b>${dif ? `<small class="mal"> · la etiqueta dice ${peso(e.totalEtiqueta)}: revisá peso y precio</small>` : (e.totalEtiqueta > 0 ? '<small class="ok"> · coincide con la etiqueta</small>' : '')}`;
}
function pintarEtq() {
  $('cnEtqFilas').innerHTML = cn.etq.map((e, i) => `<div class="cn-fila" data-i="${i}">
    <input data-et="producto" type="text" value="${esc(e.producto)}" aria-label="Producto">
    <div class="cn-campos">
      <label>Cantidad<input data-et="cantidad" type="number" inputmode="decimal" step="any" value="${e.cantidad}"></label>
      <label>Unidad<select data-et="unidad">${['kg', 'g', 'l', 'u'].map(u => `<option${u === e.unidad ? ' selected' : ''}>${u}</option>`).join('')}</select></label>
    </div>
    <div class="cn-campos">
      <label>Precio ($)<input data-et="precio" type="number" inputmode="decimal" step="any" value="${e.precio}"></label>
      <label>Por<select data-et="up">${['kg', 'l', 'u'].map(u => `<option value="${u}"${u === e.up ? ' selected' : ''}>${nombreUp[u]}</option>`).join('')}</select></label>
    </div>
    <div class="cn-suma"><span>Total</span><span data-et-total>${textoTotalEtq(e)}</span></div>
    <label class="chk"><input data-et="guardar" type="checkbox" ${e.guardar ? 'checked' : ''}> Guardar el precio en mi lista de precios</label>
    <button class="ghost" type="button" data-et-quitar="${i}" style="width:100%;margin-top:8px">Quitar esta etiqueta</button>
  </div>`).join('');
}
function leerCampoEtq(el, confirmar) {
  const k = el.dataset && el.dataset.et, fila = el.closest('[data-i]'); if (!k || !fila || !cn) return;
  const e = cn.etq[+fila.dataset.i];
  e[k] = el.type === 'checkbox' ? el.checked : el.value;
  if (k !== 'producto' && k !== 'guardar') fila.querySelector('[data-et-total]').innerHTML = textoTotalEtq({ ...e, cantidad: e.cantidad, precio: e.precio });
}
function guardarEtiquetas() {
  const malos = cn.etq.filter(e => !String(e.producto).trim() || !(Number(e.cantidad) > 0) || !(Number(e.precio) > 0) || totalEtq(e) === null);
  if (malos.length) { toast('Revisá el producto, la cantidad, la unidad y el precio'); return; }
  let precios_guardados = 0;
  for (const e of cn.etq) {
    const nombre = String(e.producto).trim();
    carrito.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), producto: nombre, cantidad: Number(e.cantidad), unidad: e.unidad, precio: Number(e.precio), up: e.up });
    if (e.guardar) { setPrecio(nombre, Number(e.precio), e.up, ''); precios_guardados++; }
  }
  const n = cn.etq.length;
  guardarCarrito(); renderCompra(); cerrarConciliacion();
  toast(`${n} producto(s) al carrito${precios_guardados ? ' · ' + precios_guardados + ' precio(s) guardado(s)' : ''}`);
}
document.addEventListener('click', e => { if (e.target.closest('#cEtiqueta')) abrirEtiqueta(); });
