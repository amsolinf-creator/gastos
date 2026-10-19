// ---------- Medio de pago, tarjetas y cuotas ----------
// Cada gasto puede llevar un "pago": { medio, tarjeta?, cuotas? }. Con tarjeta de crédito, el total de la compra se divide
// en cuotas iguales y la sección "Cuotas" lleva la cuenta de cada tarjeta mes a mes.
const LS_TARJETAS = 'gastos.tarjetas.v1';
const LS_PAGO = 'gastos.pago.v1';
let tarjetas = cargar(LS_TARJETAS, []);   // [{ nombre, desde }]  desde: 0 = la 1ª cuota cae el mes de la compra, 1 = el mes siguiente
let pagoUlt = { medio: '', tarjeta: '', ...cargar(LS_PAGO, {}) };   // lo último que elegiste: se sugiere en la próxima compra
const guardarTarjetas = () => { localStorage.setItem(LS_TARJETAS, JSON.stringify(tarjetas)); if (typeof alGuardarDatos === 'function') alGuardarDatos(); if (typeof renderMisTarjetas === 'function') renderMisTarjetas(); };
const guardarPagoUlt = () => { try { localStorage.setItem(LS_PAGO, JSON.stringify(pagoUlt)); } catch {} };

async function agregarTarjeta(texto) {
  const n = (texto !== undefined ? texto : await pedirTexto({ titulo: 'Nueva tarjeta', placeholder: 'Ej: Cordobesa, Visa Galicia' })).trim();
  if (!n) return '';
  const ya = tarjetas.find(t => t.nombre.toLowerCase() === n.toLowerCase());
  if (ya) return ya.nombre;
  const nombre = n.charAt(0).toUpperCase() + n.slice(1);
  tarjetas.push({ nombre, desde: 0 }); guardarTarjetas();
  return nombre;
}

// ---------- Selector reutilizable (Compra, Gasto, Ticket y edición del Historial) ----------
function pintarPago(c, cuotas) {
  if (!c) return;
  const inp = c.querySelector('[data-p=cuotas]');
  const cuo = cuotas !== undefined ? cuotas : (inp ? inp.value : '1');
  const opT = tarjetas.map(t => `<option${t.nombre === pagoUlt.tarjeta ? ' selected' : ''}>${esc(t.nombre)}</option>`).join('');
  c.innerHTML = `<label><span class="lab"><svg class="ic ic-s"><use href="#i-card"/></svg> Medio de pago</span>
      <select data-p="medio"><option value="">Sin especificar</option>${MEDIOS.map(m => `<option${m === pagoUlt.medio ? ' selected' : ''}>${m}</option>`).join('')}</select></label>
    <div class="pago-cred"${pagoUlt.medio === CREDITO ? '' : ' hidden'}>
      <label>Tarjeta<select data-p="tarjeta"><option value="">Elegí la tarjeta…</option>${opT}<option value="__nueva__">➕ Agregar tarjeta…</option></select></label>
      <label>Cantidad de cuotas <span class="nota">· 1 = un solo pago</span><input data-p="cuotas" type="number" inputmode="numeric" min="1" max="60" step="1" value="${esc(cuo)}"></label>
    </div>`;
}
const pintarTodosLosPagos = () => document.querySelectorAll('.pago').forEach(c => { if (c.dataset.fijo === undefined) pintarPago(c); });

document.addEventListener('change', async e => {
  const k = e.target.dataset && e.target.dataset.p, c = e.target.closest && e.target.closest('.pago');
  if (!k || !c) return;
  if (k === 'medio') pagoUlt.medio = e.target.value;
  else if (k === 'tarjeta') {
    if (e.target.value === '__nueva__') pagoUlt.tarjeta = (await agregarTarjeta()) || pagoUlt.tarjeta;
    else pagoUlt.tarjeta = e.target.value;
  } else return;
  guardarPagoUlt();
  document.querySelectorAll('.pago').forEach(x => pintarPago(x));
});

// Devuelve {} si no se eligió medio, el pago, o null si falta algo (ya avisó con un cartel)
function leerPago(c) {
  if (!c || !pagoUlt.medio) return {};
  if (pagoUlt.medio !== CREDITO) return { medio: pagoUlt.medio };
  if (!pagoUlt.tarjeta) { toast('Elegí con qué tarjeta pagaste'); return null; }
  const inp = c.querySelector('[data-p=cuotas]');
  const cuotas = Math.max(1, Math.min(60, Math.round(Number(inp && inp.value) || 1)));
  return { medio: CREDITO, tarjeta: pagoUlt.tarjeta, cuotas };
}
const reiniciarCuotas = c => { const i = c && c.querySelector('[data-p=cuotas]'); if (i) i.value = 1; };
const conPago = pago => (pago && pago.medio ? { pago: { ...pago } } : {});

// ---------- Cálculo de cuotas ----------
const esCredito = p => !!p && /cr[eé]dito/i.test(String(p.medio || ''));
const mesDeFecha = f => { const [y, m] = f.split('-').map(Number); return y * 12 + (m - 1); };
const etqMes = k => `${MESES[k % 12].slice(0, 3)} ${Math.floor(k / 12)}`;
const mesActualK = () => { const d = new Date(); return d.getFullYear() * 12 + d.getMonth(); };

// Un plan = una compra (o gasto directo) pagada con tarjeta de crédito
function planesCuotas() {
  const m = new Map(), cur = mesActualK();
  for (const g of gastos) {
    if (!esCredito(g.pago) || !g.pago.tarjeta) continue;
    const k = g.compraId || g.id;
    let p = m.get(k);
    if (!p) { p = { key: k, tarjeta: g.pago.tarjeta, cuotas: Math.max(1, g.pago.cuotas || 1), fecha: g.fecha, lugar: g.lugar || '', total: 0, nombres: [] }; m.set(k, p); }
    p.total += Number(g.monto) || 0; p.nombres.push(g.producto);
  }
  return [...m.values()].map(p => {
    const t = tarjetas.find(x => x.nombre === p.tarjeta);
    p.ini = mesDeFecha(p.fecha) + (t ? t.desde : 0);
    p.valor = p.total / p.cuotas;
    p.n = cur - p.ini + 1;                                   // número de la cuota de este mes (≤0: todavía no empieza; >cuotas: terminó)
    p.pagadas = Math.max(0, Math.min(p.cuotas, cur - p.ini));   // cuotas de meses anteriores
    p.faltan = p.cuotas - p.pagadas;                         // incluye la de este mes
    p.saldo = p.valor * p.faltan;
    p.fin = p.ini + p.cuotas - 1;
    p.desc = p.lugar || (p.nombres.length > 2 ? `${p.nombres.slice(0, 2).join(', ')} y ${p.nombres.length - 2} más` : p.nombres.join(', '));
    return p;
  });
}
const cuotaDelMes = (p, k) => (k >= p.ini && k <= p.fin ? p.valor : 0);

// ---------- Mis tarjetas (Ajustes): ver, agregar, renombrar y quitar ----------
const usosTarjeta = nom => new Set(gastos.filter(g => g.pago && g.pago.tarjeta === nom).map(g => g.compraId || g.id)).size;
function renderMisTarjetas() {
  const c = $('misTarjetas'); if (!c) return;
  c.innerHTML = (tarjetas.length ? tarjetas.map((t, i) => {
    const n = usosTarjeta(t.nombre);
    return `<div class="mt-fila"><div class="mt-t"><b><svg class="ic ic-s"><use href="#i-card"/></svg> ${esc(t.nombre)}</b><small>${n ? n + ' compra(s) con esta tarjeta' : 'Sin compras todavía'}</small></div>
      <div class="mt-acc"><button class="ghost" data-mt-ren="${i}">Renombrar</button><button class="ghost del" data-mt-del="${i}">Quitar</button></div>
      <label class="mt-conf">Primera cuota de cada compra
        <select data-mt-desde="${i}"><option value="0"${t.desde === 0 ? ' selected' : ''}>cae el mes de la compra</option><option value="1"${t.desde === 1 ? ' selected' : ''}>cae el mes siguiente</option></select></label></div>`;
  }).join('') : '<p class="hint" style="margin:0 0 4px">Todavía no cargaste ninguna tarjeta. Agregá las que usás y después las elegís con un toque al registrar un gasto.</p>')
    + `<div class="mt-nueva"><input id="mtNombre" type="text" placeholder="Nombre (ej: Cordobesa, Visa Galicia)" maxlength="40"><button id="mtAgregar" class="primary">Agregar</button></div>`;
}
async function renombrarTarjeta(i) {
  const t = tarjetas[i]; if (!t) return;
  const n = await pedirTexto({ titulo: 'Renombrar tarjeta', valor: t.nombre });
  if (!n || n === t.nombre) return;
  const otra = tarjetas.find((x, j) => j !== i && x.nombre.toLowerCase() === n.toLowerCase());
  if (otra && !confirm(`Ya tenés una tarjeta «${otra.nombre}». ¿Unirlas? Los gastos de «${t.nombre}» pasarán a «${otra.nombre}».`)) return;
  const nuevo = otra ? otra.nombre : n.charAt(0).toUpperCase() + n.slice(1), viejo = t.nombre;
  let cambiados = 0;
  for (const g of gastos) if (g.pago && g.pago.tarjeta === viejo) { g.pago.tarjeta = nuevo; cambiados++; }
  if (otra) tarjetas.splice(i, 1); else t.nombre = nuevo;
  if (pagoUlt.tarjeta === viejo) { pagoUlt.tarjeta = nuevo; guardarPagoUlt(); }
  guardarTarjetas(); if (cambiados) persistir();
  pintarTodosLosPagos(); renderCuotas(); renderHistorial();
  toast(cambiados ? `Tarjeta renombrada (${cambiados} gasto(s) actualizados)` : 'Tarjeta renombrada');
}
$('misTarjetas').addEventListener('click', async e => {
  if (e.target.closest('#mtAgregar')) {
    const inp = $('mtNombre'), n = inp.value.trim();
    if (!n) { toast('Escribí el nombre de la tarjeta'); inp.focus(); return; }
    const ya = tarjetas.some(t => t.nombre.toLowerCase() === n.toLowerCase());
    await agregarTarjeta(n); pintarTodosLosPagos(); renderCuotas(); toast(ya ? 'Esa tarjeta ya estaba cargada' : 'Tarjeta agregada');
    return;
  }
  const r = e.target.closest('[data-mt-ren]'); if (r) { renombrarTarjeta(+r.dataset.mtRen); return; }
  const d = e.target.closest('[data-mt-del]');
  if (d) {
    const t = tarjetas[+d.dataset.mtDel]; if (!t) return;
    const n = usosTarjeta(t.nombre);
    if (!confirm(`¿Quitar la tarjeta ${t.nombre} de la lista?${n ? '\nLas ' + n + ' compra(s) ya cargadas se mantienen y siguen apareciendo en Cuotas.' : ''}`)) return;
    tarjetas.splice(+d.dataset.mtDel, 1); guardarTarjetas();
    if (pagoUlt.tarjeta === t.nombre) { pagoUlt.tarjeta = ''; guardarPagoUlt(); }
    pintarTodosLosPagos(); renderCuotas();
  }
});
$('misTarjetas').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'mtNombre') { e.preventDefault(); $('mtAgregar').click(); } });
$('misTarjetas').addEventListener('change', e => {
  const i = e.target.dataset.mtDesde; if (i === undefined || !tarjetas[+i]) return;
  tarjetas[+i].desde = Number(e.target.value) === 1 ? 1 : 0; guardarTarjetas(); renderCuotas();
});

// Cada tarjeta tiene su propio tono suave (se asigna una vez y se conserva) para distinguirlas de un vistazo
const TONOS = [210, 150, 30, 280, 340, 180, 55, 0];
function tonoTarjeta(nom) {
  const t = tarjetas.find(x => x.nombre === nom);
  if (t) {
    if (t.tono === undefined) {
      const usados = new Set(tarjetas.map(x => x.tono)), libre = TONOS.find(h => !usados.has(h));
      t.tono = libre !== undefined ? libre : TONOS[tarjetas.indexOf(t) % TONOS.length];
      try { localStorage.setItem(LS_TARJETAS, JSON.stringify(tarjetas)); } catch {}
    }
    return t.tono;
  }
  let h = 0; for (const ch of String(nom)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

// ---------- Pantalla de Cuotas ----------
function renderCuotas() {
  try { renderCuotasInterno(); }
  catch (e) { $('cuotasCont').innerHTML = `<div class="vacio">No pude armar la pantalla de cuotas.<br><small>${esc(e && e.message || e)}</small></div>`; }
}
function renderCuotasInterno() {
  const planes = planesCuotas(), cur = mesActualK();
  const nombres = [...new Set([...tarjetas.map(t => t.nombre), ...planes.map(p => p.tarjeta)])];
  const delMes = planes.reduce((t, p) => t + cuotaDelMes(p, cur), 0);
  const saldo = planes.filter(p => p.faltan > 0).reduce((t, p) => t + p.saldo, 0);
  let h = `<div class="cards"><div class="card"><small>A pagar en ${etqMes(cur)}</small><b>${peso(delMes)}</b></div><div class="card"><small>Saldo en cuotas</small><b>${peso(saldo)}</b></div></div>`;

  if (planes.some(p => p.faltan > 0)) {
    // desde este mes hasta la última cuota pendiente (al menos 6 meses, como máximo 3 años)
    const hasta = Math.min(cur + 35, Math.max(cur + 5, ...planes.filter(p => p.faltan > 0).map(p => p.fin)));
    const meses = Array.from({ length: hasta - cur + 1 }, (_, i) => cur + i).map(k => ({ k, v: planes.reduce((t, p) => t + cuotaDelMes(p, k), 0) }));
    const max = Math.max(...meses.map(x => x.v), 1);
    h += `<h2>Próximos meses</h2><div class="panel">${meses.map(x => `<div class="cat"><div class="top"><span>${etqMes(x.k)}</span><span>${peso(x.v)}</span></div><div class="pista"><i style="width:${x.v / max * 100}%"></i></div></div>`).join('')}</div>`;
  }

  for (const nom of nombres) {
    const t = tarjetas.find(x => x.nombre === nom), mias = planes.filter(p => p.tarjeta === nom);
    const activos = mias.filter(p => p.faltan > 0).sort((a, b) => a.fin - b.fin), cerrados = mias.filter(p => p.faltan <= 0).sort((a, b) => b.fin - a.fin);
    const mes = mias.reduce((s, p) => s + cuotaDelMes(p, cur), 0), prox = mias.reduce((s, p) => s + cuotaDelMes(p, cur + 1), 0), sal = activos.reduce((s, p) => s + p.saldo, 0);
    const fila = p => {
      const estado = p.n < 1 ? `Empieza en ${etqMes(p.ini)}` : (p.n > p.cuotas ? 'Terminado' : `Cuota ${p.n} de ${p.cuotas}`);
      const pct = Math.max(0, Math.min(p.cuotas, p.n)) / p.cuotas * 100;
      return `<div class="plan"><div class="plan-t"><b>${esc(p.desc || 'Compra')}</b><small>${fmtFecha(p.fecha)} · ${peso(p.total)} en ${p.cuotas} ${p.cuotas === 1 ? 'pago' : 'cuotas'} de ${peso(p.valor)}</small></div>
        <div class="plan-m"><b>${estado}</b>${p.faltan > 0 ? `<small>faltan ${peso(p.saldo)}</small>` : ''}</div>
        <div class="pista"><i style="width:${pct}%"></i></div>
        <small class="plan-f">${p.faltan > 0 ? `Última cuota: ${etqMes(p.fin)}` : `Terminó en ${etqMes(p.fin)}`}</small></div>`;
    };
    h += `<div class="tj" style="--h:${tonoTarjeta(nom)}"><div class="tj-cab"><b><svg class="ic ic-s"><use href="#i-card"/></svg> ${esc(nom)}</b>${t ? `<button class="tj-x" data-tj-quitar="${esc(nom)}" aria-label="Quitar tarjeta">${ICX}</button>` : ''}</div>
      <div class="tj-res"><div><small>Este mes</small><b>${peso(mes)}</b></div><div><small>Mes próximo</small><b>${peso(prox)}</b></div><div><small>Saldo</small><b>${peso(sal)}</b></div></div>
      ${t ? `<label class="tj-conf">Primera cuota de cada compra
        <select data-tj-desde="${esc(nom)}"><option value="0"${t.desde === 0 ? ' selected' : ''}>cae el mes de la compra</option><option value="1"${t.desde === 1 ? ' selected' : ''}>cae el mes siguiente</option></select></label>` : ''}
      ${activos.length ? activos.map(fila).join('') : '<p class="hint" style="margin:10px 0 0">No hay compras en cuotas pendientes.</p>'}
      ${cerrados.length ? `<details class="tj-ter"><summary>Terminadas (${cerrados.length})</summary>${cerrados.map(fila).join('')}</details>` : ''}
    </div>`;
  }
  // aviso si hay gastos pagados con tarjeta que no se pueden contar (falta elegir cuál)
  const sinTarjeta = gastos.filter(g => esCredito(g.pago) && !g.pago.tarjeta).length;
  if (sinTarjeta) h += `<p class="hint" style="margin-top:14px">⚠ Hay ${sinTarjeta} gasto(s) pagado(s) con tarjeta de crédito sin indicar cuál. Abrilos en el Historial, tocá el medio de pago y elegí la tarjeta.</p>`;
  if (!nombres.length) h += '<div class="vacio"><svg class="ic"><use href="#i-card"/></svg>Todavía no cargaste compras con tarjeta de crédito.<br>Al registrar un gasto elegí «Tarjeta de crédito» como medio de pago.</div>';
  h += '<button id="tjNueva" class="ghost" style="width:100%;margin-top:14px">➕ Agregar tarjeta</button><button id="tjAdmin" class="ghost" style="width:100%;margin-top:8px">Administrar mis tarjetas</button>';
  $('cuotasCont').innerHTML = h;
}

$('cuotasCont').addEventListener('click', async e => {
  if (e.target.closest('#tjAdmin')) { document.querySelector('nav button[data-t=ajustes]').click(); $('misTarjetas').scrollIntoView({ block: 'start' }); return; }
  if (e.target.closest('#tjNueva')) { if (await agregarTarjeta()) { renderCuotas(); pintarTodosLosPagos(); } return; }
  const q = e.target.closest('[data-tj-quitar]');
  if (q) {
    const nom = q.dataset.tjQuitar, usos = gastos.filter(g => g.pago && g.pago.tarjeta === nom).length;
    if (!confirm(`¿Quitar la tarjeta ${nom} de la lista?${usos ? `\nLos gastos ya cargados con ella se mantienen y siguen apareciendo acá.` : ''}`)) return;
    tarjetas = tarjetas.filter(t => t.nombre !== nom); guardarTarjetas();
    if (pagoUlt.tarjeta === nom) { pagoUlt.tarjeta = ''; guardarPagoUlt(); }
    renderCuotas(); pintarTodosLosPagos();
  }
});
$('cuotasCont').addEventListener('change', e => {
  const nom = e.target.dataset.tjDesde; if (!nom) return;
  const t = tarjetas.find(x => x.nombre === nom); if (!t) return;
  t.desde = Number(e.target.value) === 1 ? 1 : 0; guardarTarjetas(); renderCuotas();
});

// ---------- Cambiar el medio de pago de algo ya guardado (Historial) ----------
function editarPago(ids) {
  const g0 = gastos.find(g => g.id === ids[0]); if (!g0) return;
  pagoUlt.medio = (g0.pago && g0.pago.medio) || ''; pagoUlt.tarjeta = (g0.pago && g0.pago.tarjeta) || ''; guardarPagoUlt();
  mostrarModal({
    titulo: 'Medio de pago', html: '<div id="pagoModal" class="pago pago-modal" data-fijo></div>', ok: 'Guardar', sec: 'Cancelar',
    alOk: () => {
      const pago = leerPago($('pagoModal'));
      if (pago === null) { editarPago(ids); return; }
      for (const g of gastos) if (ids.includes(g.id)) { if (pago.medio) g.pago = { ...pago }; else delete g.pago; }
      persistir(); renderHistorial(); renderCuotas(); toast('Medio de pago actualizado');
    },
  });
  pintarPago($('pagoModal'), (g0.pago && g0.pago.cuotas) || 1);
}
$('lista').addEventListener('click', e => {
  const b = e.target.closest('[data-pago-compra],[data-pago-gasto]'); if (!b) return;
  e.preventDefault();
  if (b.dataset.pagoCompra) editarPago(gastos.filter(g => g.compraId === b.dataset.pagoCompra).map(g => g.id));
  else editarPago([b.dataset.pagoGasto]);
});

document.querySelector('nav button[data-t=cuotas]').addEventListener('click', renderCuotas);
document.querySelector('nav button[data-t=ajustes]').addEventListener('click', renderMisTarjetas);
renderMisTarjetas();
document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => { if (b.dataset.t === 'compra' || b.dataset.t === 'registrar') pintarTodosLosPagos(); }));
pintarTodosLosPagos();
