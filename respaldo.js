// ---------- Copia de seguridad: Google Drive (carpeta propia de cada usuario) y envío manual ----------
// Cada persona conecta SU cuenta de Google: la app crea la carpeta "Gastos por voz" en SU Drive y guarda ahí
// "respaldo-gastos.json". Con el permiso "drive.file" la app solo puede ver los archivos que ella misma creó.
const GCLIENT_KEY = 'gastos.gclient';
const DRIVE_KEY = 'gastos.drive.v1';
const COPIA_MANUAL_KEY = 'gastos.copiaManual.v1';
const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive.file';
const NOMBRE_CARPETA = 'Gastos por voz';
const NOMBRE_ARCHIVO = 'respaldo-gastos.json';

const idCliente = () => ((localStorage.getItem(GCLIENT_KEY) || (typeof GOOGLE_CLIENT_ID !== 'undefined' ? GOOGLE_CLIENT_ID : '')) + '').trim();
let drive = cargar(DRIVE_KEY, {});
drive = { conectado: false, auto: true, ...drive };
const guardarDrive = () => localStorage.setItem(DRIVE_KEY, JSON.stringify(drive));
let restaurandoCopia = false;

// ---------- Contenido de la copia ----------
function construirCopia() {
  // Las claves de IA no se guardan en la copia: son personales y se vuelven a pegar en Ajustes.
  const { apiKey, groqKey, modelo, groqModelo, ...seguros } = ajustes;
  return { app: 'gastos-por-voz', version: 2, creado: new Date().toISOString(), gastos, precios, lugares, tarjetas, categoriasAprendidas: catsAprendidas, ajustes: seguros };
}

// Combina una copia con lo que hay en este celular, sin duplicar ni pisar lo existente
function aplicarCopia(d) {
  if (Array.isArray(d)) d = { gastos: d };
  restaurandoCopia = true;
  try {
    const ids = new Set(gastos.map(g => g.id));
    const nuevos = (d.gastos || []).filter(g => g && g.id && g.producto && g.monto > 0 && /^\d{4}-\d{2}-\d{2}$/.test(g.fecha) && !ids.has(g.id));
    const estabaVacio = !gastos.length;
    gastos.push(...nuevos); persistir();
    let nPrecios = 0;
    for (const p of d.precios || []) {
      if (p && p.nombre && p.precio > 0 && !buscarExacto(p.nombre)) { precios.push({ nombre: p.nombre, precio: p.precio, unidad: p.unidad || 'u', etiqueta: p.etiqueta || '' }); nPrecios++; }
    }
    precios.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')); guardarPrecios();
    for (const l of d.lugares || []) if (typeof l === 'string' && l && !lugares.some(x => x.toLowerCase() === l.toLowerCase())) lugares.push(l);
    localStorage.setItem(LS_LUGARES, JSON.stringify(lugares));
    for (const t of d.tarjetas || []) if (t && t.nombre && !tarjetas.some(x => x.nombre.toLowerCase() === String(t.nombre).toLowerCase())) tarjetas.push({ nombre: String(t.nombre), desde: t.desde === 1 ? 1 : 0 });
    guardarTarjetas(); pintarTodosLosPagos(); renderCuotas();
    catsAprendidas = { ...(d.categoriasAprendidas || {}), ...catsAprendidas };
    localStorage.setItem(LS_CATS, JSON.stringify(catsAprendidas));
    if (estabaVacio && d.ajustes) {   // celular nuevo: se recuperan también las preferencias (no las claves)
      for (const k of ['dolar', 'modoIA', 'confirmar', 'principal']) if (d.ajustes[k] !== undefined) ajustes[k] = d.ajustes[k];
      localStorage.setItem(LS_AJUSTES, JSON.stringify(ajustes)); cargarAjustes();
    }
    renderLugares(); renderHoy(); renderCompra(); renderHistorial();
    return { gastos: nuevos.length, precios: nPrecios };
  } finally { restaurandoCopia = false; }
}

// ---------- Autorización de Google (token de acceso en memoria, dura ~1 hora) ----------
let gToken = null, gTokenExp = 0, gCliente = null, gCargando = null;
const tokenValido = () => !!gToken && Date.now() < gTokenExp - 60000;
const hayGIS = () => !!(window.google && google.accounts && google.accounts.oauth2);

function cargarGIS() {
  if (hayGIS()) return Promise.resolve();
  if (gCargando) return gCargando;
  gCargando = new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => ok(); s.onerror = () => { gCargando = null; mal(new Error('Sin conexión con Google')); };
    document.head.appendChild(s);
  });
  return gCargando;
}

// Debe llamarse DENTRO de un toque del usuario y con GIS ya cargado (si no, el navegador bloquea la ventana de Google)
function obtenerToken(consentir) {
  if (tokenValido()) return Promise.resolve(gToken);
  if (!idCliente()) return Promise.reject(new Error('Falta el ID de cliente de Google'));
  const pedir = () => new Promise((ok, mal) => {
    if (!gCliente) {
      gCliente = google.accounts.oauth2.initTokenClient({ client_id: idCliente(), scope: SCOPE_DRIVE, callback: () => {} });
    }
    gCliente.callback = r => {
      if (r.error) return mal(new Error(r.error));
      gToken = r.access_token; gTokenExp = Date.now() + (Number(r.expires_in) || 3600) * 1000; ok(gToken);
    };
    gCliente.error_callback = e => mal(new Error((e && e.type) || 'ventana cerrada'));
    gCliente.requestAccessToken({ prompt: consentir ? 'consent' : '', hint: drive.email || undefined });
  });
  return hayGIS() ? pedir() : cargarGIS().then(pedir);
}

// ---------- Drive (API REST) ----------
async function driveFetch(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + gToken, ...(opts.headers || {}) } });
  if (r.ok) return r;
  let razon = '', msg = '';
  try { const j = await r.json(); razon = (j.error && j.error.errors && j.error.errors[0] && j.error.errors[0].reason) || ''; msg = (j.error && j.error.message) || ''; } catch {}
  const e = new Error(msg || ('HTTP ' + r.status)); e.status = r.status; e.razon = razon;
  if (r.status === 401) { gToken = null; gTokenExp = 0; }
  throw e;
}
const driveJson = async (url, opts) => (await driveFetch(url, opts)).json();

async function buscarEnDrive(q) {
  const r = await driveJson(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)&pageSize=10&spaces=drive`);
  return r.files || [];
}

async function asegurarCarpeta() {
  if (drive.carpetaId) return drive.carpetaId;
  const hay = await buscarEnDrive(`name='${NOMBRE_CARPETA}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  if (hay[0]) { drive.carpetaId = hay[0].id; guardarDrive(); return drive.carpetaId; }
  const c = await driveJson('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: NOMBRE_CARPETA, mimeType: 'application/vnd.google-apps.folder' }),
  });
  drive.carpetaId = c.id; guardarDrive(); return c.id;
}

async function buscarCopiaRemota() {
  const carpeta = await asegurarCarpeta();
  const hay = await buscarEnDrive(`name='${NOMBRE_ARCHIVO}' and '${carpeta}' in parents and trashed=false`);
  return hay[0] || null;
}

// Protección: la copia automática no pisa una copia grande con datos mucho más chicos (p. ej. tras borrar todo en este celular)
const muchoMenosQueLaCopia = () => (drive.cantidad || 0) > 5 && gastos.length < (drive.cantidad || 0) * 0.5;

async function subirCopia(forzar = false) {
  if (!tokenValido()) return false;
  if (!forzar && muchoMenosQueLaCopia()) {
    drive.pendiente = true;
    drive.error = `Este celular tiene bastante menos gastos (${gastos.length}) que la última copia (${drive.cantidad}). No se pisó la copia de Drive: tocá “Restaurar” o “Respaldar ahora” para decidir.`;
    guardarDrive(); pintarDrive(); return false;
  }
  try {
    const cuerpo = JSON.stringify(construirCopia());
    let id = drive.archivoId;
    if (!id) { const ex = await buscarCopiaRemota(); id = ex ? ex.id : null; }
    if (id) {
      try { await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: cuerpo }); }
      catch (e) { if (e.status === 404) { id = null; drive.archivoId = null; drive.carpetaId = null; } else throw e; }
    }
    if (!id) {
      const carpeta = await asegurarCarpeta();
      const limite = 'gastos' + Date.now();
      const multipart = `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: NOMBRE_ARCHIVO, parents: [carpeta] })}\r\n--${limite}\r\nContent-Type: application/json\r\n\r\n${cuerpo}\r\n--${limite}--`;
      const nuevo = await driveJson('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${limite}` }, body: multipart });
      id = nuevo.id;
    }
    drive.archivoId = id; drive.cantidad = gastos.length; drive.ultimo = new Date().toISOString(); drive.pendiente = false; drive.error = ''; guardarDrive(); pintarDrive();
    return true;
  } catch (e) {
    drive.pendiente = true;
    drive.error = /storageQuota|quota/i.test(e.razon || '') || /storage|quota|full/i.test(e.message)
      ? 'Tu Drive no tiene espacio libre. Podés enviar la copia por WhatsApp.'
      : (e.status === 401 ? 'Hay que volver a autorizar a Google.' : 'No se pudo guardar la copia en Drive (' + e.message + ').');
    guardarDrive(); pintarDrive();
    return false;
  }
}

// ---------- Copia automática al guardar ----------
let temporizadorDrive = null;
const programarSubida = () => { clearTimeout(temporizadorDrive); temporizadorDrive = setTimeout(subirCopia, 2000); };

// app.js llama a esta función cada vez que se guardan datos
function alGuardarDatos() {
  if (restaurandoCopia) return;
  avisoPrimerGuardado();
  if (!drive.conectado || drive.auto === false || !idCliente()) return;
  drive.pendiente = true; guardarDrive(); pintarDrive();
  if (tokenValido()) { programarSubida(); return; }
  // Sin token vigente: se renueva ahora, mientras el toque del usuario sigue "vivo" (si no, el navegador bloquea la ventana)
  obtenerToken(false).then(programarSubida).catch(() => pintarDrive());
}

// ---------- Acciones de los botones ----------
function fmtMomento(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

async function conectarDrive() {
  if (!idCliente()) { toast('Falta el ID de cliente de Google (Configuración avanzada)'); $('driveAvanzado').open = true; return; }
  try {
    await obtenerToken(true);
    try { const a = await driveJson('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)'); drive.email = (a.user && a.user.emailAddress) || drive.email || ''; } catch {}
    drive.conectado = true; drive.auto = true; guardarDrive(); pintarDrive();
    const remota = await buscarCopiaRemota();
    if (remota) {
      if (!confirm(`Encontré una copia en tu Drive (${fmtMomento(remota.modifiedTime)}).\n¿Traerla y combinarla con los datos de este celular?`)) {
        drive.conectado = false; guardarDrive(); pintarDrive(); toast('No se conectó Drive para no pisar tu copia'); return;
      }
      const txt = await (await driveFetch(`https://www.googleapis.com/drive/v3/files/${remota.id}?alt=media`)).text();
      const r = aplicarCopia(JSON.parse(txt));
      drive.archivoId = remota.id; guardarDrive();
      toast(`Copia traída: ${r.gastos} gasto(s) y ${r.precios} precio(s) nuevos`);
    }
    await subirCopia();
    toast('Google Drive conectado ✓');
  } catch (e) { toast('No se pudo conectar: ' + e.message); drive.conectado = false; guardarDrive(); pintarDrive(); }
}

async function respaldarAhora() {
  try { await obtenerToken(false); } catch (e) { toast('No se pudo autorizar: ' + e.message); return; }
  let forzar = false;
  if (muchoMenosQueLaCopia()) {
    if (!confirm(`Este celular tiene ${gastos.length} gastos y la última copia tiene ${drive.cantidad}.
¿Reemplazar la copia de Drive con los datos de este celular?`)) return;
    forzar = true;
  }
  const ok = await subirCopia(forzar);
  toast(ok ? 'Copia guardada en tu Drive ✓' : (drive.error || 'No se pudo guardar'));
}

async function restaurarDeDrive() {
  try {
    await obtenerToken(false);
    const remota = await buscarCopiaRemota();
    if (!remota) { toast('No hay ninguna copia en tu Drive todavía'); return; }
    if (!confirm(`Copia del ${fmtMomento(remota.modifiedTime)}.\n¿Combinarla con los datos de este celular?`)) return;
    const txt = await (await driveFetch(`https://www.googleapis.com/drive/v3/files/${remota.id}?alt=media`)).text();
    const r = aplicarCopia(JSON.parse(txt));
    toast(`Restaurado: ${r.gastos} gasto(s) y ${r.precios} precio(s) nuevos`);
  } catch (e) { toast('No se pudo restaurar: ' + e.message); }
}

function desconectarDrive() {
  if (!confirm('¿Desconectar Google Drive? La copia que ya está en tu Drive no se borra.')) return;
  try { if (gToken && hayGIS()) google.accounts.oauth2.revoke(gToken, () => {}); } catch {}
  gToken = null; gTokenExp = 0;
  drive = { conectado: false, auto: true }; guardarDrive(); pintarDrive();
  toast('Drive desconectado');
}

// Envío manual (WhatsApp, correo, Drive...): abre el menú de compartir del celular con el archivo de copia
function archivoCopia(tipo, ext) {
  const f = new Date().toISOString().slice(0, 10);
  return new File([JSON.stringify(construirCopia())], `respaldo-gastos-${f}.${ext}`, { type: tipo });
}
function descargarArchivo(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function enviarCopiaPorWhatsapp() {
  // Algunos celulares no dejan compartir ".json": se prueba también como archivo de texto
  for (const [tipo, ext] of [['application/json', 'json'], ['text/plain', 'txt']]) {
    const file = archivoCopia(tipo, ext);
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Copia de mis gastos', text: 'Copia de seguridad de la app Gastos por voz' });
        registrarCopiaManual(); return;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  descargarArchivo(archivoCopia('application/json', 'json'));
  toast('Se descargó la copia: adjuntala en WhatsApp o guardala donde quieras');
  registrarCopiaManual();
}

// ---------- Pantalla ----------
function pintarDrive() {
  if (!$('driveEstado')) return;
  const hayId = !!idCliente();
  $('driveBloque').hidden = !hayId;
  $('tituloManual').textContent = hayId ? 'Copia manual' : 'Copia de seguridad';
  $('driveConectar').hidden = drive.conectado;
  $('driveAcciones').hidden = !drive.conectado;
  $('driveAuto').checked = drive.auto !== false;
  let t;
  if (!hayId) t = 'La copia en Google Drive todavía no está habilitada en esta app. Mientras tanto, usá la copia manual de abajo.';
  else if (!drive.conectado) t = 'Conectá tu Google Drive para guardar una copia automática en una carpeta propia ("Gastos por voz"). Solo esta app puede ver ese archivo.';
  else {
    t = `✓ Conectado${drive.email ? ' como ' + drive.email : ''}\n`
      + (drive.ultimo ? `Última copia: ${fmtMomento(drive.ultimo)}` : 'Todavía no hay copia.')
      + (drive.pendiente ? '\n⏳ Hay cambios sin respaldar; se guardan al próximo guardado o con “Respaldar ahora”.' : '');
  }
  $('driveEstado').textContent = t;
  $('driveError').textContent = drive.conectado ? (drive.error || '') : '';
  $('driveError').hidden = !(drive.conectado && drive.error);
  const manual = localStorage.getItem(COPIA_MANUAL_KEY);
  $('copiaManualInfo').textContent = manual ? `Última copia manual: ${fmtMomento(manual)}` : 'Todavía no hiciste ninguna copia manual.';
  $('googleClientId').value = localStorage.getItem(GCLIENT_KEY) || '';
}

$('driveConectar').addEventListener('click', conectarDrive);
$('driveRespaldar').addEventListener('click', respaldarAhora);
$('driveRestaurar').addEventListener('click', restaurarDeDrive);
$('driveDesconectar').addEventListener('click', desconectarDrive);
$('driveAuto').addEventListener('change', () => { drive.auto = $('driveAuto').checked; guardarDrive(); });
$('googleClientId').addEventListener('change', () => { localStorage.setItem(GCLIENT_KEY, $('googleClientId').value.trim()); gCliente = null; pintarDrive(); });
$('copiaWsp').addEventListener('click', enviarCopiaPorWhatsapp);

// Se adelanta la carga del script de Google al abrir Ajustes, para que el botón "Conectar" pueda abrir la ventana de inmediato
document.querySelector('nav button[data-t=ajustes]').addEventListener('click', () => { if (idCliente()) cargarGIS().catch(() => {}); pintarDrive(); });
if (drive.conectado && idCliente()) cargarGIS().catch(() => {});

pintarDrive();

// ---------- Ventana de avisos (bienvenida, datos) ----------
function mostrarModal({ logo = false, titulo, html, ok, sec, alOk, alSec }) {
  $('modalLogo').hidden = !logo;
  $('modalTitulo').textContent = titulo; $('modalTexto').innerHTML = html;
  $('modalOk').textContent = ok; $('modalSec').hidden = !sec; if (sec) $('modalSec').textContent = sec;
  const cerrar = () => { $('modal').hidden = true; };
  $('modalOk').onclick = () => { cerrar(); if (alOk) alOk(); };
  $('modalSec').onclick = () => { cerrar(); if (alSec) alSec(); };
  $('modal').hidden = false;
}

function mostrarBienvenida() {
  if (localStorage.getItem('gastos.bienvenida.v1') || gastos.length) return;
  mostrarModal({
    logo: true, titulo: 'Bienvenido a Gastos por voz',
    html: '<ol class="pasos"><li>Dictá lo que vas comprando: <i>“dos kilos de tomate”</i>.</li><li>Revisá lo que entendió y tocá <b>✓</b>.</li><li>Al final, cargá el total de la caja y tocá <b>Guardar compra</b>.</li></ol><p class="hint">Tus datos se guardan solo en este celular. Hacé una copia de vez en cuando desde Ajustes.</p>',
    ok: 'Empezar', alOk: () => localStorage.setItem('gastos.bienvenida.v1', '1'),
    sec: window.__instalar ? 'Instalar la app' : '', alSec: () => { localStorage.setItem('gastos.bienvenida.v1', '1'); instalarApp(); },
  });
}

// La primera vez que se guarda algo: se explica dónde viven los datos
function avisoPrimerGuardado() {
  if (!gastos.length || localStorage.getItem('gastos.avisoDatos.v1')) return;
  localStorage.setItem('gastos.avisoDatos.v1', '1');
  protegerAlmacenamiento();
  if (drive.conectado) return;
  setTimeout(() => { if ($('modal').hidden) mostrarModal({
    titulo: 'Tus datos viven en este celular',
    html: '<p>Si borrás los datos del navegador o desinstalás la app, <b>se pierden los gastos</b>.</p><p>Con una copia los podés recuperar. Te la envío por WhatsApp con un toque.</p>',
    ok: 'Enviar copia ahora', sec: 'Más tarde', alOk: enviarCopiaPorWhatsapp,
  }); }, 1400);
}

// ---------- Recordatorio de copia (cada 14 días o cada 20 gastos nuevos) ----------
const REC_SNOOZE = 'gastos.recSnooze.v1', COPIA_CANT = 'gastos.copiaCantidad.v1', REC_TOAST = 'gastos.recToast.v1';
function registrarCopiaManual() {
  localStorage.setItem(COPIA_MANUAL_KEY, new Date().toISOString());
  localStorage.setItem(COPIA_CANT, String(gastos.length));
  pintarDrive(); pintarRecordatorio();
}
function debeRecordarCopia() {
  if (drive.conectado || gastos.length < 5) return false;
  if (Date.now() < Number(localStorage.getItem(REC_SNOOZE) || 0)) return false;
  const u = localStorage.getItem(COPIA_MANUAL_KEY), dias = u ? (Date.now() - new Date(u)) / 86400000 : Infinity;
  return dias > 14 || gastos.length - Number(localStorage.getItem(COPIA_CANT) || 0) >= 20;
}
function pintarRecordatorio() {
  const ver = debeRecordarCopia();
  $('recordatorioCopia').hidden = !ver;
  if (!ver) return;
  const u = localStorage.getItem(COPIA_MANUAL_KEY), n = gastos.length - Number(localStorage.getItem(COPIA_CANT) || 0);
  $('recordatorioTxt').textContent = u
    ? `Última copia: ${fmtMomento(u)} · desde entonces cargaste ${n} gasto(s) más.`
    : `Todavía no hiciste ninguna copia y ya tenés ${gastos.length} gastos cargados.`;
}
$('recMas').addEventListener('click', () => { localStorage.setItem(REC_SNOOZE, String(Date.now() + 7 * 86400000)); pintarRecordatorio(); });
$('recEnviar').addEventListener('click', enviarCopiaPorWhatsapp);
document.querySelector('nav button[data-t=historial]').addEventListener('click', pintarRecordatorio);

// ---------- Almacenamiento protegido: se le pide al celular que no borre los datos por falta de espacio ----------
async function protegerAlmacenamiento() {
  let ok = false;
  try { if (navigator.storage && navigator.storage.persist) ok = (await navigator.storage.persisted()) || (await navigator.storage.persist()); } catch {}
  localStorage.setItem('gastos.persistido', ok ? '1' : '0');
  pintarPersist(); return ok;
}
function pintarPersist() {
  if (!$('persistInfo')) return;
  $('persistInfo').textContent = localStorage.getItem('gastos.persistido') === '1'
    ? 'El celular marcó estos datos como protegidos contra el borrado automático por falta de espacio.'
    : 'Si el celular se queda sin espacio, podría borrar estos datos. Una copia de seguridad los protege.';
}

// ---------- Inicio ----------
protegerAlmacenamiento();
setTimeout(mostrarBienvenida, 700);
setTimeout(() => {   // un solo aviso por día como máximo
  const hoy = new Date().toISOString().slice(0, 10);
  if (debeRecordarCopia() && localStorage.getItem(REC_TOAST) !== hoy) { localStorage.setItem(REC_TOAST, hoy); toast('Hacé una copia de tus gastos: Historial o Ajustes'); }
}, 4000);
obtenerVersion(navigator.serviceWorker && navigator.serviceWorker.controller).then(v => {
  const el = $('versionApp'); if (el) el.textContent = v ? 'Versión ' + (v.match(/\d+/) || [v])[0] : '';
});

// ---------- Instalación como app ----------
const estaInstalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const esIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

function pintarInstalar() {
  const caja = $('instalarApp'); if (!caja) return;
  if (estaInstalada()) { caja.hidden = true; return; }
  caja.hidden = false;
  const puede = !!window.__instalar;
  $('instalarBtn').hidden = !puede;
  $('instalarTxt').textContent = puede
    ? 'Se instala como una app más, con su ícono en la pantalla de inicio.'
    : (esIphone()
      ? 'En Safari: tocá el botón Compartir y elegí «Agregar a pantalla de inicio».'
      : 'En Chrome: tocá los tres puntos ⋮ y elegí «Instalar aplicación» o «Agregar a la pantalla principal». Si no aparece, abrí este enlace directamente en Chrome (no desde WhatsApp ni otro navegador).');
}
async function instalarApp() {
  const ev = window.__instalar; if (!ev) return;
  ev.prompt();
  try { await ev.userChoice; } catch {}
  window.__instalar = null; pintarInstalar();
}
$('instalarBtn').addEventListener('click', instalarApp);
document.addEventListener('instalable', pintarInstalar);
document.addEventListener('instalada', () => { pintarInstalar(); toast('App instalada ✓'); });
pintarInstalar();
