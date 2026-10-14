// Intérprete local (sin IA): "leche mil doscientos cincuenta, dos lucas de verdura"
const CATEGORIAS = ['Comida', 'Verdulería', 'Carnicería', 'Limpieza', 'Transporte', 'Salud', 'Hogar', 'Ocio', 'Ropa', 'Servicios', 'Otros'];

const PALABRAS_CAT = {
  'Verdulería': ['verdura', 'verduras', 'fruta', 'frutas', 'tomate', 'papa', 'papas', 'cebolla', 'lechuga', 'banana', 'manzana', 'zapallo', 'zanahoria', 'limon'],
  'Carnicería': ['carne', 'asado', 'pollo', 'milanesa', 'milanesas', 'chorizo', 'cerdo', 'pescado', 'jamon', 'fiambre', 'bife', 'carnicería', 'carniceria'],
  'Comida': ['leche', 'pan', 'queso', 'huevos', 'huevo', 'fideos', 'arroz', 'aceite', 'yerba', 'cafe', 'azucar', 'harina', 'galletitas', 'gaseosa', 'agua', 'cerveza', 'vino', 'almuerzo', 'cena', 'desayuno', 'pizza', 'empanadas', 'helado', 'super', 'supermercado', 'comida', 'facturas', 'medialunas', 'manteca', 'yogur'],
  'Limpieza': ['lavandina', 'detergente', 'jabon', 'limpieza', 'esponja', 'desodorante', 'shampoo', 'papel higienico'],
  'Transporte': ['nafta', 'colectivo', 'bondi', 'sube', 'taxi', 'uber', 'cabify', 'peaje', 'estacionamiento', 'combustible', 'gnc', 'remis', 'tren', 'subte'],
  'Salud': ['farmacia', 'remedio', 'remedios', 'medico', 'doctor', 'dentista', 'analisis', 'obra social', 'prepaga', 'ibuprofeno'],
  'Hogar': ['alquiler', 'expensas', 'ferreteria', 'arreglo', 'plomero', 'electricista', 'muebles', 'lampara'],
  'Ocio': ['cine', 'netflix', 'spotify', 'salida', 'bar', 'boliche', 'juego', 'libro', 'regalo', 'restaurante', 'resto', 'cafeteria'],
  'Ropa': ['remera', 'pantalon', 'zapatillas', 'campera', 'ropa', 'zapatos', 'medias', 'camisa'],
  'Servicios': ['luz', 'gas', 'internet', 'celular', 'telefono', 'cable', 'abl', 'monotributo', 'impuesto', 'seguro', 'recarga'],
};

const sinTildes = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

function adivinarCategoria(texto) {
  const t = sinTildes(texto.toLowerCase());
  for (const [cat, palabras] of Object.entries(PALABRAS_CAT)) {
    if (palabras.some(p => new RegExp('\\b' + sinTildes(p) + '\\b').test(t))) return cat;
  }
  return 'Otros';
}

const UNIDADES = { cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29 };
const DECENAS = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const CENTENAS = { cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600, setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900 };

const esPalabraNum = w => w in UNIDADES || w in DECENAS || w in CENTENAS || w === 'mil' || w === 'medio' || w === 'millon' || w === 'millones';
const esDigitos = w => /^\d[\d.,]*$/.test(w);

function parseDigitos(w) {
  // "1.250" -> 1250 ; "12,50" -> 12.5 ; "1250" -> 1250
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(w)) return parseFloat(w.replace(/\./g, '').replace(',', '.'));
  return parseFloat(w.replace(',', '.'));
}

function parsePalabrasNum(ws) {
  let total = 0, actual = 0;
  for (const w of ws) {
    if (w === 'y') continue;
    if (esDigitos(w)) actual += parseDigitos(w);
    else if (w in UNIDADES) actual += UNIDADES[w];
    else if (w in DECENAS) actual += DECENAS[w];
    else if (w in CENTENAS) actual += CENTENAS[w];
    else if (w === 'mil') { total += (actual || 1) * 1000; actual = 0; }
    else if (w === 'millon' || w === 'millones') { total += (actual || 1) * 1e6; actual = 0; }
    else if (w === 'medio') actual += 0.5;
  }
  return total + actual;
}

function fechaISO(d) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

function interpretarLocal(texto, hoy = new Date()) {
  let t = sinTildes(texto.toLowerCase()).replace(/[$]/g, ' ').replace(/[;:]/g, ',');
  let fecha = new Date(hoy);
  if (/\banteayer\b/.test(t)) { fecha.setDate(fecha.getDate() - 2); t = t.replace(/\banteayer\b/, ' '); }
  else if (/\bayer\b/.test(t)) { fecha.setDate(fecha.getDate() - 1); t = t.replace(/\bayer\b/, ' '); }
  else t = t.replace(/\bhoy\b/, ' ');

  const tokens = t.replace(/(?<!\d),|,(?!\d)/g, ' , ').split(/\s+/).filter(Boolean);
  const items = [];
  let nombre = [];
  let i = 0;
  while (i < tokens.length) {
    const w = tokens[i];
    if (w === ',') { i++; continue; }
    if (esDigitos(w) || esPalabraNum(w)) {
      // juntar la corrida numérica
      const corrida = [];
      let j = i;
      while (j < tokens.length) {
        const x = tokens[j];
        if (esDigitos(x) || esPalabraNum(x)) { corrida.push(x); j++; }
        else if (x === 'y' && corrida.length && j + 1 < tokens.length && esPalabraNum(tokens[j + 1]) && esPalabraNum(corrida[corrida.length - 1])) { corrida.push(x); j++; }
        else break;
      }
      let monto = corrida.every(esDigitos) && corrida.length === 1 ? parseDigitos(corrida[0])
        : corrida.every(x => esPalabraNum(x) || x === 'y') ? parsePalabrasNum(corrida)
        : parseDigitos(corrida.find(esDigitos));
      if (/^(luca|lucas|k)$/.test(tokens[j] || '')) { monto *= 1000; j++; }
      if (/^(pesos|peso|mangos|mango)$/.test(tokens[j] || '')) j++;
      if (!nombre.length) { // "dos lucas de verdura": el nombre viene después del monto
        while (j < tokens.length && tokens[j] !== ',' && !esDigitos(tokens[j]) && !esPalabraNum(tokens[j])) nombre.push(tokens[j++]);
      }
      const limpio = nombre.filter(x => !['de', 'del', 'la', 'el', 'los', 'las', 'y', 'compre', 'gaste', 'pague', 'en', 'por', 'un', 'una', 'unos', 'unas', 'son', 'salio'].includes(x) || nombre.length === 1).join(' ').trim();
      if (monto > 0) items.push({ producto: limpio || 'Gasto', monto, categoria: adivinarCategoria(limpio), fecha: fechaISO(fecha) });
      nombre = [];
      i = j;
    } else {
      nombre.push(w);
      i++;
    }
  }
  return items.map(it => ({ ...it, producto: it.producto.charAt(0).toUpperCase() + it.producto.slice(1) }));
}

// ---------- Modo compra: precios por kilo y cantidades ----------
// Convierte "dos lucas", "mil doscientos", "2 mil" en dígitos planos ("2000", "1200")
function numerosADigitos(t) {
  const tokens = t.replace(/(?<!\d),|,(?!\d)/g, ' , ').split(/\s+/).filter(Boolean);
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    if (!(esDigitos(tokens[i]) || esPalabraNum(tokens[i]))) { out.push(tokens[i++]); continue; }
    const corrida = [];
    let j = i;
    while (j < tokens.length) {
      const x = tokens[j];
      if (esDigitos(x) || esPalabraNum(x)) { corrida.push(x); j++; }
      else if (x === 'y' && corrida.length && esPalabraNum(tokens[j + 1] || '') && esPalabraNum(corrida[corrida.length - 1])) { corrida.push(x); j++; }
      else break;
    }
    let v = parsePalabrasNum(corrida);
    if (/^(luca|lucas|k)$/.test(tokens[j] || '')) { v *= 1000; j++; }
    if (/^(pesos|peso|mangos|mango)$/.test(tokens[j] || '')) j++;
    out.push(String(v));
    i = j;
  }
  return out.join(' ');
}

// Envases y presentaciones que cuentan como "unidad": "rúcula, atado, 2000" => 2000 por unidad
const ENV = 'atados?|paquetes?|bolsas?|bolsones?|cajas?|cajones?|maples?|bandejas?|packs?|botellas?|latas?|frascos?|racimos?|manojos?|cabezas?';
const UNI = '(kilos?|kgs?|gramos?|grs?|gr|g|litros?|lts?|lt|l|mililitros?|ml|unidad(?:es)?|unid|u|docenas?|' + ENV + ')';
const NUM = '(\\d+(?:\\.\\d+)?)';
const ENV_RE = new RegExp('\\b(' + ENV + ')\\b');
const ENV_EXACTO = new RegExp('^(?:' + ENV + ')$');

// "atados" => "atado"; '' si no es un envase
function etiquetaDe(u) { return u && ENV_EXACTO.test(u) ? u.replace(/ones$/, 'on').replace(/s$/, '') : ''; }

// Saca el envase del nombre: "rucula atado" => { nombre: "rucula", etiqueta: "atado" }
function sacarEnvase(nombre) {
  const m = nombre.match(ENV_RE);
  if (!m) return { nombre, etiqueta: '' };
  const sin = nombre.replace(ENV_RE, ' ').replace(/\s+/g, ' ').trim();
  return { nombre: limpiarNombre(sin) || nombre, etiqueta: etiquetaDe(m[1]) };
}

const PRODUCTOS_POR_UNIDAD = /\b(lechuga|rucula|acelga|espinaca|perejil|cilantro|albahaca|apio|puerro|verdeo|coliflor|brocoli|remolacha|huevo|pan|baguette|facturas?|medialunas?|gaseosa|cerveza|yogur|alfajor|galletitas|fideos|arroz|yerba|azucar|harina|sal)\b/;
const PRODUCTOS_POR_LITRO = /\b(leche|aceite|agua|jugo|vinagre|vino|lavandina|detergente)\b/;

// Unidad más probable para un producto sin unidad explícita: kg, l o u
function sugerirUnidad(nombre) {
  const n = sinTildes(nombre.toLowerCase());
  if (ENV_RE.test(n) || PRODUCTOS_POR_UNIDAD.test(n)) return 'u';
  if (PRODUCTOS_POR_LITRO.test(n)) return 'l';
  return 'kg';
}

function normUnidad(u) {
  if (!u) return 'u';
  if (ENV_EXACTO.test(u)) return 'u';
  if (u === 'ml' || /^mili/.test(u)) return 'ml';
  if (/^k/.test(u)) return 'kg';
  if (/^g/.test(u)) return 'g';
  if (/^l/.test(u)) return 'l';
  if (/^d/.test(u)) return 'docena';
  return 'u';
}

function limpiarNombre(n) {
  return n.replace(/\b(el|la|los|las|un|una|unos|unas|de|del|por|que|con)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseSegmento(s) {
  for (let k = 0; k < 3; k++) s = s.trim().replace(/^(tambien|ademas|ahora|dame|quiero|compre|llevo|puse|agrega|agregar|anota|anotame|sumame|suma|poneme|pone)\s+/, '');
  s = s.trim();
  if (!s) return null;

  // Declaración de precio: "tomate a 2500 el kilo" / "2500 el kilo de tomate"
  let m = s.match(new RegExp(`^(.*?)\\s*(?:\\b(?:a|sale|cuesta|esta|vale)\\b)?\\s*${NUM}\\s*(?:el|la|por|x|cada|/)\\s*${UNI}\\b\\s*(?:de\\s+(.+))?$`));
  let producto, precio, uni, etiqueta = '';
  if (m && (limpiarNombre(m[1]) || m[4])) {
    producto = limpiarNombre(m[1]) || limpiarNombre(m[4]); precio = +m[2]; uni = normUnidad(m[3]); etiqueta = etiquetaDe(m[3]);
  } else if ((m = s.match(new RegExp(`^(?:el|la)\\s+${UNI}\\s+de\\s+(.+?)\\s*(?:\\b(?:sale|cuesta|esta|vale|a)\\b)?\\s*${NUM}$`)))) {
    producto = limpiarNombre(m[2]); precio = +m[3]; uni = normUnidad(m[1]); etiqueta = etiquetaDe(m[1]);
  }
  if (producto) {
    if (uni === 'docena') { precio /= 12; uni = 'u'; }
    if (uni === 'g') uni = 'kg';
    return { tipo: 'precio', producto, precio, unidad: uni, etiqueta };
  }

  // Compra. Precio incluido: "2 kilos de tomate a 2500"
  let inline = 0;
  const mp = s.match(new RegExp(`^(.+?)\\s+(?:a|sale|cuesta|vale)\\s+${NUM}$`));
  if (mp) { s = mp[1]; inline = +mp[2]; }

  let cantidad, unidad, nombre, fijo = false, etiq = '';
  if ((m = s.match(new RegExp(`^${NUM}\\s*${UNI}\\b\\s*(?:de\\s+)?(.+)$`)))) { cantidad = +m[1]; unidad = normUnidad(m[2]); etiq = etiquetaDe(m[2]); nombre = m[3]; }
  else if ((m = s.match(new RegExp(`^(.+?)\\s+${NUM}\\s*${UNI}$`)))) { cantidad = +m[2]; unidad = normUnidad(m[3]); etiq = etiquetaDe(m[3]); nombre = m[1]; }
  else if ((m = s.match(new RegExp(`^${NUM}\\s+(?:de\\s+)?(.+)$`)))) { cantidad = +m[1]; unidad = 'u'; nombre = m[2]; }
  else if (!inline && (m = s.match(new RegExp(`^(.+?)\\s+${NUM}$`)))) { cantidad = 1; nombre = m[1]; inline = +m[2]; fijo = true; }
  else { cantidad = 1; unidad = 'u'; nombre = s; }

  if (unidad === 'docena') { cantidad *= 12; unidad = 'u'; }
  nombre = limpiarNombre(nombre);
  const env = sacarEnvase(nombre);   // "rucula atado" => "rucula" + etiqueta "atado"
  nombre = env.nombre; etiq = etiq || env.etiqueta;
  if (!nombre) return null;
  // "Rúcula atado 2000" / "tomate 2500": precio por la unidad más probable (atado => unidad, tomate => kilo)
  if (fijo) unidad = etiq ? 'u' : sugerirUnidad(nombre);
  return { tipo: 'compra', producto: nombre, cantidad, unidad, precio: inline, guardarPrecio: !!inline, etiqueta: etiq };
}

function interpretarCompraLocal(texto) {
  let t = sinTildes(texto.toLowerCase()).replace(/\$/g, ' ');
  t = t.replace(/\b(?:tres cuartos|3\/4)(?: de)? kilos?\b/g, '0.75 kilo')
       .replace(/\b(?:un )?cuarto(?: de)? kilos?\b/g, '0.25 kilo')
       .replace(/\b(?:un )?kilo y medio\b/g, '1.5 kilos')
       .replace(/\b(?:un )?kilo y cuarto\b/g, '1.25 kilos');
  t = numerosADigitos(t);
  t = t.replace(/(\d+(?:\.\d+)?) (kilos?|kgs?|litros?) y 0\.5\b/g, (_, n, u) => (parseFloat(n) + 0.5) + ' ' + u);
  return t.split(/\s*(?:,|\by\b|\bmas\b|\btambien\b|\bademas\b)\s*/).map(parseSegmento).filter(Boolean)
    .map(it => ({ ...it, producto: it.producto.charAt(0).toUpperCase() + it.producto.slice(1) }));
}

if (typeof module !== 'undefined') module.exports = { interpretarCompraLocal, interpretarLocal, adivinarCategoria, CATEGORIAS, fechaISO };
