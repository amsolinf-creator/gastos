// ---------- Resumen de tarjeta: importar el PDF o foto del banco y controlar vencimientos y cuotas ----------
// Solo se guardan montos y fechas (nada de nombre, domicilio ni números de cuenta).
const RESUMEN_AVISO = 'gastos.resumenAviso.v1';
let leyendoRs = '';

const isoOk = s => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : '');
const fechaCorta = iso => { const [, m, d] = iso.split('-'); return `${+d} ${MESES[+m - 1].slice(0, 3).toLowerCase()}`; };
const diasHasta = iso => Math.round((new Date(iso + 'T00:00:00') - new Date(hoyISO() + 'T00:00:00')) / 86400000);

// Fecha de vencimiento en palabras: "Vence el 28 oct (en 3 días)"
function textoVence(iso) {
  const d = diasHasta(iso);
  if (d < 0) return `Venció el ${fechaCorta(iso)} (hace ${-d} día${d === -1 ? '' : 's'})`;
  if (d === 0) return `Vence HOY (${fechaCorta(iso)})`;
  return `Vence el ${fechaCorta(iso)} (en ${d} día${d === 1 ? '' : 's'})`;
}

function bloqueResumen(nom) {
  const rs = resumenes[nom], q = esc(nom);
  if (leyendoRs === nom) return '<div class="rs"><p class="hint" style="margin:0">Leyendo el resumen… puede tardar unos segundos.</p></div>';
  if (!rs) return `<div class="rs"><button class="ghost" data-rs-imp="${q}">📄 Importar resumen del banco</button><small class="hint">PDF o foto: controlás el vencimiento, el total y las cuotas que te cobran.</small></div>`;
  const vencido = rs.vence && diasHasta(rs.vence) < 0;
  const planes = planesCuotas().filter(p => p.tarjeta === nom);
  const filas = (rs.cuotasVencer || []).map(c => {
    const k = mesDeFecha(c.mes + '-01'), app = planes.reduce((s, p) => s + cuotaDelMes(p, k), 0), dif = Math.round(c.monto - app);
    const est = Math.abs(dif) < 1 ? '<span class="rs-ok">✓ coincide</span>' : (dif > 0 ? `<span class="rs-dif">falta cargar ${peso(dif)}</span>` : `<span class="rs-dif">la app suma ${peso(-dif)} de más</span>`);
    return `<div class="rs-fila"><span>${etqMes(k)}</span><span>${peso(c.monto)}</span><span>${peso(app)}</span>${est}</div>`;
  }).join('');
  const pagoAnt = rs.saldoAnt > 0 ? (rs.pagoAnt >= rs.saldoAnt - 1 ? '✓ Pagaste completo el resumen anterior' : `Del resumen anterior pagaste ${peso(rs.pagoAnt || 0)} de ${peso(rs.saldoAnt)}`) : '';
  return `<div class="rs">
    <div class="rs-cab"><b>Último resumen</b><small>leído el ${fmtFecha(rs.leido)}</small></div>
    ${rs.vence ? `<div class="rs-vto${vencido ? ' vencido' : ''}">${esc(textoVence(rs.vence))}</div>` : ''}
    <div class="tj-res"><div><small>Total a pagar</small><b>${peso(rs.saldo)}</b></div><div><small>Pago mínimo</small><b>${peso(rs.minimo || 0)}</b></div><div><small>Cargos del banco</small><b>${peso(rs.cargos || 0)}</b></div></div>
    <small class="rs-f">${[rs.cierre ? 'Cierre ' + fechaCorta(rs.cierre) : '', rs.proxCierre ? 'próximo cierre ' + fechaCorta(rs.proxCierre) : '', rs.proxVence ? 'próximo vencimiento ' + fechaCorta(rs.proxVence) : ''].filter(Boolean).join(' · ')}</small>
    ${pagoAnt ? `<small class="rs-f">${pagoAnt}</small>` : ''}
    ${filas ? `<div class="rs-tabla"><div class="rs-fila rs-th"><span>Cuotas a vencer</span><span>Resumen</span><span>App</span><span></span></div>${filas}</div><small class="rs-f">Una diferencia suele ser una compra en cuotas anterior a la app, o una compra que no cargaste.</small>` : ''}
    <div class="rs-acc"><button class="ghost" data-rs-imp="${q}">${vencido ? 'Importar el resumen nuevo' : 'Actualizar resumen'}</button><button class="ghost del" data-rs-del="${q}">Quitar</button></div>
  </div>`;
}

async function leerResumen(doc) {
  const prompt = `Este es el resumen de cuenta de una tarjeta de crédito argentina (puede ser Visa, Mastercard u otra). Leelo y devolvé en JSON SOLO estos datos (no copies nombres, domicilios ni números de cuenta o de tarjeta):
- "cierre": fecha de cierre de ESTE resumen (el del período que se está informando). "vencimiento": fecha de vencimiento de ESTE resumen. "cierre_anterior": fecha de cierre del resumen anterior. "proximo_cierre" y "proximo_vencimiento". Todas en formato AAAA-MM-DD; si no figura, vacío. Las fechas pueden venir como "15-Oct-26" o "28 oct. 26" (año 2026).
- "saldo_actual": el total a pagar de este resumen, en pesos. "pago_minimo": el pago mínimo. "saldo_anterior": el saldo del resumen anterior. "pago_realizado": lo que se pagó del saldo anterior ("su pago"), como número positivo; 0 si no hubo.
- "cargos_banco": suma en pesos de lo que cobra el banco aparte de los consumos: comisiones, impuesto de sellos, IVA, intereses y seguros. NO incluyas consumos ni cuotas de compras.
- "cuotas_a_vencer": la tabla "Cuotas a vencer" si existe: una entrada por mes con "mes" (AAAA-MM; "Noviembre-26" es 2026-11) y "monto" en pesos. Si no hay tabla, lista vacía.
Los importes argentinos usan punto para los miles y coma para los decimales: 56.577,78 es 56577.78. Si un dato no figura, usá 0 o vacío.`;
  const schema = {
    type: 'OBJECT',
    properties: {
      cierre: { type: 'STRING' }, vencimiento: { type: 'STRING' }, cierre_anterior: { type: 'STRING' }, proximo_cierre: { type: 'STRING' }, proximo_vencimiento: { type: 'STRING' },
      saldo_actual: { type: 'NUMBER' }, pago_minimo: { type: 'NUMBER' }, saldo_anterior: { type: 'NUMBER' }, pago_realizado: { type: 'NUMBER' }, cargos_banco: { type: 'NUMBER' },
      cuotas_a_vencer: { type: 'ARRAY', items: { type: 'OBJECT', properties: { mes: { type: 'STRING' }, monto: { type: 'NUMBER' } }, required: ['mes', 'monto'] } },
    },
    required: ['vencimiento', 'saldo_actual'],
  };
  const r = await llamarGeminiImagenes(prompt, schema, [doc]);
  const cierre = isoOk(r.cierre), vence = isoOk(r.vencimiento);
  if (!vence || !(Number(r.saldo_actual) >= 0)) throw new Error('no encontré el vencimiento y el total en ese archivo');
  let cierreAnt = isoOk(r.cierre_anterior), proxCierre = isoOk(r.proximo_cierre), proxVence = isoOk(r.proximo_vencimiento);
  // las fechas tienen que ser coherentes entre sí para usarlas en el cálculo de cuotas
  if (cierre && cierreAnt && cierreAnt >= cierre) cierreAnt = '';
  if (cierre && proxCierre && proxCierre <= cierre) proxCierre = '';
  if (proxCierre && proxVence && proxVence < proxCierre) proxVence = '';
  return {
    cierre, vence, cierreAnt, proxCierre, proxVence, leido: hoyISO(),
    saldo: Math.round(Number(r.saldo_actual) * 100) / 100, minimo: Number(r.pago_minimo) || 0,
    saldoAnt: Number(r.saldo_anterior) || 0, pagoAnt: Math.abs(Number(r.pago_realizado) || 0), cargos: Math.round(Number(r.cargos_banco) || 0),
    cuotasVencer: (r.cuotas_a_vencer || []).filter(c => /^\d{4}-\d{2}$/.test(c.mes) && Number(c.monto) > 0).map(c => ({ mes: c.mes, monto: Number(c.monto) })).sort((a, b) => a.mes.localeCompare(b.mes)),
  };
}

const archivoABase64 = f => new Promise((ok, mal) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.onerror = () => mal(new Error('no pude abrir el archivo')); fr.readAsDataURL(f); });

async function importarResumen(nom, file) {
  if (!ajustes.apiKey) { toast('Para leer el resumen hace falta la clave de Gemini (Ajustes)'); return; }
  if (file.size > 15 * 1024 * 1024) { toast('El archivo es muy grande (máximo 15 MB)'); return; }
  const seguir = async () => {
    leyendoRs = nom; renderCuotas();
    try {
      const doc = /pdf/i.test(file.type) || /\.pdf$/i.test(file.name) ? { mime: 'application/pdf', base64: await archivoABase64(file) } : await prepararImagen(file, 2000);
      resumenes[nom] = await leerResumen(doc); guardarResumenes();
      toast('Resumen leído');
    } catch (e) { toast('No se pudo leer el resumen: ' + (e.message || e)); }
    finally { leyendoRs = ''; renderCuotas(); }
  };
  if (localStorage.getItem(RESUMEN_AVISO)) { await seguir(); return; }
  mostrarModal({
    titulo: 'El resumen se envía a Google',
    html: '<p>Para leerlo, el archivo se envía a <b>Google (Gemini)</b>. La app <b>no lo guarda</b>: solo conserva fechas y montos.</p><p>Un resumen trae tu nombre y datos de la cuenta. Si preferís no compartirlos, sacale una captura solo de la parte de fechas, saldos y cuotas.</p>',
    ok: 'Entendido, continuar', sec: 'Cancelar',
    alOk: () => { localStorage.setItem(RESUMEN_AVISO, '1'); seguir(); },
  });
}

$('cuotasCont').addEventListener('click', e => {
  const imp = e.target.closest('[data-rs-imp]');
  if (imp) {
    const nom = imp.dataset.rsImp, inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/pdf,image/*';
    inp.addEventListener('change', () => { if (inp.files[0]) importarResumen(nom, inp.files[0]); });
    inp.click(); return;
  }
  const del = e.target.closest('[data-rs-del]');
  if (del && confirm('¿Quitar el resumen guardado de esta tarjeta?')) { delete resumenes[del.dataset.rsDel]; guardarResumenes(); renderCuotas(); }
});
