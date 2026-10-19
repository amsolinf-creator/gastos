// ---------- Medio de pago, tarjetas y cuotas ----------
// Cada gasto puede llevar un "pago": { medio, tarjeta?, cuotas? }. Con tarjeta de crédito, el total de la compra se divide
// en cuotas iguales y la sección "Cuotas" lleva la cuenta de cada tarjeta mes a mes.
const LS_TARJETAS = 'gastos.tarjetas.v1';
const LS_PAGO = 'gastos.pago.v1';
let tarjetas = cargar(LS_TARJETAS, []);   // [{ nombre, desde }]  desde: 0 = la 1ª cuota cae el mes de la compra, 1 = el mes siguiente
let pagoUlt = { medio: '', tarjeta: '', ...cargar(LS_PAGO, {}) };   // lo último que elegiste: se sugiere en la próxima compra
const guardarTarjetas = () => { localStorage.setItem(LS_TARJETAS, JSON.stringify(tarjetas)); if (typeof alGuardarDatos === 'function') alGuardarDatos(); };
const guardarPagoUlt = () => { try { localStorage.setItem(LS_PAGO, JSON.stringify(pagoUlt)); } catch {} };

function agregarTarjeta() {
  const n = (prompt('Nombre de la tarjeta (ej: Cordobesa, Visa Galicia)') || '').trim();
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

document.addEventListener('change', e => {
  const k = e.target.dataset && e.target.dataset.p, c = e.target.closest && e.target.closest('.pago');
  if (!k || !c) return;
  if (k === 'medio') pagoUlt.medio = e.target.value;
  else if (k === 'tarjeta') {
    if (e.target.value === '__nueva__') pagoUlt.tarjeta = agregarTarjeta() || pagoUlt.tarjeta;
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
const mesDeFecha = f => { const [y, m] = f.split('-').map(Number); return y * 12 + (m - 1); };
const etqMes = k => `${MESES[k % 12].slice(0, 3)} ${Math.floor(k / 12)}`;
const mesActualK = () => { const d = new Date(); return d.getFullYear() * 12 + d.getMonth(); };

// Un plan = una compra (o gasto directo) pagada con tarjeta de crédito
function planesCuotas() {
  const m = new Map(), cur = mesActualK();
  for (const g of gastos) {
    if (!g.pago || g.pago.medio !== CREDITO || !g.pago.tarjeta) continue;
    const k = g.compraId || g.id;
    let p = m.get(k);
    if (!p) { p = { key: k, tarjeta: g.pago.tarjeta, cuotas: Math.max(1, g.pago.cuotas || 1), fecha: g.fecha, lugar: g.lugar || '', total: 0, nombres: [] }; m.set(k, p); }
    p.total += g.monto; p.nombres.push(g.producto);
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

// ---------- Pantalla de Cuotas ----------
function renderCuotas() {
  const planes = planesCuotas(), cur = mesActualK();
  const nombres = [...new Set([...tarjetas.map(t => t.nombre), ...planes.map(p => p.tarjeta)])];
  const delMes = planes.reduce((t, p) => t + cuotaDelMes(p, cur), 0);
  const saldo = planes.filter(p => p.faltan > 0).reduce((t, p) => t + p.saldo, 0);
  let h = `<div class="cards"><div class="card"><small>A pagar en ${etqMes(cur)}</small><b>${peso(delMes)}</b></div><div class="card"><small>Saldo en cuotas</small><b>${peso(saldo)}</b></div></div>`;

  if (planes.some(p => p.faltan > 0)) {
    const meses = Array.from({ length: 6 }, (_, i) => cur + i).map(k => ({ k, v: planes.reduce((t, p) => t + cuotaDelMes(p, k), 0) }));
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
    h += `<div class="tj"><div class="tj-cab"><b><svg class="ic ic-s"><use href="#i-card"/></svg> ${esc(nom)}</b>${t ? `<button class="tj-x" data-tj-quitar="${esc(nom)}" aria-label="Quitar tarjeta">${ICX}</button>` : ''}</div>
      <div class="tj-res"><div><small>Este mes</small><b>${peso(mes)}</b></div><div><small>Mes próximo</small><b>${peso(prox)}</b></div><div><small>Saldo</small><b>${peso(sal)}</b></div></div>
      ${t ? `<label class="tj-conf">Primera cuota de cada compra
        <select data-tj-desde="${esc(nom)}"><option value="0"${t.desde === 0 ? ' selected' : ''}>cae el mes de la compra</option><option value="1"${t.desde === 1 ? ' selected' : ''}>cae el mes siguiente</option></select></label>` : ''}
      ${activos.length ? activos.map(fila).join('') : '<p class="hint" style="margin:10px 0 0">No hay compras en cuotas pendientes.</p>'}
      ${cerrados.length ? `<details class="tj-ter"><summary>Terminadas (${cerrados.length})</summary>${cerrados.map(fila).join('')}</details>` : ''}
    </div>`;
  }
  if (!nombres.length) h += '<div class="vacio"><svg class="ic"><use href="#i-card"/></svg>Todavía no cargaste compras con tarjeta de crédito.<br>Al registrar un gasto elegí «Tarjeta de crédito» como medio de pago.</div>';
  h += '<button id="tjNueva" class="ghost" style="width:100%;margin-top:14px">➕ Agregar tarjeta</button>';
  $('cuotasCont').innerHTML = h;
}

$('cuotasCont').addEventListener('click', e => {
  if (e.target.closest('#tjNueva')) { if (agregarTarjeta()) { renderCuotas(); pintarTodosLosPagos(); } return; }
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
document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => { if (b.dataset.t === 'compra' || b.dataset.t === 'registrar') pintarTodosLosPagos(); }));
pintarTodosLosPagos();
