// Generador mínimo de archivos .xlsx (Excel) sin librerías: un .xlsx es un ZIP con XML adentro.
// Uso: crearXlsx([{ nombre, anchos: [12, 30], filas: [[celda, ...], ...], filtro: true }]) => Uint8Array
// Celdas: xTxt(v, estilo), xNum(v, estilo), xFecha('2026-10-18', estilo), xForm('SUM(A1:A3)', valorCalculado, estilo)

// Estilos disponibles (índices de cellXfs en styles.xml)
const EST = { normal: 0, encabezado: 1, fecha: 2, dinero: 3, porcentaje: 4, totalTxt: 5, totalDinero: 6, titulo: 7, negrita: 8 };

const xTxt = (v, s = 0) => ({ t: 's', v: String(v == null ? '' : v), s });
const xNum = (v, s = 0) => ({ t: 'n', v: Number(v) || 0, s });
const xFecha = (iso, s = EST.fecha) => ({ t: 'd', v: iso, s });
const xForm = (f, v, s = 0) => ({ t: 'f', f, v: Number(v) || 0, s });

const xmlEsc = s => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function letraCol(i) {   // 0 => A, 25 => Z, 26 => AA
  let s = '';
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}

// Fecha ISO "2026-10-18" => número de serie de Excel (días desde 1899-12-30)
function serieExcel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}

function xmlHoja(h) {
  const filas = h.filas.map((fila, r) => {
    const celdas = fila.map((c, i) => {
      if (c == null || c === '') return '';
      if (typeof c !== 'object') c = typeof c === 'number' ? xNum(c) : xTxt(c);
      const ref = letraCol(i) + (r + 1), s = c.s ? ` s="${c.s}"` : '';
      if (c.t === 's') return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${xmlEsc(c.v)}</t></is></c>`;
      if (c.t === 'd') return `<c r="${ref}"${s}><v>${serieExcel(c.v)}</v></c>`;
      if (c.t === 'f') return `<c r="${ref}"${s}><f>${xmlEsc(c.f)}</f><v>${c.v}</v></c>`;
      return `<c r="${ref}"${s}><v>${c.v}</v></c>`;
    }).join('');
    return `<row r="${r + 1}">${celdas}</row>`;
  }).join('');
  const cols = (h.anchos || []).length ? `<cols>${h.anchos.map((a, i) => `<col min="${i + 1}" max="${i + 1}" width="${a}" customWidth="1"/>`).join('')}</cols>` : '';
  const ancho = Math.max(...h.filas.map(f => f.length), 1);
  const congelar = h.filtro ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : '';
  const ultima = h.filtroHasta || h.filas.length;
  const filtro = h.filtro && ultima > 1 ? `<autoFilter ref="A1:${letraCol(ancho - 1)}${ultima}"/>` : '';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<sheetViews><sheetView workbookViewId="0"${h.primera ? ' tabSelected="1"' : ''}>${congelar}</sheetView></sheetViews>`
    + `${cols}<sheetData>${filas}</sheetData>${filtro}</worksheet>`;
}

const XML_ESTILOS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/><numFmt numFmtId="166" formatCode="0.0%"/></numFmts>'
  + '<fonts count="4">'
  + '<font><sz val="11"/><name val="Calibri"/></font>'
  + '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'
  + '<font><b/><sz val="11"/><name val="Calibri"/></font>'
  + '<font><b/><sz val="15"/><name val="Calibri"/></font></fonts>'
  + '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FF1F3A8A"/><bgColor indexed="64"/></patternFill></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FFE8EEFF"/><bgColor indexed="64"/></patternFill></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="9">'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
  + '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>'
  + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
  + '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
  + '<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
  + '<xf numFmtId="164" fontId="2" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>'
  + '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
  + '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

// ---------- ZIP sin compresión (método "store") ----------
let TABLA_CRC = null;
function crc32(bytes) {
  if (!TABLA_CRC) {
    TABLA_CRC = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; TABLA_CRC[n] = c >>> 0; }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function zipStore(archivos) {
  const enc = new TextEncoder(), ahora = new Date();
  const dosFecha = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();
  const dosHora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1);
  const partes = [], central = [];
  let desplazamiento = 0;
  for (const a of archivos) {
    const nombre = enc.encode(a.nombre), datos = typeof a.datos === 'string' ? enc.encode(a.datos) : a.datos;
    const crc = crc32(datos);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
    local.setUint16(10, dosHora, true); local.setUint16(12, dosFecha, true); local.setUint32(14, crc, true);
    local.setUint32(18, datos.length, true); local.setUint32(22, datos.length, true); local.setUint16(26, nombre.length, true); local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nombre, datos);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true);
    cen.setUint16(12, dosHora, true); cen.setUint16(14, dosFecha, true); cen.setUint32(16, crc, true);
    cen.setUint32(20, datos.length, true); cen.setUint32(24, datos.length, true); cen.setUint16(28, nombre.length, true);
    cen.setUint32(42, desplazamiento, true);
    central.push(new Uint8Array(cen.buffer), nombre);
    desplazamiento += 30 + nombre.length + datos.length;
  }
  const tamCentral = central.reduce((t, p) => t + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true); fin.setUint32(16, desplazamiento, true);
  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const salida = new Uint8Array(todo.reduce((t, p) => t + p.length, 0));
  let pos = 0;
  for (const p of todo) { salida.set(p, pos); pos += p.length; }
  return salida;
}

function crearXlsx(hojas) {
  hojas[0].primera = true;
  const ns = 'http://schemas.openxmlformats.org/';
  const tipos = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
  const relRaiz = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${ns}package/2006/relationships"><Relationship Id="rId1" Type="${ns}officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const libro = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${ns}spreadsheetml/2006/main" xmlns:r="${ns}officeDocument/2006/relationships"><sheets>`
    + hojas.map((h, i) => `<sheet name="${xmlEsc(h.nombre.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>';
  const relLibro = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${ns}package/2006/relationships">`
    + hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${ns}officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
    + `<Relationship Id="rId${hojas.length + 1}" Type="${ns}officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  return zipStore([
    { nombre: '[Content_Types].xml', datos: tipos },
    { nombre: '_rels/.rels', datos: relRaiz },
    { nombre: 'xl/workbook.xml', datos: libro },
    { nombre: 'xl/_rels/workbook.xml.rels', datos: relLibro },
    { nombre: 'xl/styles.xml', datos: XML_ESTILOS },
    ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, datos: xmlHoja(h) })),
  ]);
}
